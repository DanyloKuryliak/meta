"use client"

import { useState, useMemo } from "react"
import useSWR from "swr"
import { getSupabaseClient } from "@/lib/supabase/client"
import type { BrandCreativeSummary } from "@/lib/supabase"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Input } from "@/components/ui/input"
import {
  ArrowUp,
  ArrowDown,
  Download,
  Loader2,
  ExternalLink,
  TrendingUp,
  TrendingDown,
  Search,
  X,
  Plus,
  Check,
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
  Cell,
  Legend,
} from "recharts"

type SortField = "brand_name" | "total" | "recent" | "trend" | "avgPerMonth" | "peakMonth" | "percentChange"
type SortDirection = "asc" | "desc"
type Trend = "up" | "down" | "inactive"

// Format month from "2026-01-01" to "Jan '26"
function formatMonthShort(monthStr: string): string {
  const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
  const parts = monthStr.split("-")
  if (parts.length < 2) return monthStr
  const year = parts[0].slice(2)
  const monthIndex = parseInt(parts[1], 10) - 1
  return `${monthNames[monthIndex] || parts[1]} '${year}`
}

function clampPercent(value: number) {
  if (!Number.isFinite(value)) return value
  return Math.max(-999, Math.min(999, value))
}

function monthStartUTC(d: Date): string {
  const y = d.getUTCFullYear()
  const m = String(d.getUTCMonth() + 1).padStart(2, "0")
  return `${y}-${m}-01`
}

function monthAbbrev(label: string) {
  return (label || "").split(" ")[0] || label
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

function getTrendFromRecentPrevious(opts: {
  recentCount: number
  previousCount: number
  canCompare: boolean
}): { trend: Trend; pctLabel: string } {
  const { recentCount, previousCount, canCompare } = opts

  // Never label as growing/declining if latest month is 0.
  if (recentCount === 0) return { trend: "inactive", pctLabel: "—" }

  // If we don't have a baseline month in the dataset, fall back to a simple, deterministic rule.
  // (Still 100% based on DB data; no randomness.)
  if (!canCompare) return { trend: "up", pctLabel: "New" }

  if (previousCount === 0) return { trend: "up", pctLabel: "New" }

  const pct = clampPercent(((recentCount - previousCount) / previousCount) * 100)
  const pctLabel = `${pct > 0 ? "+" : ""}${Math.round(pct)}%`

  // No "steady" bucket: if it's not inactive, it must be growing or declining.
  if (pct >= 0) return { trend: "up", pctLabel }
  return { trend: "down", pctLabel }
}

function getTrendFromConsecutiveMonths(opts: {
  monthlyCounts: Array<{ month: string; count: number }>
  sortedMonths: string[]
}): { trend: Trend; pctLabel: string; growthPercent: number } {
  const { monthlyCounts, sortedMonths } = opts

  // Create a map for quick lookup - ensure we have counts for ALL months in the sorted list
  const monthToCount = new Map<string, number>()
  monthlyCounts.forEach(m => {
    monthToCount.set(m.month, m.count)
  })
  
  // Ensure all months in sortedMonths have entries (default to 0 if missing)
  sortedMonths.forEach(month => {
    if (!monthToCount.has(month)) {
      monthToCount.set(month, 0)
    }
  })

  // Need at least 2 months to calculate growth
  if (sortedMonths.length < 2) {
    const lastMonth = sortedMonths[sortedMonths.length - 1]
    const lastCount = monthToCount.get(lastMonth) || 0
    if (lastCount === 0) {
      return { trend: "inactive", pctLabel: "—", growthPercent: 0 }
    }
    return { trend: "up", pctLabel: "New", growthPercent: Infinity }
  }

  // Calculate means of consecutive month pairs (1&2, 2&3, 3&4, etc.)
  // For 6 months: calculate means of (1&2), (2&3), (3&4), (4&5), (5&6)
  // For 3 months: calculate means of (1&2), (2&3)
  const pairMeans: number[] = []
  for (let i = 0; i < sortedMonths.length - 1; i++) {
    const month1 = sortedMonths[i]
    const month2 = sortedMonths[i + 1]
    const count1 = monthToCount.get(month1) || 0
    const count2 = monthToCount.get(month2) || 0
    const mean = (count1 + count2) / 2
    pairMeans.push(mean)
  }

  // If all pair means are 0, brand is inactive
  if (pairMeans.every(m => m === 0)) {
    return { trend: "inactive", pctLabel: "—", growthPercent: 0 }
  }

  // Calculate growth rates between consecutive pair means
  // For 6 months with 5 pair means: calculate growth from mean(1,2) to mean(2,3), mean(2,3) to mean(3,4), etc.
  // Then average all growth rates to get the final percentage
  const growthRates: number[] = []
  for (let i = 0; i < pairMeans.length - 1; i++) {
    const currentMean = pairMeans[i]
    const nextMean = pairMeans[i + 1]
    
    if (currentMean === 0 && nextMean > 0) {
      // New activity
      growthRates.push(Infinity)
    } else if (currentMean > 0 && nextMean === 0) {
      // Stopped
      growthRates.push(-100)
    } else if (currentMean > 0) {
      // Normal calculation: ((nextMean - currentMean) / currentMean) * 100
      const growth = ((nextMean - currentMean) / currentMean) * 100
      growthRates.push(growth)
    }
  }

  // If no valid growth rates, handle edge cases
  if (growthRates.length === 0) {
    const lastMonth = sortedMonths[sortedMonths.length - 1]
    const lastCount = monthToCount.get(lastMonth) || 0
    if (lastCount === 0) {
      return { trend: "inactive", pctLabel: "—", growthPercent: 0 }
    }
    return { trend: "up", pctLabel: "New", growthPercent: Infinity }
  }

  // Average the growth rates (handle Infinity separately)
  const hasInfinity = growthRates.some(r => r === Infinity)
  const finiteRates = growthRates.filter(r => r !== Infinity && Number.isFinite(r))
  
  let avgGrowth: number
  if (hasInfinity && finiteRates.length === 0) {
    avgGrowth = Infinity
    return { trend: "up", pctLabel: "New", growthPercent: Infinity }
  } else if (finiteRates.length > 0) {
    avgGrowth = finiteRates.reduce((sum, r) => sum + r, 0) / finiteRates.length
  } else {
    avgGrowth = -100
  }

  const clampedGrowth = clampPercent(avgGrowth)
  const pctLabel = `${clampedGrowth > 0 ? "+" : ""}${Math.round(clampedGrowth)}%`

  // Determine trend based on growth
  if (clampedGrowth >= 0) {
    return { trend: "up", pctLabel, growthPercent: clampedGrowth }
  }
  return { trend: "down", pctLabel, growthPercent: clampedGrowth }
}

function getTrendBadge(trend: Trend) {
  switch (trend) {
    case "up":
      return {
        emoji: "📈",
        label: "Growing",
        className:
          "border-green-600/30 bg-green-50 text-green-700 dark:bg-green-950/40 dark:text-green-300",
        lineColor: "hsl(142 71% 45%)",
        dash: undefined as string | undefined,
      }
    case "down":
      return {
        emoji: "📉",
        label: "Declining",
        className:
          "border-red-600/30 bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-300",
        lineColor: "hsl(0 84% 60%)",
        dash: undefined,
      }
    case "inactive":
      return {
        emoji: "😴",
        label: "No activity",
        className:
          "border-slate-500/30 bg-slate-50 text-slate-600 dark:bg-slate-900/40 dark:text-slate-300",
        // IMPORTANT: theme vars are OKLCH, so don't wrap in hsl(...)
        lineColor: "var(--muted-foreground)",
        dash: undefined,
      }
  }
}

type BrandData = {
  brand_id: string
  brand_name: string
  total: number
  recentCount: number
  previousCount: number
  recentMonth: string
  previousMonth: string
  percentChangeLabel: string
  growthPercent: number // Numeric growth % (Infinity for "New", 0 for inactive)
  lastActiveMonth: string
  monthlyData: { month: string; count: number }[]
  lastSixMonths: { month: string; count: number; label: string }[]
  lastTwelveMonths: { month: string; count: number; label: string }[]
  trend: Trend
  activeMonths: number
  firstMonth: string
  lastMonth: string
  avgPerMonth?: number
  peakMonth?: string
}

const CHUNK_SIZE = 1000

async function fetchAllCreativeSummaryRows(
  supabase: ReturnType<typeof getSupabaseClient>,
  selectedBusinessIds: Set<string>
): Promise<BrandCreativeSummary[]> {
  const allRows: BrandCreativeSummary[] = []
  let offset = 0
  while (true) {
    const { data, error } = await supabase
      .from("brand_creative_summary")
      .select("*")
      .not("brand_id", "is", null)
      .not("brand_name", "is", null)
      .not("month", "is", null)
      .not("creatives_count", "is", null)
      .in("business_id", Array.from(selectedBusinessIds))
      .order("month", { ascending: false })
      .range(offset, offset + CHUNK_SIZE - 1)
    if (error) throw error
    if (!data?.length) break
    allRows.push(...(data as BrandCreativeSummary[]))
    if (data.length < CHUNK_SIZE) break
    offset += CHUNK_SIZE
  }
  return allRows
}

const createFetcher = (selectedBusinessIds: Set<string>) => async (): Promise<BrandCreativeSummary[]> => {
  // Return empty array if no businesses are selected
  if (selectedBusinessIds.size === 0) {
    return []
  }

  const supabase = getSupabaseClient()
  const data = await fetchAllCreativeSummaryRows(supabase, selectedBusinessIds)
  
  // Normalize month format - Supabase returns date as ISO string, convert to YYYY-MM-01
  const normalized = (data || []).map((row: BrandCreativeSummary) => {
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
  
  console.log(`[Creative Summary] Fetched ${normalized.length} rows`)
  return normalized
}

export function CreativeSummaryTab({ selectedBusinessIds = new Set() }: { selectedBusinessIds?: Set<string> }) {
  const fetcherKey = `creative-summary-${Array.from(selectedBusinessIds).sort().join(",")}`
  const { data, error, isLoading, mutate } = useSWR(fetcherKey, createFetcher(selectedBusinessIds), {
    revalidateOnMount: true, // Always fetch fresh data on mount
  })
  const [searchQuery, setSearchQuery] = useState("")
  const [sortField, setSortField] = useState<SortField>("total")
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc")
  const [topBrandsCount, setTopBrandsCount] = useState<number>(5)
  const [dateFilter, setDateFilter] = useState<"3months" | "6months" | "12months" | "18months" | "24months" | "lastmonth">("12months")
  const [selectedBrandIds, setSelectedBrandIds] = useState<Set<string>>(new Set())


  const globalMonths = useMemo(() => {
    const monthsInData = [...new Set((data || []).map((d) => d.month))].sort()
    const endMonth = monthsInData.at(-1) || monthStartUTC(new Date())
    const lastTwelve = buildLastNMonths(endMonth, 12) // Last 12 months for display and export
    return { endMonth, monthsInData, lastTwelve }
  }, [data])

  // Process data into brand summaries — aggregate by brand_name so one player (multiple FB pages) = one row
  const brandData = useMemo(() => {
    if (!data || data.length === 0) return []

    const brandMap: Record<string, BrandData> = {}

    for (const row of data) {
      const name = (row.brand_name || "").trim() || "Unknown"
      // Use brand_name as key so multiple pages under same player merge into one row
      if (!brandMap[name]) {
        const initMonth = row.month
        brandMap[name] = {
          brand_id: name,
          brand_name: name,
          total: 0,
          recentCount: 0,
          previousCount: 0,
          recentMonth: initMonth,
          previousMonth: initMonth,
          percentChangeLabel: "—",
          growthPercent: 0,
          lastActiveMonth: initMonth,
          monthlyData: [],
          lastSixMonths: [],
          lastTwelveMonths: [],
          trend: "inactive",
          activeMonths: 0,
          firstMonth: initMonth,
          lastMonth: initMonth,
        }
      }

      brandMap[name].total += row.creatives_count
      brandMap[name].monthlyData.push({ month: row.month, count: row.creatives_count })
      
      if (row.month < brandMap[name].firstMonth) brandMap[name].firstMonth = row.month
      if (row.month > brandMap[name].lastMonth) brandMap[name].lastMonth = row.month
    }

    // Build monthly data maps (trends calculated after filtering)
    for (const brand of Object.values(brandMap)) {
      const monthToCount: Record<string, number> = {}
      for (const m of brand.monthlyData) {
        monthToCount[m.month] = (monthToCount[m.month] || 0) + m.count
      }

      brand.monthlyData = Object.entries(monthToCount)
        .map(([month, count]) => ({ month, count }))
        .sort((a, b) => a.month.localeCompare(b.month))

      brand.activeMonths = Object.values(monthToCount).filter((c) => c > 0).length

      // Build last 12 months for display
      const lastTwelve = globalMonths.lastTwelve.map((m) => ({
        month: m,
        count: monthToCount[m] || 0,
        label: formatMonthShort(m),
      }))
      brand.lastTwelveMonths = lastTwelve
      
      // Last active month (overall)
      const lastActive = [...brand.monthlyData].reverse().find((m) => m.count > 0)?.month
      brand.lastActiveMonth = lastActive || brand.lastMonth
    }

    return Object.values(brandMap)
  }, [data, globalMonths])

  // Filter by months (since data is aggregated by month)
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
      case "18months":
        monthsToInclude = 18
        break
      case "24months":
        monthsToInclude = 24
        break
      case "lastmonth":
        monthsToInclude = 3 // Show 3 months visual, but only last month has data
        break
      default:
        monthsToInclude = 12
    }
    
    // Get the last N months from the end month
    const filteredMonths = buildLastNMonths(endMonth, monthsToInclude)
    const startMonth = filteredMonths[0]
    const endMonthFiltered = filteredMonths[filteredMonths.length - 1]
    
    // Calculate recent and previous months FROM THE FILTERED RANGE
    // Sort to ensure we get the correct last and second-to-last months
    const sortedFilteredMonths = [...filteredMonths].sort()
    const recentMonth = sortedFilteredMonths[sortedFilteredMonths.length - 1] || endMonthFiltered
    const previousMonth = sortedFilteredMonths.length >= 2 
      ? sortedFilteredMonths[sortedFilteredMonths.length - 2] 
      : recentMonth
    
    return { 
      start: startMonth, 
      end: endMonthFiltered, 
      months: filteredMonths,
      recentMonth,
      previousMonth,
      canCompare: sortedFilteredMonths.length >= 2 && monthsToInclude >= 2
    }
  }, [dateFilter, globalMonths.endMonth])

  // Filter and sort - recalculate all metrics based on date filter
  const filteredBrands = useMemo(() => {
    let result = brandData

    // Search filter
    if (searchQuery) {
      const q = searchQuery.toLowerCase().trim()
      result = result.filter(b => b.brand_name.toLowerCase().includes(q))
    }

    // Apply date filter and recalculate metrics (month-based)
    const dateRange = getDateFilterRange
    const monthsSet = new Set(dateRange.months)
    const isLastMonthFilter = dateFilter === "lastmonth"
    const lastMonthOnly = isLastMonthFilter ? dateRange.end : null
    
    result = result.map(brand => {
      // Filter monthly data - for "lastmonth", only include the last month's data
      let filteredMonthlyData = brand.monthlyData.filter(m => monthsSet.has(m.month))
      if (isLastMonthFilter && lastMonthOnly) {
        filteredMonthlyData = brand.monthlyData.filter(m => m.month === lastMonthOnly)
      }
      const filteredTotal = filteredMonthlyData.reduce((sum, m) => sum + m.count, 0)
      
      // Sort filtered months to ensure correct order
      const sortedFilteredMonths = [...dateRange.months].sort()
      const recentMonth = sortedFilteredMonths[sortedFilteredMonths.length - 1] || dateRange.end
      const previousMonth = sortedFilteredMonths[0] || dateRange.start
      
      // Create a map for quick lookup
      const monthToCountMap = new Map<string, number>()
      filteredMonthlyData.forEach(m => {
        monthToCountMap.set(m.month, m.count)
      })
      
      // Calculate growth by comparing consecutive months (1&2, 2&3, 3&4, etc.) and averaging
      // This gives the mean growth rate over the entire selected period
      const sortedMonths = [...dateRange.months].sort()
      
      // Get recent count for display (last month in period)
      const recentCount = monthToCountMap.get(recentMonth) || 0
      
      // IMPORTANT: Calculate trend based on consecutive month comparisons using ONLY filtered data
      // For 6 months: compares 1&2, 2&3, 3&4, 4&5, 5&6 and averages the growth rates
      // This ensures the percentage changes when the date filter changes
      const trendEval = getTrendFromConsecutiveMonths({
        monthlyCounts: filteredMonthlyData.map(m => ({ month: m.month, count: m.count })),
        sortedMonths: sortedMonths,
      })
      
      // Recalculate avg/month and peak month
      const activeMonths = filteredMonthlyData.filter(m => m.count > 0).length
      const avgPerMonth = activeMonths > 0 ? filteredTotal / activeMonths : 0
      const peakMonthData = filteredMonthlyData.length > 0 
        ? filteredMonthlyData.reduce((max, m) => m.count > max.count ? m : max, filteredMonthlyData[0])
        : { month: "", count: 0 }
      const peakMonth = peakMonthData.count > 0 ? formatMonthShort(peakMonthData.month) : "N/A"
      
      // Build filtered last N months for display (based on filter)
      // For "lastmonth", show 3 months but only last month has data
      const filteredDisplayMonths = dateRange.months.map((m) => {
        if (isLastMonthFilter && m !== lastMonthOnly) {
          // First two months show zero
          return {
            month: m,
            count: 0,
            label: formatMonthShort(m),
          }
        }
        const monthData = filteredMonthlyData.find(d => d.month === m)
        return {
          month: m,
          count: monthData?.count || 0,
          label: formatMonthShort(m),
        }
      })
      
      return {
        ...brand,
        monthlyData: filteredMonthlyData,
        total: filteredTotal,
        recentCount,
        previousCount: monthToCountMap.get(previousMonth) || 0, // Keep for compatibility
        recentMonth,
        previousMonth,
        trend: trendEval.trend,
        percentChangeLabel: trendEval.pctLabel,
        growthPercent: trendEval.growthPercent, // Store numeric growth % for sorting
        avgPerMonth: Math.round(avgPerMonth),
        peakMonth,
        activeMonths,
        // Update display months to show filtered range
        lastTwelveMonths: filteredDisplayMonths,
      }
    }).filter(b => b.total > 0) // Only show brands with data in range

    // When sorting by Growth %, exclude "New" brands (they don't have a percentage)
    if (sortField === "percentChange") {
      result = result.filter(b => b.growthPercent !== Infinity)
    }

    // Sort - prioritize actionability: Trend > Recent Activity > Growth %
    result.sort((a, b) => {
      let cmp = 0
      switch (sortField) {
        case "brand_name":
          cmp = a.brand_name.localeCompare(b.brand_name)
          break
        case "total":
          cmp = a.total - b.total
          break
        case "recent":
          cmp = a.recentCount - b.recentCount
          break
        case "trend":
          // Primary: trend (up > down > inactive)
          const trendOrder = { up: 2, down: 1, inactive: 0 }
          cmp = trendOrder[a.trend] - trendOrder[b.trend]
          // Secondary: recent activity (if same trend)
          if (cmp === 0) {
            cmp = a.recentCount - b.recentCount
          }
          // Tertiary: growth % (if same trend and recent activity)
          if (cmp === 0) {
            const aGrowth = a.growthPercent === Infinity ? 1000 : (a.growthPercent || 0)
            const bGrowth = b.growthPercent === Infinity ? 1000 : (b.growthPercent || 0)
            cmp = aGrowth - bGrowth
          }
          break
        case "avgPerMonth":
          cmp = (a.avgPerMonth || 0) - (b.avgPerMonth || 0)
          break
        case "percentChange":
          // Sort by numeric growthPercent
          // "New" brands (Infinity) are already filtered out before sorting
          cmp = (a.growthPercent || 0) - (b.growthPercent || 0)
          
          // If same growth %, sort by recent activity
          if (cmp === 0) {
            cmp = a.recentCount - b.recentCount
          }
          // If still same, sort by total volume
          if (cmp === 0) {
            cmp = a.total - b.total
          }
          break
        default:
          cmp = 0
      }
      // desc = descending (high to low) = reverse comparison
      // asc = ascending (low to high) = normal comparison
      return sortDirection === "desc" ? -cmp : cmp
    })

    return result
  }, [brandData, searchQuery, sortField, sortDirection, getDateFilterRange, dateFilter])

  // Summary stats (based on filtered data)
  const stats = useMemo(() => {
    const totalBrands = filteredBrands.length
    const totalCreatives = filteredBrands.reduce((sum, b) => sum + b.total, 0)
    const growingBrands = filteredBrands.filter(b => b.trend === "up").length
    return { 
      totalBrands, 
      totalCreatives, 
      growingBrands
    }
  }, [filteredBrands])

  // Chart data - Top N by total volume OR selected brands with monthly data for line chart (uses filtered data)
  const chartData = useMemo(() => {
    let brandsToShow: BrandData[] = []
    
    // If brands are selected for comparison, show those. Otherwise show top N (brand_id is brand_name when aggregated)
    if (selectedBrandIds.size > 0) {
      brandsToShow = filteredBrands.filter(brand => selectedBrandIds.has(brand.brand_id))
    } else {
      // Top N mode: sort by total and take top N
      const sorted = [...filteredBrands].sort((a, b) => b.total - a.total)
      brandsToShow = sorted.slice(0, topBrandsCount)
    }
    
    // Get months from the filtered range
    const dateRange = getDateFilterRange
    const isLastMonthFilter = dateFilter === "lastmonth"
    
    // For "lastmonth", show only the last month (single data point)
    const sortedMonths = isLastMonthFilter 
      ? [dateRange.end] // Only last month
      : [...dateRange.months].sort()
    
    // Generate colors for each brand
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
    const lineChartData = sortedMonths.map((month) => {
      const dataPoint: Record<string, any> = { month, monthLabel: formatMonthShort(month) }
      brandsToShow.forEach((brand) => {
        const monthData = brand.lastTwelveMonths.find(m => m.month === month)
        dataPoint[brand.brand_name] = monthData?.count || 0
      })
      return dataPoint
    })
    
    return {
      data: lineChartData,
      brands: brandsToShow.map((brand, index) => ({
        name: brand.brand_name,
        color: colors[index % colors.length],
        total: brand.total,
        id: brand.brand_id,
      })),
    }
  }, [filteredBrands, topBrandsCount, getDateFilterRange, dateFilter, selectedBrandIds])

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection(d => (d === "asc" ? "desc" : "asc"))
    } else {
      setSortField(field)
      setSortDirection("desc")
    }
  }


  const exportCSV = () => {
    if (!filteredBrands || filteredBrands.length === 0) return

    // Use filtered months for export (based on current date filter)
    const dateRange = getDateFilterRange
    const exportMonths = dateRange.months.map(m => m.substring(0, 7)) // YYYY-MM format

    // Build monthly data map for each brand
    const brandMonthlyData: Record<string, Record<string, number>> = {}
    filteredBrands.forEach(brand => {
      brandMonthlyData[brand.brand_id] = {}
      brand.monthlyData.forEach(m => {
        const monthKey = m.month.substring(0, 7) // Get YYYY-MM format
        if (exportMonths.includes(monthKey)) {
          brandMonthlyData[brand.brand_id][monthKey] = m.count
        }
      })
    })

    // Calculate total for filtered range
    const calculateFilteredTotal = (brand: BrandData) => {
      return brand.monthlyData
        .filter(m => exportMonths.includes(m.month.substring(0, 7)))
        .reduce((sum, m) => sum + m.count, 0)
    }

    // Build CSV rows — Brand Name = Player (column A)
    const headers = [
      'Brand Name',
      'Ads Library Link',
      ...exportMonths,
      'Total'
    ]

    const rows = filteredBrands.map(brand => {
      const monthlyValues = exportMonths.map(m => brandMonthlyData[brand.brand_id]?.[m] || 0)
      const total = calculateFilteredTotal(brand)

      return [
        brand.brand_name,
        ...monthlyValues,
        total
      ]
    })

    // Escape CSV values
    const escapeCSV = (val: any) => {
      const str = String(val)
      if (str.includes(',') || str.includes('"') || str.includes('\n')) {
        return `"${str.replace(/"/g, '""')}"`
      }
      return str
    }

    const csv = [headers.map(escapeCSV), ...rows.map(r => r.map(escapeCSV))].map(r => r.join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `creative-summary-${dateFilter}-${new Date().toISOString().split('T')[0]}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (error) {
    return (
      <Card className="border-destructive">
        <CardContent className="pt-6">
          <p className="text-destructive">Failed to load data: {error.message}</p>
          <p className="text-sm text-muted-foreground mt-2">Data will auto-refresh automatically.</p>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-6">
      {/* Info Banner */}
      

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="overflow-hidden bg-gradient-to-br from-cyan-500/10 via-card to-card">
          <CardContent className="pt-4">
            <p className="text-sm text-muted-foreground flex items-center gap-2">
              <span className="text-base leading-none">👀</span>
              Brands Tracked
            </p>
            <p className="text-2xl font-bold">{stats.totalBrands}</p>
            <p className="text-xs text-muted-foreground mt-1">
              {dateFilter === "lastmonth" ? "Last month" : 
               dateFilter === "3months" ? "Last 3 months" :
               dateFilter === "6months" ? "Last 6 months" :
               dateFilter === "18months" ? "Last 18 months" :
               dateFilter === "24months" ? "Last 24 months" : "Last 12 months"}
            </p>
          </CardContent>
        </Card>
        <Card className="overflow-hidden bg-gradient-to-br from-violet-500/10 via-card to-card">
          <CardContent className="pt-4">
            <p className="text-sm text-muted-foreground flex items-center gap-2">
              <span className="text-base leading-none">🎨</span>
              Total Creatives
            </p>
            <p className="text-2xl font-bold">{stats.totalCreatives.toLocaleString()}</p>
            <p className="text-xs text-muted-foreground mt-1">
              {stats.totalBrands > 0 ? Math.round(stats.totalCreatives / stats.totalBrands) : 0} avg per brand
            </p>
          </CardContent>
        </Card>
        <Card className="overflow-hidden bg-gradient-to-br from-emerald-500/10 via-card to-card">
          <CardContent className="pt-4">
            <p className="text-sm text-muted-foreground flex items-center gap-2">
              <span className="text-base leading-none">🚀</span>
              Growing Brands
            </p>
            <p className="text-2xl font-bold text-green-600">{stats.growingBrands}</p>
            <p className="text-xs text-muted-foreground mt-1">
              {stats.totalBrands > 0 ? Math.round((stats.growingBrands / stats.totalBrands) * 100) : 0}% of total
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Search - Moved above chart */}
      <div className="flex items-center gap-2">
        <div className="relative flex-1 sm:w-64">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search brands..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
          />
        </div>
      </div>

      {/* Chart */}
      {chartData.data.length > 0 && chartData.brands.length > 0 && (
        <Card className="overflow-hidden border-border/60 bg-gradient-to-br from-indigo-500/12 via-card to-card">
          <CardHeader className="pb-2">
            <div className="flex flex-col gap-4">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base flex items-center gap-2">
                  <span className="text-base leading-none">🏆</span>
                  {selectedBrandIds.size > 0
                    ? `${selectedBrandIds.size} Brand${selectedBrandIds.size !== 1 ? 's' : ''} Comparison`
                    : `Top ${topBrandsCount} Brands by Creative Volume`
                  }
                </CardTitle>
                <div className="flex items-center gap-2">
                  {selectedBrandIds.size > 0 && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setSelectedBrandIds(new Set())}
                    >
                      Clear Selection
                    </Button>
                  )}
                  <div className="flex items-center gap-2">
                    <label className="text-sm text-muted-foreground whitespace-nowrap">Show top:</label>
                    <Input
                      type="number"
                      min={1}
                      max={10}
                      value={topBrandsCount}
                      onChange={(e) => {
                        const value = parseInt(e.target.value, 10)
                        if (!isNaN(value) && value >= 1 && value <= 10) {
                          setTopBrandsCount(value)
                        }
                      }}
                      className="w-16 h-8 text-center"
                      disabled={selectedBrandIds.size > 0}
                    />
                    <span className="text-xs text-muted-foreground">(1-10)</span>
                  </div>
                </div>
              </div>
              {selectedBrandIds.size > 0 && (
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs text-muted-foreground">Comparing:</span>
                  {Array.from(selectedBrandIds).map((brandId) => {
                    const brand = filteredBrands.find(b => b.brand_id === brandId)
                    if (!brand) return null
                    return (
                      <Badge key={brandId} variant="secondary" className="gap-1">
                        {brand.brand_name}
                        <button
                          onClick={() => {
                            const newSet = new Set(selectedBrandIds)
                            newSet.delete(brandId)
                            setSelectedBrandIds(newSet)
                          }}
                          className="ml-1 hover:bg-destructive/20 rounded"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </Badge>
                    )
                  })}
                </div>
              )}
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
                  {chartData.brands.map((brand, index) => {
                    const isLastMonth = dateFilter === "lastmonth"
                    return (
                      <Line
                        key={brand.name}
                        type={isLastMonth ? "linear" : "monotone"}
                        dataKey={brand.name}
                        stroke={brand.color}
                        strokeWidth={isLastMonth ? 0 : 2.5} // Hide line when last month (show only dots)
                        dot={{ r: isLastMonth ? 6 : 4, fill: brand.color }}
                        activeDot={{ r: 8 }}
                        name={brand.name}
                        connectNulls={false}
                      />
                    )
                  })}
                </LineChart>
              </ResponsiveContainer>
            </div>
            {/* Legend with colors - single legend below chart */}
            <div className="mt-4 flex flex-wrap gap-4 justify-center">
              {chartData.brands.map((brand) => (
                <div key={brand.name} className="flex items-center gap-2">
                  <div 
                    className="w-3 h-3 rounded-full" 
                    style={{ backgroundColor: brand.color }}
                  />
                  <span className="text-sm text-muted-foreground">
                    {brand.name.length > 25 ? brand.name.substring(0, 25) + "…" : brand.name}
                  </span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Controls */}
      <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
        <div className="flex items-center gap-2 w-full sm:w-auto flex-wrap">
          <Select value={dateFilter} onValueChange={(v) => setDateFilter(v as typeof dateFilter)}>
            <SelectTrigger className="w-[140px]">
              <SelectValue placeholder="Time Period" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="lastmonth">Last Month</SelectItem>
              <SelectItem value="3months">Last 3 Months</SelectItem>
              <SelectItem value="6months">Last 6 Months</SelectItem>
              <SelectItem value="12months">Last 12 Months</SelectItem>
              <SelectItem value="18months">Last 18 Months</SelectItem>
              <SelectItem value="24months">Last 24 Months</SelectItem>
            </SelectContent>
          </Select>
          <Select value={sortField} onValueChange={(v) => {
            const newField = v as SortField
            if (sortField === newField) {
              setSortDirection(d => d === "asc" ? "desc" : "asc")
            } else {
              setSortField(newField)
              setSortDirection("desc")
            }
          }}>
            <SelectTrigger className="w-[160px]">
              <SelectValue placeholder="Sort by" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="total">Volume</SelectItem>
              {dateFilter !== "lastmonth" && (
                <SelectItem value="percentChange">Growth %</SelectItem>
              )}
            </SelectContent>
          </Select>
          <Button
            variant="outline"
            size="icon"
            onClick={() => setSortDirection(d => d === "asc" ? "desc" : "asc")}
            title={sortDirection === "desc" ? "Sorting: High to Low (Descending)" : "Sorting: Low to High (Ascending)"}
          >
            {sortDirection === "desc" ? <ArrowDown className="h-4 w-4" /> : <ArrowUp className="h-4 w-4" />}
          </Button>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={exportCSV}>
            <Download className="mr-2 h-4 w-4" />
            Export
          </Button>
        </div>
      </div>

      {/* Brand Cards View */}
      {(
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredBrands.map((brand) => (
            <Card 
              key={brand.brand_id} 
              className={`hover:border-primary/50 transition-colors ${
                selectedBrandIds.has(brand.brand_id) ? "border-primary/50 ring-2 ring-primary/20" : ""
              }`}
            >
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between">
                  <div className="flex-1 min-w-0">
                    <CardTitle className="text-base truncate">{brand.brand_name}</CardTitle>
                    <CardDescription className="text-xs">
                      {formatMonthShort(brand.firstMonth)} – {formatMonthShort(brand.lastMonth)}
                    </CardDescription>
                  </div>
                  <div className="flex items-center gap-2">
                    {(() => {
                      const badge = getTrendBadge(brand.trend)
                      return (
                        <Badge variant="outline" className={`gap-1 ${badge.className}`}>
                          <span className="text-[13px] leading-none">{badge.emoji}</span>
                          {badge.label}
                        </Badge>
                      )
                    })()}
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {/* Sparkline for last 12 months */}
                  <div className="h-14 w-full">
                    {(() => {
                      const badge = getTrendBadge(brand.trend)
                      return (
                        <ResponsiveContainer width="100%" height="100%">
                          <LineChart data={brand.lastTwelveMonths} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
                            <XAxis dataKey="label" hide />
                            <YAxis
                              hide
                              domain={[
                                0,
                                (dataMax: number) => (Number.isFinite(dataMax) ? Math.max(dataMax, 1) : 1),
                              ]}
                            />
                            <Tooltip
                              formatter={(value: number) => [value, "Creatives"]}
                              labelFormatter={(label) => `Month: ${label}`}
                              contentStyle={{
                                background: "var(--background)",
                                border: "1px solid var(--border)",
                                borderRadius: 10,
                              }}
                            />
                            <Line
                              type="monotone"
                              dataKey="count"
                              stroke={badge.lineColor}
                              strokeWidth={2}
                              dot={false}
                              strokeDasharray={badge.dash}
                            />
                          </LineChart>
                        </ResponsiveContainer>
                      )
                    })()}
                  </div>

                  {/* Month labels for the sparkline (show every 2nd month to avoid crowding) */}
                  <div className="flex items-center justify-between px-1 text-[9px] text-muted-foreground">
                    {brand.lastTwelveMonths.map((m, idx) => (
                      idx % 2 === 0 ? <span key={m.month}>{monthAbbrev(m.label)}</span> : <span key={m.month} className="opacity-0">{monthAbbrev(m.label)}</span>
                    ))}
                  </div>

                  <div className="flex items-center justify-between text-xs">
                    <div className="flex items-center gap-1">
                      <span className="text-muted-foreground">
                        Period Growth
                      </span>
                      <span 
                        className="text-muted-foreground cursor-help" 
                        title={`Calculated from consecutive month pairs. Growth rates between pair means are averaged over the selected period.`}
                      >
                        ℹ️
                      </span>
                    </div>
                    <span className={`font-bold text-lg ${
                      brand.trend === "up" ? "text-green-600 dark:text-green-400" :
                      brand.trend === "down" ? "text-red-600 dark:text-red-400" :
                      "text-muted-foreground"
                    }`}>
                      {brand.percentChangeLabel}
                    </span>
                  </div>

                  {brand.trend === "inactive" && (
                    <div className="text-[11px] text-muted-foreground">
                      Last active: <span className="text-foreground">{formatMonthShort(brand.lastActiveMonth)}</span>
                    </div>
                  )}

                  <div className="flex items-center justify-between pt-2 border-t">
                    <div>
                      <p className="text-2xl font-bold">{brand.total}</p>
                      <p className="text-xs text-muted-foreground">Total Volume</p>
                      {brand.avgPerMonth && brand.avgPerMonth > 0 && (
                        <p className="text-[10px] text-muted-foreground mt-0.5">
                          ~{brand.avgPerMonth}/month avg
                        </p>
                      )}
                    </div>
                    <div className="text-right">
                      <p className="text-2xl font-bold">{brand.recentCount}</p>
                      <p className="text-xs text-muted-foreground">Latest Month</p>
                      <p className="text-[10px] text-muted-foreground mt-0.5">
                        {formatMonthShort(brand.recentMonth)}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 pt-2">
                    <Button
                      variant={selectedBrandIds.has(brand.brand_id) ? "default" : "outline"}
                      size="sm"
                      className="flex-1"
                      onClick={() => {
                        const newSet = new Set(selectedBrandIds)
                        if (newSet.has(brand.brand_id)) {
                          newSet.delete(brand.brand_id)
                        } else {
                          if (newSet.size < 10) {
                            newSet.add(brand.brand_id)
                          }
                        }
                        setSelectedBrandIds(newSet)
                      }}
                      disabled={!selectedBrandIds.has(brand.brand_id) && selectedBrandIds.size >= 10}
                    >
                      {selectedBrandIds.has(brand.brand_id) ? (
                        <>
                          <Check className="h-3 w-3 mr-1" />
                          In Comparison
                        </>
                      ) : (
                        <>
                          <Plus className="h-3 w-3 mr-1" />
                          Add to Comparison
                        </>
                      )}
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Table View - Removed */}
      {false && (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>
                    <Button variant="ghost" size="sm" onClick={() => handleSort("brand_name")} className="-ml-3">
                      Brand Name
                      {sortField === "brand_name" && (sortDirection === "asc" ? <ArrowUp className="ml-1 h-3 w-3" /> : <ArrowDown className="ml-1 h-3 w-3" />)}
                    </Button>
                  </TableHead>
                  <TableHead className="text-center">
                    <div className="flex flex-col items-center gap-1 py-1">
                      <span>Monthly Activity (Last 12 Months)</span>
                      <div className="flex items-center justify-center gap-0.5 text-[9px] text-muted-foreground">
                        {globalMonths.lastTwelve.map((m) => (
                          <span key={m} className="w-3 text-center" title={formatMonthShort(m)}>
                            {monthAbbrev(formatMonthShort(m))}
                          </span>
                        ))}
                      </div>
                    </div>
                  </TableHead>
                  <TableHead className="text-right">
                    <Button variant="ghost" size="sm" onClick={() => handleSort("total")} className="-mr-3">
                      Total
                      {sortField === "total" && (sortDirection === "asc" ? <ArrowUp className="ml-1 h-3 w-3" /> : <ArrowDown className="ml-1 h-3 w-3" />)}
                    </Button>
                  </TableHead>
                  <TableHead className="text-center">
                    <span className="text-xs text-muted-foreground">Avg/Month</span>
                  </TableHead>
                  <TableHead className="text-center">
                    <span className="text-xs text-muted-foreground">Peak Month</span>
                  </TableHead>
                  <TableHead className="text-center">
                    <Button variant="ghost" size="sm" onClick={() => handleSort("trend")}>
                      Trend
                      {sortField === "trend" && (sortDirection === "asc" ? <ArrowUp className="ml-1 h-3 w-3" /> : <ArrowDown className="ml-1 h-3 w-3" />)}
                    </Button>
                  </TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredBrands.map((brand) => (
                  <TableRow key={brand.brand_id}>
                    <TableCell className="font-medium">{brand.brand_name}</TableCell>
                    <TableCell>
                      <div className="flex items-end gap-0.5 justify-center h-8 relative">
                        {(() => {
                          // Get last 12 months data for this brand
                          const lastTwelveData = globalMonths.lastTwelve.map(month => {
                            const monthData = brand.monthlyData.find(m => m.month === month)
                            return {
                              month,
                              count: monthData?.count || 0,
                              label: formatMonthShort(month)
                            }
                          })
                          const maxCount = Math.max(...lastTwelveData.map((d) => d.count), 1)
                          
                          return lastTwelveData.map((m) => {
                            const heightPct = maxCount > 0 ? (m.count / maxCount) * 100 : 0
                            const isZero = m.count === 0
                            return (
                              <div
                                key={m.month}
                                className={`w-3 rounded-sm cursor-pointer transition-all hover:opacity-80 hover:ring-2 hover:ring-primary/50 relative group ${isZero ? "bg-muted" : "bg-primary/70"}`}
                                style={{ height: isZero ? 2 : `${Math.max(8, heightPct)}%` }}
                              >
                                <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none bg-popover text-popover-foreground text-xs px-2 py-1 rounded shadow-lg border border-border whitespace-nowrap z-50">
                                  {m.label}: {m.count} creatives
                                </div>
                              </div>
                            )
                          })
                        })()}
                      </div>
                    </TableCell>
                    <TableCell className="text-right font-bold">{brand.total}</TableCell>
                    <TableCell className="text-center text-sm text-muted-foreground">
                      {brand.avgPerMonth ?? 0}
                    </TableCell>
                    <TableCell className="text-center text-sm text-muted-foreground">
                      {brand.peakMonth || "—"}
                    </TableCell>
                    <TableCell className="text-center">
                      {brand.trend === "up" && <TrendingUp className="h-4 w-4 text-green-600 mx-auto" />}
                      {brand.trend === "down" && <TrendingDown className="h-4 w-4 text-red-600 mx-auto" />}
                      {brand.trend === "inactive" && <span className="text-muted-foreground">😴</span>}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {filteredBrands.length === 0 && (
        <Card>
          <CardContent className="pt-6 text-center text-muted-foreground">
            {searchQuery ? "No brands match your search" : "No creative data yet. Add competitors to start tracking."}
          </CardContent>
        </Card>
      )}
    </div>
  )
}
