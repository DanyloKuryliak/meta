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
  const [progress, setProgress] = useState<{ current: number; total: number } | null>(null)

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
    setProgress(null)

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

      // Keep each request body well under platform limit (~4.5MB) to avoid 413
      const MAX_BATCH_BYTES = 1.8 * 1024 * 1024 // 1.8MB per request (safe for Vercel/edge)
      const fileSize = jsonFile.size
      const avgBytesPerCreative = fileSize / creatives.length
      const sizeBasedBatch = Math.max(50, Math.floor(MAX_BATCH_BYTES / avgBytesPerCreative))
      const BATCH_SIZE = Math.min(800, sizeBasedBatch) // Larger batches = fewer requests = less timeout risk
      const batches: any[][] = []
      for (let i = 0; i < creatives.length; i += BATCH_SIZE) {
        batches.push(creatives.slice(i, i + BATCH_SIZE))
      }

      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 20 * 60 * 1000) // 20 min for large files
      let lastParsed: ParseJsonResult | null = null
      const PAYLOAD_LIMIT = Math.floor(MAX_BATCH_BYTES) // bytes; stay under platform 413 limit

      const sendBatch = async (batch: any[], isLastBatch: boolean): Promise<ParseJsonResult | null> => {
        const body: Record<string, unknown> = {
          business_id: businessId,
          creatives: batch,
          is_last_batch: isLastBatch,
        }
        if (lastParsed?.brand?.id) {
          body.brand_id = lastParsed.brand.id
        } else {
          if (brandName) body.brand_name = brandName
          if (adsLibraryUrl) body.ads_library_url = adsLibraryUrl
        }
        const bodyStr = JSON.stringify(body)
        const bodyBytes = new TextEncoder().encode(bodyStr).length
        if (bodyBytes > PAYLOAD_LIMIT && batch.length > 1) {
          const mid = Math.ceil(batch.length / 2)
          const first = await sendBatch(batch.slice(0, mid), false)
          if (first && !first.success) return first
          if (first) lastParsed = first
          return sendBatch(batch.slice(mid), isLastBatch)
        }

        const response = await fetch("/api/edge/parse-json", {
          method: "POST",
          signal: controller.signal,
          headers: { "Content-Type": "application/json" },
          body: bodyStr,
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
            ? " Request too large. Batches are split automatically; try again or use a smaller file."
            : ""
          setResult({ success: false, error: `HTTP ${response.status}: ${message}${hint}` })
          return null
        }

        if (!parsed) {
          setResult({
            success: false,
            error: `Invalid response (${response.status}): ${text.substring(0, 300)}`,
          })
          return null
        }

        const result = parsed as ParseJsonResult
        lastParsed = result
        if (!result.success) {
          setResult(result)
          return null
        }
        return result
      }

      const PARALLEL_LIMIT = 4 // Run up to 4 batches concurrently after first

      const runBatchesParallel = async (): Promise<ParseJsonResult | null> => {
        if (batches.length === 0) return null
        // First batch establishes brand_id
        setProgress({ current: 1, total: batches.length })
        const first = await sendBatch(batches[0], batches.length === 1)
        if (!first || !first.success) return first
        lastParsed = first
        if (batches.length === 1) return first
        // Remaining batches in parallel with concurrency limit
        const remaining = batches.slice(1)
        const results: (ParseJsonResult | null)[] = []
        for (let i = 0; i < remaining.length; i += PARALLEL_LIMIT) {
          const chunk = remaining.slice(i, i + PARALLEL_LIMIT)
          const chunkResults = await Promise.all(
            chunk.map((batch, j) => {
              const batchIndex = i + j
              const isLast = batchIndex === remaining.length - 1
              return sendBatch(batch, isLast)
            })
          )
          const firstFail = chunkResults.find((r) => r === null || (r && !r.success))
          if (firstFail !== undefined && (firstFail === null || !firstFail.success))
            return firstFail
          results.push(...chunkResults)
          if (chunkResults[0]) lastParsed = chunkResults[chunkResults.length - 1]!
          setProgress({ current: Math.min(i + chunk.length + 1, batches.length), total: batches.length })
        }
        return lastParsed
      }

      try {
        await runBatchesParallel()
      } catch (fetchErr: any) {
        if (fetchErr?.name === "AbortError") {
          setResult({ success: false, error: "Request timed out after 20 minutes. Try splitting the file or use fewer creatives." })
          return
        }
        throw fetchErr
      } finally {
        clearTimeout(timeoutId)
        setProgress(null)
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
                {progress ? `Parsing batch ${progress.current}/${progress.total}...` : "Parsing JSON..."}
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
