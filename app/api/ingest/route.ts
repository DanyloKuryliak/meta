import { getSupabaseServerClient } from "@/lib/supabase"
import { runIngestForBrand } from "@/lib/ingest-ads"

const MAX_CREATIVES_PER_BRAND = 300

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}))
    const ads_library_url = typeof body.ads_library_url === "string" ? body.ads_library_url : undefined
    const brand_name = typeof body.brand_name === "string" ? body.brand_name?.trim() : undefined
    const start_date = typeof body.start_date === "string" ? body.start_date : undefined
    const end_date = typeof body.end_date === "string" ? body.end_date : undefined
    const countRaw = typeof body.count === "number" ? body.count : typeof body.count === "string" ? parseInt(body.count, 10) : undefined
    const count = countRaw != null && countRaw > 0 ? Math.min(MAX_CREATIVES_PER_BRAND, countRaw) : undefined
    const refresh_summaries = body.refresh_summaries !== false
    const source = typeof body.source === "string" && (body.source === "meta" || body.source === "apify") ? body.source : undefined

    if (!ads_library_url) {
      return Response.json({ success: false, error: { message: "ads_library_url is required" } }, { status: 400 })
    }
    try {
      new URL(ads_library_url)
    } catch {
      return Response.json({ success: false, error: { message: "Invalid ads_library_url" } }, { status: 400 })
    }

    const supabase = getSupabaseServerClient()
    const result = await runIngestForBrand(supabase, {
      ads_library_url,
      brand_name,
      start_date,
      end_date,
      count,
      refresh_summaries,
      source,
    })

    if (!result.success && result.error) {
      const status = result.error.includes("required") || result.error.includes("Invalid") ? 400 : 500
      return Response.json({ success: false, error: { message: result.error } }, { status })
    }

    return Response.json({
      success: result.success,
      message: result.success ? "Ingestion completed successfully" : result.error,
      brand: { id: result.brand_id, brand_name: result.brand_name, ads_library_url },
      ingestion: {
        received: result.rows_transformed,
        inserted: result.inserted,
        transformed: result.rows_transformed,
      },
      summaries: result.summaries,
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error("[Ingest] Error:", err)
    return Response.json({ success: false, error: { message: msg } }, { status: 500 })
  }
}
