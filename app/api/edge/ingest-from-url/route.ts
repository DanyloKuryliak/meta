import { createServerClient } from "@supabase/ssr"
import { NextResponse, type NextRequest } from "next/server"
import { getSupabaseAdminClient } from "@/lib/supabase/admin"

type CookieToSet = { name: string; value: string; options: any }

export async function POST(request: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!url || !anonKey || !serviceRoleKey) {
    return NextResponse.json({ error: "Missing Supabase env" }, { status: 500 })
  }

  const cookiesToSet: CookieToSet[] = []
  const supabase = createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll()
      },
      setAll(newCookies) {
        cookiesToSet.push(...(newCookies as CookieToSet[]))
      },
    },
  })

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser()

  if (userError || !user) {
    const res = NextResponse.json({ error: "Not authenticated" }, { status: 401 })
    cookiesToSet.forEach(({ name, value, options }) => res.cookies.set(name, value, options))
    return res
  }

  const body = await request.json().catch(() => null)
  const business_id = typeof body?.business_id === "string" ? body.business_id : ""
  const ads_library_url = typeof body?.ads_library_url === "string" ? body.ads_library_url : ""
  const brand_name = typeof body?.brand_name === "string" ? body.brand_name : undefined

  if (!business_id || !ads_library_url) {
    const res = NextResponse.json(
      { error: "Missing business_id or ads_library_url" },
      { status: 400 }
    )
    cookiesToSet.forEach(({ name, value, options }) => res.cookies.set(name, value, options))
    return res
  }

  const admin = getSupabaseAdminClient()

  // Resolve whether caller is admin (service role read; avoids dependence on RLS policies).
  const { data: profile } = await admin
    .from("user_profiles")
    .select("is_admin")
    .eq("id", user.id)
    .maybeSingle()

  const isAdmin = Boolean((profile as any)?.is_admin)

  // Enforce access rules:
  // - Shared businesses: only admins can ingest into them
  // - Private businesses: only the owner can ingest into them
  const { data: business } = await admin
    .from("businesses")
    .select("id, user_id, is_shared")
    .eq("id", business_id)
    .maybeSingle()

  if (!business) {
    const res = NextResponse.json({ error: "Business not found" }, { status: 404 })
    cookiesToSet.forEach(({ name, value, options }) => res.cookies.set(name, value, options))
    return res
  }

  const isShared = Boolean((business as any).is_shared)
  const ownerId = (business as any).user_id as string | null | undefined

  if (isShared && !isAdmin) {
    const res = NextResponse.json({ error: "Forbidden" }, { status: 403 })
    cookiesToSet.forEach(({ name, value, options }) => res.cookies.set(name, value, options))
    return res
  }

  if (!isShared && ownerId !== user.id) {
    const res = NextResponse.json({ error: "Forbidden" }, { status: 403 })
    cookiesToSet.forEach(({ name, value, options }) => res.cookies.set(name, value, options))
    return res
  }

  const fnResponse = await fetch(`${url}/functions/v1/ingest_from_url`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: anonKey,
      Authorization: `Bearer ${serviceRoleKey}`,
    },
    body: JSON.stringify({
      business_id,
      ads_library_url,
      brand_name,
      user_id: user.id,
    }),
  })

  const text = await fnResponse.text().catch(() => "")
  const parsed = (() => {
    try {
      return text ? JSON.parse(text) : null
    } catch {
      return null
    }
  })()

  const res = NextResponse.json(parsed ?? { raw: text }, { status: fnResponse.status })
  cookiesToSet.forEach(({ name, value, options }) => res.cookies.set(name, value, options))
  return res
}

