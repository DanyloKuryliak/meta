"use client"

import React from "react"
import { useState, useMemo } from "react"
import useSWR from "swr"
import { getSupabaseClient, type BrandFunnelSummary } from "@/lib/supabase"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Switch } from "@/components/ui/switch"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  Download,
  Loader2,
  ChevronDown,
  ChevronRight,
  ExternalLink,
  Link2,
  Smartphone,
  FileQuestion,
  Globe,
  Info,
  Search,
} from "lucide-react"
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend,
} from "recharts"

type SortField = "creatives_count" | "month"
type SortDirection = "asc" | "desc"
type FunnelType = "tracking_link" | "app_store" | "quiz_funnel" | "landing_page" | "unknown"

// Format month from "2026-01-01" to "Jan '26"
function formatMonthShort(monthStr: string): string {
  const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
  const parts = monthStr.split("-")
  if (parts.length < 2) return monthStr
  const year = parts[0].slice(2)
  const monthIndex = parseInt(parts[1], 10) - 1
  return `${monthNames[monthIndex] || parts[1]} '${year}`
}

function monthKeyFromDateStr(dateStr: string): string {
  // Supabase returns DATE as "YYYY-MM-DD"
  return dateStr?.slice(0, 7) || ""
}

function monthKeyToLabel(monthKey: string): string {
  // monthKey: "YYYY-MM"
  if (!monthKey) return ""
  return formatMonthShort(`${monthKey}-01`)
}

function monthStartUTC(d: Date): string {
  const y = d.getUTCFullYear()
  const m = String(d.getUTCMonth() + 1).padStart(2, "0")
  return `${y}-${m}-01`
}

function parseMonthStart(dateStr: string): Date | null {
  // dateStr is "YYYY-MM-01"
  const [y, m] = (dateStr || "").split("-")
  const year = Number.parseInt(y || "", 10)
  const month = Number.parseInt(m || "", 10)
  if (!Number.isFinite(year) || !Number.isFinite(month) || month < 1 || month > 12) return null
  return new Date(Date.UTC(year, month - 1, 1))
}

function addMonthsUTC(date: Date, deltaMonths: number): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + deltaMonths, 1))
}

function buildLastNMonths(endMonthStart: string, n: number): string[] {
  const end = parseMonthStart(endMonthStart)
  if (!end || n <= 0) return []
  const months: string[] = []
  for (let i = n - 1; i >= 0; i--) {
    months.push(monthStartUTC(addMonthsUTC(end, -i)))
  }
  return months
}

function hexToRgba(hex: string, alpha: number): string {
  const h = hex.replace("#", "").trim()
  if (h.length !== 6) return `rgba(255,255,255,${alpha})`
  const r = parseInt(h.slice(0, 2), 16)
  const g = parseInt(h.slice(2, 4), 16)
  const b = parseInt(h.slice(4, 6), 16)
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

const FUNNEL_TYPE_CONFIG: Record<FunnelType, { label: string; color: string; icon: React.ReactNode; description: string }> = {
  tracking_link: {
    label: "Tracking Link",
    color: "#f59e0b",
    icon: <Link2 className="h-3 w-3" />,
    description: "Attribution/tracking URLs (Adjust, AppsFlyer, Branch)",
  },
  app_store: {
    label: "App Store",
    color: "#10b981",
    icon: <Smartphone className="h-3 w-3" />,
    description: "Direct links to App Store or Google Play",
  },
  quiz_funnel: {
    label: "Quiz/Survey",
    color: "#8b5cf6",
    icon: <FileQuestion className="h-3 w-3" />,
    description: "Interactive quiz or survey landing pages",
  },
  landing_page: {
    label: "Landing Page",
    color: "#3b82f6",
    icon: <Globe className="h-3 w-3" />,
    description: "Standard landing pages and websites",
  },
  unknown: {
    label: "Other",
    color: "#6b7280",
    icon: <Globe className="h-3 w-3" />,
    description: "Uncategorized URLs",
  },
}

const createFetcher = (selectedBusinessIds: Set<string>) => async (): Promise<BrandFunnelSummary[]> => {
  // Return empty array if no businesses are selected
  if (selectedBusinessIds.size === 0) {
    return []
  }

  const supabase = getSupabaseClient()
  let query = supabase
    .from("brand_funnel_summary")
    .select("*")
    .not("brand_name", "is", null)
    .not("funnel_url", "is", null)
    .not("funnel_domain", "is", null)
    .not("month", "is", null)
    .not("creatives_count", "is", null)
    .gt("creatives_count", 0)
  
  // Filter by selected businesses
  query = query.in("business_id", Array.from(selectedBusinessIds))
  
  const { data, error } = await query.order("month", { ascending: false })

  if (error) {
    console.error("[Funnel Summary] Fetch error:", error)
    throw error
  }
  
  // Normalize month format - Supabase returns date as ISO string, convert to YYYY-MM-01
  const normalized = (data || []).map((row) => {
    let monthStr = row.month
    if (typeof monthStr === "string") {
      // If it's an ISO date string, extract YYYY-MM-DD and ensure it's first of month
      if (monthStr.includes("T")) {
        monthStr = monthStr.split("T")[0]
      }
      // Ensure it's in YYYY-MM-01 format
      const parts = monthStr.split("-")
      if (parts.length >= 2) {
        monthStr = `${parts[0]}-${parts[1]}-01`
      }
    }
    return { ...row, month: monthStr }
  })
  
  console.log(`[Funnel Summary] Fetched ${normalized.length} rows`)
  return normalized
}

export function FunnelSummaryTab({ selectedBusinessIds = new Set() }: { selectedBusinessIds?: Set<string> }) {
  const fetcherKey = `funnel-summary-${Array.from(selectedBusinessIds).sort().join(",")}`
  const { data, error, isLoading, mutate } = useSWR(fetcherKey, createFetcher(selectedBusinessIds), {
    revalidateOnMount: true, // Always fetch fresh data on mount
  })

  const [selectedBrands, setSelectedBrands] = useState<string[]>([])
  const [selectedTypes, setSelectedTypes] = useState<FunnelType[]>([])
  const [selectedNiches, setSelectedNiches] = useState<FunnelType[]>([])
  const [brandSearch, setBrandSearch] = useState("")
  const [dateFilter, setDateFilter] = useState<"lastmonth" | "3months" | "6months" | "12months">("12months")
  const [trendFilter, setTrendFilter] = useState<"all" | "up" | "down">("all")
  const [sortField, setSortField] = useState<SortField>("creatives_count")
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc")
  const [expandedDomains, setExpandedDomains] = useState<Set<string>>(new Set())
  const [topDomainsCount, setTopDomainsCount] = useState<number>(5)

  const uniqueBrands = useMemo(() => {
    if (!data) return []
    return [...new Set(data.map((d) => d.brand_name))].sort()
  }, [data])

  // Removed type-based filtering since type detection is unreliable
  const uniqueNiches: FunnelType[] = []

  const formatMonth = (month: string) => formatMonthShort(month)

  // Get global months for date filtering
  const globalMonths = useMemo(() => {
    const monthsInData = [...new Set((data || []).map((d) => d.month))].sort()
    const endMonth = monthsInData.at(-1) || monthStartUTC(new Date())
    return { endMonth, monthsInData }
  }, [data])

  // Get date filter range
  const getDateFilterRange = useMemo(() => {
    const endMonth = globalMonths.endMonth
    let monthsToInclude = 0
    
    switch (dateFilter) {
      case "3months":
        monthsToInclude = 3
        break
      case "6months":
        monthsToInclude = 6
        break
      case "12months":
        monthsToInclude = 12
        break
      case "lastmonth":
        monthsToInclude = 1
        break
      default:
        monthsToInclude = 12
    }
    
    const filteredMonths = buildLastNMonths(endMonth, monthsToInclude)
    return { 
      start: filteredMonths[0], 
      end: filteredMonths[filteredMonths.length - 1], 
      months: filteredMonths
    }
  }, [dateFilter, globalMonths.endMonth])

  // First filter: brand search and date filter
  const filteredData = useMemo(() => {
    if (!data) return []

    const brandSearchLower = brandSearch.toLowerCase().trim()
    const dateRange = getDateFilterRange
    const monthsSet = new Set(dateRange.months)
    const isLastMonthFilter = dateFilter === "lastmonth"
    const lastMonthOnly = isLastMonthFilter ? dateRange.end : null

    return data.filter((item) => {
      // Brand search filter
      if (brandSearchLower && !item.brand_name.toLowerCase().includes(brandSearchLower)) {
        return false
      }
      
      // Date filter
      if (isLastMonthFilter && lastMonthOnly) {
        if (item.month !== lastMonthOnly) return false
      } else {
        if (!monthsSet.has(item.month)) return false
      }
      
      return true
    })
  }, [data, brandSearch, getDateFilterRange, dateFilter])

  // Calculate domain trends - simplified without date filtering
  const domainTrends = useMemo(() => {
    // Aggregate data by domain and month - sum creatives_count per domain per month
    const domainMonthMap: Record<string, Record<string, number>> = {}
    
    filteredData.forEach(item => {
      if (!domainMonthMap[item.funnel_domain]) {
        domainMonthMap[item.funnel_domain] = {}
      }
      const monthKey = item.month
      domainMonthMap[item.funnel_domain][monthKey] = 
        (domainMonthMap[item.funnel_domain][monthKey] || 0) + item.creatives_count
    })
    
    const trends: Record<string, "up" | "down" | "inactive"> = {}
    const growthPercents: Record<string, number> = {}
    const growthLabels: Record<string, string> = {}
    
    Object.entries(domainMonthMap).forEach(([domain, months]) => {
      const sortedMonths = Object.keys(months).sort()
      
      if (sortedMonths.length < 2) {
        const lastMonth = sortedMonths[sortedMonths.length - 1]
        const lastCount = months[lastMonth] || 0
        if (lastCount === 0) {
          trends[domain] = "inactive"
          growthPercents[domain] = 0
          growthLabels[domain] = "—"
        } else {
          trends[domain] = "up"
          growthPercents[domain] = Infinity
          growthLabels[domain] = "New"
        }
        return
      }
      
      // Calculate growth % for each consecutive month pair and average
      const growthRates: number[] = []
      for (let i = 0; i < sortedMonths.length - 1; i++) {
        const currentMonth = sortedMonths[i]
        const nextMonth = sortedMonths[i + 1]
        const currentCount = months[currentMonth] || 0
        const nextCount = months[nextMonth] || 0
        
        if (currentCount === 0 && nextCount > 0) {
          growthRates.push(Infinity)
        } else if (currentCount > 0 && nextCount === 0) {
          growthRates.push(-100)
        } else if (currentCount > 0) {
          const growth = ((nextCount - currentCount) / currentCount) * 100
          growthRates.push(growth)
        }
      }
      
      if (growthRates.length === 0) {
        trends[domain] = "inactive"
        growthPercents[domain] = 0
        growthLabels[domain] = "—"
        return
      }
      
      const hasInfinity = growthRates.some(r => r === Infinity)
      const finiteRates = growthRates.filter(r => r !== Infinity)
      
      let avgGrowth: number
      if (hasInfinity && finiteRates.length === 0) {
        avgGrowth = Infinity
        growthLabels[domain] = "New"
        trends[domain] = "up"
        growthPercents[domain] = Infinity
        return
      } else if (finiteRates.length > 0) {
        avgGrowth = finiteRates.reduce((sum, r) => sum + r, 0) / finiteRates.length
      } else {
        avgGrowth = -100
      }
      
      const clampedGrowth = Math.max(-999, Math.min(999, avgGrowth))
      growthPercents[domain] = clampedGrowth
      growthLabels[domain] = `${clampedGrowth > 0 ? "+" : ""}${Math.round(clampedGrowth)}%`
      trends[domain] = clampedGrowth >= 0 ? "up" : "down"
    })
    
    return { trends, growthPercents, growthLabels }
  }, [filteredData])

  // Use filteredData directly (no date filtering)
  const displayData = useMemo(() => {
    if (!filteredData) return []
    
    // Apply trend filter only
    if (trendFilter !== "all") {
      return filteredData.filter(item => domainTrends.trends[item.funnel_domain] === trendFilter)
    }
    
    return filteredData
  }, [filteredData, trendFilter, domainTrends])

  // Calculate stats - simplified
  const stats = useMemo(() => {
    const uniqueDomains = new Set(displayData.map(item => item.funnel_domain)).size
    const totalCreatives = displayData.reduce((sum, item) => sum + item.creatives_count, 0)
    
    return {
      totalFunnels: displayData.length,
      totalCreatives,
      uniqueDomains,
    }
  }, [displayData])

  const groupedByDomain = useMemo(() => {
    const groups: Record<string, BrandFunnelSummary[]> = {}
    displayData.forEach((item) => {
      if (!groups[item.funnel_domain]) groups[item.funnel_domain] = []
      groups[item.funnel_domain].push(item)
    })

    // Aggregate by brand_name + funnel_url within each domain (one player can have multiple FB pages)
    const aggregated: Record<string, BrandFunnelSummary[]> = {}
    for (const [domain, items] of Object.entries(groups)) {
      const keyed: Record<string, BrandFunnelSummary> = {}
      for (const item of items) {
        const name = (item.brand_name || "").trim() || "Unknown"
        const key = `${name}|${item.funnel_url || ""}|${item.month || ""}`
        if (!keyed[key]) {
          keyed[key] = { ...item, creatives_count: 0 }
        }
        keyed[key].creatives_count += item.creatives_count
      }
      aggregated[domain] = Object.values(keyed)
    }

    Object.values(aggregated).forEach((items) => {
      items.sort((a, b) => {
        let comparison = 0
        if (sortField === "creatives_count") {
          comparison = a.creatives_count - b.creatives_count
        } else if (sortField === "month") {
          comparison = a.month.localeCompare(b.month)
        }
        return sortDirection === "asc" ? comparison : -comparison
      })
    })

    // Sort domains by total creatives (descending by default)
    const sortedEntries = Object.entries(aggregated).sort((a, b) => {
      const totalA = a[1].reduce((sum, item) => sum + item.creatives_count, 0)
      const totalB = b[1].reduce((sum, item) => sum + item.creatives_count, 0)
      return totalB - totalA
    })

    return sortedEntries
  }, [displayData, sortField, sortDirection])

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection(sortDirection === "asc" ? "desc" : "asc")
    } else {
      setSortField(field)
      setSortDirection("desc")
    }
  }

  const SortIcon = ({ field }: { field: SortField }) => {
    if (sortField !== field) return <ArrowUpDown className="ml-2 h-4 w-4" />
    return sortDirection === "asc" ? (
      <ArrowUp className="ml-2 h-4 w-4" />
    ) : (
      <ArrowDown className="ml-2 h-4 w-4" />
    )
  }

  const toggleDomain = (domain: string) => {
    setExpandedDomains((prev) => {
      const next = new Set(prev)
      if (next.has(domain)) next.delete(domain)
      else next.add(domain)
      return next
    })
  }

  const expandAll = () => setExpandedDomains(new Set(groupedByDomain.map(([d]) => d)))
  const collapseAll = () => setExpandedDomains(new Set())

  const clearFilters = () => {
    setTrendFilter("all")
    setBrandSearch("")
  }

  // Chart data - Top N domains by total volume with monthly data for line chart
  const chartData = useMemo(() => {
    // Aggregate by domain and month
    const domainMonthMap: Record<string, Record<string, number>> = {}
    
    displayData.forEach((item) => {
      if (!domainMonthMap[item.funnel_domain]) {
        domainMonthMap[item.funnel_domain] = {}
      }
      const monthKey = item.month
      domainMonthMap[item.funnel_domain][monthKey] = 
        (domainMonthMap[item.funnel_domain][monthKey] || 0) + item.creatives_count
    })

    // Calculate totals per domain
    const domainTotals = Object.entries(domainMonthMap).map(([domain, months]) => ({
      domain,
      total: Object.values(months).reduce((sum, count) => sum + count, 0),
      months
    }))

    // Get top N domains
    const sorted = domainTotals.sort((a, b) => b.total - a.total)
    const topDomains = sorted.slice(0, topDomainsCount)
    
    // Get all unique months from data
    const allMonths = new Set<string>()
    displayData.forEach(item => allMonths.add(item.month))
    const sortedMonths = Array.from(allMonths).sort()
    
    // Generate colors for each domain
    const colors = [
      "#3b82f6", // blue
      "#10b981", // green
      "#f59e0b", // amber
      "#ef4444", // red
      "#8b5cf6", // violet
      "#ec4899", // pink
      "#06b6d4", // cyan
      "#84cc16", // lime
      "#f97316", // orange
      "#6366f1", // indigo
    ]
    
    // Create data structure for line chart using filtered months
    const lineChartData = sortedMonths.map(month => {
      const dataPoint: Record<string, any> = { month, monthLabel: formatMonthShort(month) }
      topDomains.forEach((domainData) => {
        dataPoint[domainData.domain] = domainData.months[month] || 0
      })
      return dataPoint
    })
    
    return {
      data: lineChartData,
      domains: topDomains.map((domainData, index) => ({
        name: domainData.domain,
        color: colors[index % colors.length],
        total: domainData.total,
      })),
    }
  }, [displayData, topDomainsCount])

  const exportCSV = () => {
    const headers = ["Brand Name", "Domain", "Full URL", "Month", "Creatives Count"]
    const rows = displayData.map((item) => [
      item.brand_name,
      item.funnel_domain,
      item.funnel_url,
      formatMonth(item.month),
      item.creatives_count,
    ])
    const csv = [headers, ...rows].map((row) => row.join(",")).join("\n")
    const blob = new Blob([csv], { type: "text/csv" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `funnels-${new Date().toISOString().split("T")[0]}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  const toggleNiche = (niche: FunnelType) => {
    setSelectedNiches((prev) =>
      prev.includes(niche) ? prev.filter((n) => n !== niche) : [...prev, niche]
    )
  }

  const toggleType = (type: FunnelType) => {
    setSelectedTypes((prev) =>
      prev.includes(type) ? prev.filter((t) => t !== type) : [...prev, type]
    )
  }


  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="text-center py-20 text-destructive">
        Failed to load data. Please check your Supabase connection.
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* What is Funnel Summary? - Info Card */}
      

      {/* Stats Cards with Trend Indicators */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        <Card className="overflow-hidden bg-card border-border/60">
          <CardContent className="pt-4">
            <div className="flex items-center gap-2 mb-1">
              <Globe className="h-4 w-4 text-primary" />
              <span className="text-sm font-medium">Total Funnels</span>
            </div>
            <div className="text-2xl font-bold">{stats.totalFunnels.toLocaleString()}</div>
            <div className="text-xs text-muted-foreground">Unique destinations</div>
          </CardContent>
        </Card>
        <Card className="overflow-hidden bg-card border-border/60">
          <CardContent className="pt-4">
            <div className="flex items-center gap-2 mb-1">
              <Link2 className="h-4 w-4 text-primary" />
              <span className="text-sm font-medium">Total Creatives</span>
            </div>
            <div className="text-2xl font-bold">{stats.totalCreatives.toLocaleString()}</div>
            <div className="text-xs text-muted-foreground">Ads pointing to funnels</div>
          </CardContent>
        </Card>
        <Card className="overflow-hidden bg-card border-border/60">
          <CardContent className="pt-4">
            <div className="flex items-center gap-2 mb-1">
              <Globe className="h-4 w-4 text-primary" />
              <span className="text-sm font-medium">Unique Domains</span>
            </div>
            <div className="text-2xl font-bold">{stats.uniqueDomains.toLocaleString()}</div>
            <div className="text-xs text-muted-foreground">Different domains</div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card className="bg-card border-border">
        <CardHeader>
          <CardTitle className="text-lg">Filters</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label>Date Range</Label>
              <Select value={dateFilter} onValueChange={(v) => setDateFilter(v as typeof dateFilter)}>
                <SelectTrigger className="bg-muted border-border">
                  <SelectValue placeholder="Date Range" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="lastmonth">Last Month</SelectItem>
                  <SelectItem value="3months">Last 3 Months</SelectItem>
                  <SelectItem value="6months">Last 6 Months</SelectItem>
                  <SelectItem value="12months">Last 12 Months</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Search Brand</Label>
              <Input
                placeholder="Search by brand name..."
                value={brandSearch}
                onChange={(e) => setBrandSearch(e.target.value)}
                className="bg-muted border-border"
              />
            </div>
            <div className="space-y-2">
              <Label>&nbsp;</Label>
              <Button variant="outline" onClick={() => {
                setDateFilter("12months")
                setTrendFilter("all")
                setBrandSearch("")
              }} className="w-full bg-transparent">
                Clear Filters
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Chart */}
      {chartData.data.length > 0 && (
        <Card className="overflow-hidden border-border/60 bg-gradient-to-br from-indigo-500/12 via-card to-card">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base flex items-center gap-2">
                <span className="text-base leading-none">🏆</span>
                Top {topDomainsCount} Funnel Domains by Creative Volume
              </CardTitle>
              <div className="flex items-center gap-2">
                <label className="text-sm text-muted-foreground whitespace-nowrap">Show top:</label>
                <Input
                  type="number"
                  min={1}
                  max={10}
                  value={topDomainsCount}
                  onChange={(e) => {
                    const value = parseInt(e.target.value, 10)
                    if (!isNaN(value) && value >= 1 && value <= 10) {
                      setTopDomainsCount(value)
                    }
                  }}
                  className="w-16 h-8 text-center"
                />
                <span className="text-xs text-muted-foreground">(1-10)</span>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData.data} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="4 8" stroke="var(--border)" opacity={0.25} />
                  <XAxis 
                    dataKey="monthLabel" 
                    tick={{ fontSize: 12, fill: "var(--muted-foreground)" }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis 
                    tick={{ fontSize: 12, fill: "var(--muted-foreground)" }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <Tooltip 
                    contentStyle={{ 
                      background: "var(--background)", 
                      border: "1px solid var(--border)", 
                      borderRadius: 10,
                      padding: "8px 12px"
                    }}
                  />
                  {chartData.domains.map((domain, index) => (
                    <Line
                      key={domain.name}
                      type="monotone"
                      dataKey={domain.name}
                      stroke={domain.color}
                      strokeWidth={2}
                      dot={{ r: 4, fill: domain.color }}
                      activeDot={{ r: 8 }}
                      name={domain.name}
                      connectNulls={false}
                    />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            </div>
            {/* Legend with colors and growth % - single legend below chart */}
            <div className="mt-4 flex flex-wrap gap-4 justify-center">
              {chartData.domains.map((domain) => {
                const growthInfo = domainTrends.growthLabels[domain.name]
                const growthPercent = domainTrends.growthPercents[domain.name]
                const isGrowing = domainTrends.trends[domain.name] === "up"
                return (
                  <div key={domain.name} className="flex items-center gap-2">
                    <div 
                      className="w-3 h-3 rounded-full" 
                      style={{ backgroundColor: domain.color }}
                    />
                    <span className="text-sm text-muted-foreground">
                      {domain.name.length > 25 ? domain.name.substring(0, 25) + "…" : domain.name}
                    </span>
                    {growthInfo && growthInfo !== "—" && (
                      <span className={`text-xs font-semibold ${
                        isGrowing ? "text-green-600" : "text-red-600"
                      }`}>
                        {growthInfo}
                      </span>
                    )}
                  </div>
                )
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Table */}
      <Card className="bg-card border-border">
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle className="text-lg">Funnel Details</CardTitle>
            <CardDescription>Grouped by domain - click to expand</CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <div className="relative w-64">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search by brand name..."
                value={brandSearch}
                onChange={(e) => setBrandSearch(e.target.value)}
                className="pl-9 bg-muted border-border"
              />
            </div>
            <Button onClick={expandAll} variant="outline" size="sm">Expand All</Button>
            <Button onClick={collapseAll} variant="outline" size="sm">Collapse All</Button>
            <Button onClick={exportCSV} variant="outline" size="sm">
              <Download className="mr-2 h-4 w-4" />
              Export CSV
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border border-border overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/50 hover:bg-muted/50">
                  <TableHead className="w-12"></TableHead>
                  <TableHead>Brand</TableHead>
                  <TableHead className="cursor-pointer" onClick={() => handleSort("month")}>
                    <div className="flex items-center">Month<SortIcon field="month" /></div>
                  </TableHead>
                  <TableHead className="cursor-pointer" onClick={() => handleSort("creatives_count")}>
                    <div className="flex items-center">Ads<SortIcon field="creatives_count" /></div>
                  </TableHead>
                  <TableHead>View</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {groupedByDomain.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                      No data found. Try adjusting filters or add competitors.
                    </TableCell>
                  </TableRow>
                ) : (
                  groupedByDomain.map(([domain, items]) => {
                    const isExpanded = expandedDomains.has(domain)
                    const totalCreatives = items.reduce((sum, item) => sum + item.creatives_count, 0)
                    const uniqueMonthKeys = [...new Set(items.map(item => monthKeyFromDateStr(item.month)))].sort()
                    const monthDisplay = uniqueMonthKeys.length === 1
                      ? monthKeyToLabel(uniqueMonthKeys[0])
                      : `${monthKeyToLabel(uniqueMonthKeys[0])} - ${monthKeyToLabel(uniqueMonthKeys[uniqueMonthKeys.length - 1])}`
                    return (
                      <React.Fragment key={domain}>
                        <TableRow
                          className="cursor-pointer bg-muted/30 hover:bg-muted/50"
                          onClick={() => toggleDomain(domain)}
                        >
                          <TableCell>
                            {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                          </TableCell>
                          <TableCell className="font-medium">{domain}</TableCell>
                          <TableCell className="text-muted-foreground">{items.length} paths</TableCell>
                          <TableCell className="text-muted-foreground">{monthDisplay}</TableCell>
                          <TableCell className="font-semibold">{totalCreatives.toLocaleString()}</TableCell>
                        </TableRow>
                        {isExpanded && items.map((item) => (
                          <TableRow key={item.id} className="hover:bg-muted/50">
                            <TableCell></TableCell>
                            <TableCell className="pl-8">{item.brand_name}</TableCell>
                            <TableCell>{formatMonth(item.month)}</TableCell>
                            <TableCell>{item.creatives_count.toLocaleString()}</TableCell>
                            <TableCell>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={(e) => {
                                  e.stopPropagation()
                                  window.open(item.funnel_url, '_blank', 'noopener,noreferrer')
                                }}
                                className="inline-flex items-center gap-1"
                              >
                                View <ExternalLink className="h-3 w-3" />
                              </Button>
                            </TableCell>
                          </TableRow>
                        ))}
                      </React.Fragment>
                    )
                  })
                )}
              </TableBody>
            </Table>
          </div>
          <div className="mt-4 text-sm text-muted-foreground">
            Showing {groupedByDomain.length} domains with {displayData.length} total records
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
