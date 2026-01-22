import { getSupabaseServerClient, getEdgeFunctionUrl } from "@/lib/supabase"

/**
 * Populate summary tables for all brands
 */
export async function POST(request: Request) {
  try {
    const supabase = getSupabaseServerClient()
    
    // Get all brand IDs
    const { data: brands, error: brandsError } = await supabase
      .from("brands")
      .select("id, brand_name")
      .like("brand_name", "Test Brand%")
    
    if (brandsError) {
      return Response.json({ success: false, error: brandsError.message }, { status: 500 })
    }
    
    if (!brands || brands.length === 0) {
      return Response.json({ success: false, error: "No brands found" }, { status: 404 })
    }
    
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    
    if (!supabaseUrl || !supabaseAnonKey) {
      return Response.json({ success: false, error: "Missing Supabase environment variables" }, { status: 500 })
    }
    
    const creativeFunctionUrl = getEdgeFunctionUrl("populate_creative_summary")
    const funnelFunctionUrl = getEdgeFunctionUrl("populate_funnel_summary")
    
    const headers = {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${supabaseAnonKey}`,
      "apikey": supabaseAnonKey,
    }
    
    // Populate summaries for all brands in parallel batches
    const results = []
    const batchSize = 5
    
    for (let i = 0; i < brands.length; i += batchSize) {
      const batch = brands.slice(i, i + batchSize)
      
      const batchPromises = batch.map(async (brand) => {
        try {
          const [creativeRes, funnelRes] = await Promise.all([
            fetch(creativeFunctionUrl, {
              method: "POST",
              headers,
              body: JSON.stringify({ brand_id: brand.id }),
            }),
            fetch(funnelFunctionUrl, {
              method: "POST",
              headers,
              body: JSON.stringify({ brand_id: brand.id }),
            }),
          ])
          
          const creativeData = await creativeRes.json().catch(() => ({ inserted: 0 }))
          const funnelData = await funnelRes.json().catch(() => ({ inserted: 0 }))
          
          return {
            brand_name: brand.brand_name,
            creative: creativeData.inserted || 0,
            funnel: funnelData.inserted || 0,
          }
        } catch (error) {
          return {
            brand_name: brand.brand_name,
            error: error instanceof Error ? error.message : "Unknown error",
          }
        }
      })
      
      const batchResults = await Promise.all(batchPromises)
      results.push(...batchResults)
    }
    
    const totalCreative = results.reduce((sum, r) => sum + (r.creative || 0), 0)
    const totalFunnel = results.reduce((sum, r) => sum + (r.funnel || 0), 0)
    
    return Response.json({
      success: true,
      message: `Populated summaries for ${brands.length} brands`,
      total_brands: brands.length,
      total_creative_summaries: totalCreative,
      total_funnel_summaries: totalFunnel,
      results,
    })
  } catch (error) {
    return Response.json({
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    }, { status: 500 })
  }
}
