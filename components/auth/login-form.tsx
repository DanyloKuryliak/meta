"use client"

import { useEffect, useState } from "react"
import { useSearchParams } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Loader2, AlertCircle } from "lucide-react"
import { getSupabaseClient } from "@/lib/supabase/client"

export function LoginForm({
  initialError,
}: { initialError?: string } = {}) {
  const searchParams = useSearchParams()
  const next = searchParams.get("next") || "/"

  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [isLoading, setIsLoading] = useState(false)
  const [isSignUp, setIsSignUp] = useState(false)
  const [error, setError] = useState<string | null>(initialError ?? null)

  useEffect(() => {
    setError(initialError ?? null)
  }, [initialError])

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!email?.trim() || !password) return

    setIsLoading(true)
    setError(null)
    try {
      const supabase = getSupabaseClient()
      const { data, error: signInError } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      })
      if (signInError) throw signInError
      if (data?.session) {
        window.location.assign(next)
        return
      }
      throw new Error("Sign in failed")
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Invalid email or password")
    } finally {
      setIsLoading(false)
    }
  }

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!email?.trim() || !password) return
    if (password.length < 6) {
      setError("Password must be at least 6 characters")
      return
    }

    setIsLoading(true)
    setError(null)
    try {
      const res = await fetch("/api/auth/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim(), password }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data?.error || "Sign up failed")

      const supabase = getSupabaseClient()
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      })
      if (signInError) throw signInError
      window.location.assign(next)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Sign up failed")
    } finally {
      setIsLoading(false)
    }
  }

  const handleSubmit = isSignUp ? handleSignUp : handleSignIn

  return (
    <Card className="w-full max-w-md mx-auto">
      <CardHeader>
        <CardTitle>{isSignUp ? "Sign up" : "Sign in"}</CardTitle>
        <CardDescription>
          {isSignUp
            ? "Create an account with your email and password"
            : "Enter your email and password"}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoFocus
              className="bg-muted border-border"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              type="password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={6}
              className="bg-muted border-border"
            />
          </div>
          <div className="flex gap-2">
            <Button type="submit" disabled={isLoading} className="flex-1">
              {isLoading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  {isSignUp ? "Creating account..." : "Signing in..."}
                </>
              ) : isSignUp ? (
                "Sign up"
              ) : (
                "Sign in"
              )}
            </Button>
            <Button
              type="button"
              variant="ghost"
              disabled={isLoading}
              onClick={() => {
                setIsSignUp((v) => !v)
                setError(null)
              }}
            >
              {isSignUp ? "Sign in instead" : "Sign up instead"}
            </Button>
          </div>
        </form>

        {error && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
      </CardContent>
    </Card>
  )
}
