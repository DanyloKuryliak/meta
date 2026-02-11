"use client"

import React, { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Loader2, Upload, CheckCircle, AlertCircle, FileJson } from "lucide-react"
import type { Business } from "@/lib/supabase"
import { useAuth } from "@/components/auth/auth-provider"

type ParseJsonResult = {
  success: boolean
  message?: string
  error?: string
  brand?: {
    id: string
    brand_name: string
  }
  ingestion?: {
    received: number
    inserted: number
    transformed: number
    batches: number
  }
  summaries?: {
    creative: number
    funnel: number
  }
}

export function ParseJsonForm({ 
  onSuccess,
  businesses = [],
  currentUserId = "",
  isAdmin = false
}: { 
  onSuccess?: () => void
  businesses?: Business[]
  currentUserId?: string
  isAdmin?: boolean
}) {
  const { user } = useAuth()
  const [selectedBusinessId, setSelectedBusinessId] = useState<string>("")
  const [brandName, setBrandName] = useState("")
  const [adsLibraryUrl, setAdsLibraryUrl] = useState("")
  const [jsonFile, setJsonFile] = useState<File | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [result, setResult] = useState<ParseJsonResult | null>(null)

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      if (file.type !== "application/json" && !file.name.endsWith(".json")) {
        setResult({ success: false, error: "Please select a JSON file" })
        return
      }
      setJsonFile(file)
      setResult(null)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsLoading(true)
    setResult(null)

    const businessId = selectedBusinessId?.trim()
    if (!businessId || businessId === "none") {
      setResult({ success: false, error: "Please select a business" })
      setIsLoading(false)
      return
    }

    if (!jsonFile) {
      setResult({ success: false, error: "Please select a JSON file" })
      setIsLoading(false)
      return
    }

    try {
      const fileSizeMB = (jsonFile.size / (1024 * 1024)).toFixed(1)
      if (jsonFile.size > 200 * 1024 * 1024) {
        setResult({ success: false, error: "File is over 200MB. Please split into smaller files (e.g. under 100MB each) to avoid browser memory limits." })
        setIsLoading(false)
        return
      }

      // Read JSON file
      let fileContent: string
      try {
        fileContent = await jsonFile.text()
      } catch (readErr) {
        throw new Error(`Failed to read file (${fileSizeMB}MB). The file may be too large for the browser. Try a smaller file or split it.`)
      }
      let creatives: any[]
      
      try {
        const parsed = JSON.parse(fileContent)
        // Handle: raw array, {creatives}, {data}, or {items} (Apify Facebook Ads Library scraper)
        if (Array.isArray(parsed)) {
          creatives = parsed
        } else if (parsed.creatives && Array.isArray(parsed.creatives)) {
          creatives = parsed.creatives
        } else if (parsed.data && Array.isArray(parsed.data)) {
          creatives = parsed.data
        } else if (parsed.items && Array.isArray(parsed.items)) {
          creatives = parsed.items
        } else {
          throw new Error("JSON must contain an array: top-level [...], or {creatives/data/items: [...]}")
        }
      } catch (parseError) {
        const msg = parseError instanceof Error ? parseError.message : "Unknown error"
        const hint = jsonFile.size > 50 * 1024 * 1024
          ? " Large files can cause memory issues. Try splitting into smaller files."
          : ""
        throw new Error(`Invalid JSON format: ${msg}${hint}`)
      }

      if (creatives.length === 0) {
        setResult({ success: false, error: "JSON file contains no creatives. Make sure the file has an array of creative objects." })
        setIsLoading(false)
        return
      }

      // Validate that creatives have required fields
      const validCreatives = creatives.filter((c: any) => {
        return c && (c.ad_archive_id || c.id || c.snapshot || c.page_name || c.page_id)
      })

      if (validCreatives.length === 0) {
        setResult({ 
          success: false, 
          error: "No valid creatives found. Creatives must have at least one of: ad_archive_id, id, snapshot, page_name, or page_id" 
        })
        setIsLoading(false)
        return
      }

      // Update creatives to only valid ones
      creatives = validCreatives

      if (!user) {
        setResult({ success: false, error: "You must be logged in to parse JSON" })
        setIsLoading(false)
        return
      }

      // Dynamic batch size: keep each request body under ~3.5MB to avoid 413/limits
      // Files 15MB+ use smaller batches; very large files (e.g. 150MB) need even more conservative sizing
      const MAX_BATCH_BYTES = 3.5 * 1024 * 1024 // 3.5MB
      const fileSize = jsonFile.size
      const CHUNK_THRESHOLD = 15 * 1024 * 1024 // 15MB
      const maxBatch = fileSize >= CHUNK_THRESHOLD ? 150 : 350
      const avgBytesPerCreative = fileSize / creatives.length
      const sizeBasedBatch = Math.max(20, Math.min(maxBatch, Math.floor(MAX_BATCH_BYTES / avgBytesPerCreative)))
      const BATCH_SIZE = Math.min(maxBatch, sizeBasedBatch)
      const batches: any[][] = []
      for (let i = 0; i < creatives.length; i += BATCH_SIZE) {
        batches.push(creatives.slice(i, i + BATCH_SIZE))
      }

      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 6 * 60 * 1000)
      let lastParsed: ParseJsonResult | null = null

      try {
        for (let i = 0; i < batches.length; i++) {
          const batch = batches[i]
          const isLast = i === batches.length - 1
          const body: Record<string, unknown> = {
            business_id: businessId,
            creatives: batch,
            is_last_batch: isLast,
          }
          if (lastParsed?.brand?.id) {
            body.brand_id = lastParsed.brand.id
          } else {
            if (brandName) body.brand_name = brandName
            if (adsLibraryUrl) body.ads_library_url = adsLibraryUrl
          }

          const response = await fetch("/api/edge/parse-json", {
            method: "POST",
            signal: controller.signal,
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
          })

          const text = await response.text().catch(() => "")
          const parsed = (() => {
            try {
              return text ? JSON.parse(text) : null
            } catch {
              return null
            }
          })()

          if (!response.ok) {
            const message =
              parsed?.error?.message ||
              parsed?.message ||
              parsed?.error ||
              (typeof parsed?.error === "string" ? parsed.error : null) ||
              (text ? text.substring(0, 300) : "Unknown error")
            const hint = response.status === 413
              ? " Request too large. The parser uses smaller batches for big files; try again or split your file."
              : ""
            setResult({ success: false, error: `HTTP ${response.status}: ${message}${hint}` })
            return
          }

          if (!parsed) {
            setResult({
              success: false,
              error: `Invalid response (${response.status}): ${text.substring(0, 300)}`,
            })
            return
          }

          lastParsed = parsed as ParseJsonResult
          if (!lastParsed.success) {
            setResult(lastParsed)
            return
          }
        }
      } catch (fetchErr: any) {
        if (fetchErr?.name === "AbortError") {
          setResult({ success: false, error: "Request timed out. Try a smaller file or fewer creatives." })
          return
        }
        throw fetchErr
      } finally {
        clearTimeout(timeoutId)
      }

      if (lastParsed) {
        const totalReceived = creatives.length
        const agg = {
          ...lastParsed,
          ingestion: lastParsed.ingestion
            ? { ...lastParsed.ingestion, received: totalReceived }
            : undefined,
        }
        setResult(agg)
      }

      if (lastParsed?.success && lastParsed !== undefined) {
        // Clear form on success
        setJsonFile(null)
        setBrandName("")
        setAdsLibraryUrl("")
        setSelectedBusinessId("")
        // Reset file input
        const fileInput = document.getElementById("json-file-input") as HTMLInputElement
        if (fileInput) fileInput.value = ""
        
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
          <FileJson className="h-5 w-5" />
          Parse JSON Creatives
        </CardTitle>
        <CardDescription>
          Upload a JSON file with creatives. Supported: raw array <code>[...]</code>, <code>&#123;creatives: [...]&#125;</code>, or Apify format <code>&#123;data: [...]&#125;</code>. Large files (15MB+) are processed in smaller chunks automatically.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="json-business-select">Business *</Label>
            <Select value={selectedBusinessId} onValueChange={setSelectedBusinessId} required>
              <SelectTrigger id="json-business-select" className="bg-muted border-border">
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
              {isAdmin ? "As admin (host), you parse into shared businesses only." : "You can only parse into businesses you created (Yours)."}
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="json-file-input">JSON File *</Label>
            <div className="flex items-center gap-2">
              <Input
                id="json-file-input"
                type="file"
                accept=".json,application/json"
                onChange={handleFileChange}
                required
                className="bg-muted border-border"
              />
            </div>
            <p className="text-xs text-muted-foreground">
              Select a JSON file containing creatives array. Format: <code className="text-xs bg-muted px-1 py-0.5 rounded">{"{creatives: [...]}"}</code> or <code className="text-xs bg-muted px-1 py-0.5 rounded">[...]</code>
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="json-brand-name">Brand Name (Optional)</Label>
            <Input
              id="json-brand-name"
              type="text"
              placeholder="e.g., Competitor Name"
              value={brandName}
              onChange={(e) => setBrandName(e.target.value)}
              className="bg-muted border-border"
            />
            <p className="text-xs text-muted-foreground">
              Optional: Specify brand name. If not provided, will be extracted from creatives.
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="json-ads-url">Ads Library URL (Optional)</Label>
            <Input
              id="json-ads-url"
              type="url"
              placeholder="https://www.facebook.com/ads/library/..."
              value={adsLibraryUrl}
              onChange={(e) => setAdsLibraryUrl(e.target.value)}
              className="bg-muted border-border"
            />
            <p className="text-xs text-muted-foreground">
              Optional: Meta Ads Library URL for this brand.
            </p>
          </div>

          <Button 
            type="submit" 
            disabled={isLoading || !selectedBusinessId?.trim() || selectedBusinessId === "none" || !jsonFile}
            className="w-full md:w-auto"
          >
            {isLoading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Parsing JSON...
              </>
            ) : (
              <>
                <Upload className="mr-2 h-4 w-4" />
                Parse & Import
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
                      Brand: <strong>{result.brand.brand_name}</strong> (ID: {result.brand.id})
                    </p>
                  )}
                  {result.ingestion && (
                    <p className="mt-1">
                      Received {result.ingestion.received} creatives, inserted {result.ingestion.inserted} records.
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
                  {result.error || "An error occurred while parsing the JSON file."}
                </AlertDescription>
              </Alert>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
