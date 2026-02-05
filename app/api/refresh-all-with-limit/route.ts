import { getSupabaseServerClient } from "@/lib/supabase"
import { runIngestForBrand } from "@/lib/ingest-ads"

const MAX_CREATIVES_PER_BRAND = 300

/**
 * Refresh all active brands: fetch last N creatives per brand from Meta Ads Library (max 300 per brand).
 * Uses local Meta/Apify fetch and Supabase storage (no edge functions).
 */
export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}))
    const limitPerBrand = Math.min(MAX_CREATIVES_PER_BRAND, Math.max(1, Number(body?.limit_per_page) ?? MAX_CREATIVES_PER_BRAND))

    const supabase = getSupabaseServerClient()
    const { data: brands, error: listError } = await supabase
      .from("brands")
      .select("id, brand_name, ads_library_url")
      .eq("is_active", true)
      .not("ads_library_url", "is", null)

    if (listError) {
      return Response.json({ success: false, error: listError.message }, { status: 500 })
    }
    if (!brands?.length) {
      return Response.json({
        success: true,
        message: "No active brands to refresh",
        results: [],
        limit_per_brand: limitPerBrand,
      })
    }

    const results: { brand_name: string; brand_id: string; success: boolean; inserted?: number; error?: string }[] = []

    for (const brand of brands) {
      try {
        const result = await runIngestForBrand(supabase, {
          ads_library_url: brand.ads_library_url!,
          brand_name: brand.brand_name,
          count: limitPerBrand,
          refresh_summaries: true,
        })
        if (result.success) {
          results.push({
            brand_name: brand.brand_name,
            brand_id: brand.id,
            success: true,
            inserted: result.inserted,
          })
        } else {
          results.push({
            brand_name: brand.brand_name,
            brand_id: brand.id,
            success: false,
            error: result.error,
          })
        }
      } catch (err) {
        results.push({
          brand_name: brand.brand_name,
          brand_id: brand.id,
          success: false,
          error: err instanceof Error ? err.message : String(err),
        })
      }
    }

    const totalInserted = results.reduce((s, r) => s + (r.inserted ?? 0), 0)
    const successCount = results.filter((r) => r.success).length

    return Response.json({
      success: true,
      message: `Processed ${brands.length} brands, ${successCount} succeeded. Total creatives inserted: ${totalInserted}`,
      limit_per_brand: limitPerBrand,
      results,
      total_inserted: totalInserted,
    })
  } catch (error) {
    console.error("[refresh-all-with-limit] Error:", error)
    return Response.json(
      { success: false, error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    )
  }
}
