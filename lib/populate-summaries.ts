/**
 * Populate brand_creative_summary and brand_funnel_summary from raw_data.
 * Supabase stores data; this runs in the app to keep the two summary tables in sync for the UI.
 */

import type { SupabaseClient } from "@supabase/supabase-js"

type FunnelType = "tracking_link" | "app_store" | "quiz_funnel" | "landing_page" | "unknown"

function monthStart(dateStr: string): string {
  const d = new Date(dateStr)
  const y = d.getUTCFullYear()
  const m = String(d.getUTCMonth() + 1).padStart(2, "0")
  return `${y}-${m}-01`
}

function classifyFunnelType(linkUrl: string): FunnelType {
  const lower = linkUrl.toLowerCase()
  const host = lower
  if (/apps\.apple\.com|play\.google\.com|itunes\.apple\.com/.test(host)) return "app_store"
  if (/quiz|survey|assessment/.test(lower)) return "quiz_funnel"
  if (/track|click|redirect|affiliate|go\./.test(host)) return "tracking_link"
  return "landing_page"
}

function parseFunnelUrl(linkUrl: string): { domain: string; path: string | null } {
  try {
    const u = new URL(linkUrl)
    return { domain: u.hostname, path: u.pathname || null }
  } catch {
    return { domain: linkUrl, path: null }
  }
}

export async function populateCreativeSummary(
  supabase: SupabaseClient,
  brandId: string | null
): Promise<{ inserted: number }> {
  const query = supabase
    .from("raw_data")
    .select("id, brand_id, start_date, total_active_time")
  if (brandId) query.eq("brand_id", brandId)
  const { data: rows, error } = await query
  if (error) throw error
  if (!rows?.length) return { inserted: 0 }

  // Get brand names and ads_library_url
  const brandIds = [...new Set(rows.map((r) => r.brand_id))]
  const { data: brands } = await supabase
    .from("brands")
    .select("id, brand_name, ads_library_url")
    .in("id", brandIds)
  const brandMap = new Map((brands || []).map((b) => [b.id, b]))

  const byKey = new Map<string, { count: number; totalActiveDays: number; brandId: string; brandName: string; adsLibraryUrl: string | null }>()
  for (const r of rows) {
    const month = monthStart(r.start_date || "")
    if (!month) continue
    const key = `${r.brand_id}:${month}`
    const brand = brandMap.get(r.brand_id)
    if (!byKey.has(key)) {
      byKey.set(key, {
        count: 0,
        totalActiveDays: 0,
        brandId: r.brand_id,
        brandName: brand?.brand_name || "Unknown",
        adsLibraryUrl: brand?.ads_library_url || null,
      })
    }
    const agg = byKey.get(key)!
    agg.count += 1
    agg.totalActiveDays += Number(r.total_active_time) || 0
  }

  const toUpsert = Array.from(byKey.entries()).map(([key, agg]) => {
    const [, month] = key.split(":")
    return {
      brand_id: agg.brandId,
      brand_name: agg.brandName,
      month,
      creatives_count: agg.count,
      total_active_days: agg.totalActiveDays,
      ads_library_url: agg.adsLibraryUrl,
    }
  })

  if (toUpsert.length === 0) return { inserted: 0 }
  const { error: upsertErr } = await supabase
    .from("brand_creative_summary")
    .upsert(toUpsert, { onConflict: "brand_id,month" })
  if (upsertErr) throw upsertErr
  return { inserted: toUpsert.length }
}

export async function populateFunnelSummary(
  supabase: SupabaseClient,
  brandId: string | null
): Promise<{ inserted: number }> {
  const query = supabase
    .from("raw_data")
    .select("id, brand_id, start_date, link_url")
  if (brandId) query.eq("brand_id", brandId)
  const { data: rows, error } = await query
  if (error) throw error
  if (!rows?.length) return { inserted: 0 }

  const brandIds = [...new Set(rows.map((r) => r.brand_id))]
  const { data: brands } = await supabase
    .from("brands")
    .select("id, brand_name, ads_library_url")
    .in("id", brandIds)
  const brandMap = new Map((brands || []).map((b) => [b.id, b]))

  const byKey = new Map<string, { count: number; brandId: string; brandName: string; adsLibraryUrl: string | null; funnelUrl: string; funnelDomain: string; funnelPath: string | null; funnelType: FunnelType; month: string }>()
  for (const r of rows) {
    const linkUrl = (r.link_url || "").trim()
    if (!linkUrl) continue
    const month = monthStart(r.start_date || "")
    if (!month) continue
    const { domain, path } = parseFunnelUrl(linkUrl)
    const funnelType = classifyFunnelType(linkUrl)
    const key = `${r.brand_id}:${linkUrl}:${month}`
    const brand = brandMap.get(r.brand_id)
    if (!byKey.has(key)) {
      byKey.set(key, {
        count: 0,
        brandId: r.brand_id,
        brandName: brand?.brand_name || "Unknown",
        adsLibraryUrl: brand?.ads_library_url || null,
        funnelUrl: linkUrl,
        funnelDomain: domain,
        funnelPath: path,
        funnelType,
        month,
      })
    }
    byKey.get(key)!.count += 1
  }

  const toUpsert = Array.from(byKey.values()).map((agg) => ({
    brand_id: agg.brandId,
    brand_name: agg.brandName,
    funnel_url: agg.funnelUrl,
    funnel_domain: agg.funnelDomain,
    funnel_path: agg.funnelPath,
    month: agg.month,
    creatives_count: agg.count,
    ads_library_url: agg.adsLibraryUrl,
    funnel_type: agg.funnelType,
    campaign_info: null,
  }))

  if (toUpsert.length === 0) return { inserted: 0 }
  const { error: upsertErr } = await supabase
    .from("brand_funnel_summary")
    .upsert(toUpsert, { onConflict: "brand_id,funnel_url,month" })
  if (upsertErr) throw upsertErr
  return { inserted: toUpsert.length }
}

export async function populateSummariesForBrand(
  supabase: SupabaseClient,
  brandId: string | null
): Promise<{ creative: number; funnel: number }> {
  const [creative, funnel] = await Promise.all([
    populateCreativeSummary(supabase, brandId),
    populateFunnelSummary(supabase, brandId),
  ])
  return { creative: creative.inserted, funnel: funnel.inserted }
}
