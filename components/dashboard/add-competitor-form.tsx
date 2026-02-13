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
import { getSupabaseClient } from "@/lib/supabase/client"
import type { Business, Brand } from "@/lib/supabase"
import { useAuth } from "@/components/auth/auth-provider"
import useSWR from "swr"

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

const brandsFetcher = async (businessId: string): Promise<Brand[]> => {
  if (!businessId) return []
  const supabase = getSupabaseClient()
  const { data, error } = await supabase
    .from("brands")
    .select("*")
    .eq("business_id", businessId)
    .order("brand_name", { ascending: true })
  
  if (error) throw error
  return data || []
}

export function AddCompetitorForm({ 
  onSuccess,
  businesses = [],
  selectedBusinessForBrands = "",
  currentUserId = "",
  isAdmin = false
}: { 
  onSuccess?: () => void
  businesses?: Business[]
  selectedBusinessForBrands?: string
  currentUserId?: string
  isAdmin?: boolean
}) {
  const { user } = useAuth()
  const [adsLibraryUrl, setAdsLibraryUrl] = useState("")
  const [brandName, setBrandName] = useState("")
  const [creativesCount, setCreativesCount] = useState<string>("")
  const [selectedBusinessId, setSelectedBusinessId] = useState<string>("")
  const [isLoading, setIsLoading] = useState(false)
  const [result, setResult] = useState<IngestResult | null>(null)
  
  // Fetch brands for the selected business from header
  const { data: brands, error: brandsError } = useSWR(
    selectedBusinessForBrands && selectedBusinessForBrands !== "all" ? `brands-${selectedBusinessForBrands}` : null,
    () => brandsFetcher(selectedBusinessForBrands === "all" ? "" : selectedBusinessForBrands)
  )

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsLoading(true)
    setResult(null)

    if (!selectedBusinessId) {
      setResult({ success: false, error: "Please select a business" })
      setIsLoading(false)
      return
    }

    if (!user) {
      setResult({ success: false, error: "You must be logged in to add a competitor" })
      setIsLoading(false)
      return
    }

    try {
      const countNum = creativesCount.trim() ? parseInt(creativesCount.trim(), 10) : 500
      const count = countNum != null && !isNaN(countNum) && countNum > 0 ? Math.min(25000, countNum) : 500
      const response = await fetch("/api/edge/ingest-from-url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ads_library_url: adsLibraryUrl,
          brand_name: brandName || undefined,
          business_id: selectedBusinessId,
          count,
        }),
      })

      const text = await response.text().catch(() => "")
      const parsed = (() => {
        try {
          return text ? JSON.parse(text) : null
        } catch {
          return null
        }
      })()

      let data: any
      try {
        data = parsed ?? (text ? JSON.parse(text) : null)
      } catch (jsonError) {
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
        setCreativesCount("")
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
            <Select 
              value={selectedBusinessId} 
              onValueChange={setSelectedBusinessId} 
              required
            >
              <SelectTrigger id="business-select" className="bg-muted border-border">
                <SelectValue placeholder="Select a business" />
              </SelectTrigger>
              <SelectContent>
                {businesses.length === 0 ? (
                  <SelectItem value="none" disabled>No businesses available</SelectItem>
                ) : (
                  businesses.map((business) => {
                    const isOwner = business.user_id === currentUserId
                    const isShared = Boolean(business.is_shared)
                    const canAdd = isAdmin ? isShared : isOwner
                    const label = isAdmin
                      ? business.business_name
                      : isOwner
                        ? `${business.business_name} (Yours)`
                        : isShared
                          ? `${business.business_name} (Shared)`
                          : business.business_name
                    return (
                      <SelectItem 
                        key={business.id} 
                        value={business.id} 
                        disabled={!canAdd}
                      >
                        {label}
                      </SelectItem>
                    )
                  })
                )}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              {isAdmin ? "As admin (host), you add competitors to shared businesses only." : "You can only add competitors to businesses you created (Yours)."}
            </p>
          </div>

          {/* Display brands from selected business */}
          {selectedBusinessForBrands && selectedBusinessForBrands !== "all" && (
            <div className="space-y-2">
              <Label>Brands from Selected Business</Label>
              {brandsError ? (
                <p className="text-xs text-destructive">Error loading brands</p>
              ) : brands && brands.length > 0 ? (
                <div className="border border-border rounded-md p-3 bg-muted/50 max-h-48 overflow-y-auto">
                  <div className="space-y-1">
                    {(() => {
                      const seen = new Set<string>()
                      return brands
                        .filter((brand) => {
                          const key = (brand.brand_name || "").trim().toLowerCase()
                          if (!key || seen.has(key)) return false
                          seen.add(key)
                          return true
                        })
                        .map((brand) => (
                          <div key={brand.id} className="text-sm py-1 px-2 rounded hover:bg-muted">
                            <span className="font-medium">{brand.brand_name}</span>
                            {brand.last_fetch_status && (
                              <span className={`ml-2 text-xs ${
                                brand.last_fetch_status === "success" ? "text-green-600" : "text-red-600"
                              }`}>
                                ({brand.last_fetch_status})
                              </span>
                            )}
                          </div>
                        ))
                    })()}
                  </div>
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">No brands found for this business.</p>
              )}
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="creatives-count">Number of Creatives (Optional)</Label>
            <Input
              id="creatives-count"
              type="number"
              min={1}
              max={25000}
              placeholder="e.g. 300 (default: 500)"
              value={creativesCount}
              onChange={(e) => setCreativesCount(e.target.value)}
              className="bg-muted border-border"
            />
            <p className="text-xs text-muted-foreground">
              Number of creatives for Apify to scrape (default 500 if empty). Max 25000.
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
              Leave empty to auto-extract from URL. Apify scrapes by number of creatives (not by date range).
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
