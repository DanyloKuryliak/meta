import { getSupabaseServerClient } from "@/lib/supabase"

/**
 * Seed test data to raw_data table for UI testing
 * Creates test brands and ads data across multiple months
 */
export async function POST(request: Request) {
  try {
    const supabase = getSupabaseServerClient()
    
    // Use existing test brands if they exist, or create new ones
    const { data: existingTestBrands } = await supabase
      .from("brands")
      .select("id, brand_name, ads_library_url")
      .in("brand_name", ["Test Brand 1", "Test Brand 2", "Test Brand A", "Test Brand B", "Test Brand C"])
      .limit(10)
    
    // If we have existing test brands, use them
    if (existingTestBrands && existingTestBrands.length > 0) {
      const brandIds: Record<string, string> = {}
      existingTestBrands.forEach(brand => {
        brandIds[brand.brand_name] = brand.id
      })
      
      // Generate test data for existing brands
      const today = new Date()
      const testRecords: any[] = []

      for (const [brandName, brandId] of Object.entries(brandIds)) {
        // Create ads for each of the last 12 months
        for (let monthOffset = 0; monthOffset < 12; monthOffset++) {
          const monthDate = new Date(today)
          monthDate.setMonth(today.getMonth() - monthOffset)
          
          // Create 5-15 ads per month (random)
          const adsCount = Math.floor(Math.random() * 11) + 5
          
          for (let i = 0; i < adsCount; i++) {
            const adDate = new Date(monthDate)
            adDate.setDate(Math.floor(Math.random() * 28) + 1) // Random day in month
            
            const adArchiveId = `test_${brandName.replace(/\s+/g, "_")}_${monthDate.getFullYear()}_${String(monthDate.getMonth() + 1).padStart(2, "0")}_${monthOffset}_${i}`
            
            // Generate different link URLs for funnel testing
            const linkUrls = [
              `https://example.com/product-${i}`,
              `https://example.com/landing-page-${i}`,
              `https://app.example.com/download`,
              `https://track.example.com/campaign-${i}`,
              `https://quiz.example.com/start`,
            ]
            
            const linkUrl = linkUrls[i % linkUrls.length]
            
            testRecords.push({
              ad_archive_id: adArchiveId,
              page_id: `page_${brandName.replace(/\s+/g, "_")}`,
              page_name: brandName,
              page_categories: ["Business", "E-commerce"], // JSONB - array is fine
              publisher_platform: ["facebook", "instagram"], // JSONB - array is fine
              display_format: ["single_image", "video", "carousel"][i % 3],
              media_type: ["image", "video"][i % 2],
              ad_status: "ACTIVE",
              caption: `Test ad caption for ${brandName} - Month ${12 - monthOffset} - Ad ${i + 1}`,
              link_url: linkUrl,
              ad_library_url: `https://www.facebook.com/ads/library/?id=${adArchiveId}`,
              start_date: adDate.toISOString(),
              end_date: null,
              creation_date: adDate.toISOString(),
              total_active_time: Math.floor(Math.random() * 30) + 1,
              source: "apify", // Required field
              brand_id: brandId,
              start_date_formatted: adDate.toISOString().split("T")[0],
              end_date_formatted: null,
              url: linkUrl,
              cta_text: ["Learn More", "Shop Now", "Download", "Sign Up"][i % 4],
              cta_type: ["LEARN_MORE", "SHOP_NOW", "DOWNLOAD", "SIGN_UP"][i % 4],
              ad_title: `Test Ad Title ${i + 1}`,
              thumbnail_url: `https://via.placeholder.com/300x300?text=${encodeURIComponent(brandName)}`,
              media_url: `https://via.placeholder.com/1200x630?text=${encodeURIComponent(brandName)}+Ad+${i + 1}`,
              page_like_count: Math.floor(Math.random() * 100000),
              collation_count: 1,
            })
          }
        }
      }

      // Insert in batches
      const batchSize = 100
      let inserted = 0
      let errors = 0

      for (let i = 0; i < testRecords.length; i += batchSize) {
        const batch = testRecords.slice(i, i + batchSize)
        
        const { data, error } = await supabase
          .from("raw_data")
          .upsert(batch, {
            onConflict: "ad_archive_id",
            ignoreDuplicates: false,
          })
          .select("id")

        if (error) {
          console.error(`Error inserting batch ${i / batchSize + 1}:`, error)
          // Log first error details for debugging
          if (i === 0) {
            console.error("First batch error details:", JSON.stringify(error, null, 2))
          }
          errors += batch.length
        } else {
          inserted += data?.length || 0
        }
      }

      return Response.json({
        success: true,
        message: `Test data inserted successfully`,
        stats: {
          brandsUsed: Object.keys(brandIds).length,
          recordsInserted: inserted,
          recordsTotal: testRecords.length,
          errors: errors,
        },
        brandIds,
        note: "Summary tables will be updated automatically. You may need to wait a few seconds for them to refresh.",
      })
    }
    
    // First, get or create test brands
    const testBrands = [
      { name: "Test Brand A", url: "https://www.facebook.com/ads/library/?active_status=all&ad_type=all&country=ALL&search_type=page&view_all_page_id=111111111" },
      { name: "Test Brand B", url: "https://www.facebook.com/ads/library/?active_status=all&ad_type=all&country=ALL&search_type=page&view_all_page_id=222222222" },
      { name: "Test Brand C", url: "https://www.facebook.com/ads/library/?active_status=all&ad_type=all&country=ALL&search_type=page&view_all_page_id=333333333" },
    ]

    const brandIds: Record<string, string> = {}

    // Get or create brands
    for (const brand of testBrands) {
      // Try to find by URL first (more reliable)
      const { data: existingByUrl } = await supabase
        .from("brands")
        .select("id")
        .eq("ads_library_url", brand.url)
        .maybeSingle()

      if (existingByUrl) {
        brandIds[brand.name] = existingByUrl.id
        continue
      }

      // Try by name
      const { data: existingByName } = await supabase
        .from("brands")
        .select("id")
        .eq("brand_name", brand.name)
        .maybeSingle()

      if (existingByName) {
        brandIds[brand.name] = existingByName.id
        continue
      }

      // Create new brand
      const { data: newBrand, error } = await supabase
        .from("brands")
        .insert({
          brand_name: brand.name,
          ads_library_url: brand.url,
          is_active: true,
          last_fetch_status: "success",
          last_fetched_date: new Date().toISOString().split("T")[0],
        })
        .select("id")
        .single()

      if (error) {
        console.error(`Error creating brand ${brand.name}:`, error)
        return Response.json({
          success: false,
          error: `Failed to create brand ${brand.name}: ${error.message}`,
        }, { status: 500 })
      }
      brandIds[brand.name] = newBrand.id
    }

    if (Object.keys(brandIds).length === 0) {
      return Response.json({
        success: false,
        error: "No brands available for test data insertion",
      }, { status: 500 })
    }

    // Generate test data for last 12 months
    const today = new Date()
    const testRecords: any[] = []

    for (const [brandName, brandId] of Object.entries(brandIds)) {
      // Create ads for each of the last 12 months
      for (let monthOffset = 0; monthOffset < 12; monthOffset++) {
        const monthDate = new Date(today)
        monthDate.setMonth(today.getMonth() - monthOffset)
        
        // Create 5-15 ads per month (random)
        const adsCount = Math.floor(Math.random() * 11) + 5
        
        for (let i = 0; i < adsCount; i++) {
          const adDate = new Date(monthDate)
          adDate.setDate(Math.floor(Math.random() * 28) + 1) // Random day in month
          
          const adArchiveId = `test_${brandName.replace(/\s+/g, "_")}_${monthDate.getFullYear()}_${String(monthDate.getMonth() + 1).padStart(2, "0")}_${i}`
          
          // Generate different link URLs for funnel testing
          const linkUrls = [
            `https://example.com/product-${i}`,
            `https://example.com/landing-page-${i}`,
            `https://app.example.com/download`,
            `https://track.example.com/campaign-${i}`,
            `https://quiz.example.com/start`,
          ]
          
          const linkUrl = linkUrls[i % linkUrls.length]
          
          testRecords.push({
            ad_archive_id: adArchiveId,
            page_id: `page_${brandName.replace(/\s+/g, "_")}`,
            page_name: brandName,
            page_categories: ["Business", "E-commerce"],
            publisher_platform: ["facebook", "instagram"],
            display_format: ["single_image", "video", "carousel"][i % 3],
            media_type: ["image", "video"][i % 2],
            ad_status: "ACTIVE",
            caption: `Test ad caption for ${brandName} - Month ${12 - monthOffset} - Ad ${i + 1}`,
            link_url: linkUrl,
            ad_library_url: `https://www.facebook.com/ads/library/?id=${adArchiveId}`,
            start_date: adDate.toISOString(),
            end_date: null,
            creation_date: adDate.toISOString(),
            total_active_time: Math.floor(Math.random() * 30) + 1,
            source: "apify",
            brand_id: brandId,
            start_date_formatted: adDate.toISOString().split("T")[0],
            end_date_formatted: null,
            url: linkUrl,
            cta_text: ["Learn More", "Shop Now", "Download", "Sign Up"][i % 4],
            cta_type: ["LEARN_MORE", "SHOP_NOW", "DOWNLOAD", "SIGN_UP"][i % 4],
            ad_title: `Test Ad Title ${i + 1}`,
            thumbnail_url: `https://via.placeholder.com/300x300?text=${encodeURIComponent(brandName)}`,
            media_url: `https://via.placeholder.com/1200x630?text=${encodeURIComponent(brandName)}+Ad+${i + 1}`,
            page_like_count: Math.floor(Math.random() * 100000),
            collation_count: 1,
          })
        }
      }
    }

    // Insert in batches to avoid timeout
    const batchSize = 100
    let inserted = 0
    let errors = 0

    for (let i = 0; i < testRecords.length; i += batchSize) {
      const batch = testRecords.slice(i, i + batchSize)
      
      // Use upsert to avoid duplicate key errors
      const { data, error } = await supabase
        .from("raw_data")
        .upsert(batch, {
          onConflict: "ad_archive_id",
          ignoreDuplicates: false,
        })
        .select("id")

      if (error) {
        console.error(`Error inserting batch ${i / batchSize + 1}:`, error)
        errors += batch.length
      } else {
        inserted += data?.length || 0
      }
    }

    // Now trigger summary table updates
    const { data: brands } = await supabase
      .from("brands")
      .select("id")
      .in("id", Object.values(brandIds))

    return Response.json({
      success: true,
      message: `Test data inserted successfully`,
      stats: {
        brandsCreated: Object.keys(brandIds).length,
        recordsInserted: inserted,
        recordsTotal: testRecords.length,
        errors: errors,
      },
      brandIds,
      note: "Summary tables will be updated automatically. You may need to wait a few seconds for them to refresh.",
    })

  } catch (error) {
    console.error("[Seed Test Data] Error:", error)
    return Response.json({
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    }, { status: 500 })
  }
}
