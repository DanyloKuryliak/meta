import { createServerClient } from "@supabase/ssr"
import { NextResponse, type NextRequest } from "next/server"
import { getSupabaseAdminClient } from "@/lib/supabase/admin"

export const maxDuration = 300

type CookieToSet = { name: string; value: string; options: any }

function formatDate(d: Date | string): string {
  if (typeof d === "string") return d
  return d.toISOString().split("T")[0]
}

function transformCreativeToRaw(creative: any, brandId: string) {
  const snapshot = creative.snapshot || {}
  let startDate: Date | null = null
  if (creative.start_date) {
    const ts = typeof creative.start_date === "number" ? creative.start_date : parseInt(String(creative.start_date))
    if (!isNaN(ts) && ts > 0) {
      startDate = new Date(ts * 1000)
      if (isNaN(startDate.getTime())) startDate = null
    }
  }
  if (!startDate || isNaN(startDate.getTime())) startDate = new Date()

  let endDate: string | null = null
  if (creative.end_date) {
    const ts = typeof creative.end_date === "number" ? creative.end_date : parseInt(String(creative.end_date))
    if (!isNaN(ts) && ts > 0) {
      const d = new Date(ts * 1000)
      if (!isNaN(d.getTime())) endDate = formatDate(d)
    }
  }

  let linkUrl = snapshot.link_url || null
  if (!linkUrl && snapshot.cards?.length) linkUrl = snapshot.cards[0]?.link_url || null
  const caption = snapshot.caption || null
  const pageName = snapshot.page_name || creative.page_name || null
  const pageId = String(snapshot.page_id || creative.page_id || "")
  let adArchiveId = String(creative.ad_archive_id || creative.id || "")
  if (!adArchiveId || adArchiveId === "undefined" || adArchiveId === "null") {
    adArchiveId = crypto.randomUUID()
  }
  const adLibraryUrl = creative.url || creative.ad_library_url || null

  return {
    id: adArchiveId,
    brand_id: brandId,
    ad_archive_id: adArchiveId,
    source: "json",
    ad_library_url: adLibraryUrl,
    page_id: pageId,
    page_name: pageName,
    start_date: startDate.toISOString(),
    end_date: endDate,
    link_url: linkUrl,
    caption: caption,
  }
}

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

  const body = await request.json().catch(() => null)
  const business_id = typeof body?.business_id === "string" ? body.business_id : ""
  const creatives = Array.isArray(body?.creatives) ? body.creatives : null
  const brand_name = typeof body?.brand_name === "string" ? body.brand_name : undefined
  const ads_library_url = typeof body?.ads_library_url === "string" ? body.ads_library_url : undefined

  if (!business_id || !creatives?.length) {
    const res = NextResponse.json({ error: "Missing business_id or creatives" }, { status: 400 })
    cookiesToSet.forEach(({ name, value, options }) => res.cookies.set(name, value, options))
    return res
  }

  const admin = getSupabaseAdminClient()
  const { data: profile } = await admin.from("user_profiles").select("is_admin").eq("id", user.id).maybeSingle()
  const isAdmin = (profile as any)?.is_admin === true

  const { data: business } = await admin.from("businesses").select("id, user_id, is_shared").eq("id", business_id).maybeSingle()
  if (!business) {
    const res = NextResponse.json({ error: "Business not found" }, { status: 404 })
    cookiesToSet.forEach(({ name, value, options }) => res.cookies.set(name, value, options))
    return res
  }

  const isShared = Boolean((business as any).is_shared)
  const ownerId = (business as any).user_id
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

  // Parse logic inlined – no Edge Function call
  const firstCreative = creatives[0]
  const pageNames = creatives
    .map((c: any) => c.snapshot?.page_name || c.page_name)
    .filter((n: any) => n && typeof n === "string" && n.trim())
  let extractedBrandName = brand_name
  if (!extractedBrandName && pageNames.length > 0) {
    const counts: Record<string, number> = {}
    pageNames.forEach((n: string) => { counts[n] = (counts[n] || 0) + 1 })
    extractedBrandName = Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0] || pageNames[0]
  }
  const finalBrandName = (extractedBrandName || "Unknown Brand").trim().slice(0, 120)

  const firstAdLibraryUrl = firstCreative.url || firstCreative.ad_library_url || null
  const brandIdentifier = ads_library_url || firstAdLibraryUrl || null

  let brand_id: string
  if (!brandIdentifier) {
    const { data: existing } = await admin
      .from("brands")
      .select("id")
      .eq("business_id", business_id)
      .eq("brand_name", finalBrandName)
      .maybeSingle()
    if (existing?.id) {
      brand_id = existing.id
      await admin.from("brands").update({ brand_name: finalBrandName, is_active: true, user_id: user.id }).eq("id", brand_id)
    } else {
      brand_id = crypto.randomUUID()
      const { error: err } = await admin.from("brands").insert({
        id: brand_id,
        brand_name: finalBrandName,
        ads_library_url: null,
        is_active: true,
        business_id,
        user_id: user.id,
      }).select("id").single()
      if (err) {
        const res = NextResponse.json({ success: false, error: (err as Error).message }, { status: 500 })
        cookiesToSet.forEach(({ name, value, options }) => res.cookies.set(name, value, options))
        return res
      }
    }
  } else {
    const { data: existing } = await admin.from("brands").select("id").eq("ads_library_url", brandIdentifier).maybeSingle()
    if (existing?.id) {
      brand_id = existing.id
      await admin.from("brands").update({ brand_name: finalBrandName, is_active: true, business_id, user_id: user.id }).eq("id", brand_id)
    } else {
      brand_id = crypto.randomUUID()
      const { error: err } = await admin.from("brands").insert({
        id: brand_id,
        brand_name: finalBrandName,
        ads_library_url: brandIdentifier,
        is_active: true,
        business_id,
        user_id: user.id,
      }).select("id").single()
      if (err) {
        const res = NextResponse.json({ success: false, error: (err as Error).message }, { status: 500 })
        cookiesToSet.forEach(({ name, value, options }) => res.cookies.set(name, value, options))
        return res
      }
    }
  }

  const rows = creatives
    .filter((c: any) => c && (c.ad_archive_id || c.id) && !c.errorCode && !c.error)
    .map((c: any) => transformCreativeToRaw(c, brand_id))

  if (rows.length === 0) {
    const res = NextResponse.json({
      success: false,
      error: "No valid creatives. Need ad_archive_id or id.",
      brand: { id: brand_id, brand_name: finalBrandName },
      ingestion: { received: creatives.length, inserted: 0 },
    }, { status: 400 })
    cookiesToSet.forEach(({ name, value, options }) => res.cookies.set(name, value, options))
    return res
  }

  const BATCH_SIZE = 500
  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE).filter((r) => r.ad_archive_id?.trim())
    if (batch.length && (await admin.from("raw_data").upsert(batch, { onConflict: "ad_archive_id" })).error) {
      const res = NextResponse.json({ success: false, error: "Failed to insert creatives" }, { status: 500 })
      cookiesToSet.forEach(({ name, value, options }) => res.cookies.set(name, value, options))
      return res
    }
  }

  const { count } = await admin.from("raw_data").select("*", { count: "exact", head: true }).eq("brand_id", brand_id)
  await admin.from("brands").update({
    last_fetched_date: formatDate(new Date()),
    last_fetch_status: "success",
    last_fetch_error: null,
  }).eq("id", brand_id)

  let summaryResult = { creative: 0, funnel: 0 }
  try {
    const summaryRes = await fetch(`${url}/functions/v1/populate_summaries`, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: anonKey, Authorization: `Bearer ${serviceRoleKey}` },
      body: JSON.stringify({ brand_id, business_id }),
    })
    const sd = await summaryRes.json().catch(() => ({}))
    summaryResult = { creative: sd.creative || 0, funnel: sd.funnel || 0 }
  } catch (_) {}

  const payload = {
    success: true,
    message: "JSON parsing completed successfully",
    brand: { id: brand_id, brand_name: finalBrandName },
    ingestion: {
      received: creatives.length,
      inserted: count ?? 0,
      transformed: rows.length,
      batches: Math.ceil(rows.length / BATCH_SIZE),
    },
    summaries: summaryResult,
  }
  const res = NextResponse.json(payload, { status: 200 })
  cookiesToSet.forEach(({ name, value, options }) => res.cookies.set(name, value, options))
  return res
}
