import { createServerClient } from "@supabase/ssr"
import { NextResponse, type NextRequest } from "next/server"
import { getSupabaseAdminClient } from "@/lib/supabase/admin"

type CookieToSet = { name: string; value: string; options: Record<string, unknown> }

async function getAuthUser(request: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !anonKey) return { user: null, cookies: [] as CookieToSet[] }

  const cookiesToSet: CookieToSet[] = []
  const supabase = createServerClient(url, anonKey, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (cookies) =>
        cookies.forEach((c) => cookiesToSet.push(c as CookieToSet)),
    },
  })
  const { data: { user } } = await supabase.auth.getUser()
  return { user, cookies: cookiesToSet }
}

function jsonWithCookies(data: object, cookies: CookieToSet[], status = 200) {
  const res = NextResponse.json(data, { status })
  cookies.forEach(({ name, value, options }) => res.cookies.set(name, value, options))
  return res
}

export async function GET(request: NextRequest) {
  const { user, cookies } = await getAuthUser(request)
  if (!user) return jsonWithCookies({ error: "Not authenticated" }, cookies, 401)

  const admin = getSupabaseAdminClient()
  const { data: profile } = await admin.from("user_profiles").select("is_admin").eq("id", user.id).maybeSingle()
  const isAdmin = (profile as { is_admin?: boolean } | null)?.is_admin === true
  if (!isAdmin) return jsonWithCookies({ error: "Forbidden. Admin only." }, cookies, 403)

  const { data: { users: authUsers } } = await admin.auth.admin.listUsers({ perPage: 500 })
  const { data: profiles } = await admin.from("user_profiles").select("id, is_admin")
  const profileMap = new Map((profiles || []).map((p: { id: string; is_admin?: boolean }) => [p.id, p]))

  const nonAdminUsers = (authUsers || [])
    .filter((u) => !(profileMap.get(u.id) as { is_admin?: boolean })?.is_admin)
    .map((u) => ({ id: u.id, email: u.email || "—" }))

  const { data: sharedBusinesses } = await admin
    .from("businesses")
    .select("id, business_name")
    .eq("is_shared", true)
    .order("business_name", { ascending: true })

  const { data: accessRows } = await admin.from("user_business_access").select("user_id, business_id")

  const accessSet = new Set<string>()
  for (const row of accessRows || []) {
    accessSet.add(`${(row as { user_id: string }).user_id}:${(row as { business_id: string }).business_id}`)
  }

  return jsonWithCookies(
    {
      users: nonAdminUsers,
      businesses: sharedBusinesses || [],
      access: Array.from(accessSet),
    },
    cookies
  )
}

export async function POST(request: NextRequest) {
  const { user, cookies } = await getAuthUser(request)
  if (!user) return jsonWithCookies({ error: "Not authenticated" }, cookies, 401)

  const admin = getSupabaseAdminClient()
  const { data: profile } = await admin.from("user_profiles").select("is_admin").eq("id", user.id).maybeSingle()
  const isAdmin = (profile as { is_admin?: boolean } | null)?.is_admin === true
  if (!isAdmin) return jsonWithCookies({ error: "Forbidden. Admin only." }, cookies, 403)

  const body = await request.json().catch(() => ({}))
  const userId = typeof body?.user_id === "string" ? body.user_id.trim() : ""
  const businessId = typeof body?.business_id === "string" ? body.business_id.trim() : ""
  const granted = Boolean(body?.granted)

  if (!userId || !businessId) {
    return jsonWithCookies({ error: "Missing user_id or business_id" }, cookies, 400)
  }

  const { data: business } = await admin
    .from("businesses")
    .select("id, is_shared")
    .eq("id", businessId)
    .maybeSingle()
  if (!business || !(business as { is_shared?: boolean }).is_shared) {
    return jsonWithCookies({ error: "Business not found or not shared" }, cookies, 404)
  }

  if (granted) {
    const { error } = await admin.from("user_business_access").upsert(
      { user_id: userId, business_id: businessId },
      { onConflict: "user_id,business_id" }
    )
    if (error) return jsonWithCookies({ error: error.message }, cookies, 500)
  } else {
    const { error } = await admin
      .from("user_business_access")
      .delete()
      .eq("user_id", userId)
      .eq("business_id", businessId)
    if (error) return jsonWithCookies({ error: error.message }, cookies, 500)
  }

  return jsonWithCookies({ ok: true, granted }, cookies)
}
