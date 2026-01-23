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

const fetcher = async (): Promise<BrandFunnelSummary[]> => {
  const supabase = getSupabaseClient()
  const { data, error } = await supabase
    .from("brand_funnel_summary")
    .select("*")
    .not("brand_name", "is", null)
    .not("funnel_url", "is", null)
    .not("funnel_domain", "is", null)
    .not("month", "is", null)
    .not("creatives_count", "is", null)
    .gt("creatives_count", 0)
    .order("month", { ascending: false })

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

export function FunnelSummaryTab() {
  const { data, error, isLoading, mutate } = useSWR("funnel-summary", fetcher, {
    revalidateOnMount: true, // Always fetch fresh data on mount
  })

  const [selectedBrands, setSelectedBrands] = useState<string[]>([])
  const [selectedTypes, setSelectedTypes] = useState<FunnelType[]>([])
  const [selectedNiches, setSelectedNiches] = useState<FunnelType[]>([])
  const [brandSearch, setBrandSearch] = useState("")
  const [dateRangeFilter, setDateRangeFilter] = useState<"3months" | "6months" | "12months" | "lastmonth">("12months")
  const [trendFilter, setTrendFilter] = useState<"all" | "up" | "down">("all")
  const [sortField, setSortField] = useState<SortField>("creatives_count")
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc")
  const [expandedDomains, setExpandedDomains] = useState<Set<string>>(new Set())
  const [topDomainsCount, setTopDomainsCount] = useState<5 | 10>(5)

  const uniqueBrands = useMemo(() => {
    if (!data) return []
    return [...new Set(data.map((d) => d.brand_name))].sort()
  }, [data])

  // Removed type-based filtering since type detection is unreliable
  const uniqueNiches: FunnelType[] = []

  const formatMonth = (month: string) => formatMonthShort(month)

  // First filter: brand search
  const filteredData = useMemo(() => {
    if (!data) return []

    const brandSearchLower = brandSearch.toLowerCase().trim()

    return data.filter((item) => {
      // Brand search filter
      if (brandSearchLower && !item.brand_name.toLowerCase().includes(brandSearchLower)) {
        return false
      }
      
      return true
    })
  }, [data, brandSearch])

  // Get global months for date filtering
  const globalMonths = useMemo(() => {
    const monthsInData = [...new Set((data || []).map((d) => d.month))].sort()
    const endMonth = monthsInData.at(-1) || monthStartUTC(new Date())
    const lastTwelve = buildLastNMonths(endMonth, 12)
    return { endMonth, monthsInData, lastTwelve }
  }, [data])

  // Get date filter range
  const getDateFilterRange = useMemo(() => {
    const endMonth = globalMonths.endMonth
    let monthsToInclude = 0
    
    switch (dateRangeFilter) {
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
        monthsToInclude = 3 // Show 3 months visual, but only last month has data
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
  }, [dateRangeFilter, globalMonths.endMonth])

  // Filter data by date range first (before trend calculation)
  const dateFilteredDataForTrends = useMemo(() => {
    if (!filteredData) return []
    const dateRange = getDateFilterRange
    const monthsSet = new Set(dateRange.months)
    return filteredData.filter(item => monthsSet.has(item.month))
  }, [filteredData, getDateFilterRange])

  // Calculate domain trends and growth % based on selected time period (like creatives)
  const domainTrends = useMemo(() => {
    const dateRange = getDateFilterRange
    const sortedMonths = [...dateRange.months].sort()
    
    // Aggregate data by domain and month - sum creatives_count per domain per month
    const domainMonthMap: Record<string, Record<string, number>> = {}
    
    dateFilteredDataForTrends.forEach(item => {
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
      // Convert to array format for trend calculation
      const monthlyCounts = sortedMonths.map(month => ({
        month,
        count: months[month] || 0
      }))
      
      // For last month filter, don't calculate percentages
      if (dateRangeFilter === "lastmonth") {
        const lastMonth = sortedMonths[sortedMonths.length - 1]
        const lastCount = months[lastMonth] || 0
        if (lastCount === 0) {
          trends[domain] = "inactive"
          growthPercents[domain] = 0
          growthLabels[domain] = "—"
        } else {
          trends[domain] = "up"
          growthPercents[domain] = 0
          growthLabels[domain] = "—"
        }
        return
      }
      
      // For 3+ months: calculate % change for each consecutive pair and average them
      // 3 months: compare 1-2, 2-3 and average
      // 6 months: compare 1-2, 2-3, 3-4, 4-5, 5-6 and average
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
      
      // Calculate growth % for each consecutive month pair
      const growthRates: number[] = []
      for (let i = 0; i < sortedMonths.length - 1; i++) {
        const currentMonth = sortedMonths[i]
        const nextMonth = sortedMonths[i + 1]
        const currentCount = months[currentMonth] || 0
        const nextCount = months[nextMonth] || 0
        
        if (currentCount === 0 && nextCount > 0) {
          // New activity
          growthRates.push(Infinity)
        } else if (currentCount > 0 && nextCount === 0) {
          // Stopped
          growthRates.push(-100)
        } else if (currentCount > 0) {
          // Normal calculation
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
      
      // Average the growth rates (handle Infinity separately)
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
  }, [dateFilteredDataForTrends, getDateFilterRange, dateRangeFilter])

  // Filter data by date range and other filters
  const dateFilteredData = useMemo(() => {
    if (!filteredData) return []
    
    const dateRange = getDateFilterRange
    const isLastMonthFilter = dateRangeFilter === "lastmonth"
    const lastMonthOnly = isLastMonthFilter ? dateRange.end : null
    
    // Apply date filter - for "lastmonth", only include the last month's data
    let result: typeof filteredData
    if (isLastMonthFilter && lastMonthOnly) {
      result = filteredData.filter(item => item.month === lastMonthOnly)
    } else {
      const monthsSet = new Set(dateRange.months)
      result = filteredData.filter(item => monthsSet.has(item.month))
    }
    
    // Apply trend filter (excluding inactive) - but not when last month is selected
    if (trendFilter !== "all" && !isLastMonthFilter) {
      result = result.filter(item => domainTrends.trends[item.funnel_domain] === trendFilter)
    }
    
    return result
  }, [filteredData, getDateFilterRange, dateRangeFilter, trendFilter, domainTrends])

  // Calculate stats with trend indicators (vs previous period)
  const stats = useMemo(() => {
    const dateRange = getDateFilterRange
    const currentMonths = new Set(dateRange.months)
    
    // Get previous period (same length, before current period)
    const sortedMonths = [...dateRange.months].sort()
    if (sortedMonths.length === 0) {
      return { totalFunnels: 0, totalCreatives: 0, uniqueDomains: 0, trends: {} }
    }
    
    const periodLength = sortedMonths.length
    const firstMonth = parseMonthStart(sortedMonths[0])
    if (!firstMonth) {
      return { totalFunnels: 0, totalCreatives: 0, uniqueDomains: 0, trends: {} }
    }
    
    // Calculate previous period months
    const previousPeriodStart = addMonthsUTC(firstMonth, -periodLength)
    const previousMonths: string[] = []
    for (let i = 0; i < periodLength; i++) {
      previousMonths.push(monthStartUTC(addMonthsUTC(previousPeriodStart, i)))
    }
    const previousMonthsSet = new Set(previousMonths)
    
    // Current period stats
    const currentData = filteredData.filter(item => currentMonths.has(item.month))
    const totalFunnels = currentData.length
    const totalCreatives = currentData.reduce((sum, item) => sum + item.creatives_count, 0)
    const uniqueDomains = new Set(currentData.map(item => item.funnel_domain)).size
    
    // Previous period stats
    const previousData = filteredData.filter(item => previousMonthsSet.has(item.month))
    const prevTotalFunnels = previousData.length
    const prevTotalCreatives = previousData.reduce((sum, item) => sum + item.creatives_count, 0)
    const prevUniqueDomains = new Set(previousData.map(item => item.funnel_domain)).size
    
    // Calculate trends
    const calculateTrend = (current: number, previous: number) => {
      if (previous === 0) return current > 0 ? { direction: "up" as const, percent: 100, label: "New" } : { direction: "neutral" as const, percent: 0, label: "—" }
      const percent = ((current - previous) / previous) * 100
      return {
        direction: percent > 0 ? "up" as const : percent < 0 ? "down" as const : "neutral" as const,
        percent: Math.abs(percent),
        label: `${percent > 0 ? "+" : ""}${Math.round(percent)}%`
      }
    }
    
    return {
      totalFunnels,
      totalCreatives,
      uniqueDomains,
      trends: {
        funnels: calculateTrend(totalFunnels, prevTotalFunnels),
        creatives: calculateTrend(totalCreatives, prevTotalCreatives),
        domains: calculateTrend(uniqueDomains, prevUniqueDomains),
      }
    }
  }, [dateFilteredData, filteredData, getDateFilterRange])

  const groupedByDomain = useMemo(() => {
    const groups: Record<string, BrandFunnelSummary[]> = {}
    dateFilteredData.forEach((item) => {
      if (!groups[item.funnel_domain]) groups[item.funnel_domain] = []
      groups[item.funnel_domain].push(item)
    })

    Object.values(groups).forEach((items) => {
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
    const sortedEntries = Object.entries(groups).sort((a, b) => {
      const totalA = a[1].reduce((sum, item) => sum + item.creatives_count, 0)
      const totalB = b[1].reduce((sum, item) => sum + item.creatives_count, 0)
      return totalB - totalA
    })

    return sortedEntries
  }, [dateFilteredData, sortField, sortDirection])

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
    setDateRangeFilter("12months")
    setTrendFilter("all")
    setBrandSearch("")
  }

  // Chart data - Top N domains by total volume with monthly data for line chart
  const chartData = useMemo(() => {
    // Aggregate by domain and month
    const domainMonthMap: Record<string, Record<string, number>> = {}
    
    dateFilteredData.forEach((item) => {
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
    
    // Get months from the filtered range
    const dateRange = getDateFilterRange
    const isLastMonthFilter = dateRangeFilter === "lastmonth"
    
    // For "lastmonth", show only the last month (single data point)
    const sortedMonths = isLastMonthFilter 
      ? [dateRange.end] // Only last month
      : [...dateRange.months].sort()
    
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
  }, [dateFilteredData, topDomainsCount, getDateFilterRange, dateRangeFilter])

  const exportCSV = () => {
    const headers = ["Brand Name", "Domain", "Path", "Full URL", "Type", "Month", "Creatives Count", "Ads Library URL"]
    const rows = dateFilteredData.map((item) => [
      item.brand_name,
      item.funnel_domain,
      item.funnel_path || "",
      item.funnel_url,
      item.funnel_type || "landing_page",
      formatMonth(item.month),
      item.creatives_count,
      item.ads_library_url || "",
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

      {/* Filters - Simplified */}
      <Card className="bg-card border-border">
        <CardHeader>
          <CardTitle className="text-lg">Filters</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label>Date Range</Label>
              <Select value={dateRangeFilter} onValueChange={(v) => setDateRangeFilter(v as typeof dateRangeFilter)}>
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
            {dateRangeFilter !== "lastmonth" && (
              <div className="space-y-2">
                <Label>Trend</Label>
                <Select value={trendFilter} onValueChange={(v) => setTrendFilter(v as typeof trendFilter)}>
                  <SelectTrigger className="bg-muted border-border">
                    <SelectValue placeholder="All Trends" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Trends</SelectItem>
                    <SelectItem value="up">Growing</SelectItem>
                    <SelectItem value="down">Declining</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="space-y-2">
              <Label>&nbsp;</Label>
              <Button variant="outline" onClick={() => {
                setDateRangeFilter("12months")
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
                Top {topDomainsCount} Domains by Creative Volume
              </CardTitle>
              <div className="flex gap-2">
                <Button
                  variant={topDomainsCount === 5 ? "default" : "outline"}
                  size="sm"
                  onClick={() => setTopDomainsCount(5)}
                >
                  Top 5
                </Button>
                <Button
                  variant={topDomainsCount === 10 ? "default" : "outline"}
                  size="sm"
                  onClick={() => setTopDomainsCount(10)}
                >
                  Top 10
                </Button>
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
                  {chartData.domains.map((domain, index) => {
                    const isLastMonth = dateRangeFilter === "lastmonth"
                    return (
                      <Line
                        key={domain.name}
                        type={isLastMonth ? "linear" : "monotone"}
                        dataKey={domain.name}
                        stroke={domain.color}
                        strokeWidth={isLastMonth ? 0 : 2} // Hide line when last month (show only dots)
                        dot={{ r: 4, fill: domain.color }}
                        activeDot={{ r: 8 }}
                        name={domain.name}
                        connectNulls={false}
                      />
                    )
                  })}
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
                    {dateRangeFilter !== "lastmonth" && growthInfo && growthInfo !== "—" && (
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
                  <TableHead>Domain / Path</TableHead>
                  <TableHead>Brand</TableHead>
                  <TableHead className="cursor-pointer" onClick={() => handleSort("month")}>
                    <div className="flex items-center">Month<SortIcon field="month" /></div>
                  </TableHead>
                  <TableHead className="cursor-pointer" onClick={() => handleSort("creatives_count")}>
                    <div className="flex items-center">Ads<SortIcon field="creatives_count" /></div>
                  </TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {groupedByDomain.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
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
                    const adsLibraryUrl = items.find(item => item.ads_library_url)?.ads_library_url

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
                          <TableCell>
                            {adsLibraryUrl && (
                              <a
                                href={adsLibraryUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1 text-primary hover:underline text-sm"
                                onClick={(e) => e.stopPropagation()}
                              >
                                View Ads <ExternalLink className="h-3 w-3" />
                              </a>
                            )}
                          </TableCell>
                        </TableRow>
                        {isExpanded && items.map((item) => (
                          <TableRow key={item.id} className="hover:bg-muted/50">
                            <TableCell></TableCell>
                            <TableCell className="pl-8">
                              <a
                                href={item.funnel_url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-primary hover:underline inline-flex items-center gap-1"
                              >
                                {item.funnel_path || "/"}
                                <ExternalLink className="h-3 w-3" />
                              </a>
                            </TableCell>
                            <TableCell>{item.brand_name}</TableCell>
                            <TableCell>{formatMonth(item.month)}</TableCell>
                            <TableCell>{item.creatives_count.toLocaleString()}</TableCell>
                            <TableCell>
                              {item.ads_library_url && (
                                <a
                                  href={item.ads_library_url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="inline-flex items-center gap-1 text-primary hover:underline text-sm"
                                >
                                  View <ExternalLink className="h-3 w-3" />
                                </a>
                              )}
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
            Showing {groupedByDomain.length} domains with {dateFilteredData.length} total records
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
