import { getEdgeFunctionUrl } from "@/lib/supabase"

/**
 * Endpoint specifically for monthly scraping
 * Fetches all creatives for a specific brand for a given month
 * 
 * Usage:
 * POST /api/ingest-monthly
 * {
 *   "ads_library_url": "...",
 *   "brand_name": "Headway App",
 *   "year": 2026,
 *   "month": 1  // 1-12 (January = 1, December = 12)
 * }
 */
export async function POST(request: Request) {
  try {
    const body = await request.json()
    const { ads_library_url, brand_name, year, month } = body

    if (!ads_library_url) {
      return Response.json({
        success: false,
        error: "ads_library_url is required",
      }, { status: 400 })
    }

    if (!year || !month) {
      return Response.json({
        success: false,
        error: "year and month are required (month: 1-12)",
      }, { status: 400 })
    }

    if (month < 1 || month > 12) {
      return Response.json({
        success: false,
        error: "month must be between 1 and 12",
      }, { status: 400 })
    }

    // Calculate month date range
    // month is 1-indexed (1 = January, 12 = December)
    const startDate = new Date(year, month - 1, 1)
    const lastDay = new Date(year, month, 0).getDate()
    const endDate = new Date(year, month - 1, lastDay)

    const start_date = startDate.toISOString().split("T")[0]
    const end_date = endDate.toISOString().split("T")[0]

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

    if (!supabaseUrl || !supabaseAnonKey) {
      return Response.json({ success: false, error: "Missing Supabase environment variables" }, { status: 500 })
    }

    // Call the ingest endpoint with calculated date range
    const requestBody = {
      ads_library_url,
      brand_name: brand_name || undefined,
      start_date,
      end_date,
      refresh_summaries: true,
    }

    const edgeFunctionUrl = getEdgeFunctionUrl("ingest_from_url")

    console.log("[Ingest Monthly] Calling Edge Function with:", {
      url: edgeFunctionUrl,
      body: requestBody,
      monthRange: `${year}-${String(month).padStart(2, "0")}`,
    })

    const response = await fetch(edgeFunctionUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${supabaseAnonKey}`,
        "apikey": supabaseAnonKey,
      },
      body: JSON.stringify(requestBody),
    })

    const text = await response.text()
    let data
    try {
      data = JSON.parse(text)
    } catch {
      return Response.json({
        success: false,
        error: `Invalid response from Edge Function: ${text.substring(0, 200)}`,
        rawResponse: text.substring(0, 500),
      }, { status: 500 })
    }

    if (!response.ok || data.success === false) {
      return Response.json({
        success: false,
        error: data.error || data.message || `Edge Function returned status ${response.status}`,
        details: data,
      }, { status: response.ok ? 500 : response.status })
    }

    return Response.json({
      success: true,
      message: `Monthly scraping completed for ${year}-${String(month).padStart(2, "0")}`,
      month: `${year}-${String(month).padStart(2, "0")}`,
      dateRange: {
        start_date,
        end_date,
      },
      ingestion: data.ingestion,
      summaries: data.summaries,
    }, { status: 200 })

  } catch (error) {
    console.error("[Ingest Monthly] API error:", error)
    return Response.json({
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    }, { status: 500 })
  }
}
