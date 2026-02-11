import { createServerClient } from "@supabase/ssr"
import { NextResponse, type NextRequest } from "next/server"
import { getSupabaseAdminClient } from "@/lib/supabase/admin"

type CookieToSet = { name: string; value: string; options: any }

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: businessId } = await params
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!url || !anonKey) {
    return NextResponse.json({ error: "Missing Supabase env" }, { status: 500 })
  }

  const cookiesToSet: CookieToSet[] = []
  const supabase = createServerClient(url, anonKey, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (cookies) => cookies.forEach((c) => cookiesToSet.push(c as CookieToSet)),
    },
  })

  const { data: { user }, error: userError } = await supabase.auth.getUser()
  if (userError || !user) {
    const res = NextResponse.json({ error: "Not authenticated" }, { status: 401 })
    cookiesToSet.forEach(({ name, value, options }) => res.cookies.set(name, value, options))
    return res
  }

  const admin = getSupabaseAdminClient()
  const { data: profile } = await admin.from("user_profiles").select("is_admin").eq("id", user.id).maybeSingle()
  const isAdmin = (profile as any)?.is_admin === true

  const { data: business, error: bizErr } = await admin.from("businesses").select("id, user_id, is_shared").eq("id", businessId).maybeSingle()
  if (bizErr || !business) {
    const res = NextResponse.json({ error: "Business not found" }, { status: 404 })
    cookiesToSet.forEach(({ name, value, options }) => res.cookies.set(name, value, options))
    return res
  }

  const ownerId = (business as any).user_id
  const isShared = Boolean((business as any).is_shared)

  if (!isAdmin) {
    if (isShared) {
      const res = NextResponse.json({ error: "Forbidden. You cannot delete admin-created shared businesses." }, { status: 403 })
      cookiesToSet.forEach(({ name, value, options }) => res.cookies.set(name, value, options))
      return res
    }
    if (ownerId !== user.id) {
      const res = NextResponse.json({ error: "Forbidden. You can only delete businesses you created." }, { status: 403 })
      cookiesToSet.forEach(({ name, value, options }) => res.cookies.set(name, value, options))
      return res
    }
  }

  const { data: brands } = await admin.from("brands").select("id").eq("business_id", businessId)
  for (const b of brands || []) {
    const { error: rawErr } = await admin.from("raw_data").delete().eq("brand_id", b.id)
    if (rawErr) {
      const res = NextResponse.json({ error: `Failed to delete raw_data: ${rawErr.message}` }, { status: 500 })
      cookiesToSet.forEach(({ name, value, options }) => res.cookies.set(name, value, options))
      return res
    }
    await admin.from("brand_creative_summary").delete().eq("brand_id", b.id)
    await admin.from("brand_funnel_summary").delete().eq("brand_id", b.id)
  }
  const { error: brandsDelErr } = await admin.from("brands").delete().eq("business_id", businessId)
  if (brandsDelErr) {
    const res = NextResponse.json({ error: brandsDelErr.message }, { status: 500 })
    cookiesToSet.forEach(({ name, value, options }) => res.cookies.set(name, value, options))
    return res
  }
  await admin.from("brand_creative_summary").delete().eq("business_id", businessId)
  await admin.from("brand_funnel_summary").delete().eq("business_id", businessId)
  const { error: deleteErr } = await admin.from("businesses").delete().eq("id", businessId)
  if (deleteErr) {
    const res = NextResponse.json({ error: deleteErr.message }, { status: 500 })
    cookiesToSet.forEach(({ name, value, options }) => res.cookies.set(name, value, options))
    return res
  }

  const res = NextResponse.json({ success: true })
  cookiesToSet.forEach(({ name, value, options }) => res.cookies.set(name, value, options))
  return res
}
