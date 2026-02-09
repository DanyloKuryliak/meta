"use client"

import React from "react"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Loader2, Plus, CheckCircle, AlertCircle } from "lucide-react"
import { getSupabaseClient } from "@/lib/supabase"
import type { Business } from "@/lib/supabase"

type IngestResult = {
  success: boolean
  message?: string
  error?: string
  brand?: {
    id: string
    brand_name: string
  }
  ingestion?: {
    inserted: number
    transformed: number
    received: number
  }
  summaries?: {
    creative: number
    funnel: number
  }
}

export function AddCompetitorForm({ 
  onSuccess,
  businesses = []
}: { 
  onSuccess?: () => void
  businesses?: Business[]
}) {
  const [adsLibraryUrl, setAdsLibraryUrl] = useState("")
  const [brandName, setBrandName] = useState("")
  const [selectedBusinessId, setSelectedBusinessId] = useState<string>("")
  const [isLoading, setIsLoading] = useState(false)
  const [result, setResult] = useState<IngestResult | null>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsLoading(true)
    setResult(null)

    if (!selectedBusinessId) {
      setResult({ success: false, error: "Please select a business" })
      setIsLoading(false)
      return
    }

    try {
      const supabase = getSupabaseClient()
      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
      const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
      if (!supabaseUrl || !anonKey) throw new Error("Supabase configuration missing")

      // Call Edge Function with authentication
      const response = await fetch(`${supabaseUrl}/functions/v1/ingest_from_url`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${anonKey}`,
          "apikey": anonKey,
        },
        body: JSON.stringify({
          ads_library_url: adsLibraryUrl,
          brand_name: brandName || undefined,
          business_id: selectedBusinessId,
        }),
      })

      let data: any
      try {
        data = await response.json()
      } catch (jsonError) {
        const text = await response.text()
        setResult({ 
          success: false, 
          error: `Invalid response: ${text.substring(0, 200)}` 
        })
        return
      }
      
      if (!response.ok) {
        setResult({ 
          success: false, 
          error: data.error?.message || data.error || `HTTP ${response.status}: ${JSON.stringify(data).substring(0, 200)}` 
        })
        return
      }
      
      setResult(data as IngestResult)

      if (data.success) {
        // Clear form on success
        setAdsLibraryUrl("")
        setBrandName("")
        setSelectedBusinessId("")
        
        // Call onSuccess callback to refresh dashboard data
        if (onSuccess) {
          onSuccess()
        }
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
          <Plus className="h-5 w-5" />
          Add Competitor
        </CardTitle>
        <CardDescription>
          Enter a Meta Ads Library URL to track a new competitor's ads and funnels.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="ads-library-url">Meta Ads Library URL *</Label>
            <Input
              id="ads-library-url"
              type="url"
              placeholder="https://www.facebook.com/ads/library/?active_status=all&ad_type=all&country=ALL&search_type=page&view_all_page_id=123456789"
              value={adsLibraryUrl}
              onChange={(e) => setAdsLibraryUrl(e.target.value)}
              required
              className="bg-muted border-border"
            />
            <p className="text-xs text-muted-foreground">
              Find this URL by going to Meta Ads Library, searching for a brand, and copying the URL.
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="business-select">Business *</Label>
            <Select value={selectedBusinessId} onValueChange={setSelectedBusinessId} required>
              <SelectTrigger id="business-select" className="bg-muted border-border">
                <SelectValue placeholder="Select a business" />
              </SelectTrigger>
              <SelectContent>
                {businesses.length === 0 ? (
                  <SelectItem value="" disabled>No businesses available</SelectItem>
                ) : (
                  businesses.map((business) => (
                    <SelectItem key={business.id} value={business.id}>
                      {business.business_name}
                    </SelectItem>
                  ))
                )}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              Select which business this competitor belongs to.
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="brand-name">Brand Name (Optional)</Label>
            <Input
              id="brand-name"
              type="text"
              placeholder="e.g., Competitor Name"
              value={brandName}
              onChange={(e) => setBrandName(e.target.value)}
              className="bg-muted border-border"
            />
            <p className="text-xs text-muted-foreground">
              Leave empty to auto-extract from URL. System will automatically fetch last 30 days of data.
            </p>
          </div>

          <Button 
            type="submit" 
            disabled={isLoading || !adsLibraryUrl || !selectedBusinessId}
            className="w-full md:w-auto"
          >
            {isLoading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Fetching Creatives...
              </>
            ) : (
              <>
                <Plus className="mr-2 h-4 w-4" />
                Add Competitor
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
                  {result.brand && (
                    <p className="mt-1">
                      Brand: <strong>{result.brand.brand_name}</strong>
                    </p>
                  )}
                  {result.ingestion && (
                    <p className="mt-1">
                      Received {result.ingestion.received} ads, inserted {result.ingestion.inserted} new records.
                    </p>
                  )}
                  {result.summaries && (
                    <p className="mt-1">
                      Creative summaries: {result.summaries.creative} | 
                      Funnel summaries: {result.summaries.funnel}
                    </p>
                  )}
                </AlertDescription>
              </Alert>
            ) : (
              <Alert className="bg-red-950/50 border-red-900">
                <AlertCircle className="h-4 w-4 text-red-500" />
                <AlertTitle className="text-red-400">Error</AlertTitle>
                <AlertDescription className="text-red-300">
                  {result.error || "An error occurred while fetching creatives."}
                </AlertDescription>
              </Alert>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
