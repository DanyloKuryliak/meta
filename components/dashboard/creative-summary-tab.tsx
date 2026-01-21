"use client"

import { useState, useMemo } from "react"
import useSWR from "swr"
import { getSupabaseClient, type BrandCreativeSummary } from "@/lib/supabase"
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
  RefreshCw,
  ExternalLink,
  TrendingUp,
  TrendingDown,
  Search,
  LayoutGrid,
  List,
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
} from "recharts"

type SortField = "brand_name" | "total" | "recent" | "trend"
type SortDirection = "asc" | "desc"
type ViewMode = "cards" | "table"
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
  ads_library_url: string | null
  total: number
  recentCount: number
  previousCount: number
  recentMonth: string
  previousMonth: string
  percentChangeLabel: string
  lastActiveMonth: string
  monthlyData: { month: string; count: number }[]
  lastSixMonths: { month: string; count: number; label: string }[]
  trend: Trend
  monthsTracked: number
  activeMonths: number
  firstMonth: string
  lastMonth: string
}

const fetcher = async (): Promise<BrandCreativeSummary[]> => {
  const supabase = getSupabaseClient()
  const { data, error } = await supabase
    .from("brand_creative_summary")
    .select("*")
    .not("brand_id", "is", null)
    .not("brand_name", "is", null)
    .not("ads_library_url", "is", null)
    .not("month", "is", null)
    .not("creatives_count", "is", null)
    .order("month", { ascending: false })

  if (error) throw error
  return data || []
}

export function CreativeSummaryTab() {
  const { data, error, isLoading, mutate } = useSWR("creative-summary", fetcher)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [searchQuery, setSearchQuery] = useState("")
  const [sortField, setSortField] = useState<SortField>("total")
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc")
  const [viewMode, setViewMode] = useState<ViewMode>("cards")

  const handleRefresh = async () => {
    setIsRefreshing(true)
    await mutate()
    setIsRefreshing(false)
  }

  const globalMonths = useMemo(() => {
    const monthsInData = [...new Set((data || []).map((d) => d.month))].sort()
    const endMonth = monthsInData.at(-1) || monthStartUTC(new Date())
    const lastSix = buildLastNMonths(endMonth, 6)
    const recent = lastSix.at(-1) || endMonth
    const previous = lastSix.at(-2) || recent
    const canCompare = monthsInData.includes(previous)
    return { endMonth, monthsInData, recent, previous, lastSix, canCompare }
  }, [data])

  // Process data into brand summaries
  const brandData = useMemo(() => {
    if (!data || data.length === 0) return []

    const recentMonth = globalMonths.recent
    const previousMonth = globalMonths.previous
    const lastSixMonths = globalMonths.lastSix

    const brandMap: Record<string, BrandData> = {}

    for (const row of data) {
      const id = row.brand_id
      const name = row.brand_name
      if (!brandMap[id]) {
        const initMonth = row.month
        brandMap[id] = {
          brand_id: id,
          brand_name: name,
          ads_library_url: row.ads_library_url,
          total: 0,
          recentCount: 0,
          previousCount: 0,
          recentMonth,
          previousMonth,
          percentChangeLabel: "—",
          lastActiveMonth: initMonth,
          monthlyData: [],
          lastSixMonths: [],
          trend: "inactive",
          monthsTracked: 0,
          activeMonths: 0,
          firstMonth: initMonth,
          lastMonth: initMonth,
        }
      }
      // Prefer the most recent name/url if they change over time
      if (row.month === recentMonth) {
        brandMap[id].brand_name = name
        brandMap[id].ads_library_url = row.ads_library_url
      }

      brandMap[id].total += row.creatives_count
      brandMap[id].monthlyData.push({ month: row.month, count: row.creatives_count })
      
      if (row.month < brandMap[id].firstMonth) brandMap[id].firstMonth = row.month
      if (row.month > brandMap[id].lastMonth) brandMap[id].lastMonth = row.month
    }

    // Calculate trends and recent counts (use global latest/previous months so "no activity" is visible)
    for (const brand of Object.values(brandMap)) {
      const monthToCount: Record<string, number> = {}
      for (const m of brand.monthlyData) {
        monthToCount[m.month] = (monthToCount[m.month] || 0) + m.count
      }

      const monthsTracked = Object.keys(monthToCount).length
      const activeMonths = Object.values(monthToCount).filter((c) => c > 0).length

      const recentCount = monthToCount[recentMonth] || 0
      const previousCount = monthToCount[previousMonth] || 0

      brand.monthlyData = Object.entries(monthToCount)
        .map(([month, count]) => ({ month, count }))
        .sort((a, b) => a.month.localeCompare(b.month))

      brand.monthsTracked = monthsTracked
      brand.activeMonths = activeMonths
      brand.recentCount = recentCount
      brand.previousCount = previousCount

      const lastSix = lastSixMonths.map((m) => ({
        month: m,
        count: monthToCount[m] || 0,
        label: formatMonthShort(m),
      }))

      const trendEval = getTrendFromRecentPrevious({
        recentCount,
        previousCount,
        canCompare: globalMonths.canCompare,
      })
      brand.trend = trendEval.trend
      brand.percentChangeLabel = trendEval.pctLabel

      // Always show real last-6-months shape. For inactivity we rely on styling + recentCount == 0.
      brand.lastSixMonths = lastSix

      // Last active month (overall)
      const lastActive = [...brand.monthlyData].reverse().find((m) => m.count > 0)?.month
      brand.lastActiveMonth = lastActive || brand.lastMonth
    }

    return Object.values(brandMap)
  }, [data, globalMonths])

  // Filter and sort
  const filteredBrands = useMemo(() => {
    let result = brandData

    if (searchQuery) {
      const q = searchQuery.toLowerCase()
      result = result.filter(b => b.brand_name.toLowerCase().includes(q))
    }

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
          const trendOrder = { up: 2, down: 1, inactive: 0 }
          cmp = trendOrder[a.trend] - trendOrder[b.trend]
          break
      }
      return sortDirection === "desc" ? -cmp : cmp
    })

    return result
  }, [brandData, searchQuery, sortField, sortDirection])

  // Summary stats
  const stats = useMemo(() => {
    const totalBrands = brandData.length
    const totalCreatives = brandData.reduce((sum, b) => sum + b.total, 0)
    const growingBrands = brandData.filter(b => b.trend === "up").length
    const allMonths = new Set(data?.map(d => d.month) || [])
    return { totalBrands, totalCreatives, growingBrands, totalMonths: allMonths.size }
  }, [brandData, data])

  // Chart data - always Top 5 by total volume (not affected by search/sort)
  const chartData = useMemo(() => {
    const sorted = [...brandData].sort((a, b) => b.total - a.total)
    return sorted.slice(0, 5).map((b) => ({
      name: b.brand_name.length > 22 ? b.brand_name.substring(0, 22) + "…" : b.brand_name,
      fullName: b.brand_name,
      total: b.total,
      recent: b.recentCount,
    }))
  }, [brandData])

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection(d => (d === "asc" ? "desc" : "asc"))
    } else {
      setSortField(field)
      setSortDirection("desc")
    }
  }

  const exportCSV = () => {
    if (!data) return
    const headers = ["Brand Name", "Month", "Creatives Count", "Ads Library URL"]
    const rows = data.map(d => [d.brand_name, d.month, d.creatives_count, d.ads_library_url || ""])
    const csv = [headers, ...rows].map(r => r.join(",")).join("\n")
    const blob = new Blob([csv], { type: "text/csv" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `creative-summary-${new Date().toISOString().split("T")[0]}.csv`
    a.click()
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
          <Button onClick={handleRefresh} variant="outline" className="mt-4 bg-transparent">
            <RefreshCw className="mr-2 h-4 w-4" /> Retry
          </Button>
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
          </CardContent>
        </Card>
        <Card className="overflow-hidden bg-gradient-to-br from-violet-500/10 via-card to-card">
          <CardContent className="pt-4">
            <p className="text-sm text-muted-foreground flex items-center gap-2">
              <span className="text-base leading-none">🎨</span>
              Total Creatives
            </p>
            <p className="text-2xl font-bold">{stats.totalCreatives.toLocaleString()}</p>
          </CardContent>
        </Card>
        <Card className="overflow-hidden bg-gradient-to-br from-emerald-500/10 via-card to-card">
          <CardContent className="pt-4">
            <p className="text-sm text-muted-foreground flex items-center gap-2">
              <span className="text-base leading-none">🚀</span>
              Growing Brands
            </p>
            <p className="text-2xl font-bold text-green-600">{stats.growingBrands}</p>
          </CardContent>
        </Card>
        <Card className="overflow-hidden bg-gradient-to-br from-amber-500/10 via-card to-card">
          <CardContent className="pt-4">
            <p className="text-sm text-muted-foreground flex items-center gap-2">
              <span className="text-base leading-none">🗓️</span>
              Months Tracked
            </p>
            <p className="text-2xl font-bold">{stats.totalMonths}</p>
          </CardContent>
        </Card>
      </div>

      {/* Chart */}
      {chartData.length > 0 && (
        <Card className="overflow-hidden border-border/60 bg-gradient-to-br from-indigo-500/12 via-card to-card">
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <span className="text-base leading-none">🏆</span>
              Top 5 Brands by Creative Volume
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[250px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} layout="vertical" margin={{ left: 120, right: 20 }}>
                  <CartesianGrid strokeDasharray="4 8" horizontal={true} vertical={false} opacity={0.25} />
                  <XAxis type="number" tick={{ fontSize: 12 }} axisLine={false} tickLine={false} />
                  <YAxis type="category" dataKey="name" width={115} tick={{ fontSize: 12 }} />
                  <Tooltip 
                    formatter={(value: number) => [value, "Total Creatives"]}
                    labelFormatter={(_, payload) => (payload?.[0] as any)?.payload?.fullName ?? _}
                    contentStyle={{ background: "var(--background)", border: "1px solid var(--border)", borderRadius: 10 }}
                  />
                  <Bar dataKey="total" radius={[0, 6, 6, 0]}>
                    {chartData.map((_, index) => (
                      <Cell
                        key={index}
                        fill="var(--chart-2)"
                        fillOpacity={index === 0 ? 0.95 : Math.max(0.35, 0.75 - index * 0.1)}
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Controls */}
      <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
        <div className="flex items-center gap-2 w-full sm:w-auto">
          <div className="relative flex-1 sm:w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search brands..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9"
            />
          </div>
          <Select value={sortField} onValueChange={(v) => setSortField(v as SortField)}>
            <SelectTrigger className="w-[140px]">
              <SelectValue placeholder="Sort by" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="total">Total Volume</SelectItem>
              <SelectItem value="recent">Recent Activity</SelectItem>
              <SelectItem value="trend">Trend</SelectItem>
              <SelectItem value="brand_name">Name</SelectItem>
            </SelectContent>
          </Select>
          <Button
            variant="outline"
            size="icon"
            onClick={() => setSortDirection(d => d === "asc" ? "desc" : "asc")}
          >
            {sortDirection === "desc" ? <ArrowDown className="h-4 w-4" /> : <ArrowUp className="h-4 w-4" />}
          </Button>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex border rounded-md">
            <Button
              variant={viewMode === "cards" ? "secondary" : "ghost"}
              size="sm"
              onClick={() => setViewMode("cards")}
              className="rounded-r-none"
            >
              <LayoutGrid className="h-4 w-4" />
            </Button>
            <Button
              variant={viewMode === "table" ? "secondary" : "ghost"}
              size="sm"
              onClick={() => setViewMode("table")}
              className="rounded-l-none"
            >
              <List className="h-4 w-4" />
            </Button>
          </div>
          <Button variant="outline" size="sm" onClick={handleRefresh} disabled={isRefreshing}>
            <RefreshCw className={`mr-2 h-4 w-4 ${isRefreshing ? "animate-spin" : ""}`} />
            Refresh
          </Button>
          <Button variant="outline" size="sm" onClick={exportCSV}>
            <Download className="mr-2 h-4 w-4" />
            Export
          </Button>
        </div>
      </div>

      {/* Brand Cards View */}
      {viewMode === "cards" && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredBrands.map((brand) => (
            <Card key={brand.brand_id} className="hover:border-primary/50 transition-colors">
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between">
                  <div className="flex-1 min-w-0">
                    <CardTitle className="text-base truncate">{brand.brand_name}</CardTitle>
                    <CardDescription className="text-xs">
                      {brand.monthsTracked} month{brand.monthsTracked !== 1 ? "s" : ""} tracked ·{" "}
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
                  {/* Sparkline for last 6 months */}
                  <div className="h-14 w-full">
                    {(() => {
                      const badge = getTrendBadge(brand.trend)
                      return (
                        <ResponsiveContainer width="100%" height="100%">
                          <LineChart data={brand.lastSixMonths} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
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

                  {/* Month labels for the sparkline */}
                  <div className="flex items-center justify-between px-1 text-[10px] text-muted-foreground">
                    {brand.lastSixMonths.map((m) => (
                      <span key={m.month}>{monthAbbrev(m.label)}</span>
                    ))}
                  </div>

                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span>
                      {formatMonthShort(brand.previousMonth)} → {formatMonthShort(brand.recentMonth)}
                    </span>
                    <span className="font-medium text-foreground">{brand.percentChangeLabel}</span>
                  </div>

                  {brand.trend === "inactive" && (
                    <div className="text-[11px] text-muted-foreground">
                      Last active: <span className="text-foreground">{formatMonthShort(brand.lastActiveMonth)}</span>
                    </div>
                  )}

                  <div className="flex items-center justify-between pt-2 border-t">
                    <div>
                      <p className="text-2xl font-bold">{brand.total}</p>
                      <p className="text-xs text-muted-foreground">Total Creatives</p>
                    </div>
                    <div className="text-right">
                      <p className="text-lg font-semibold">{brand.recentCount}</p>
                      <p className="text-xs text-muted-foreground">Latest ({formatMonthShort(brand.recentMonth)})</p>
                    </div>
                  </div>

                  {brand.ads_library_url && (
                    <a
                      href={brand.ads_library_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center justify-center gap-2 text-sm text-primary hover:underline pt-2"
                    >
                      <ExternalLink className="h-3 w-3" />
                      View in Meta Ads Library
                    </a>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Table View */}
      {viewMode === "table" && (
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
                      <span>Monthly Activity</span>
                      <div className="flex items-center justify-center gap-1 text-[10px] text-muted-foreground">
                        {globalMonths.lastSix.map((m) => (
                          <span key={m} className="w-4 text-center">
                            {monthAbbrev(formatMonthShort(m))}
                          </span>
                        ))}
                      </div>
                    </div>
                  </TableHead>
                  <TableHead className="text-right">
                    <Button variant="ghost" size="sm" onClick={() => handleSort("recent")} className="-mr-3">
                      Recent
                      {sortField === "recent" && (sortDirection === "asc" ? <ArrowUp className="ml-1 h-3 w-3" /> : <ArrowDown className="ml-1 h-3 w-3" />)}
                    </Button>
                  </TableHead>
                  <TableHead className="text-right">
                    <Button variant="ghost" size="sm" onClick={() => handleSort("total")} className="-mr-3">
                      Total
                      {sortField === "total" && (sortDirection === "asc" ? <ArrowUp className="ml-1 h-3 w-3" /> : <ArrowDown className="ml-1 h-3 w-3" />)}
                    </Button>
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
                      <div className="flex items-end gap-1 justify-center h-8">
                        {brand.lastSixMonths.map((m) => {
                          const maxCount = Math.max(...brand.lastSixMonths.map((d) => d.count))
                          const heightPct = maxCount > 0 ? (m.count / maxCount) * 100 : 0
                          const isZero = m.count === 0
                          return (
                            <div
                              key={m.month}
                              title={`${m.label}: ${m.count}`}
                              className={`w-4 rounded-sm ${isZero ? "bg-muted" : "bg-primary/70"}`}
                              style={{ height: isZero ? 3 : `${Math.max(10, heightPct)}%` }}
                            />
                          )
                        })}
                      </div>
                    </TableCell>
                    <TableCell className="text-right font-medium">{brand.recentCount}</TableCell>
                    <TableCell className="text-right font-bold">{brand.total}</TableCell>
                    <TableCell className="text-center">
                      {brand.trend === "up" && <TrendingUp className="h-4 w-4 text-green-600 mx-auto" />}
                      {brand.trend === "down" && <TrendingDown className="h-4 w-4 text-red-600 mx-auto" />}
                      {brand.trend === "inactive" && <span className="text-muted-foreground">😴</span>}
                    </TableCell>
                    <TableCell>
                      {brand.ads_library_url && (
                        <a href={brand.ads_library_url} target="_blank" rel="noopener noreferrer">
                          <Button variant="ghost" size="sm">
                            <ExternalLink className="h-4 w-4" />
                          </Button>
                        </a>
                      )}
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
