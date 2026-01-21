"use client"

import React from "react"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Loader2, Plus, CheckCircle, AlertCircle } from "lucide-react"

type IngestResult = {
  success: boolean
  message?: string
  error?: string
  brand?: {
    id: string
    name: string
    ads_library_url: string
  }
  ingestion?: {
    inserted: number
    brand_id: string
    ads_processed: number
  }
  summaries?: {
    creative_summary: { inserted: number }
    funnel_summary: { inserted: number }
  }
}

export function AddCompetitorForm({ onSuccess }: { onSuccess?: () => void }) {
  const [adsLibraryUrl, setAdsLibraryUrl] = useState("")
  const [brandName, setBrandName] = useState("")
  const [count, setCount] = useState("10")
  const [isLoading, setIsLoading] = useState(false)
  const [result, setResult] = useState<IngestResult | null>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsLoading(true)
    setResult(null)

    try {
      // Use our API route which can call edge function with service role key
      const response = await fetch("/api/ingest", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          ads_library_url: adsLibraryUrl,
          brand_name: brandName || undefined,
          count: parseInt(count) || 10,
        }),
      })

      const data = await response.json()
      
      if (!response.ok) {
        setResult({ success: false, error: data.error || `HTTP ${response.status}` })
        return
      }
      
      setResult(data as IngestResult)

      if (data.success) {
        // Clear form on success
        setAdsLibraryUrl("")
        setBrandName("")
        setCount("10")
        
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

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
                Leave empty to auto-extract from URL.
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="count">Number of Creatives</Label>
              <Input
                id="count"
                type="number"
                min="1"
                max="100"
                placeholder="10"
                value={count}
                onChange={(e) => setCount(e.target.value)}
                className="bg-muted border-border"
              />
              <p className="text-xs text-muted-foreground">
                How many latest creatives to fetch (default: 10).
              </p>
            </div>
          </div>

          <Button 
            type="submit" 
            disabled={isLoading || !adsLibraryUrl}
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
                      Brand: <strong>{result.brand.name}</strong>
                    </p>
                  )}
                  {result.ingestion && (
                    <p className="mt-1">
                      Processed {result.ingestion.ads_processed} ads, inserted {result.ingestion.inserted} new records.
                    </p>
                  )}
                  {result.summaries && (
                    <p className="mt-1">
                      Creative summaries: {result.summaries.creative_summary.inserted} | 
                      Funnel summaries: {result.summaries.funnel_summary.inserted}
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
