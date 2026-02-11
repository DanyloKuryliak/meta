import { createServerClient } from "@supabase/ssr"
import { NextResponse, type NextRequest } from "next/server"

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

  let body: Record<string, unknown> | null = null
  try {
    body = await request.json()
  } catch {
    body = {}
  }

  const brand_id = typeof body?.brand_id === "string" ? body.brand_id.trim() : undefined
  const business_id = typeof body?.business_id === "string" ? body.business_id.trim() : undefined

  if (!brand_id && !business_id) {
    const res = NextResponse.json(
      { error: "Provide brand_id or business_id to refresh summaries." },
      { status: 400 }
    )
    cookiesToSet.forEach(({ name, value, options }) => res.cookies.set(name, value, options))
    return res
  }

  try {
    const summaryRes = await fetch(`${url}/functions/v1/populate_summaries`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: anonKey,
        Authorization: `Bearer ${serviceRoleKey}`,
      },
      body: JSON.stringify({ brand_id: brand_id || null, business_id: business_id || null }),
    })
    const sd = await summaryRes.json().catch(() => ({}))
    const creative = sd.creative ?? 0
    const funnel = sd.funnel ?? 0

    const res = NextResponse.json({
      success: true,
      message: "Summaries recalculated from all raw data.",
      creative,
      funnel,
    })
    cookiesToSet.forEach(({ name, value, options }) => res.cookies.set(name, value, options))
    return res
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    const res = NextResponse.json(
      { success: false, error: msg },
      { status: 500 }
    )
    cookiesToSet.forEach(({ name, value, options }) => res.cookies.set(name, value, options))
    return res
  }
}
