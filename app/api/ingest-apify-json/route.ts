import { getSupabaseServerClient } from "@/lib/supabase"
import { transformApifyAdToRaw, upsertRawData } from "@/lib/ingest-ads"
import { populateSummariesForBrand } from "@/lib/populate-summaries"

/**
 * Ingest Apify JSON response directly into the database
 * Transforms Apify format to raw_data schema and creates/updates brand
 */
export async function POST(request: Request) {
  try {
    const body = await request.json()
    const { apify_data, brand_name, ads_library_url } = body

    if (!apify_data || !Array.isArray(apify_data)) {
      return Response.json({
        success: false,
        error: "apify_data must be an array of ad objects",
      }, { status: 400 })
    }

    const supabase = getSupabaseServerClient()

    // Extract brand info from first ad (all ads should be from same brand)
    const firstAd = apify_data[0]
    const pageName = brand_name || firstAd?.page_name || firstAd?.snapshot?.page_name || "Unknown Brand"
    const pageId = firstAd?.page_id || firstAd?.snapshot?.page_id
    const libraryUrl = ads_library_url || firstAd?.url || firstAd?.ad_library_url

    if (!libraryUrl) {
      return Response.json({
        success: false,
        error: "ads_library_url is required. Provide it in the request or ensure ad objects have 'url' or 'ad_library_url' field",
      }, { status: 400 })
    }

    // Get or create brand
    let brandId: string
    const { data: existingBrand } = await supabase
      .from("brands")
      .select("id")
      .eq("ads_library_url", libraryUrl)
      .maybeSingle()

    if (existingBrand) {
      brandId = existingBrand.id
      // Update brand name if provided
      if (brand_name) {
        await supabase
          .from("brands")
          .update({ brand_name: brand_name })
          .eq("id", brandId)
      }
    } else {
      // Create new brand
      const { data: newBrand, error: brandError } = await supabase
        .from("brands")
        .insert({
          brand_name: pageName,
          ads_library_url: libraryUrl,
          is_active: true,
          last_fetch_status: "success",
          last_fetched_date: new Date().toISOString().split("T")[0],
        })
        .select("id")
        .single()

      if (brandError) {
        return Response.json({
          success: false,
          error: `Failed to create brand: ${brandError.message}`,
        }, { status: 500 })
      }
      brandId = newBrand.id
    }

    const transformedRecords = apify_data
      .filter((ad: any) => ad && (ad.ad_archive_id || ad.id) && !ad.errorCode && !ad.error)
      .map((ad: any) => transformApifyAdToRaw(ad, brandId))

    await upsertRawData(supabase, transformedRecords)

    const { count: insertedCount } = await supabase
      .from("raw_data")
      .select("*", { count: "exact", head: true })
      .eq("brand_id", brandId)
    const inserted = insertedCount ?? 0

    try {
      await populateSummariesForBrand(supabase, brandId)
    } catch (summaryError) {
      console.error("Error updating summary tables:", summaryError)
    }

    return Response.json({
      success: true,
      message: `Apify data ingested successfully`,
      stats: {
        brandId: brandId,
        brandName: pageName,
        recordsProcessed: apify_data.length,
        recordsInserted: inserted,
      },
      note: "Summary tables updated. Data should appear in the UI shortly.",
    })

  } catch (error) {
    console.error("[Ingest Apify JSON] Error:", error)
    return Response.json({
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    }, { status: 500 })
  }
}
