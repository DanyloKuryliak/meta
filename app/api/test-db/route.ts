import { getSupabaseServerClient } from "@/lib/supabase"

/**
 * Test endpoint to verify Supabase database connection and write operations
 * GET: Check connection
 * POST: Test write operation to raw_data table
 */
export async function GET() {
  try {
    const supabase = getSupabaseServerClient()
    
    // Test connection by querying a simple table
    const { data, error } = await supabase
      .from("brands")
      .select("id")
      .limit(1)
    
    if (error) {
      return Response.json({
        success: false,
        error: error.message,
        code: error.code,
        details: error,
      }, { status: 500 })
    }
    
    // Also check raw_data structure if any data exists
    const { data: rawDataSample } = await supabase
      .from("raw_data")
      .select("*")
      .limit(1)
      .maybeSingle()
    
    return Response.json({
      success: true,
      message: "Database connection successful",
      sampleData: data,
      rawDataColumns: rawDataSample ? Object.keys(rawDataSample) : "No data in raw_data table to inspect",
    })
  } catch (error) {
    return Response.json({
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const { testData } = body
    
    const supabase = getSupabaseServerClient()
    
    // First, let's check what columns exist by querying the table structure
    const { data: sampleData } = await supabase
      .from("raw_data")
      .select("*")
      .limit(1)
      .single()
    
    // Test write operation to raw_data table with minimal required fields
    const testRecord: any = {
      ads_library_url: testData?.ads_library_url || "https://test-url.com",
      brand_name: testData?.brand_name || "Test Brand",
      source: "test",
      raw_data: testData?.raw_data || { test: true, timestamp: new Date().toISOString() },
    }
    
    // Only add date field if it exists in the schema
    // The actual column name might be different (e.g., delivery_start_date, start_date, etc.)
    
    console.log("[Test DB] Attempting to insert test record:", testRecord)
    
    const { data, error } = await supabase
      .from("raw_data")
      .insert(testRecord)
      .select()
      .single()
    
    if (error) {
      console.error("[Test DB] Insert error:", error)
      return Response.json({
        success: false,
        error: error.message,
        code: error.code,
        details: error,
        hint: error.code === "42501" ? "Check RLS policies or use service role key" : undefined,
      }, { status: 500 })
    }
    
    console.log("[Test DB] Successfully inserted:", data)
    
    // Clean up test record
    if (data?.id) {
      await supabase.from("raw_data").delete().eq("id", data.id)
      console.log("[Test DB] Cleaned up test record")
    }
    
    return Response.json({
      success: true,
      message: "Database write test successful",
      inserted: data,
      cleanedUp: true,
    })
  } catch (error) {
    console.error("[Test DB] Error:", error)
    return Response.json({
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    }, { status: 500 })
  }
}
