import { getSupabaseServerClient } from "@/lib/supabase"
import { populateSummariesForBrand } from "@/lib/populate-summaries"

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}))
    const brand_id = typeof body.brand_id === "string" ? body.brand_id : null

    const supabase = getSupabaseServerClient()
    const result = await populateSummariesForBrand(supabase, brand_id)

    return Response.json({
      success: true,
      creative: result.creative,
      funnel: result.funnel,
    })
  } catch (error) {
    console.error("Populate API error:", error)
    return Response.json(
      { success: false, error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    )
  }
}
