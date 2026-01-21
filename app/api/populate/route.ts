export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}))
    const { brand_id } = body

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

    if (!supabaseUrl || !supabaseAnonKey) {
      return Response.json({ success: false, error: "Missing Supabase environment variables" }, { status: 500 })
    }

    const headers = {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${supabaseAnonKey}`,
      "apikey": supabaseAnonKey,
    }

    // Call both populate functions
    const [creativeRes, funnelRes] = await Promise.all([
      fetch(`${supabaseUrl}/functions/v1/populate_creative_summary`, {
        method: "POST",
        headers,
        body: JSON.stringify({ brand_id }),
      }),
      fetch(`${supabaseUrl}/functions/v1/populate_funnel_summary`, {
        method: "POST",
        headers,
        body: JSON.stringify({ brand_id }),
      }),
    ])

    const creativeData = await creativeRes.json().catch(() => ({ error: "Failed to parse creative response" }))
    const funnelData = await funnelRes.json().catch(() => ({ error: "Failed to parse funnel response" }))

    return Response.json({
      success: true,
      creative: creativeData,
      funnel: funnelData,
    })

  } catch (error) {
    console.error("Populate API error:", error)
    return Response.json(
      { success: false, error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    )
  }
}
