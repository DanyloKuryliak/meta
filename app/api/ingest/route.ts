export async function POST(request: Request) {
  try {
    const body = await request.json()
    const { ads_library_url, brand_name, count = 10 } = body

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

    if (!supabaseUrl || !supabaseAnonKey) {
      return Response.json({ success: false, error: "Missing Supabase environment variables" }, { status: 500 })
    }

    // Call edge function (verify_jwt is disabled, so anon key works)
    const response = await fetch(`${supabaseUrl}/functions/v1/ingest_from_url`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${supabaseAnonKey}`,
        "apikey": supabaseAnonKey,
      },
      body: JSON.stringify({
        ads_library_url,
        brand_name: brand_name || undefined,
        count: parseInt(count) || 10,
        refresh_summaries: true,
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
    console.error("Ingest API error:", error)
    return Response.json(
      { success: false, error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    )
  }
}
