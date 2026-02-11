"use client"

import React, { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Loader2, Building2, CheckCircle, AlertCircle } from "lucide-react"
import { getSupabaseClient } from "@/lib/supabase/client"
import { useAuth } from "@/components/auth/auth-provider"

type AddBusinessResult = {
  success: boolean
  message?: string
  error?: string
  business?: {
    id: string
    business_name: string
  }
}

export function AddBusinessForm({ onSuccess, isAdmin = false }: { onSuccess?: () => void; isAdmin?: boolean }) {
  const { user } = useAuth()
  const [businessName, setBusinessName] = useState("")
  const [isLoading, setIsLoading] = useState(false)
  const [result, setResult] = useState<AddBusinessResult | null>(null)

  const insertBusiness = async (isShared: boolean) => {
    const supabase = getSupabaseClient()
    return await supabase
      .from("businesses")
      .insert({
        business_name: businessName.trim(),
        is_active: true,
        user_id: user!.id,
        is_shared: isShared,
      })
      .select("id, business_name")
      .single()
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsLoading(true)
    setResult(null)

    if (!businessName.trim()) {
      setResult({ success: false, error: "Business name is required" })
      setIsLoading(false)
      return
    }

    try {
      if (!user) {
        throw new Error("You must be logged in to add a business")
      }

      // Admin (host) creates shared businesses only. Regular users create private (yours).
      const { data, error } = await insertBusiness(isAdmin)

      if (error) throw error

      setResult({
        success: true,
        message: "Business added successfully",
        business: data,
      })

      // Clear form on success
      setBusinessName("")

      // Call onSuccess callback to refresh dashboard data
      if (onSuccess) {
        onSuccess()
      }
    } catch (error) {
      setResult({
        success: false,
        error: error instanceof Error ? error.message : "An unexpected error occurred",
      })
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <Card className="bg-card border-border">
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-2">
          <Building2 className="h-5 w-5" />
          Add Business
        </CardTitle>
        <CardDescription>
          Create a new Genesis business to organize competitors.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="business-name">Business Name *</Label>
            <Input
              id="business-name"
              type="text"
              placeholder="e.g., Business 1, Business 2"
              value={businessName}
              onChange={(e) => setBusinessName(e.target.value)}
              required
              className="bg-muted border-border"
            />
            <p className="text-xs text-muted-foreground">
              {isAdmin ? "As admin (host), you create shared businesses visible to all users." : "You create private businesses (yours); only you can add competitors to them."}
            </p>
          </div>

          <Button 
            type="submit" 
            disabled={isLoading || !businessName.trim()}
            className="w-full md:w-auto"
          >
            {isLoading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Adding...
              </>
            ) : (
              <>
                <Building2 className="mr-2 h-4 w-4" />
                Add Business
              </>
            )}
          </Button>
        </form>

        {result && (
          <div className="mt-4">
            {result.success ? (
              <Alert className="bg-green-950/50 border-green-900">
                <CheckCircle className="h-4 w-4 text-green-500" />
                <AlertTitle className="text-green-400">Success!</AlertTitle>
                <AlertDescription className="text-green-300">
                  <p>{result.message}</p>
                  {result.business && (
                    <p className="mt-1">
                      Business: <strong>{result.business.business_name}</strong>
                    </p>
                  )}
                </AlertDescription>
              </Alert>
            ) : (
              <Alert className="bg-red-950/50 border-red-900">
                <AlertCircle className="h-4 w-4 text-red-500" />
                <AlertTitle className="text-red-400">Error</AlertTitle>
                <AlertDescription className="text-red-300">
                  {result.error || "An error occurred while adding the business."}
                </AlertDescription>
              </Alert>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
