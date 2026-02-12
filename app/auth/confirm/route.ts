import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'

/**
 * Handles magic link verification when user clicks the link in their email.
 * The Magic Link email template should use: {{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email
 */
export async function GET(request: Request) {
  const requestUrl = new URL(request.url)
  const tokenHash = requestUrl.searchParams.get('token_hash')
  const type = requestUrl.searchParams.get('type')
  const next = requestUrl.searchParams.get('next') || '/'

  if (!tokenHash || type !== 'email') {
    return NextResponse.redirect(new URL(`/auth/login?error=${encodeURIComponent('Invalid or expired verification link')}`, requestUrl.origin))
  }

  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return cookieStore.get(name)?.value
        },
        set(name: string, value: string, options: Record<string, unknown>) {
          try {
            cookieStore.set({ name, value, ...options })
          } catch {
            // ignore
          }
        },
        remove(name: string, options: Record<string, unknown>) {
          try {
            cookieStore.set({ name, value: '', ...options })
          } catch {
            // ignore
          }
        },
      },
    }
  )

  const { error } = await supabase.auth.verifyOtp({
    token_hash: tokenHash,
    type: 'email',
  })

  if (error) {
    return NextResponse.redirect(new URL(`/auth/login?error=${encodeURIComponent(error.message)}`, requestUrl.origin))
  }

  return NextResponse.redirect(new URL(next, requestUrl.origin))
}
