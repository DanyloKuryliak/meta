"use client"

import { useState } from "react"
import React from "react"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Button } from "@/components/ui/button"
import { CreativeSummaryTab } from "./creative-summary-tab"
import { FunnelSummaryTab } from "./funnel-summary-tab"
import { AddCompetitorForm } from "./add-competitor-form"
import { BarChart3, Fuel as Funnel, ChevronRight, ChevronDown } from "lucide-react"
import { useSWRConfig } from "swr"

export function Dashboard() {
  const { mutate } = useSWRConfig()
  const [activeTab, setActiveTab] = useState("creative")
  const [isFormOpen, setIsFormOpen] = useState(false)

  const handleIngestionSuccess = () => {
    // Refresh both tabs' data after successful ingestion
    mutate("creative-summary")
    mutate("funnel-summary")
    // Close the form after successful submission
    setIsFormOpen(false)
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
            <Button
              variant="outline"
              onClick={() => setIsFormOpen(!isFormOpen)}
              className="self-start sm:self-auto"
            >
              {isFormOpen ? (
                <>
                  <ChevronDown className="mr-2 h-4 w-4" />
                  Hide Add Competitor
                </>
              ) : (
                <>
                  <ChevronRight className="mr-2 h-4 w-4" />
                  Add Competitor
                </>
              )}
            </Button>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
        {/* Add Competitor Form */}
        {isFormOpen && (
          <div>
            <AddCompetitorForm onSuccess={handleIngestionSuccess} />
          </div>
        )}

        {/* Dashboard Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid w-full max-w-lg grid-cols-2 mb-6">
            <TabsTrigger value="creative" className="flex items-center gap-2">
              <BarChart3 className="h-4 w-4" />
              Creative Summary
            </TabsTrigger>
            <TabsTrigger value="funnel" className="flex items-center gap-2">
              <Funnel className="h-4 w-4" />
              Funnel Summary
            </TabsTrigger>
          </TabsList>

          <TabsContent value="creative">
            <CreativeSummaryTab />
          </TabsContent>

          <TabsContent value="funnel">
            <FunnelSummaryTab />
          </TabsContent>
        </Tabs>
      </main>
    </div>
  )
}
