"use client"

import { createContext, useContext, useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import type { AuthChangeEvent, Session, User } from "@supabase/supabase-js"
import { getSupabaseClient } from "@/lib/supabase/client"

type AuthContextType = {
  user: User | null
  loading: boolean
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  loading: true,
  signOut: async () => {},
})

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const supabase = getSupabaseClient()
    
    // Get initial session
    const initializeAuth = async () => {
      const { data: { session }, error } = await supabase.auth.getSession()
      if (error) {
        const msg = error?.message ?? ''
        const isRefreshTokenError = /refresh\s*token|invalid\s*refresh|token\s*not\s*found/i.test(msg)
        if (isRefreshTokenError) {
          await supabase.auth.signOut()
          setUser(null)
        } else {
          console.error('Error getting session:', error)
        }
      }
      setUser(session?.user ?? null)
      setLoading(false)
    }
    
    initializeAuth()

    // Listen for auth changes
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (event: AuthChangeEvent, session: Session | null) => {
      setUser(session?.user ?? null)
      setLoading(false)
    })

    return () => subscription.unsubscribe()
  }, [])

  const signOut = async () => {
    // For SSR-cookie auth, sign-out must run on the server
    // so the response can clear httpOnly auth cookies.
    try {
      await fetch("/api/auth/signout", { method: "POST" })
    } catch (e) {
      // fall through: we still force UI state to logged-out
      console.warn("Sign out request failed:", e)
    }

    setUser(null)
    router.replace("/auth/login")
    router.refresh()
  }

  return (
    <AuthContext.Provider value={{ user, loading, signOut }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  return useContext(AuthContext)
}
