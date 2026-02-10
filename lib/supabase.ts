export type BrandCreativeSummary = {
  id: string
  brand_id: string
  brand_name: string
  month: string
  creatives_count: number
  business_id?: string | null
}

export type BrandFunnelSummary = {
  id: string
  brand_id: string
  brand_name: string
  funnel_url: string
  funnel_domain: string
  month: string
  creatives_count: number
  business_id?: string | null
  caption?: string | null
  ad_library_url?: string | null
}

export type Business = {
  id: string
  business_name: string
  is_active: boolean
  created_at: string
  updated_at: string
  user_id?: string | null
  is_shared?: boolean
}

export type Brand = {
  id: string
  brand_name: string
  ads_library_url: string | null
  is_active: boolean
  last_fetched_date: string | null
  last_fetch_status: string | null
  last_fetch_error: string | null
  business_id: string | null
  user_id?: string | null
}
