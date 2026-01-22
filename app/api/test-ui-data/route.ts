import { getSupabaseServerClient } from "@/lib/supabase"

/**
 * Test endpoint to verify UI can access data
 */
export async function GET() {
  try {
    const supabase = getSupabaseServerClient()
    
    // Test creative summary query (same as UI)
    const { data: creativeData, error: creativeError } = await supabase
      .from("brand_creative_summary")
      .select("*")
      .not("brand_id", "is", null)
      .not("brand_name", "is", null)
      .not("month", "is", null)
      .not("creatives_count", "is", null)
      .order("month", { ascending: false })

    // Test funnel summary query (same as UI)
    const { data: funnelData, error: funnelError } = await supabase
      .from("brand_funnel_summary")
      .select("*")
      .not("brand_name", "is", null)
      .not("funnel_url", "is", null)
      .not("funnel_domain", "is", null)
      .not("month", "is", null)
      .not("creatives_count", "is", null)
      .gt("creatives_count", 0)
      .order("month", { ascending: false })

    return Response.json({
      success: true,
      creative: {
        count: creativeData?.length || 0,
        error: creativeError?.message,
        sample: creativeData?.slice(0, 3),
      },
      funnel: {
        count: funnelData?.length || 0,
        error: funnelError?.message,
        sample: funnelData?.slice(0, 3),
      },
    })
  } catch (error) {
    return Response.json({
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    }, { status: 500 })
  }
}
