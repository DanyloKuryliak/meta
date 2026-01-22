import { getSupabaseServerClient } from "@/lib/supabase"

/**
 * Simple test data insertion - inserts a few records to test the UI
 */
export async function POST(request: Request) {
  try {
    const supabase = getSupabaseServerClient()
    
    // Get existing test brands
    const { data: brands } = await supabase
      .from("brands")
      .select("id, brand_name")
      .in("brand_name", ["Test Brand 1", "Test Brand 2"])
      .limit(2)
    
    if (!brands || brands.length === 0) {
      return Response.json({
        success: false,
        error: "No test brands found. Please create test brands first.",
      }, { status: 400 })
    }

    const testRecords: any[] = []
    const today = new Date()

    // Create 10-20 records per brand across last 6 months
    for (const brand of brands) {
      for (let monthOffset = 0; monthOffset < 6; monthOffset++) {
        const monthDate = new Date(today)
        monthDate.setMonth(today.getMonth() - monthOffset)
        monthDate.setDate(15) // Middle of month
        
        const adsCount = 3 // 3 ads per month
        
        for (let i = 0; i < adsCount; i++) {
          const adDate = new Date(monthDate)
          adDate.setDate(monthDate.getDate() + i) // Spread across month
          
          const adArchiveId = `test_${brand.brand_name.replace(/\s+/g, "_")}_${monthDate.getFullYear()}_${String(monthDate.getMonth() + 1).padStart(2, "0")}_${i}`
          
          const linkUrls = [
            `https://example.com/product-${i}`,
            `https://example.com/landing-page-${i}`,
            `https://app.example.com/download`,
          ]
          
          testRecords.push({
            ad_archive_id: adArchiveId,
            page_id: `page_${brand.brand_name.replace(/\s+/g, "_")}`,
            page_name: brand.brand_name,
            page_categories: ["Business"],
            publisher_platform: ["facebook"],
            display_format: "single_image",
            media_type: "image",
            ad_status: "ACTIVE",
            caption: `Test ad for ${brand.brand_name} - ${monthDate.toLocaleDateString()}`,
            link_url: linkUrls[i % linkUrls.length],
            ad_library_url: `https://www.facebook.com/ads/library/?id=${adArchiveId}`,
            start_date: adDate.toISOString(),
            end_date: null,
            creation_date: adDate.toISOString(),
            total_active_time: 10,
            source: "apify",
            brand_id: brand.id,
            start_date_formatted: adDate.toISOString().split("T")[0],
            end_date_formatted: null,
            url: linkUrls[i % linkUrls.length],
            cta_text: "Learn More",
            cta_type: "LEARN_MORE",
            ad_title: `Test Ad ${i + 1}`,
            thumbnail_url: `https://via.placeholder.com/300`,
            media_url: `https://via.placeholder.com/1200x630`,
            page_like_count: 1000,
            collation_count: 1,
          })
        }
      }
    }

    // Try inserting one record first to see the error
    if (testRecords.length > 0) {
      const testRecord = testRecords[0]
      const { data: singleTest, error: singleError } = await supabase
        .from("raw_data")
        .insert(testRecord)
        .select("id")
        .single()

      if (singleError) {
        return Response.json({
          success: false,
          error: `Failed to insert test record: ${singleError.message}`,
          errorDetails: singleError,
          testRecord: testRecord,
        }, { status: 500 })
      }
    }

    // If single insert worked, try batch
    const { data: inserted, error: batchError } = await supabase
      .from("raw_data")
      .upsert(testRecords, {
        onConflict: "ad_archive_id",
      })
      .select("id")

    if (batchError) {
      return Response.json({
        success: false,
        error: `Batch insert failed: ${batchError.message}`,
        errorDetails: batchError,
      }, { status: 500 })
    }

    return Response.json({
      success: true,
      message: `Inserted ${inserted?.length || 0} test records`,
      inserted: inserted?.length || 0,
      total: testRecords.length,
    })

  } catch (error) {
    return Response.json({
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    }, { status: 500 })
  }
}
