"use client"

import React, { useState } from "react"
import useSWR, { useSWRConfig } from "swr"
import { getSupabaseClient } from "@/lib/supabase/client"
import { useAuth } from "@/components/auth/auth-provider"
import type { Brand, Business } from "@/lib/supabase"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Building2, Trash2, Loader2, AlertCircle, RefreshCw } from "lucide-react"
import { Alert, AlertDescription } from "@/components/ui/alert"

const businessesFetcher = async (): Promise<Business[]> => {
  const supabase = getSupabaseClient()
  const { data, error } = await supabase
    .from("businesses")
    .select("*")
    .order("business_name", { ascending: true })
  
  if (error) throw error
  return data || []
}

const brandsFetcher = async (businessId: string): Promise<Brand[]> => {
  const supabase = getSupabaseClient()
  const { data, error } = await supabase
    .from("brands")
    .select("id, brand_name, is_active, last_fetch_status, last_fetched_date")
    .eq("business_id", businessId)
    .order("brand_name", { ascending: true })
  
  if (error) throw error
  return data || []
}

function useRefreshAll(userId: string | undefined) {
  const { mutate } = useSWRConfig()
  return () => {
    mutate("businesses")
    if (userId) mutate(`businesses-${userId}`)
    mutate((key) => typeof key === "string" && key.startsWith("brands-"))
    mutate("creative-summary")
    mutate("funnel-summary")
  }
}

export function BusinessManagement() {
  const { user } = useAuth()
  const { data: businesses, error, mutate } = useSWR("businesses", businessesFetcher)
  const refreshAll = useRefreshAll(user?.id)
  const [deletingBusinessId, setDeletingBusinessId] = useState<string | null>(null)
  const [deletingBrandId, setDeletingBrandId] = useState<string | null>(null)
  const [refreshingBrandId, setRefreshingBrandId] = useState<string | null>(null)

  const handleDeleteBusiness = async (businessId: string) => {
    setDeletingBusinessId(businessId)
    try {
      const res = await fetch(`/api/edge/delete-business/${encodeURIComponent(businessId)}`, {
        method: "DELETE",
        credentials: "include",
        headers: { Accept: "application/json" },
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`)
      refreshAll()
    } catch (err) {
      console.error("Error deleting business:", err)
      alert(err instanceof Error ? err.message : "Failed to delete business.")
    } finally {
      setDeletingBusinessId(null)
    }
  }

  const handleDeleteBrand = async (brandId: string, businessId: string) => {
    setDeletingBrandId(brandId)
    try {
      const res = await fetch(`/api/edge/delete-brand/${encodeURIComponent(brandId)}`, {
        method: "DELETE",
        credentials: "include",
        headers: { Accept: "application/json" },
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`)
      refreshAll()
      return true
    } catch (err) {
      console.error("Error deleting brand:", err)
      alert(err instanceof Error ? err.message : "Failed to delete brand.")
      throw err
    } finally {
      setDeletingBrandId(null)
    }
  }

  const handleRefreshSummaries = async (brandId: string, businessId: string) => {
    setRefreshingBrandId(brandId)
    try {
      const res = await fetch("/api/edge/refresh-summaries", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ brand_id: brandId, business_id: businessId }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`)
      refreshAll()
    } catch (err) {
      console.error("Error refreshing summaries:", err)
      alert(err instanceof Error ? err.message : "Failed to refresh summaries.")
    } finally {
      setRefreshingBrandId(null)
    }
  }

  if (error) {
    return (
      <Alert variant="destructive">
        <AlertCircle className="h-4 w-4" />
        <AlertDescription>Error loading businesses: {error.message}</AlertDescription>
      </Alert>
    )
  }

  if (!businesses || businesses.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Business Management</CardTitle>
          <CardDescription>No businesses found. Add a business to get started.</CardDescription>
        </CardHeader>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Building2 className="h-5 w-5" />
          Business Management
        </CardTitle>
        <CardDescription>
          View and manage your Genesis businesses and their competitors.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-6">
          {businesses.map((business) => (
            <BusinessRow
              key={business.id}
              business={business}
              onDelete={handleDeleteBusiness}
              onDeleteBrand={handleDeleteBrand}
              onRefreshSummaries={handleRefreshSummaries}
              isDeleting={deletingBusinessId === business.id}
              deletingBrandId={deletingBrandId}
              refreshingBrandId={refreshingBrandId}
            />
          ))}
        </div>
      </CardContent>
    </Card>
  )
}

function BusinessRow({ 
  business, 
  onDelete,
  onDeleteBrand,
  onRefreshSummaries,
  isDeleting,
  deletingBrandId,
  refreshingBrandId
}: { 
  business: Business
  onDelete: (id: string) => void
  onDeleteBrand: (brandId: string, businessId: string) => void
  onRefreshSummaries: (brandId: string, businessId: string) => void
  isDeleting: boolean
  deletingBrandId: string | null
  refreshingBrandId: string | null
}) {
  const { mutate: globalMutate } = useSWRConfig()
  const { data: brands, error: brandsError, mutate: mutateBrands } = useSWR<Brand[]>(
    `brands-${business.id}`,
    () => brandsFetcher(business.id)
  )
  
  const handleDeleteBusiness = async () => {
    try {
      await onDelete(business.id)
    } catch {
      // Error already shown in onDelete
    }
  }

  const handleDeleteBrand = async (brand: Brand) => {
    if (!window.confirm(`Delete "${brand.brand_name}" and all associated data? This cannot be undone.`)) return
    try {
      await onDeleteBrand(brand.id, business.id)
      await mutateBrands()
      await globalMutate(`brands-${business.id}`)
    } catch {
      // Error already shown in onDeleteBrand
    }
  }

  return (
    <div className="border border-border rounded-lg p-4">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Badge variant={business.is_active ? "default" : "secondary"}>
            {business.business_name}
          </Badge>
          {brands && (
            <span className="text-sm text-muted-foreground">
              {brands.length} competitor{brands.length !== 1 ? "s" : ""}
            </span>
          )}
        </div>
        <Button
          type="button"
          variant="destructive"
          size="sm"
          disabled={isDeleting}
          onClick={() => {
            if (window.confirm(`Delete "${business.business_name}" and all associated data? This cannot be undone.`)) {
              void handleDeleteBusiness()
            }
          }}
        >
          {isDeleting ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Trash2 className="h-4 w-4" />
          )}
        </Button>
      </div>

      {brandsError ? (
        <p className="text-sm text-destructive">Error loading competitors</p>
      ) : brands && brands.length > 0 ? (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Brand Name</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Last Fetched</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {brands.map((brand) => (
              <TableRow key={brand.id}>
                <TableCell className="font-medium">{brand.brand_name}</TableCell>
                <TableCell>
                  <Badge variant={brand.is_active ? "default" : "secondary"}>
                    {brand.last_fetch_status || "Unknown"}
                  </Badge>
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {brand.last_fetched_date || "Never"}
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex items-center justify-end gap-1">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={refreshingBrandId === brand.id}
                    onClick={() => onRefreshSummaries(brand.id, business.id)}
                    title="Recalculate summaries from all creatives"
                  >
                    {refreshingBrandId === brand.id ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <RefreshCw className="h-4 w-4" />
                    )}
                  </Button>
                  <Button
                    type="button"
                    variant="destructive"
                    size="sm"
                    disabled={deletingBrandId === brand.id}
                    onClick={() => void handleDeleteBrand(brand)}
                  >
                    {deletingBrandId === brand.id ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Trash2 className="h-4 w-4" />
                    )}
                  </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      ) : (
        <p className="text-sm text-muted-foreground">No competitors added yet.</p>
      )}
    </div>
  )
}
