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
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp"

type Step = "email" | "verify" | "adminPassword"

export function LoginForm({
  initialError,
  adminEmail,
}: { initialError?: string; adminEmail?: string | null } = {}) {
  const searchParams = useSearchParams()
  const next = searchParams.get("next") || "/"

  const [step, setStep] = useState<Step>("email")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [otp, setOtp] = useState("")
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(initialError ?? null)

  useEffect(() => {
    setError(initialError ?? null)
  }, [initialError])

  const isAdminSyntheticEmail = (e: string) =>
    adminEmail && e.trim().toLowerCase() === adminEmail

  const handleEmailSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!email?.trim()) return

    if (isAdminSyntheticEmail(email)) {
      setStep("adminPassword")
      setError(null)
      return
    }

    setIsLoading(true)
    setError(null)
    try {
      const supabase = getSupabaseClient()
      const { error: otpError } = await supabase.auth.signInWithOtp({
        email: email.trim(),
        options: { shouldCreateUser: true },
      })
      if (otpError) throw otpError
      setStep("verify")
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to send verification code")
    } finally {
      setIsLoading(false)
    }
  }

  const handleAdminPasswordSignIn = async (e: React.FormEvent) => {
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
      throw new Error("Sign-in failed. Please try again.")
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Invalid email or password")
    } finally {
      setIsLoading(false)
    }
  }

  const handleBackFromAdminPassword = () => {
    setStep("email")
    setPassword("")
    setError(null)
  }

  const OTP_LENGTH = 8

  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault()
    const code = otp.replace(/\s/g, "")
    if (code.length !== OTP_LENGTH) {
      setError(`Please enter the ${OTP_LENGTH}-digit code`)
      return
    }
    setIsLoading(true)
    setError(null)
    try {
      const supabase = getSupabaseClient()
      const { data, error: verifyError } = await supabase.auth.verifyOtp({
        email: email.trim(),
        token: code,
        type: "email",
      })
      if (verifyError) throw verifyError
      if (data?.session) {
        window.location.assign(next)
        return
      }
      throw new Error("Verification failed. Please try again.")
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Invalid or expired code")
    } finally {
      setIsLoading(false)
    }
  }

  const handleBackToEmail = () => {
    setStep("email")
    setOtp("")
    setError(null)
  }

  return (
    <Card className="w-full max-w-md mx-auto">
      <CardHeader>
        <CardTitle>Sign in</CardTitle>
        <CardDescription>
          {step === "email" && "Enter your email to receive a verification code"}
          {step === "adminPassword" && "Enter your password"}
          {step === "verify" && `Enter the 8-digit code we sent to ${email}`}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {step === "email" && (
          <form onSubmit={handleEmailSubmit} className="space-y-4">
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
            <Button type="submit" disabled={isLoading} className="w-full">
              {isLoading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Sending code...
                </>
              ) : (
                "Send verification code"
              )}
            </Button>
          </form>
        )}

        {step === "verify" && (
          <form onSubmit={handleVerifyOtp} className="space-y-4">
            <div className="space-y-2">
              <Label>Verification code</Label>
              <div className="flex justify-center">
                <InputOTP
                  maxLength={OTP_LENGTH}
                  value={otp}
                  onChange={setOtp}
                  pattern="[0-9]*"
                  inputMode="numeric"
                >
                  <InputOTPGroup className="gap-1">
                    {[...Array(OTP_LENGTH)].map((_, i) => (
                      <InputOTPSlot key={i} index={i} />
                    ))}
                  </InputOTPGroup>
                </InputOTP>
              </div>
              <p className="text-xs text-muted-foreground text-center">
                Enter the 8-digit code sent to your email
              </p>
            </div>
            <div className="flex gap-2">
              <Button
                type="submit"
                disabled={isLoading || otp.length !== OTP_LENGTH}
                className="flex-1"
              >
                {isLoading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Verifying...
                  </>
                ) : (
                  "Verify"
                )}
              </Button>
              <Button type="button" variant="ghost" onClick={handleBackToEmail}>
                Back
              </Button>
            </div>
            <Button
              type="button"
              variant="link"
              className="w-full text-sm"
              onClick={handleEmailSubmit}
              disabled={isLoading}
            >
              Resend code
            </Button>
          </form>
        )}

        {step === "adminPassword" && (
          <form onSubmit={handleAdminPasswordSignIn} className="space-y-4">
            <div className="space-y-2">
              <Label>Email</Label>
              <Input
                type="email"
                value={email}
                readOnly
                className="bg-muted border-border"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="admin-password">Password</Label>
              <Input
                id="admin-password"
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
            <div className="flex gap-2">
              <Button type="submit" disabled={isLoading} className="flex-1">
                {isLoading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Signing in...
                  </>
                ) : (
                  "Sign in"
                )}
              </Button>
              <Button type="button" variant="ghost" onClick={handleBackFromAdminPassword}>
                Back
              </Button>
            </div>
          </form>
        )}

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
