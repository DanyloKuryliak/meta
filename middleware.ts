import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

const PUBLIC_FILE = /\.(.*)$/

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  // Skip middleware for Next internals/static files
  if (
    pathname.startsWith('/api') ||
    pathname.startsWith('/auth') ||
    pathname.startsWith('/_next') ||
    pathname.startsWith('/favicon') ||
    PUBLIC_FILE.test(pathname)
  ) {
    return NextResponse.next()
  }

  let response = NextResponse.next({
    request: {
      headers: request.headers,
    },
  })

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!url || !anonKey) {
    // If env isn't configured, let the app render error messages.
    return response
  }

  const supabase = createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll()
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value, options }) => {
          // Update both request (so subsequent reads in this middleware see it)
          request.cookies.set(name, value)
          // And response (so browser receives it)
          response.cookies.set(name, value, options)
        })
      },
    },
  })

  // This refreshes the session cookie if needed.
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const isAuthRoute = pathname.startsWith('/auth')
  const isCallbackRoute = pathname.startsWith('/auth/callback')
  const isLoginRoute = pathname.startsWith('/auth/login')

  const isPublicRoute = isCallbackRoute || isLoginRoute

  if (!user && !isPublicRoute) {
    const nextUrl = request.nextUrl.clone()
    nextUrl.pathname = '/auth/login'
    nextUrl.searchParams.set('next', pathname)
    return NextResponse.redirect(nextUrl)
  }

  if (user && isLoginRoute) {
    const next = request.nextUrl.searchParams.get('next') || '/'
    const nextUrl = request.nextUrl.clone()
    nextUrl.pathname = next
    nextUrl.search = ''
    return NextResponse.redirect(nextUrl)
  }

  return response
}

export const config = {
  matcher: ['/((?!_next/static|_next/image).*)'],
}

