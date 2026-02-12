"use client"

import { useEffect, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Loader2, AlertCircle } from "lucide-react"
import { getSupabaseClient } from "@/lib/supabase/client"

type Status = "verifying" | "set-password" | "invalid" | "success"

export function ResetPasswordForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const tokenHash = searchParams.get("token_hash")
  const type = searchParams.get("type")

  const [status, setStatus] = useState<Status>("verifying")
  const [password, setPassword] = useState("")
  const [confirm, setConfirm] = useState("")
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!tokenHash || type !== "recovery") {
      setStatus("invalid")
      return
    }
    const supabase = getSupabaseClient()
    supabase.auth
      .verifyOtp({ token_hash: tokenHash, type: "recovery" })
      .then(({ error: verifyError }) => {
        if (verifyError) {
          setError(verifyError.message)
          setStatus("invalid")
        } else {
          setStatus("set-password")
        }
      })
      .catch(() => setStatus("invalid"))
  }, [tokenHash, type])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (password.length < 6) {
      setError("Password must be at least 6 characters")
      return
    }
    if (password !== confirm) {
      setError("Passwords do not match")
      return
    }
    setIsLoading(true)
    setError(null)
    try {
      const supabase = getSupabaseClient()
      const { error: updateError } = await supabase.auth.updateUser({ password })
      if (updateError) throw updateError
      setStatus("success")
      router.replace("/")
      router.refresh()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to set password")
    } finally {
      setIsLoading(false)
    }
  }

  if (status === "verifying") {
    return (
      <Card className="w-full max-w-md mx-auto">
        <CardContent className="pt-6">
          <div className="flex items-center justify-center gap-2 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" />
            <span>Verifying link...</span>
          </div>
        </CardContent>
      </Card>
    )
  }

  if (status === "invalid") {
    return (
      <Card className="w-full max-w-md mx-auto">
        <CardHeader>
          <CardTitle>Invalid or expired link</CardTitle>
          <CardDescription>
            This password reset link is invalid or has expired. Request a new one from the login
            page.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {error && (
            <Alert variant="destructive" className="mb-4">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          <Button asChild className="w-full">
            <Link href="/auth/login">Back to sign in</Link>
          </Button>
        </CardContent>
      </Card>
    )
  }

  if (status === "set-password") {
    return (
      <Card className="w-full max-w-md mx-auto">
        <CardHeader>
          <CardTitle>Set new password</CardTitle>
          <CardDescription>Choose a new password for your account (at least 6 characters).</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="password">New password</Label>
              <Input
                id="password"
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={6}
                autoFocus
                className="bg-muted border-border"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirm">Confirm password</Label>
              <Input
                id="confirm"
                type="password"
                placeholder="••••••••"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                required
                minLength={6}
                className="bg-muted border-border"
              />
            </div>
            {error && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
            <Button type="submit" disabled={isLoading} className="w-full">
              {isLoading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Updating...
                </>
              ) : (
                "Set password"
              )}
            </Button>
          </form>
        </CardContent>
      </Card>
    )
  }

  return null
}
