/**
 * Shared ingestion: transform Meta or Apify ad items into raw_data rows and upsert to Supabase.
 * Used by /api/ingest (Meta or Apify) and keeps Supabase as the single source of storage.
 */

import type { MetaArchivedAd } from "./meta-ads-api"
import type { SupabaseClient } from "@supabase/supabase-js"

const MAX_CREATIVES_PER_BRAND = 300

function formatDateOnly(d: Date): string {
  return d.toISOString().split("T")[0]
}

/** Fetch ads from Apify Facebook Ads Library scraper (same as former edge function). */
export async function fetchApifyAds(
  adsLibraryUrl: string,
  options: { start_date?: string; end_date?: string; count?: number }
): Promise<any[]> {
  const apifyToken = process.env.APIFY_TOKEN
  if (!apifyToken) throw new Error("APIFY_TOKEN not configured")

  const apifyInput: Record<string, unknown> = {
    sortBy: "start_date",
    sortOrder: "DESC",
    scrapeAdDetails: false,
    scrapePageAds: { activeStatus: "all", countryCode: "ALL" },
    urls: [{ url: adsLibraryUrl }],
  }

  if (options.count && options.count > 0) {
    apifyInput.maxItems = Math.min(MAX_CREATIVES_PER_BRAND, options.count)
  } else if (options.start_date && options.end_date) {
    apifyInput.start_date_min = options.start_date
    apifyInput.start_date_max = options.end_date
    apifyInput.maxItems = 5000
  } else {
    const today = new Date()
    const thirtyDaysAgo = new Date(today)
    thirtyDaysAgo.setDate(today.getDate() - 30)
    apifyInput.start_date_min = formatDateOnly(thirtyDaysAgo)
    apifyInput.start_date_max = formatDateOnly(today)
    apifyInput.maxItems = 100
  }

  const res = await fetch(
    "https://api.apify.com/v2/acts/curious_coder~facebook-ads-library-scraper/run-sync-get-dataset-items",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apifyToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(apifyInput),
    }
  )
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Apify error: ${res.status} - ${text.slice(0, 500)}`)
  }
  const items = await res.json()
  if (!Array.isArray(items)) throw new Error("Apify response is not an array")
  const cap = options.count && options.count > 0 ? Math.min(MAX_CREATIVES_PER_BRAND, options.count) : undefined
  let filtered = items
  if (cap) filtered = items.slice(0, cap)
  else if (options.start_date && options.end_date) {
    const start = new Date(options.start_date)
    const end = new Date(options.end_date)
    end.setHours(23, 59, 59, 999)
    filtered = items.filter((item: any) => {
      if (!item.start_date) return false
      const t = typeof item.start_date === "number" ? item.start_date * 1000 : new Date(item.start_date).getTime()
      return t >= start.getTime() && t <= end.getTime()
    })
  }
  return filtered.filter((x: any) => x && (x.ad_archive_id || x.id) && !x.errorCode && !x.error)
}

const BATCH_SIZE = 200

function formatDate(d: Date | string): string {
  if (typeof d === "string") return d.split("T")[0]
  return d.toISOString().split("T")[0]
}

/** Transform Meta Graph API archived ad to raw_data row shape */
export function transformMetaAdToRaw(
  ad: MetaArchivedAd,
  brandId: string,
  adsLibraryUrl: string | null
): Record<string, unknown> {
  const startStr = ad.ad_delivery_start_time || ad.ad_creation_time
  let startDate: Date = new Date()
  if (startStr) {
    const d = new Date(startStr)
    if (!isNaN(d.getTime())) startDate = d
  }

  let endDate: string | null = null
  if (ad.ad_delivery_stop_time) {
    const end = new Date(ad.ad_delivery_stop_time)
    if (!isNaN(end.getTime())) endDate = formatDate(end)
  }

  const body = (ad.ad_creative_bodies && ad.ad_creative_bodies[0]) || null
  const linkTitle = (ad.ad_creative_link_titles && ad.ad_creative_link_titles[0]) || null

  return {
    brand_id: brandId,
    ad_archive_id: ad.id,
    source: "meta",
    ad_library_url: ad.ad_snapshot_url || adsLibraryUrl,
    url: null,
    page_id: String(ad.page_id || ""),
    page_name: ad.page_name || null,
    start_date: startDate.toISOString(),
    end_date: endDate,
    creation_date: startDate.toISOString(),
    start_date_formatted: formatDate(startDate),
    end_date_formatted: endDate,
    publisher_platform: Array.isArray(ad.publisher_platforms) ? ad.publisher_platforms : null,
    page_categories: null,
    caption: body,
    display_format: null,
    media_type: null,
    ad_status: "ACTIVE",
    link_url: null,
    total_active_time: 0,
    cta_text: linkTitle,
    cta_type: null,
    ad_title: linkTitle,
    thumbnail_url: null,
    media_url: null,
    page_like_count: null,
    collation_count: 1,
  }
}

/** Transform Apify-style ad object (from edge function / ingest-apify-json) to raw_data row */
export function transformApifyAdToRaw(ad: any, brandId: string): Record<string, unknown> {
  const snapshot = ad.snapshot || {}
  const firstCard = snapshot.cards?.[0]

  let startDate: Date
  const dateSources = [ad.start_date, ad.ad_delivery_start_time, snapshot.start_date]
  for (const v of dateSources) {
    if (!v) continue
    try {
      if (typeof v === "string") {
        startDate = new Date(v)
        if (!isNaN(startDate.getTime())) break
      } else if (typeof v === "number") {
        const ts = v > 1e12 ? v : v * 1000
        startDate = new Date(ts)
        if (!isNaN(startDate.getTime())) break
      }
    } catch {}
  }
  // @ts-expect-error may be set in loop
  if (!startDate || isNaN(startDate.getTime())) {
    startDate = ad.creation_date
      ? new Date(typeof ad.creation_date === "number" ? (ad.creation_date > 1e12 ? ad.creation_date : ad.creation_date * 1000) : ad.creation_date)
      : new Date()
  }

  let endDate: string | null = null
  if (ad.end_date) {
    try {
      const endTs = typeof ad.end_date === "number" ? ad.end_date : parseInt(String(ad.end_date))
      if (!isNaN(endTs) && endTs > 0) {
        const d = new Date(endTs > 1e12 ? endTs : endTs * 1000)
        if (!isNaN(d.getTime())) endDate = formatDate(d)
      }
    } catch {}
  }

  let thumbnailUrl: string | null = null
  let mediaUrl: string | null = null
  if (snapshot.cards?.length > 0) {
    const c = firstCard
    mediaUrl = c.video_hd_url || c.video_sd_url || c.original_image_url || c.resized_image_url || null
    thumbnailUrl = c.video_preview_image_url || c.resized_image_url || c.original_image_url || null
  }
  if ((!mediaUrl || !thumbnailUrl) && snapshot.videos?.length > 0) {
    const v = snapshot.videos[0]
    thumbnailUrl = thumbnailUrl || v.video_preview_image_url || null
    mediaUrl = mediaUrl || v.video_hd_url || v.video_sd_url || null
  }
  if ((!mediaUrl || !thumbnailUrl) && snapshot.images?.length > 0) {
    const img = snapshot.images[0]
    mediaUrl = mediaUrl || img.original_image_url || null
    thumbnailUrl = thumbnailUrl || img.resized_image_url || img.original_image_url || null
  }

  const displayFormat = snapshot.display_format || ad.display_format || null
  let linkUrl = snapshot.link_url || null
  if (!linkUrl && firstCard) linkUrl = firstCard.link_url || null
  const ctaText = snapshot.cta_text || firstCard?.cta_text || null
  const ctaType = snapshot.cta_type || firstCard?.cta_type || null
  const caption = snapshot.body?.text || snapshot.caption || ad.caption || null
  const pageName = snapshot.page_name || ad.page_name || null
  const adArchiveId = String(ad.ad_archive_id || ad.id || "").trim()
  const hasVideo = !!(firstCard?.video_hd_url || firstCard?.video_sd_url || snapshot.videos?.length)
  let mediaType: string | null = null
  if (displayFormat === "VIDEO" || hasVideo) mediaType = "video"
  else if (displayFormat === "IMAGE" || displayFormat === "DPA" || displayFormat === "DCO") mediaType = "image"

  const id = adArchiveId && adArchiveId !== "undefined" && adArchiveId !== "null"
    ? adArchiveId
    : `${ad.page_id || snapshot.page_id || ""}_${startDate.getTime()}_${Math.random().toString(36).slice(2, 9)}`

  return {
    brand_id: brandId,
    ad_archive_id: id,
    source: "apify",
    ad_library_url: ad.ad_library_url || ad.url || null,
    url: ad.url || null,
    page_id: String(ad.page_id || snapshot.page_id || ""),
    page_name: pageName,
    start_date: startDate.toISOString(),
    end_date: endDate,
    creation_date: startDate.toISOString(),
    start_date_formatted: ad.start_date_formatted || formatDate(startDate),
    end_date_formatted: ad.end_date_formatted || endDate,
    publisher_platform: Array.isArray(ad.publisher_platform) ? ad.publisher_platform : null,
    page_categories: Array.isArray(snapshot.page_categories) ? snapshot.page_categories : null,
    caption,
    display_format: displayFormat,
    media_type: mediaType,
    ad_status: ad.is_active === true ? "ACTIVE" : ad.is_active === false ? "INACTIVE" : null,
    link_url: linkUrl,
    total_active_time: ad.total_active_time ?? 0,
    cta_text: ctaText,
    cta_type: ctaType,
    ad_title: snapshot.title || null,
    thumbnail_url: thumbnailUrl,
    media_url: mediaUrl,
    page_like_count: snapshot.page_like_count ?? null,
    collation_count: ad.collation_count ?? 1,
  }
}

export async function upsertRawData(
  supabase: SupabaseClient,
  rows: Record<string, unknown>[]
): Promise<void> {
  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE)
    const { error } = await supabase.from("raw_data").upsert(batch, { onConflict: "ad_archive_id" })
    if (error) throw error
  }
}

export type IngestOptions = {
  ads_library_url: string
  brand_name?: string
  start_date?: string
  end_date?: string
  count?: number
  refresh_summaries?: boolean
  source?: "meta" | "apify"
}

export type IngestResult = {
  success: boolean
  brand_id: string
  brand_name: string
  rows_transformed: number
  inserted: number
  summaries?: { creative: number; funnel: number }
  error?: string
}

function toDateStr(d: Date): string {
  return d.toISOString().split("T")[0]
}

/** Run full ingest for one brand: get/create brand, fetch ads, upsert raw_data, optionally populate summaries. */
export async function runIngestForBrand(
  supabase: SupabaseClient,
  options: IngestOptions
): Promise<IngestResult> {
  const { fetchMetaAdsArchive, extractPageIdFromAdsLibraryUrl } = await import("./meta-ads-api")
  const { populateSummariesForBrand } = await import("./populate-summaries")

  const ads_library_url = options.ads_library_url
  const finalBrandName = (options.brand_name || "Unknown Brand").slice(0, 120)
  const refresh_summaries = options.refresh_summaries !== false
  const source = options.source ?? (process.env.META_ACCESS_TOKEN ? "meta" : "apify")

  let start = options.start_date
  let end = options.end_date
  const count = options.count != null && options.count > 0 ? Math.min(MAX_CREATIVES_PER_BRAND, options.count) : undefined
  if (!start || !end) {
    const today = new Date()
    if (count) {
      end = toDateStr(today)
      const d = new Date(today)
      d.setDate(d.getDate() - 30)
      start = toDateStr(d)
    } else {
      const twelveMonthsAgo = new Date(today)
      twelveMonthsAgo.setMonth(twelveMonthsAgo.getMonth() - 12)
      start = toDateStr(twelveMonthsAgo)
      end = toDateStr(today)
    }
  }

  let brand_id: string
  const { data: existing } = await supabase.from("brands").select("id").eq("ads_library_url", ads_library_url).maybeSingle()
  if (existing?.id) {
    brand_id = existing.id
    await supabase.from("brands").update({ brand_name: finalBrandName, is_active: true }).eq("id", brand_id)
  } else {
    const { data: inserted, error: insErr } = await supabase
      .from("brands")
      .insert({ brand_name: finalBrandName, ads_library_url, is_active: true })
      .select("id")
      .single()
    if (insErr) throw insErr
    brand_id = inserted.id
  }

  let rows: Record<string, unknown>[] = []
  try {
    if (source === "meta") {
      const token = process.env.META_ACCESS_TOKEN
      if (!token) throw new Error("META_ACCESS_TOKEN not set")
      const pageId = extractPageIdFromAdsLibraryUrl(ads_library_url)
      if (!pageId) throw new Error("Could not extract page ID from ads_library_url")
      const ads = await fetchMetaAdsArchive({
        accessToken: token,
        searchPageIds: [pageId],
        adDeliveryDateMin: start!,
        adDeliveryDateMax: end!,
        maxItems: count ?? MAX_CREATIVES_PER_BRAND,
      })
      rows = ads.map((ad) => transformMetaAdToRaw(ad, brand_id, ads_library_url))
    } else {
      const items = await fetchApifyAds(ads_library_url, count ? { count } : { start_date: start!, end_date: end! })
      rows = items.map((ad) => transformApifyAdToRaw(ad, brand_id))
    }
  } catch (err) {
    await supabase.from("brands").update({ last_fetch_status: "error", last_fetch_error: String(err) }).eq("id", brand_id)
    return { success: false, brand_id, brand_name: finalBrandName, rows_transformed: 0, inserted: 0, error: err instanceof Error ? err.message : String(err) }
  }

  if (rows.length === 0) {
    await supabase.from("brands").update({ last_fetch_status: "error", last_fetch_error: "No valid ads returned" }).eq("id", brand_id)
    return { success: true, brand_id, brand_name: finalBrandName, rows_transformed: 0, inserted: 0 }
  }

  await upsertRawData(supabase, rows)
  const { count: verifyCount, error: verifyError } = await supabase.from("raw_data").select("*", { count: "exact", head: true }).eq("brand_id", brand_id)
  if (verifyError) throw verifyError
  const inserted = verifyCount ?? 0

  await supabase.from("brands").update({
    last_fetched_date: toDateStr(new Date()),
    last_fetch_status: "success",
    last_fetch_error: null,
  }).eq("id", brand_id)

  let summaries = { creative: 0, funnel: 0 }
  if (refresh_summaries) {
    try {
      summaries = await populateSummariesForBrand(supabase, brand_id)
    } catch (_) {}
  }
  return { success: true, brand_id, brand_name: finalBrandName, rows_transformed: rows.length, inserted, summaries }
}
