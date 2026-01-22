import { createBrowserClient } from '@supabase/ssr'
import { createClient } from '@supabase/supabase-js'

let supabase: ReturnType<typeof createBrowserClient> | null = null
let supabaseServer: ReturnType<typeof createClient> | null = null

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

/**
 * Get a server-side Supabase client for API routes
 * Uses service role key if available, otherwise falls back to anon key
 */
export function getSupabaseServerClient() {
  if (!supabaseServer) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    
    if (!url) {
      throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL environment variable")
    }
    
    // Prefer service role key for server-side operations (bypasses RLS)
    // Fall back to anon key if service role not available
    const key = serviceRoleKey || anonKey
    if (!key) {
      throw new Error(
        "Missing Supabase key. Set either SUPABASE_SERVICE_ROLE_KEY or NEXT_PUBLIC_SUPABASE_ANON_KEY in `.env.local`"
      )
    }
    
    supabaseServer = createClient(url, key, {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    })
  }
  return supabaseServer
}

/**
 * Get the Edge Function base URL
 * Handles both local Supabase (localhost:54321) and production
 */
export function getEdgeFunctionUrl(functionName: string): string {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  
  if (!supabaseUrl) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL environment variable")
  }
  
  // Remove trailing slash if present
  const baseUrl = supabaseUrl.replace(/\/$/, '')
  
  // Check if this is a local Supabase instance
  // Local Supabase typically runs on localhost:54321
  if (baseUrl.includes('localhost') || baseUrl.includes('127.0.0.1')) {
    // For local Supabase, ensure we're using port 54321
    // If URL already has a port, keep it; otherwise assume 54321
    let localUrl = baseUrl
    if (!baseUrl.match(/:\d+$/)) {
      // No port specified, add default local Supabase port
      localUrl = baseUrl.replace(/^(https?:\/\/[^\/]+)/, '$1:54321')
    } else if (!baseUrl.includes(':54321')) {
      // Different port, replace with 54321 for Edge Functions
      localUrl = baseUrl.replace(/:\d+$/, ':54321')
    }
    return `${localUrl}/functions/v1/${functionName}`
  }
  
  // Production: use the same URL
  return `${baseUrl}/functions/v1/${functionName}`
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
