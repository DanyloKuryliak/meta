import { getEdgeFunctionUrl } from "@/lib/supabase"

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const { ads_library_url, brand_name, start_date, end_date, count } = body

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

    if (!supabaseUrl || !supabaseAnonKey) {
      return Response.json({ success: false, error: "Missing Supabase environment variables" }, { status: 500 })
    }

    // Support both date range (preferred) and count (fallback for backward compatibility)
    const requestBody: any = {
      ads_library_url,
      brand_name: brand_name || undefined,
      refresh_summaries: true,
    }

    if (start_date && end_date) {
      requestBody.start_date = start_date
      requestBody.end_date = end_date
    } else if (count) {
      // Fallback to count if dates not provided (backward compatibility)
      requestBody.count = parseInt(count) || 10
    } else {
      // Default to trailing 12 months if nothing specified (as per system design)
      const today = new Date()
      const twelveMonthsAgo = new Date(today)
      twelveMonthsAgo.setMonth(today.getMonth() - 12)
      requestBody.start_date = twelveMonthsAgo.toISOString().split("T")[0]
      requestBody.end_date = today.toISOString().split("T")[0]
    }

    // Get correct Edge Function URL (handles local vs production)
    const edgeFunctionUrl = getEdgeFunctionUrl("ingest_from_url")
    
    console.log("[Ingest] Calling Edge Function with:", {
      url: edgeFunctionUrl,
      body: requestBody,
    })

    // Call edge function (verify_jwt is disabled, so anon key works)
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
    console.log("[Ingest] Edge Function response status:", response.status)
    console.log("[Ingest] Edge Function response text:", text.substring(0, 1000))
    
    let data
    try {
      data = JSON.parse(text)
    } catch {
      return Response.json({ 
        success: false, 
        error: `Invalid response from Edge Function: ${text.substring(0, 200)}`,
        rawResponse: text.substring(0, 500)
      }, { status: 500 })
    }

    // Validate response - check if it actually indicates success
    if (!response.ok) {
      console.error("[Ingest] Edge Function returned error:", data)
      return Response.json({ 
        success: false, 
        error: data.error || data.message || `Edge Function returned status ${response.status}`,
        details: data
      }, { status: response.status })
    }

    // Check if data was actually inserted
    if (data.success === false) {
      console.error("[Ingest] Edge Function reported failure:", data)
      return Response.json({ 
        success: false, 
        error: data.error || data.message || "Edge Function reported failure",
        details: data
      }, { status: 500 })
    }

    // Log success details
    if (data.ingestion) {
      console.log("[Ingest] Success - Inserted:", data.ingestion.inserted, "Processed:", data.ingestion.ads_processed)
    }
    if (data.summaries) {
      console.log("[Ingest] Summaries - Creative:", data.summaries.creative_summary?.inserted, "Funnel:", data.summaries.funnel_summary?.inserted)
    }

    return Response.json(data, { status: 200 })

  } catch (error) {
    console.error("[Ingest] API error:", error)
    return Response.json(
      { success: false, error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    )
  }
}
