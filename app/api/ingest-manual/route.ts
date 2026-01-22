import { getEdgeFunctionUrl } from "@/lib/supabase"

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const { raw_data, ads, ads_library_url, brand_name, source } = body

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

    if (!supabaseUrl || !supabaseAnonKey) {
      return Response.json({ success: false, error: "Missing Supabase environment variables" }, { status: 500 })
    }

    // Get correct Edge Function URL (handles local vs production)
    const edgeFunctionUrl = getEdgeFunctionUrl("ingest_manual_data")

    // Call manual ingestion edge function
    const response = await fetch(edgeFunctionUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${supabaseAnonKey}`,
        "apikey": supabaseAnonKey,
      },
      body: JSON.stringify({
        raw_data: raw_data || ads || body, // Accept array directly or in raw_data/ads field
        ads_library_url,
        brand_name,
        source: source || "apify",
      }),
    })

    const text = await response.text()
    let data
    try {
      data = JSON.parse(text)
    } catch {
      return Response.json({ success: false, error: `Invalid response: ${text.substring(0, 200)}` }, { status: 500 })
    }

    return Response.json(data, { status: response.ok ? 200 : 500 })

  } catch (error) {
    console.error("Manual Ingest API error:", error)
    return Response.json(
      { success: false, error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    )
  }
}
