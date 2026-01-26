/**
 * Endpoint to ingest the full Apify dataset provided by the user
 * This endpoint accepts the complete JSON array from Apify API
 */
import { NextRequest } from "next/server"

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    
    // Accept either direct array or wrapped in 'data' field
    const apifyData = Array.isArray(body) ? body : body.data || body.apify_data
    
    if (!Array.isArray(apifyData) || apifyData.length === 0) {
      return Response.json({
        success: false,
        error: "Expected an array of ad objects. Provide the JSON array directly or wrapped in 'data' or 'apify_data' field.",
      }, { status: 400 })
    }

    // Extract brand info from first ad
    const firstAd = apifyData[0]
    const brandName = body.brand_name || firstAd?.page_name || firstAd?.snapshot?.page_name || "Unknown Brand"
    const adsLibraryUrl = body.ads_library_url || firstAd?.url || firstAd?.ad_library_url

    if (!adsLibraryUrl) {
      return Response.json({
        success: false,
        error: "ads_library_url is required. Provide it in the request body or ensure ad objects have 'url' or 'ad_library_url' field",
      }, { status: 400 })
    }

    console.log(`[Ingest Full Apify] Processing ${apifyData.length} records for brand: ${brandName}`)

    // Call the ingest endpoint
    const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || 
                    process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 
                    'http://localhost:3000'
    
    const response = await fetch(`${baseUrl}/api/ingest-apify-json`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        apify_data: apifyData,
        brand_name: brandName,
        ads_library_url: adsLibraryUrl,
      }),
    })

    const data = await response.json()
    
    if (!data.success) {
      return Response.json(data, { status: 500 })
    }

    return Response.json({
      success: true,
      message: `Successfully ingested ${data.stats.recordsInserted} records for ${data.stats.brandName}`,
      ...data,
    })

  } catch (error) {
    console.error("[Ingest Full Apify] Error:", error)
    return Response.json({
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    }, { status: 500 })
  }
}
