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
  businesses = []
}: { 
  onSuccess?: () => void
  businesses?: Business[]
}) {
  const { user } = useAuth()
  const [selectedBusinessId, setSelectedBusinessId] = useState<string>("")
  const [brandName, setBrandName] = useState("")
  const [adsLibraryUrl, setAdsLibraryUrl] = useState("")
  const [jsonFile, setJsonFile] = useState<File | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [result, setResult] = useState<ParseJsonResult | null>(null)

  const MAX_FILE_SIZE_MB = 4
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      if (file.type !== "application/json" && !file.name.endsWith(".json")) {
        setResult({ success: false, error: "Please select a JSON file" })
        return
      }
      if (file.size > MAX_FILE_SIZE_MB * 1024 * 1024) {
        setResult({ success: false, error: `File too large. Maximum ${MAX_FILE_SIZE_MB}MB. Split your dataset or use a smaller export.` })
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

    if (!selectedBusinessId) {
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
      // Read JSON file
      const fileContent = await jsonFile.text()
      let creatives: any[]
      
      try {
        const parsed = JSON.parse(fileContent)
        // Handle both array and object with creatives property
        if (Array.isArray(parsed)) {
          creatives = parsed
        } else if (parsed.creatives && Array.isArray(parsed.creatives)) {
          creatives = parsed.creatives
        } else if (parsed.data && Array.isArray(parsed.data)) {
          // Handle Apify dataset format
          creatives = parsed.data
        } else {
          throw new Error("JSON must contain an array of creatives, a 'creatives' property, or a 'data' property with an array")
        }
      } catch (parseError) {
        throw new Error(`Invalid JSON format: ${parseError instanceof Error ? parseError.message : "Unknown error"}`)
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

      // Call our server proxy. Large datasets may take 1–2 minutes.
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 6 * 60 * 1000) // 6 min
      let response: Response
      try {
        response = await fetch("/api/edge/parse-json", {
          method: "POST",
          signal: controller.signal,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            business_id: selectedBusinessId,
            creatives,
            brand_name: brandName || undefined,
            ads_library_url: adsLibraryUrl || undefined,
          }),
        })
      } catch (fetchErr: any) {
        if (fetchErr?.name === "AbortError") {
          setResult({ success: false, error: "Request timed out. Try a smaller file (under 4MB) or fewer creatives." })
          return
        }
        throw fetchErr
      } finally {
        clearTimeout(timeoutId)
      }

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
        setResult({ success: false, error: `HTTP ${response.status}: ${message}` })
        return
      }

      if (!parsed) {
        setResult({
          success: false,
          error: `Invalid response (${response.status}): ${text.substring(0, 300)}`,
        })
        return
      }

      setResult(parsed as ParseJsonResult)

      if ((parsed as ParseJsonResult).success) {
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
          Upload a JSON file (max 4MB) with creatives. Supported: raw array <code>[...]</code>, <code>&#123;creatives: [...]&#125;</code>, or Apify format <code>&#123;data: [...]&#125;</code>. Use <code>test-sample-creatives.json</code> to verify.
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
                  businesses.map((business) => (
                    <SelectItem key={business.id} value={business.id}>
                      {business.business_name}
                    </SelectItem>
                  ))
                )}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              Select which business these creatives belong to.
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
            disabled={isLoading || !selectedBusinessId || !jsonFile}
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
