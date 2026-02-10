"use client"

import React, { useState } from "react"
import useSWR, { useSWRConfig } from "swr"
import { getSupabaseClient } from "@/lib/supabase/client"
import type { Brand, Business } from "@/lib/supabase"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Building2, Trash2, Loader2, AlertCircle } from "lucide-react"
import { Alert, AlertDescription } from "@/components/ui/alert"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"

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

export function BusinessManagement() {
  const { data: businesses, error, mutate } = useSWR("businesses", businessesFetcher)
  const [deletingBusinessId, setDeletingBusinessId] = useState<string | null>(null)
  const [deletingBrandId, setDeletingBrandId] = useState<string | null>(null)

  const handleDeleteBusiness = async (businessId: string) => {
    setDeletingBusinessId(businessId)
    try {
      const supabase = getSupabaseClient()
      const { error: deleteError } = await supabase
        .from("businesses")
        .delete()
        .eq("id", businessId)
      
      if (deleteError) throw deleteError
      mutate()
    } catch (err) {
      console.error("Error deleting business:", err)
      alert("Failed to delete business. Make sure no brands are linked to it.")
    } finally {
      setDeletingBusinessId(null)
    }
  }

  const handleDeleteBrand = async (brandId: string, businessId: string) => {
    setDeletingBrandId(brandId)
    try {
      const supabase = getSupabaseClient()
      const { error: deleteError, data } = await supabase
        .from("brands")
        .delete()
        .eq("id", brandId)
        .select()
      
      if (deleteError) {
        console.error("Supabase delete error:", deleteError)
        throw deleteError
      }
      
      console.log("Brand deleted successfully:", data)
      
      // Refresh businesses list (which will trigger brands refresh via SWR)
      mutate()
      
      return true // Success
    } catch (err) {
      console.error("Error deleting brand:", err)
      const errorMessage = err instanceof Error ? err.message : "Failed to delete brand."
      alert(`Failed to delete brand: ${errorMessage}`)
      throw err // Re-throw to prevent dialog from closing on error
    } finally {
      setDeletingBrandId(null)
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
              isDeleting={deletingBusinessId === business.id}
              deletingBrandId={deletingBrandId}
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
  isDeleting,
  deletingBrandId
}: { 
  business: Business
  onDelete: (id: string) => void
  onDeleteBrand: (brandId: string, businessId: string) => void
  isDeleting: boolean
  deletingBrandId: string | null
}) {
  const { mutate: globalMutate } = useSWRConfig()
  const { data: brands, error: brandsError, mutate: mutateBrands } = useSWR<Brand[]>(
    `brands-${business.id}`,
    () => brandsFetcher(business.id)
  )
  
  // Track which brand's delete dialog is open
  const [openDeleteDialogForBrand, setOpenDeleteDialogForBrand] = useState<string | null>(null)

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
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button
              variant="destructive"
              size="sm"
              disabled={isDeleting}
            >
              {isDeleting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Trash2 className="h-4 w-4" />
              )}
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete Business?</AlertDialogTitle>
              <AlertDialogDescription>
                This will delete "{business.business_name}" and all associated data. This action cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => onDelete(business.id)}
                className="bg-destructive text-destructive-foreground"
              >
                Delete
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
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
              <TableHead>Actions</TableHead>
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
                <TableCell>
                  <AlertDialog 
                    open={openDeleteDialogForBrand === brand.id} 
                    onOpenChange={(open) => {
                      if (!open) {
                        setOpenDeleteDialogForBrand(null)
                      }
                    }}
                  >
                    <AlertDialogTrigger asChild>
                      <Button
                        variant="destructive"
                        size="sm"
                        disabled={deletingBrandId === brand.id}
                        onClick={() => setOpenDeleteDialogForBrand(brand.id)}
                      >
                        {deletingBrandId === brand.id ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Trash2 className="h-4 w-4" />
                        )}
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Delete Brand?</AlertDialogTitle>
                        <AlertDialogDescription>
                          This will delete "{brand.brand_name}" and all associated data. This action cannot be undone.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel 
                          onClick={() => setOpenDeleteDialogForBrand(null)}
                          disabled={deletingBrandId === brand.id}
                        >
                          Cancel
                        </AlertDialogCancel>
                        <AlertDialogAction
                          onClick={async (e) => {
                            e.preventDefault()
                            e.stopPropagation()
                            
                            if (deletingBrandId === brand.id) {
                              return // Prevent double-click
                            }
                            
                            try {
                              console.log("Starting brand deletion for:", brand.id)
                              await onDeleteBrand(brand.id, business.id)
                              console.log("Brand deleted, refreshing data...")
                              
                              // Refresh brands list after successful deletion
                              await mutateBrands()
                              // Also invalidate the global cache for this business's brands
                              await globalMutate(`brands-${business.id}`)
                              
                              console.log("Data refreshed, closing dialog")
                              // Close dialog on success
                              setOpenDeleteDialogForBrand(null)
                            } catch (error) {
                              // Error already handled in onDeleteBrand, keep dialog open
                              console.error("Failed to delete brand:", error)
                              // Dialog stays open so user can try again or cancel
                            }
                          }}
                          disabled={deletingBrandId === brand.id}
                          className="bg-destructive text-destructive-foreground"
                        >
                          {deletingBrandId === brand.id ? (
                            <>
                              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                              Deleting...
                            </>
                          ) : (
                            "Delete"
                          )}
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
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
