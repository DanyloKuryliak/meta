import { getSupabaseServerClient } from "@/lib/supabase"
import { populateSummariesForBrand } from "@/lib/populate-summaries"

/**
 * Populate summary tables (brand_creative_summary, brand_funnel_summary) for all active brands.
 * Reads from raw_data and writes to the two summary tables used by the UI.
 */
export async function POST(request: Request) {
  try {
    const supabase = getSupabaseServerClient()
    const { data: brands, error: brandsError } = await supabase
      .from("brands")
      .select("id, brand_name")
      .eq("is_active", true)

    if (brandsError) {
      return Response.json({ success: false, error: brandsError.message }, { status: 500 })
    }
    if (!brands?.length) {
      return Response.json({ success: true, message: "No active brands", total_brands: 0, results: [] })
    }

    const results: { brand_name: string; creative: number; funnel: number; error?: string }[] = []

    for (const brand of brands) {
      try {
        const result = await populateSummariesForBrand(supabase, brand.id)
        results.push({
          brand_name: brand.brand_name,
          creative: result.creative,
          funnel: result.funnel,
        })
      } catch (error) {
        results.push({
          brand_name: brand.brand_name,
          creative: 0,
          funnel: 0,
          error: error instanceof Error ? error.message : "Unknown error",
        })
      }
    }

    const totalCreative = results.reduce((s, r) => s + r.creative, 0)
    const totalFunnel = results.reduce((s, r) => s + r.funnel, 0)

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
