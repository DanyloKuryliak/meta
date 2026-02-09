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
import { useSWRConfig } from "swr"
import useSWR from "swr"
import { getSupabaseClient, type Business } from "@/lib/supabase"
import { Badge } from "@/components/ui/badge"
import { Switch } from "@/components/ui/switch"
import { Label } from "@/components/ui/label"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"

const businessesFetcher = async (): Promise<Business[]> => {
  const supabase = getSupabaseClient()
  const { data, error } = await supabase
    .from("businesses")
    .select("*")
    .order("business_name", { ascending: true })
  
  if (error) throw error
  return data || []
}

export function Dashboard() {
  const { mutate } = useSWRConfig()
  const [activeTab, setActiveTab] = useState("creative")
  const [isAddCompetitorOpen, setIsAddCompetitorOpen] = useState(false)
  const [isAddBusinessOpen, setIsAddBusinessOpen] = useState(false)
  const [isParseJsonOpen, setIsParseJsonOpen] = useState(false)
  const [selectedBusinessIds, setSelectedBusinessIds] = useState<Set<string>>(new Set())
  
  const { data: businesses, error: businessesError } = useSWR("businesses", businessesFetcher)

  const handleIngestionSuccess = () => {
    // Refresh both tabs' data after successful ingestion
    mutate("creative-summary")
    mutate("funnel-summary")
    mutate("businesses")
  }

  const handleBusinessAdded = () => {
    mutate("businesses")
    setIsAddBusinessOpen(false)
  }

  const handleJsonParsed = () => {
    mutate("creative-summary")
    mutate("funnel-summary")
    setIsParseJsonOpen(false)
  }

  const toggleBusiness = (businessId: string) => {
    setSelectedBusinessIds((prev) => {
      const next = new Set(prev)
      if (next.has(businessId)) {
        next.delete(businessId)
      } else {
        next.add(businessId)
      }
      // Refresh data when selection changes
      mutate("creative-summary")
      mutate("funnel-summary")
      return next
    })
  }

  // Auto-refresh data periodically to catch ingestion updates
  React.useEffect(() => {
    const interval = setInterval(() => {
      mutate("creative-summary")
      mutate("funnel-summary")
    }, 15000) // Refresh every 15 seconds

    return () => clearInterval(interval)
  }, [mutate])

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border bg-card">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <h1 className="text-2xl font-bold text-foreground">
                Meta Creatives Dashboard
              </h1>
              <p className="text-muted-foreground mt-1">
                Analytics for Meta Ads creative and funnel performance
              </p>
            </div>
            <div className="flex flex-wrap gap-2 self-start sm:self-auto">
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
                  <AddBusinessForm onSuccess={handleBusinessAdded} />
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
                    <DialogDescription>
                      Enter a Meta Ads Library URL to track a new competitor's ads and funnels.
                    </DialogDescription>
                  </DialogHeader>
                  <AddCompetitorForm onSuccess={handleIngestionSuccess} businesses={businesses || []} />
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
                  <ParseJsonForm onSuccess={handleJsonParsed} businesses={businesses || []} />
                </DialogContent>
              </Dialog>
            </div>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
        {/* Business Toggle Section */}
        <div className="bg-card border border-border rounded-lg p-4">
          <div className="flex items-center gap-2 mb-4">
            <Building2 className="h-5 w-5 text-muted-foreground" />
            <h2 className="text-lg font-semibold">Select Businesses</h2>
          </div>
          {businessesError ? (
            <p className="text-sm text-destructive">Error loading businesses</p>
          ) : !businesses || businesses.length === 0 ? (
            <p className="text-sm text-muted-foreground">No businesses found. Add competitors to create businesses.</p>
          ) : (
            <div className="flex flex-wrap gap-3">
              {businesses.map((business) => (
                <div key={business.id} className="flex items-center gap-2">
                  <Switch
                    id={`business-${business.id}`}
                    checked={selectedBusinessIds.has(business.id)}
                    onCheckedChange={() => toggleBusiness(business.id)}
                  />
                  <Label
                    htmlFor={`business-${business.id}`}
                    className="cursor-pointer flex items-center gap-2"
                  >
                    <Badge variant={selectedBusinessIds.has(business.id) ? "default" : "outline"}>
                      {business.business_name}
                    </Badge>
                  </Label>
                </div>
              ))}
            </div>
          )}
          {selectedBusinessIds.size === 0 && businesses && businesses.length > 0 && (
            <p className="text-sm text-muted-foreground mt-3">
              Toggle businesses above to view competitors. No data will be displayed until at least one business is selected.
            </p>
          )}
        </div>


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
            <BusinessManagement />
          </TabsContent>
        </Tabs>
      </main>
    </div>
  )
}
