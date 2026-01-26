import { getSupabaseServerClient } from "@/lib/supabase"
import { getEdgeFunctionUrl } from "@/lib/supabase"
import { randomUUID } from "crypto"

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

    // Transform Apify JSON to raw_data format
    const transformedRecords: any[] = []

    for (const ad of apify_data) {
      const snapshot = ad.snapshot || {}
      const body = snapshot.body || {}
      const images = snapshot.images || []
      const videos = snapshot.videos || []

      // Extract link URL from snapshot
      const linkUrl = snapshot.link_url || ad.link_url || null

      // Extract media URLs
      let thumbnailUrl: string | null = null
      let mediaUrl: string | null = null

      if (images.length > 0) {
        thumbnailUrl = images[0]?.resized_image_url || images[0]?.original_image_url || null
        mediaUrl = images[0]?.original_image_url || images[0]?.resized_image_url || null
      } else if (videos.length > 0) {
        thumbnailUrl = videos[0]?.video_preview_image_url || null
        mediaUrl = videos[0]?.video_hd_url || videos[0]?.video_sd_url || null
      }

      // Determine display format
      let displayFormat = snapshot.display_format || "UNKNOWN"
      if (displayFormat === "IMAGE") displayFormat = "single_image"
      if (displayFormat === "VIDEO") displayFormat = "video"
      if (displayFormat === "DPA" || displayFormat === "DCO") displayFormat = "carousel"

      // Determine media type
      const mediaType = videos.length > 0 ? "video" : images.length > 0 ? "image" : "unknown"

      // Parse dates
      let startDate: Date | null = null
      let endDate: string | null = null
      let startDateFormatted: string | null = null
      let endDateFormatted: string | null = null

      if (ad.start_date) {
        startDate = new Date(ad.start_date * 1000) // Apify uses Unix timestamp
        startDateFormatted = startDate.toISOString().split("T")[0]
      } else if (ad.start_date_formatted) {
        startDate = new Date(ad.start_date_formatted)
        startDateFormatted = ad.start_date_formatted
      }

      if (ad.end_date) {
        const endDateObj = new Date(ad.end_date * 1000)
        endDateFormatted = endDateObj.toISOString().split("T")[0]
        endDate = endDateFormatted
      } else if (ad.end_date_formatted) {
        endDateFormatted = ad.end_date_formatted
        endDate = endDateFormatted
      }

      // Extract caption/text
      const caption = body.text || snapshot.caption || ad.caption || null
      const adTitle = snapshot.title || ad.title || null

      // Extract CTA
      const ctaText = snapshot.cta_text || null
      const ctaType = snapshot.cta_type || null

      // Build the record
      const record: any = {
        ad_archive_id: ad.ad_archive_id || `apify_${ad.page_id}_${Date.now()}_${Math.random()}`,
        page_id: ad.page_id || pageId,
        page_name: ad.page_name || snapshot.page_name || pageName,
        page_categories: snapshot.page_categories || ad.page_categories || null,
        publisher_platform: ad.publisher_platform || snapshot.publisher_platform || null,
        display_format: displayFormat,
        media_type: mediaType,
        ad_status: ad.is_active ? "ACTIVE" : "INACTIVE",
        caption: caption,
        link_url: linkUrl,
        url: linkUrl,
        ad_library_url: ad.ad_library_url || ad.url || libraryUrl,
        start_date: startDate?.toISOString() || null,
        end_date: endDate,
        creation_date: startDate?.toISOString() || null,
        total_active_time: ad.total_active_time || null,
        source: "apify",
        brand_id: brandId,
        start_date_formatted: startDateFormatted,
        end_date_formatted: endDateFormatted,
        cta_text: ctaText,
        cta_type: ctaType,
        ad_title: adTitle,
        thumbnail_url: thumbnailUrl,
        media_url: mediaUrl,
        page_like_count: snapshot.page_like_count || ad.page_like_count || null,
        collation_count: ad.collation_count || null,
      }

      // Generate UUID for id field (required)
      record.id = randomUUID()
      transformedRecords.push(record)
    }

    // Insert in batches
    const batchSize = 100
    let inserted = 0
    let errors = 0
    let skipped = 0
    const errorDetails: string[] = []

    for (let i = 0; i < transformedRecords.length; i += batchSize) {
      const batch = transformedRecords.slice(i, i + batchSize)

      // Check for existing records by ad_archive_id to avoid duplicates
      const archiveIds = batch.map(r => r.ad_archive_id).filter(Boolean)
      if (archiveIds.length > 0) {
        const { data: existing } = await supabase
          .from("raw_data")
          .select("ad_archive_id")
          .in("ad_archive_id", archiveIds)

        const existingIds = new Set(existing?.map(r => r.ad_archive_id) || [])
        const newBatch = batch.filter(r => !existingIds.has(r.ad_archive_id))
        skipped += batch.length - newBatch.length

        if (newBatch.length > 0) {
          const { data, error } = await supabase
            .from("raw_data")
            .insert(newBatch)
            .select("id")

          if (error) {
            console.error(`Error inserting batch ${i / batchSize + 1}:`, error)
            errors += newBatch.length
            errorDetails.push(`Batch ${i / batchSize + 1}: ${error.message}`)
          } else {
            inserted += data?.length || 0
          }
        }
      } else {
        // No ad_archive_id, just insert
        const { data, error } = await supabase
          .from("raw_data")
          .insert(batch)
          .select("id")

        if (error) {
          console.error(`Error inserting batch ${i / batchSize + 1}:`, error)
          errors += batch.length
          errorDetails.push(`Batch ${i / batchSize + 1}: ${error.message}`)
        } else {
          inserted += data?.length || 0
        }
      }
    }

    // Trigger summary table updates via Edge Functions
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

    if (supabaseUrl && supabaseAnonKey) {
      const headers = {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${supabaseAnonKey}`,
        "apikey": supabaseAnonKey,
      }

      // Call populate functions for this brand
      const creativeFunctionUrl = getEdgeFunctionUrl("populate_creative_summary")
      const funnelFunctionUrl = getEdgeFunctionUrl("populate_funnel_summary")

      try {
        await Promise.all([
          fetch(creativeFunctionUrl, {
            method: "POST",
            headers,
            body: JSON.stringify({ brand_id: brandId }),
          }),
          fetch(funnelFunctionUrl, {
            method: "POST",
            headers,
            body: JSON.stringify({ brand_id: brandId }),
          }),
        ])
      } catch (summaryError) {
        console.error("Error updating summary tables:", summaryError)
        // Don't fail the whole request if summaries fail
      }
    }

    return Response.json({
      success: true,
      message: `Apify data ingested successfully`,
      stats: {
        brandId: brandId,
        brandName: pageName,
        recordsProcessed: transformedRecords.length,
        recordsInserted: inserted,
        recordsSkipped: skipped,
        errors: errors,
      },
      errors: errorDetails.length > 0 ? errorDetails : undefined,
      note: "Summary tables are being updated. Data should appear in the UI shortly.",
    })

  } catch (error) {
    console.error("[Ingest Apify JSON] Error:", error)
    return Response.json({
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    }, { status: 500 })
  }
}
