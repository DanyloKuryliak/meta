"use client"

import { useState } from "react"
import React from "react"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Button } from "@/components/ui/button"
import { CreativeSummaryTab } from "./creative-summary-tab"
import { FunnelSummaryTab } from "./funnel-summary-tab"
import { AddCompetitorForm } from "./add-competitor-form"
import { AddBusinessForm } from "./add-business-form"
import { ParseJsonForm } from "./parse-json-form"
import { BarChart3, Fuel as Funnel, ChevronRight, ChevronDown, Building2, Plus, Upload, Settings } from "lucide-react"
import { BusinessManagement } from "./business-management"
import { UserAccessManagement } from "./user-access-management"
import { useSWRConfig } from "swr"
import useSWR from "swr"
import { getSupabaseClient } from "@/lib/supabase/client"
import type { Business } from "@/lib/supabase"
import { Label } from "@/components/ui/label"
import { useAuth } from "@/components/auth/auth-provider"
import { LoginForm } from "@/components/auth/login-form"
import { LogOut, User } from "lucide-react"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"

const businessesFetcher = async (userId: string | null): Promise<Business[]> => {
  const supabase = getSupabaseClient()
  
  // RLS policies handle filtering: users see shared businesses OR their own businesses
  const { data, error } = await supabase
    .from("businesses")
    .select("*")
    .order("business_name", { ascending: true })
  
  if (error) throw error
  return data || []
}

const isAdminFetcher = async (userId: string): Promise<boolean> => {
  const supabase = getSupabaseClient()
  const { data } = await supabase
    .from("user_profiles")
    .select("is_admin")
    .eq("id", userId)
    .maybeSingle()
  return (data as { is_admin?: boolean } | null)?.is_admin === true
}

function DashboardContent({ user, signOut }: { user: NonNullable<ReturnType<typeof useAuth>['user']>, signOut: () => Promise<void> }) {
  const { mutate } = useSWRConfig()
  const [activeTab, setActiveTab] = useState("creative")
  const [isAddCompetitorOpen, setIsAddCompetitorOpen] = useState(false)
  const [isAddBusinessOpen, setIsAddBusinessOpen] = useState(false)
  const [isParseJsonOpen, setIsParseJsonOpen] = useState(false)
  const [selectedBusinessIds, setSelectedBusinessIds] = useState<Set<string>>(new Set())
  const [selectedBusinessForBrands, setSelectedBusinessForBrands] = useState<string>("")
  
  const { data: businesses, error: businessesError } = useSWR(
    `businesses-${user.id}`,
    () => businessesFetcher(user.id)
  )
  const { data: isAdmin } = useSWR(
    `isAdmin-${user.id}`,
    () => isAdminFetcher(user.id)
  )

  // Update selectedBusinessIds when dropdown selection changes
  React.useEffect(() => {
    if (!businesses) return

    if (selectedBusinessForBrands) {
      setSelectedBusinessIds(new Set([selectedBusinessForBrands]))
      mutate("creative-summary")
      mutate("funnel-summary")
    } else {
      // No selection - default to first business
      const defaultId = businesses[0]?.id
      setSelectedBusinessIds(defaultId ? new Set([defaultId]) : new Set())
      setSelectedBusinessForBrands(defaultId || "")
      mutate("creative-summary")
      mutate("funnel-summary")
    }
  }, [selectedBusinessForBrands, businesses, mutate])

  // Auto-refresh data periodically to catch ingestion updates
  React.useEffect(() => {
    const interval = setInterval(() => {
      mutate("creative-summary")
      mutate("funnel-summary")
    }, 15000) // Refresh every 15 seconds

    return () => clearInterval(interval)
  }, [mutate])

  const handleIngestionSuccess = () => {
    mutate("creative-summary")
    mutate("funnel-summary")
    mutate("businesses")
    mutate(`businesses-${user.id}`)
  }

  const handleBusinessAdded = () => {
    mutate("businesses")
    mutate(`businesses-${user.id}`)
    setIsAddBusinessOpen(false)
  }

  const handleJsonParsed = () => {
    mutate("creative-summary")
    mutate("funnel-summary")
    setIsParseJsonOpen(false)
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border bg-card">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex flex-col gap-4">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div>
                <h1 className="text-2xl font-bold text-foreground">
                  Meta Creatives Dashboard
                </h1>
                <p className="text-muted-foreground mt-1">
                  Analytics for Meta Ads creative and funnel performance
                </p>
              </div>
              <div className="flex flex-wrap gap-2 self-start sm:self-auto items-center">
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" size="sm">
                      <User className="mr-2 h-4 w-4" />
                      {user.email?.split("@")[0] || "Account"}
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem
                      onSelect={(e) => {
                        e.preventDefault()
                        void signOut()
                      }}
                    >
                      <LogOut className="mr-2 h-4 w-4" />
                      Sign Out
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              <Dialog open={isAddBusinessOpen} onOpenChange={setIsAddBusinessOpen}>
                <DialogTrigger asChild>
                  <Button variant="outline" size="sm">
                    <Building2 className="mr-2 h-4 w-4" />
                    Add Business
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Add Business</DialogTitle>
                    <DialogDescription>
                      Create a new Genesis business to organize competitors.
                    </DialogDescription>
                  </DialogHeader>
                  <AddBusinessForm onSuccess={handleBusinessAdded} isAdmin={isAdmin ?? false} />
                </DialogContent>
              </Dialog>

              <Dialog open={isAddCompetitorOpen} onOpenChange={setIsAddCompetitorOpen}>
                <DialogTrigger asChild>
                  <Button variant="outline" size="sm">
                    <Plus className="mr-2 h-4 w-4" />
                    Add Competitor
                  </Button>
                </DialogTrigger>
                <DialogContent className="max-w-2xl">
                  <DialogHeader>
                    <DialogTitle>Add Competitor</DialogTitle>
                  </DialogHeader>
                  <AddCompetitorForm 
                    onSuccess={handleIngestionSuccess} 
                    businesses={businesses || []} 
                    selectedBusinessForBrands={selectedBusinessForBrands}
                    currentUserId={user.id}
                    isAdmin={isAdmin ?? false}
                  />
                </DialogContent>
              </Dialog>

              <Dialog open={isParseJsonOpen} onOpenChange={setIsParseJsonOpen}>
                <DialogTrigger asChild>
                  <Button variant="outline" size="sm">
                    <Upload className="mr-2 h-4 w-4" />
                    Parse JSON
                  </Button>
                </DialogTrigger>
                <DialogContent className="max-w-2xl">
                  <DialogHeader>
                    <DialogTitle>Parse JSON Creatives</DialogTitle>
                    <DialogDescription>
                      Upload a JSON file containing creatives for a business.
                    </DialogDescription>
                  </DialogHeader>
                  <ParseJsonForm 
                    onSuccess={handleJsonParsed} 
                    businesses={businesses || []}
                    currentUserId={user.id}
                    isAdmin={isAdmin ?? false}
                  />
                </DialogContent>
              </Dialog>
            </div>
            {/* Business Selector for Brands */}
            {businesses && businesses.length > 0 && (
              <div className="flex flex-col gap-2 pt-2 border-t border-border">
                <div className="flex items-center gap-3">
                <Label htmlFor="business-selector" className="text-sm font-medium whitespace-nowrap">
                  Select Business:
                </Label>
                <Select value={selectedBusinessForBrands || undefined} onValueChange={setSelectedBusinessForBrands}>
                  <SelectTrigger id="business-selector" className="w-[250px] bg-muted border-border">
                    <SelectValue placeholder="Choose a business to view brands" />
                  </SelectTrigger>
                  <SelectContent>
                    {businesses.map((business) => {
                      const isOwner = business.user_id === user.id
                      const isShared = Boolean(business.is_shared)
                      const label = isAdmin
                        ? business.business_name
                        : isOwner
                          ? `${business.business_name} (Yours)`
                          : isShared
                            ? `${business.business_name} (Shared)`
                            : business.business_name
                      return (
                        <SelectItem key={business.id} value={business.id}>
                          {label}
                        </SelectItem>
                      )
                    })}
                  </SelectContent>
                </Select>
                </div>
                <p className="text-xs text-muted-foreground">
                  {isAdmin ? "As admin (host), you manage shared businesses. You can add competitors and parse JSON to any." : <><strong>(Yours)</strong> — businesses you created; you can add competitors and parse JSON. <strong>(Shared)</strong> — admin-created; view only, you cannot modify.</>}
                </p>
              </div>
            )}
          </div>
        </div>
        </div>
      </header>

      <main className="container mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
        {/* Dashboard Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid w-full max-w-2xl grid-cols-3 mb-6">
            <TabsTrigger value="creative" className="flex items-center gap-2">
              <BarChart3 className="h-4 w-4" />
              Creative Summary
            </TabsTrigger>
            <TabsTrigger value="funnel" className="flex items-center gap-2">
              <Funnel className="h-4 w-4" />
              Funnel Summary
            </TabsTrigger>
            <TabsTrigger value="management" className="flex items-center gap-2">
              <Settings className="h-4 w-4" />
              Management
            </TabsTrigger>
          </TabsList>

          <TabsContent value="creative">
            <CreativeSummaryTab selectedBusinessIds={selectedBusinessIds} />
          </TabsContent>

          <TabsContent value="funnel">
            <FunnelSummaryTab selectedBusinessIds={selectedBusinessIds} />
          </TabsContent>

          <TabsContent value="management">
            <div className="space-y-6">
              {isAdmin && <UserAccessManagement />}
              <BusinessManagement />
            </div>
          </TabsContent>
        </Tabs>
      </main>
    </div>
  )
}

export function Dashboard() {
  const { user, loading: authLoading, signOut } = useAuth()

  if (authLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-muted-foreground">Loading...</div>
      </div>
    )
  }

  // Show login form if not authenticated
  if (!user) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <LoginForm />
      </div>
    )
  }

  // User is guaranteed to exist here
  return <DashboardContent user={user} signOut={signOut} />
}
