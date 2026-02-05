/**
 * Meta Ads Library API (Graph API ads_archive)
 * Fetches archived ads by Page ID and date range.
 * @see https://developers.facebook.com/docs/graph-api/reference/ads_archive/
 */

const GRAPH_VERSION = "v21.0"
const GRAPH_BASE = "https://graph.facebook.com"

export type MetaArchivedAd = {
  id: string
  ad_creation_time?: string
  ad_delivery_start_time?: string
  ad_delivery_stop_time?: string
  ad_creative_bodies?: string[]
  ad_creative_link_captions?: string[]
  ad_creative_link_descriptions?: string[]
  ad_creative_link_titles?: string[]
  ad_snapshot_url?: string
  page_id?: string
  page_name?: string
  publisher_platforms?: string[]
  [key: string]: unknown
}

export type MetaAdsArchiveResponse = {
  data?: MetaArchivedAd[]
  paging?: {
    cursors?: { before: string; after: string }
    next?: string
  }
}

/**
 * Extract Facebook Page ID from a Meta Ad Library URL.
 * e.g. ...?view_all_page_id=123456789 -> "123456789"
 */
export function extractPageIdFromAdsLibraryUrl(adsLibraryUrl: string): string | null {
  try {
    const u = new URL(adsLibraryUrl)
    const pageId = u.searchParams.get("view_all_page_id") || u.searchParams.get("id")
    return pageId || null
  } catch {
    return null
  }
}

/**
 * Fetch ads from Meta Ads Library API for a given page and date range.
 * Paginates until no more results or limit reached.
 */
export async function fetchMetaAdsArchive(options: {
  accessToken: string
  searchPageIds: string[]
  adDeliveryDateMin: string
  adDeliveryDateMax: string
  adActiveStatus?: "ACTIVE" | "INACTIVE" | "ALL"
  adReachedCountries?: string[]
  maxItems?: number
}): Promise<MetaArchivedAd[]> {
  const {
    accessToken,
    searchPageIds,
    adDeliveryDateMin,
    adDeliveryDateMax,
    adActiveStatus = "ALL",
    adReachedCountries = ["ALL"],
    maxItems = 500,
  } = options

  if (searchPageIds.length === 0) return []
  // API allows up to 10 page IDs
  const pageIds = searchPageIds.slice(0, 10).join(",")

  const params = new URLSearchParams({
    access_token: accessToken,
    search_page_ids: `[${pageIds}]`,
    ad_delivery_date_min: adDeliveryDateMin,
    ad_delivery_date_max: adDeliveryDateMax,
    ad_active_status: adActiveStatus,
    ad_reached_countries: JSON.stringify(adReachedCountries),
    fields: [
      "id",
      "ad_creation_time",
      "ad_delivery_start_time",
      "ad_delivery_stop_time",
      "ad_creative_bodies",
      "ad_creative_link_captions",
      "ad_creative_link_descriptions",
      "ad_creative_link_titles",
      "ad_snapshot_url",
      "page_id",
      "page_name",
      "publisher_platforms",
    ].join(","),
  })

  const all: MetaArchivedAd[] = []
  let url: string | null = `${GRAPH_BASE}/${GRAPH_VERSION}/ads_archive?${params.toString()}`

  while (url && all.length < maxItems) {
    const res = await fetch(url)
    if (!res.ok) {
      const text = await res.text()
      throw new Error(`Meta Ads API error: ${res.status} - ${text.slice(0, 500)}`)
    }
    const json = (await res.json()) as MetaAdsArchiveResponse
    const data = json.data || []
    all.push(...data)
    if (data.length === 0 || !json.paging?.next) break
    url = json.paging.next
  }

  return all.slice(0, maxItems)
}
