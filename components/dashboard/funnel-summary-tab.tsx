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
  RefreshCw,
  ExternalLink,
  Link2,
  Smartphone,
  FileQuestion,
  Globe,
  Info,
} from "lucide-react"
import {
  BarChart,
  Bar,
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

  if (error) throw error
  return data || []
}

export function FunnelSummaryTab() {
  const { data, error, isLoading, mutate } = useSWR("funnel-summary", fetcher)
  const [isRefreshing, setIsRefreshing] = useState(false)

  const handleRefresh = async () => {
    setIsRefreshing(true)
    await mutate()
    setIsRefreshing(false)
  }

  const [selectedBrands, setSelectedBrands] = useState<string[]>([])
  const [selectedTypes, setSelectedTypes] = useState<FunnelType[]>([])
  const [domainSearch, setDomainSearch] = useState("")
  const [startMonth, setStartMonth] = useState<string>("")
  const [startYear, setStartYear] = useState<string>("")
  const [endMonth, setEndMonth] = useState<string>("")
  const [endYear, setEndYear] = useState<string>("")
  const [showLastMonth, setShowLastMonth] = useState(false)
  const [sortField, setSortField] = useState<SortField>("creatives_count")
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc")
  const [expandedDomains, setExpandedDomains] = useState<Set<string>>(new Set())

  const months = [
    { value: "01", label: "January" },
    { value: "02", label: "February" },
    { value: "03", label: "March" },
    { value: "04", label: "April" },
    { value: "05", label: "May" },
    { value: "06", label: "June" },
    { value: "07", label: "July" },
    { value: "08", label: "August" },
    { value: "09", label: "September" },
    { value: "10", label: "October" },
    { value: "11", label: "November" },
    { value: "12", label: "December" },
  ]

  const availableYears = useMemo(() => {
    if (!data) return ["2024", "2025", "2026"]
    const years = new Set(data.map((d) => d.month.substring(0, 4)))
    return Array.from(years).sort()
  }, [data])

  const uniqueBrands = useMemo(() => {
    if (!data) return []
    return [...new Set(data.map((d) => d.brand_name))].sort()
  }, [data])

  const formatMonth = (month: string) => formatMonthShort(month)

  const isWithinLastMonth = (month: string) => {
    const lastMonth = new Date()
    lastMonth.setDate(lastMonth.getDate() - 30)
    return new Date(month) >= lastMonth
  }

  const filteredData = useMemo(() => {
    if (!data) return []

    const startKey = startYear && startMonth ? `${startYear}-${startMonth}` : null
    const endKey = endYear && endMonth ? `${endYear}-${endMonth}` : null

    return data.filter((item) => {
      if (selectedBrands.length > 0 && !selectedBrands.includes(item.brand_name)) {
        return false
      }
      if (selectedTypes.length > 0 && !selectedTypes.includes(item.funnel_type as FunnelType)) {
        return false
      }
      if (domainSearch && !item.funnel_domain.toLowerCase().includes(domainSearch.toLowerCase())) {
        return false
      }
      const itemKey = monthKeyFromDateStr(item.month)
      if (startKey && itemKey < startKey) return false
      if (endKey && itemKey > endKey) return false
      if (showLastMonth && !isWithinLastMonth(item.month)) return false
      return true
    })
  }, [data, selectedBrands, selectedTypes, domainSearch, startMonth, startYear, endMonth, endYear, showLastMonth])

  // Stats by funnel type
  const statsByType = useMemo(() => {
    const stats: Record<FunnelType, { count: number; creatives: number }> = {
      tracking_link: { count: 0, creatives: 0 },
      app_store: { count: 0, creatives: 0 },
      quiz_funnel: { count: 0, creatives: 0 },
      landing_page: { count: 0, creatives: 0 },
      unknown: { count: 0, creatives: 0 },
    }
    filteredData.forEach((item) => {
      const type = (item.funnel_type || "landing_page") as FunnelType
      stats[type].count++
      stats[type].creatives += item.creatives_count
    })
    return stats
  }, [filteredData])

  const pieChartData = useMemo(() => {
    return Object.entries(statsByType)
      .filter(([, stats]) => stats.creatives > 0)
      .map(([type, stats]) => ({
        name: FUNNEL_TYPE_CONFIG[type as FunnelType].label,
        value: stats.creatives,
        color: FUNNEL_TYPE_CONFIG[type as FunnelType].color,
      }))
  }, [statsByType])

  const groupedByDomain = useMemo(() => {
    const groups: Record<string, BrandFunnelSummary[]> = {}
    filteredData.forEach((item) => {
      if (!groups[item.funnel_domain]) groups[item.funnel_domain] = []
      groups[item.funnel_domain].push(item)
    })

    Object.values(groups).forEach((items) => {
      items.sort((a, b) => {
        let comparison = 0
        if (sortField === "creatives_count") {
          comparison = a.creatives_count - b.creatives_count
        } else {
          comparison = a.month.localeCompare(b.month)
        }
        return sortDirection === "asc" ? comparison : -comparison
      })
    })

    const sortedEntries = Object.entries(groups).sort((a, b) => {
      const totalA = a[1].reduce((sum, item) => sum + item.creatives_count, 0)
      const totalB = b[1].reduce((sum, item) => sum + item.creatives_count, 0)
      return totalB - totalA
    })

    return sortedEntries
  }, [filteredData, sortField, sortDirection])

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
    setStartMonth("")
    setStartYear("")
    setEndMonth("")
    setEndYear("")
    setSelectedBrands([])
    setSelectedTypes([])
    setDomainSearch("")
    setShowLastMonth(false)
  }

  const topFunnelsData = useMemo(() => {
    const totals: Record<string, number> = {}
    filteredData.forEach((item) => {
      totals[item.funnel_domain] = (totals[item.funnel_domain] || 0) + item.creatives_count
    })
    return Object.entries(totals)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([name, count]) => ({ name, count }))
  }, [filteredData])

  const exportCSV = () => {
    const headers = ["Brand Name", "Domain", "Path", "Full URL", "Type", "Month", "Creatives Count", "Ads Library URL"]
    const rows = filteredData.map((item) => [
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

  const toggleBrand = (brand: string) => {
    setSelectedBrands((prev) =>
      prev.includes(brand) ? prev.filter((b) => b !== brand) : [...prev, brand]
    )
  }

  const toggleType = (type: FunnelType) => {
    setSelectedTypes((prev) =>
      prev.includes(type) ? prev.filter((t) => t !== type) : [...prev, type]
    )
  }

  const getFunnelTypeBadge = (type: string | null) => {
    const funnelType = (type || "landing_page") as FunnelType
    const config = FUNNEL_TYPE_CONFIG[funnelType]
    return (
      <Badge
        style={{ backgroundColor: config.color }}
        className="text-white text-xs gap-1"
      >
        {config.icon}
        {config.label}
      </Badge>
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
      

      {/* Stats Cards by Type */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        {Object.entries(FUNNEL_TYPE_CONFIG).map(([type, config]) => {
          const stats = statsByType[type as FunnelType]
          return (
            <Card
              key={type}
              className={`overflow-hidden bg-card border-border/60 cursor-pointer transition-all ${
                selectedTypes.includes(type as FunnelType) ? "ring-2 ring-primary" : ""
              }`}
              style={{
                backgroundImage: `radial-gradient(600px circle at 0% 0%, ${hexToRgba(config.color, 0.22)}, transparent 55%)`,
              }}
              onClick={() => toggleType(type as FunnelType)}
            >
              <CardContent className="pt-4">
                <div className="flex items-center gap-2 mb-1">
                  <div style={{ color: config.color }}>{config.icon}</div>
                  <span className="text-sm font-medium">{config.label}</span>
                </div>
                <div className="text-2xl font-bold">{stats.creatives.toLocaleString()}</div>
                <div className="text-xs text-muted-foreground">{stats.count} unique URLs</div>
              </CardContent>
            </Card>
          )
        })}
      </div>

      {/* Filters */}
      <Card className="bg-card border-border">
        <CardHeader>
          <CardTitle className="text-lg">Filters</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-6 gap-4">
            <div className="space-y-2">
              <Label>Search Domain</Label>
              <Input
                placeholder="e.g. adjust.com"
                value={domainSearch}
                onChange={(e) => setDomainSearch(e.target.value)}
                className="bg-muted border-border"
              />
            </div>
            <div className="space-y-2">
              <Label>Start Month</Label>
              <Select value={startMonth} onValueChange={setStartMonth}>
                <SelectTrigger className="bg-muted border-border">
                  <SelectValue placeholder="Month" />
                </SelectTrigger>
                <SelectContent>
                  {months.map((m) => (
                    <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Start Year</Label>
              <Select value={startYear} onValueChange={setStartYear}>
                <SelectTrigger className="bg-muted border-border">
                  <SelectValue placeholder="Year" />
                </SelectTrigger>
                <SelectContent>
                  {availableYears.map((y) => (
                    <SelectItem key={y} value={y}>{y}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>End Month</Label>
              <Select value={endMonth} onValueChange={setEndMonth}>
                <SelectTrigger className="bg-muted border-border">
                  <SelectValue placeholder="Month" />
                </SelectTrigger>
                <SelectContent>
                  {months.map((m) => (
                    <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>End Year</Label>
              <Select value={endYear} onValueChange={setEndYear}>
                <SelectTrigger className="bg-muted border-border">
                  <SelectValue placeholder="Year" />
                </SelectTrigger>
                <SelectContent>
                  {availableYears.map((y) => (
                    <SelectItem key={y} value={y}>{y}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>&nbsp;</Label>
              <Button variant="outline" onClick={clearFilters} className="w-full bg-transparent">
                Clear Filters
              </Button>
            </div>
          </div>

          <div className="flex items-center space-x-4">
            <div className="flex items-center space-x-2">
              <Switch checked={showLastMonth} onCheckedChange={setShowLastMonth} />
              <span className="text-sm text-muted-foreground">Within last month only</span>
            </div>
          </div>

          <div className="space-y-2">
            <Label>Filter by Brands</Label>
            <div className="flex flex-wrap gap-2 max-h-32 overflow-y-auto p-2 bg-muted rounded-md">
              {uniqueBrands.map((brand) => (
                <Badge
                  key={brand}
                  variant={selectedBrands.includes(brand) ? "default" : "outline"}
                  className="cursor-pointer hover:bg-primary/80"
                  onClick={() => toggleBrand(brand)}
                >
                  {brand}
                </Badge>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Charts Row */}
      <div className="grid md:grid-cols-2 gap-6">
        {/* Bar Chart */}
        <Card className="overflow-hidden border-border/60 bg-gradient-to-br from-sky-500/12 via-card to-card">
          <CardHeader>
            <CardTitle className="text-lg">Top Domains by Ad Count</CardTitle>
            <CardDescription>Which domains receive the most ad traffic</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={topFunnelsData} layout="vertical">
                <CartesianGrid strokeDasharray="4 8" stroke="var(--border)" opacity={0.25} />
                <XAxis type="number" stroke="var(--muted-foreground)" fontSize={12} />
                <YAxis dataKey="name" type="category" width={120} stroke="var(--muted-foreground)" fontSize={11} />
                <Tooltip
                  contentStyle={{ background: "var(--background)", border: "1px solid var(--border)", borderRadius: "10px" }}
                />
                <Bar dataKey="count" fill="var(--chart-2)" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Pie Chart */}
        <Card className="overflow-hidden border-border/60 bg-gradient-to-br from-violet-500/12 via-card to-card">
          <CardHeader>
            <CardTitle className="text-lg">Traffic by Funnel Type</CardTitle>
            <CardDescription>Distribution of ad destinations</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie
                  data={pieChartData}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={100}
                  paddingAngle={2}
                  dataKey="value"
                  label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                  labelLine={false}
                >
                  {pieChartData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{ background: "var(--background)", border: "1px solid var(--border)", borderRadius: "10px" }}
                />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* Table */}
      <Card className="bg-card border-border">
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle className="text-lg">Funnel Details</CardTitle>
            <CardDescription>Grouped by domain - click to expand</CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <Button onClick={handleRefresh} variant="outline" size="sm" disabled={isRefreshing}>
              <RefreshCw className={`mr-2 h-4 w-4 ${isRefreshing ? "animate-spin" : ""}`} />
              Refresh
            </Button>
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
                  <TableHead>Type</TableHead>
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
                    const primaryType = items[0]?.funnel_type || "landing_page"
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
                          <TableCell>{getFunnelTypeBadge(primaryType)}</TableCell>
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
                            <TableCell>{getFunnelTypeBadge(item.funnel_type)}</TableCell>
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
            Showing {groupedByDomain.length} domains with {filteredData.length} total records
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
