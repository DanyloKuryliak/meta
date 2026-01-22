import { getEdgeFunctionUrl } from "@/lib/supabase"

export async function POST(request: Request) {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

    if (!supabaseUrl || !supabaseAnonKey) {
      return Response.json({ success: false, error: "Missing Supabase environment variables" }, { status: 500 })
    }

    // Get correct Edge Function URL (handles local vs production)
    const edgeFunctionUrl = getEdgeFunctionUrl("run_ingestion_for_all_brands")

    // Call batch ingestion function - it will fetch trailing 12 months for all active brands
    const response = await fetch(edgeFunctionUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${supabaseAnonKey}`,
        "apikey": supabaseAnonKey,
      },
      body: JSON.stringify({
        // Fetch trailing 12 months - function will calculate based on last_fetched_date
        trailing_months: 12,
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
    console.error("Refresh All API error:", error)
    return Response.json(
      { success: false, error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    )
  }
}
