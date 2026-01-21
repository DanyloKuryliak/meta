import { createBrowserClient } from '@supabase/ssr'

let supabase: ReturnType<typeof createBrowserClient> | null = null

export function getSupabaseClient() {
  if (!supabase) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    if (!url || !anonKey) {
      throw new Error(
        "Missing Supabase env vars. Create a `.env.local` with NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY (see `env.example`)."
      )
    }
    supabase = createBrowserClient(
      url,
      anonKey
    )
  }
  return supabase
}

export type BrandCreativeSummary = {
  id: string
  brand_id: string
  brand_name: string
  month: string
  creatives_count: number
  total_active_days: number
  ads_library_url: string | null
  created_at: string
  updated_at: string
}

export type BrandFunnelSummary = {
  id: string
  brand_id: string
  brand_name: string
  funnel_url: string
  funnel_domain: string
  funnel_path: string | null
  month: string
  creatives_count: number
  ads_library_url: string | null
  funnel_type: 'tracking_link' | 'app_store' | 'quiz_funnel' | 'landing_page' | 'unknown' | null
  campaign_info: Record<string, string> | null
  created_at: string
  updated_at: string
}
