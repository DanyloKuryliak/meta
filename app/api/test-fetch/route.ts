import { getSupabaseServerClient, getEdgeFunctionUrl } from "@/lib/supabase"

/**
 * Test endpoint to fetch a small amount of creatives and verify the ingestion flow
 * This helps debug issues with Edge Functions not writing to database
 */
export async function POST(request: Request) {
  try {
    const body = await request.json()
    const { 
      ads_library_url, 
      brand_name, 
      count = 5, // Start with very small amount
      useDirectWrite = false // If true, write directly to DB instead of using Edge Function
    } = body

    if (!ads_library_url) {
      return Response.json({ 
        success: false, 
        error: "ads_library_url is required" 
      }, { status: 400 })
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

    if (!supabaseUrl || !supabaseAnonKey) {
      return Response.json({ 
        success: false, 
        error: "Missing Supabase environment variables" 
      }, { status: 500 })
    }

    console.log("[Test Fetch] Starting fetch with count:", count)
    console.log("[Test Fetch] URL:", ads_library_url)
    console.log("[Test Fetch] Brand:", brand_name || "auto-detect")
    console.log("[Test Fetch] Use direct write:", useDirectWrite)

    if (useDirectWrite) {
      // TODO: Implement direct write logic if Edge Functions aren't working
      // For now, this is a placeholder
      return Response.json({
        success: false,
        error: "Direct write mode not yet implemented. Use Edge Function for now.",
        hint: "Check if Edge Function is deployed and accessible"
      }, { status: 501 })
    }

    // Call Edge Function directly (same as ingest route)
    const requestBody = {
      ads_library_url,
      brand_name: brand_name || undefined,
      count: parseInt(count.toString()),
      refresh_summaries: true,
    }

    console.log("[Test Fetch] Calling Edge Function with:", requestBody)

    const edgeFunctionUrl = getEdgeFunctionUrl("ingest_from_url")
    console.log("[Test Fetch] Edge Function URL:", edgeFunctionUrl)

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
    console.log("[Test Fetch] Edge Function response status:", response.status)
    console.log("[Test Fetch] Edge Function response text:", text.substring(0, 500))
    
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
    
    console.log("[Test Fetch] Parsed response:", {
      status: response.status,
      success: data.success,
      inserted: data.ingestion?.inserted,
      processed: data.ingestion?.ads_processed,
    })

    // Handle response structure - Edge Function can return data directly or wrapped in details
    const responseData = data.details || data
    const isSuccess = responseData.success === true
    const ingestion = responseData.ingestion
    const brandId = ingestion?.brand_id || responseData.brand?.id
    
    // Always verify database writes if we have a brand_id, even if Edge Function reported failure
    if (brandId) {
      const supabase = getSupabaseServerClient()
      
      // Check raw_data table - use ad_library_url (not ads_library_url) based on schema
      const { data: rawData, error: rawError } = await supabase
        .from("raw_data")
        .select("id, page_name, start_date")
        .eq("brand_id", brandId)
        .order("created_at", { ascending: false })
        .limit(10)
      
      if (rawError) {
        console.error("[Test Fetch] Error checking raw_data:", rawError)
      }
      
      // Check brand
      const { data: brandData, error: brandError } = await supabase
        .from("brands")
        .select("id, brand_name, last_fetched_date, last_fetch_status")
        .eq("id", brandId)
        .single()
      
      if (brandError) {
        console.error("[Test Fetch] Error checking brand:", brandError)
      }

      return Response.json({
        success: isSuccess,
        message: isSuccess ? "Fetch completed. Verifying database writes..." : "Fetch had errors, but checking database...",
        ingestion: ingestion,
        summaries: responseData.summaries,
        verification: {
          rawDataCount: rawData?.length || 0,
          rawDataSample: rawData?.slice(0, 3),
          brand: brandData,
          rawDataError: rawError?.message,
          brandError: brandError?.message,
        },
        note: rawData && rawData.length > 0 
          ? "✅ Data successfully written to database" 
          : isSuccess 
            ? "⚠️ Edge Function returned success but no data found in database. Check Edge Function logs."
            : "❌ Edge Function reported failure. No data written."
      })
    }

    // No brand_id means Edge Function failed before creating brand
    return Response.json({
      success: false,
      error: responseData.error || data.error,
      details: data,
      note: "Edge Function failed before creating brand. Check error above."
    }, { status: response.ok && isSuccess ? 200 : 500 })

  } catch (error) {
    console.error("[Test Fetch] Error:", error)
    return Response.json({
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    }, { status: 500 })
  }
}
