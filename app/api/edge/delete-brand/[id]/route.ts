import { createServerClient } from "@supabase/ssr"
import { NextResponse, type NextRequest } from "next/server"
import { getSupabaseAdminClient } from "@/lib/supabase/admin"

type CookieToSet = { name: string; value: string; options: any }

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: brandId } = await params
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

  const { data: brand, error: brandErr } = await admin.from("brands").select("id, user_id, business_id").eq("id", brandId).maybeSingle()
  if (brandErr || !brand) {
    const res = NextResponse.json({ error: "Brand not found" }, { status: 404 })
    cookiesToSet.forEach(({ name, value, options }) => res.cookies.set(name, value, options))
    return res
  }

  const { data: business } = await admin.from("businesses").select("id, user_id, is_shared").eq("id", brand.business_id).maybeSingle()
  if (!business) {
    const res = NextResponse.json({ error: "Business not found" }, { status: 404 })
    cookiesToSet.forEach(({ name, value, options }) => res.cookies.set(name, value, options))
    return res
  }

  const brandOwnerId = (brand as any).user_id
  const businessOwnerId = (business as any).user_id
  const isShared = Boolean((business as any).is_shared)

  if (!isAdmin) {
    if (isShared) {
      const res = NextResponse.json({ error: "Forbidden. You cannot delete brands in admin-owned shared businesses." }, { status: 403 })
      cookiesToSet.forEach(({ name, value, options }) => res.cookies.set(name, value, options))
      return res
    }
    if (businessOwnerId !== user.id && brandOwnerId !== user.id) {
      const res = NextResponse.json({ error: "Forbidden. You can only delete brands you created." }, { status: 403 })
      cookiesToSet.forEach(({ name, value, options }) => res.cookies.set(name, value, options))
      return res
    }
  }

  const { error: rawErr } = await admin.from("raw_data").delete().eq("brand_id", brandId)
  if (rawErr) {
    const res = NextResponse.json({ error: `Failed to delete raw_data: ${rawErr.message}` }, { status: 500 })
    cookiesToSet.forEach(({ name, value, options }) => res.cookies.set(name, value, options))
    return res
  }

  const { error: creativeErr } = await admin.from("brand_creative_summary").delete().eq("brand_id", brandId)
  if (creativeErr) {
    const res = NextResponse.json({ error: `Failed to delete brand_creative_summary: ${creativeErr.message}` }, { status: 500 })
    cookiesToSet.forEach(({ name, value, options }) => res.cookies.set(name, value, options))
    return res
  }

  const { error: funnelErr } = await admin.from("brand_funnel_summary").delete().eq("brand_id", brandId)
  if (funnelErr) {
    const res = NextResponse.json({ error: `Failed to delete brand_funnel_summary: ${funnelErr.message}` }, { status: 500 })
    cookiesToSet.forEach(({ name, value, options }) => res.cookies.set(name, value, options))
    return res
  }

  const { error: deleteErr } = await admin.from("brands").delete().eq("id", brandId)
  if (deleteErr) {
    const res = NextResponse.json({ error: deleteErr.message }, { status: 500 })
    cookiesToSet.forEach(({ name, value, options }) => res.cookies.set(name, value, options))
    return res
  }

  const res = NextResponse.json({ success: true })
  cookiesToSet.forEach(({ name, value, options }) => res.cookies.set(name, value, options))
  return res
}
