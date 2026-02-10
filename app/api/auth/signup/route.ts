import { NextResponse } from 'next/server'

import { getSupabaseAdminClient } from '@/lib/supabase/admin'

export async function POST(request: Request) {
  // Fail fast if env is missing (common in production when SUPABASE_SERVICE_ROLE_KEY not set in Vercel)
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !serviceRoleKey) {
    console.error('[signup] Missing SUPABASE env vars in production')
    return NextResponse.json(
      { error: 'Server misconfigured. Add SUPABASE_SERVICE_ROLE_KEY in Vercel project settings.' },
      { status: 503 }
    )
  }

  try {
    const body = await request.json().catch(() => null)
    const email = typeof body?.email === 'string' ? body.email.trim() : ''
    const password = typeof body?.password === 'string' ? body.password : ''

    if (!email || !password) {
      return NextResponse.json({ error: 'Email and password are required' }, { status: 400 })
    }

    if (password.length < 6) {
      return NextResponse.json(
        { error: 'Password must be at least 6 characters' },
        { status: 400 }
      )
    }

    const admin = getSupabaseAdminClient()

    const { data, error } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    })

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 })
    }

    const userId = data.user?.id
    if (userId) {
      const { error: profileErr } = await admin
        .from('user_profiles')
        .upsert({ id: userId, is_admin: false }, { onConflict: 'id' })
      if (profileErr) {
        console.error('[signup] Failed to create user_profile:', profileErr.message)
      }
    }

    return NextResponse.json({ ok: true }, { status: 200 })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Signup failed'
    console.error('[signup]', msg)
    return NextResponse.json({ error: 'Signup failed' }, { status: 500 })
  }
}

