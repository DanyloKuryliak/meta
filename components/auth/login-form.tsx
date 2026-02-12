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

type Step = "email" | "verify"

export function LoginForm({
  initialError,
}: { initialError?: string } = {}) {
  const searchParams = useSearchParams()
  const next = searchParams.get("next") || "/"

  const [step, setStep] = useState<Step>("email")
  const [email, setEmail] = useState("")
  const [otp, setOtp] = useState("")
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(initialError ?? null)

  useEffect(() => {
    setError(initialError ?? null)
  }, [initialError])

  const handleEmailSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!email?.trim()) return

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
