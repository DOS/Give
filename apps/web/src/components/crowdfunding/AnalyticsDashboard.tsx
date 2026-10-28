"use client"

import { useEffect, useState } from "react"
import { endOfDay, format, startOfDay, subDays } from "date-fns"
import {
  AlertCircle,
  ArrowDown,
  ArrowUp,
  Award,
  Calendar,
  DollarSign,
  Download,
  Minus,
  RefreshCw,
  Target,
  TrendingDown,
  TrendingUp,
  Users,
} from "lucide-react"
import {
  AreaChart,
  Area as AreaSeries,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  PolarAngleAxis,
  PolarGrid,
  PolarRadiusAxis,
  Radar,
  RadarChart,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"
import { toast } from "sonner"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Progress } from "@/components/ui/progress"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"

interface AnalyticsDashboardProps {
  projectId: string
  projectTitle: string
}

interface AnalyticsData {
  overview: {
    totalRaised: number
    totalBackers: number
    averageDonation: number
    conversionRate: number
    fundingProgress: number
    daysActive: number
    dailyAverage: number
    projectedTotal: number
  }
  trends: {
    donations: Array<{
      date: string
      amount: number
      count: number
      cumulative: number
    }>
    hourly: Array<{
      hour: number
      amount: number
      count: number
    }>
    weekly: Array<{
      day: string
      amount: number
      count: number
    }>
  }
  demographics: {
    donationSizes: Array<{
      range: string
      count: number
      total: number
      percentage: number
    }>
    geographic: Array<{
      country: string
      count: number
      amount: number
    }>
    devices: Array<{
      type: string
      count: number
      percentage: number
    }>
  }
  performance: {
    milestones: Array<{
      title: string
      target: number
      reached: boolean
      date?: string
      daysToReach?: number
    }>
    sources: Array<{
      source: string
      visits: number
      conversions: number
      amount: number
    }>
    topBackers: Array<{
      name: string
      amount: number
      date: string
    }>
  }
}

const CHART_COLORS = [
  "#8b5cf6",
  "#3b82f6",
  "#10b981",
  "#f59e0b",
  "#ef4444",
  "#ec4899",
]

export function AnalyticsDashboard({
  projectId,
  projectTitle,
}: AnalyticsDashboardProps) {
  const [data, setData] = useState<AnalyticsData | null>(null)
  const [loading, setLoading] = useState(true)
  const [timeRange, setTimeRange] = useState("7d")
  const [activeTab, setActiveTab] = useState("overview")
  const [refreshing, setRefreshing] = useState(false)

  // Fetch analytics data
  const fetchAnalytics = async () => {
    try {
      setRefreshing(true)
      const response = await fetch(
        `/api/projects/${projectId}/analytics?range=${timeRange}`
      )
      if (!response.ok) throw new Error("Failed to fetch analytics")

      const analyticsData = await response.json()
      setData(analyticsData)
    } catch (error) {
      console.error("Error fetching analytics:", error)
      toast.error("Failed to load analytics data")
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }

  useEffect(() => {
    fetchAnalytics()
  }, [projectId, timeRange])

  // Export data functions
  const exportToCSV = () => {
    if (!data) return

    // Convert data to CSV format
    const csvData = data.trends.donations.map((d) => ({
      Date: d.date,
      Amount: d.amount,
      "Number of Donations": d.count,
      "Cumulative Total": d.cumulative,
    }))

    const headers = Object.keys(csvData[0]).join(",")
    const rows = csvData.map((row) => Object.values(row).join(","))
    const csv = [headers, ...rows].join("\n")

    // Download CSV
    const blob = new Blob([csv], { type: "text/csv" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `${projectTitle.replace(/\s+/g, "-")}-analytics-${new Date().toISOString().split("T")[0]}.csv`
    a.click()

    toast.success("Analytics exported successfully")
  }

  const exportToPDF = async () => {
    // This would require a PDF library like jsPDF
    toast.info("PDF export coming soon!")
  }

  if (loading) {
    return (
      <div className="flex min-h-[600px] items-center justify-center">
        <RefreshCw className="text-muted-foreground h-8 w-8 animate-spin" />
      </div>
    )
  }

  if (!data) {
    return (
      <div className="flex min-h-[600px] flex-col items-center justify-center text-center">
        <AlertCircle className="text-muted-foreground mb-4 h-12 w-12" />
        <p className="text-lg font-medium">No analytics data available</p>
        <p className="text-muted-foreground text-sm">
          Data will appear once donations start coming in
        </p>
      </div>
    )
  }

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount)
  }

  const formatPercentage = (value: number) => {
    return `${(value * 100).toFixed(1)}%`
  }

  return (
    <div className="space-y-6">
      {/* Header Controls */}
      <div className="flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <h2 className="text-2xl font-bold">Analytics Dashboard</h2>
          <p className="text-muted-foreground">
            Detailed insights for {projectTitle}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Select value={timeRange} onValueChange={setTimeRange}>
            <SelectTrigger className="w-[140px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="24h">Last 24 hours</SelectItem>
              <SelectItem value="7d">Last 7 days</SelectItem>
              <SelectItem value="30d">Last 30 days</SelectItem>
              <SelectItem value="90d">Last 90 days</SelectItem>
              <SelectItem value="all">All time</SelectItem>
            </SelectContent>
          </Select>

          <Button
            variant="outline"
            size="icon"
            onClick={fetchAnalytics}
            disabled={refreshing}
          >
            <RefreshCw
              className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`}
            />
          </Button>

          <Button variant="outline" size="sm" onClick={exportToCSV}>
            <Download className="mr-2 h-4 w-4" />
            Export
          </Button>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="trends">Trends</TabsTrigger>
          <TabsTrigger value="demographics">Demographics</TabsTrigger>
          <TabsTrigger value="performance">Performance</TabsTrigger>
        </TabsList>

        {/* Overview Tab */}
        <TabsContent value="overview" className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">
                  Total Raised
                </CardTitle>
                <DollarSign className="text-muted-foreground h-4 w-4" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {formatCurrency(data.overview.totalRaised)}
                </div>
                <p className="text-muted-foreground text-xs">
                  {formatPercentage(data.overview.fundingProgress)} of goal
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">
                  Total Backers
                </CardTitle>
                <Users className="text-muted-foreground h-4 w-4" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {data.overview.totalBackers}
                </div>
                <p className="text-muted-foreground text-xs">
                  {formatPercentage(data.overview.conversionRate)} conversion
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">
                  Average Donation
                </CardTitle>
                <Target className="text-muted-foreground h-4 w-4" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {formatCurrency(data.overview.averageDonation)}
                </div>
                <p className="text-muted-foreground text-xs">Per backer</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">
                  Daily Average
                </CardTitle>
                <Calendar className="text-muted-foreground h-4 w-4" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {formatCurrency(data.overview.dailyAverage)}
                </div>
                <p className="text-muted-foreground text-xs">
                  Over {data.overview.daysActive} days
                </p>
              </CardContent>
            </Card>
          </div>

          {/* Projected Total */}
          <Card>
            <CardHeader>
              <CardTitle>Funding Projection</CardTitle>
              <CardDescription>Based on current trends</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">Current</span>
                  <span className="text-sm">
                    {formatCurrency(data.overview.totalRaised)}
                  </span>
                </div>
                <Progress
                  value={data.overview.fundingProgress * 100}
                  className="h-2"
                />
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">Projected</span>
                  <span className="text-sm font-bold">
                    {formatCurrency(data.overview.projectedTotal)}
                  </span>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Trends Tab */}
        <TabsContent value="trends" className="space-y-4">
          {/* Donation Timeline */}
          <Card>
            <CardHeader>
              <CardTitle>Donation Timeline</CardTitle>
              <CardDescription>
                Daily donations and cumulative total
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={300}>
                <ComposedChart data={data.trends.donations}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="date" />
                  <YAxis yAxisId="left" />
                  <YAxis yAxisId="right" orientation="right" />
                  <Tooltip />
                  <Legend />
                  <Bar
                    yAxisId="left"
                    dataKey="amount"
                    fill="#8b5cf6"
                    name="Daily Amount"
                  />
                  <Line
                    yAxisId="right"
                    type="monotone"
                    dataKey="cumulative"
                    stroke="#10b981"
                    name="Cumulative"
                    strokeWidth={2}
                  />
                </ComposedChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          <div className="grid gap-4 md:grid-cols-2">
            {/* Hourly Distribution */}
            <Card>
              <CardHeader>
                <CardTitle>Hourly Activity</CardTitle>
                <CardDescription>Best times for donations</CardDescription>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={200}>
                  <AreaChart data={data.trends.hourly}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="hour" />
                    <YAxis />
                    <Tooltip />
                    <AreaSeries
                      type="monotone"
                      dataKey="amount"
                      stroke="#3b82f6"
                      fill="#3b82f6"
                      fillOpacity={0.6}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            {/* Weekly Pattern */}
            <Card>
              <CardHeader>
                <CardTitle>Weekly Pattern</CardTitle>
                <CardDescription>Donations by day of week</CardDescription>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={data.trends.weekly}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="day" />
                    <YAxis />
                    <Tooltip />
                    <Bar dataKey="amount" fill="#f59e0b" />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Demographics Tab */}
        <TabsContent value="demographics" className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            {/* Donation Size Distribution */}
            <Card>
              <CardHeader>
                <CardTitle>Donation Sizes</CardTitle>
                <CardDescription>
                  Distribution of contribution amounts
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <PieChart>
                    <Pie
                      data={data.demographics.donationSizes}
                      cx="50%"
                      cy="50%"
                      labelLine={false}
                      label={({ range, percentage }) =>
                        `${range}: ${percentage}%`
                      }
                      outerRadius={80}
                      fill="#8884d8"
                      dataKey="count"
                    >
                      {data.demographics.donationSizes.map((entry, index) => (
                        <Cell
                          key={`cell-${index}`}
                          fill={CHART_COLORS[index % CHART_COLORS.length]}
                        />
                      ))}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            {/* Device Types */}
            <Card>
              <CardHeader>
                <CardTitle>Device Usage</CardTitle>
                <CardDescription>
                  How backers access your project
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {data.demographics.devices.map((device) => (
                    <div
                      key={device.type}
                      className="flex items-center justify-between"
                    >
                      <div className="flex items-center gap-2">
                        <div
                          className={`h-3 w-3 rounded-full bg-${device.type === "Desktop" ? "blue" : device.type === "Mobile" ? "green" : "orange"}-500`}
                        />
                        <span className="text-sm font-medium">
                          {device.type}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-muted-foreground text-sm">
                          {device.count} backers
                        </span>
                        <Badge variant="secondary">{device.percentage}%</Badge>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Geographic Distribution */}
          <Card>
            <CardHeader>
              <CardTitle>Geographic Distribution</CardTitle>
              <CardDescription>Where your backers are from</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {data.demographics.geographic.slice(0, 10).map((country) => (
                  <div
                    key={country.country}
                    className="flex items-center justify-between"
                  >
                    <span className="text-sm font-medium">
                      {country.country}
                    </span>
                    <div className="flex items-center gap-4">
                      <span className="text-muted-foreground text-sm">
                        {country.count} backers
                      </span>
                      <span className="text-sm font-medium">
                        {formatCurrency(country.amount)}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Performance Tab */}
        <TabsContent value="performance" className="space-y-4">
          {/* Milestones */}
          <Card>
            <CardHeader>
              <CardTitle>Milestone Performance</CardTitle>
              <CardDescription>Time to reach each milestone</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {data.performance.milestones.map((milestone, index) => (
                  <div
                    key={index}
                    className="flex items-center justify-between rounded-lg border p-3"
                  >
                    <div className="flex items-center gap-3">
                      {milestone.reached ? (
                        <Award className="h-5 w-5 text-green-500" />
                      ) : (
                        <Target className="text-muted-foreground h-5 w-5" />
                      )}
                      <div>
                        <p className="font-medium">{milestone.title}</p>
                        <p className="text-muted-foreground text-sm">
                          Target: {formatCurrency(milestone.target)}
                        </p>
                      </div>
                    </div>
                    <div className="text-right">
                      {milestone.reached ? (
                        <>
                          <Badge variant="success">Reached</Badge>
                          <p className="text-muted-foreground mt-1 text-xs">
                            {milestone.daysToReach} days
                          </p>
                        </>
                      ) : (
                        <Badge variant="secondary">Pending</Badge>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <div className="grid gap-4 md:grid-cols-2">
            {/* Traffic Sources */}
            <Card>
              <CardHeader>
                <CardTitle>Traffic Sources</CardTitle>
                <CardDescription>Where your backers come from</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {data.performance.sources.map((source) => (
                    <div key={source.source}>
                      <div className="mb-1 flex items-center justify-between">
                        <span className="text-sm font-medium">
                          {source.source}
                        </span>
                        <span className="text-muted-foreground text-sm">
                          {formatPercentage(source.conversions / source.visits)}
                        </span>
                      </div>
                      <Progress
                        value={
                          (source.amount / data.overview.totalRaised) * 100
                        }
                        className="h-2"
                      />
                      <div className="mt-1 flex justify-between">
                        <span className="text-muted-foreground text-xs">
                          {source.visits} visits
                        </span>
                        <span className="text-xs font-medium">
                          {formatCurrency(source.amount)}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* Top Backers */}
            <Card>
              <CardHeader>
                <CardTitle>Top Backers</CardTitle>
                <CardDescription>Your biggest supporters</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {data.performance.topBackers
                    .slice(0, 5)
                    .map((backer, index) => (
                      <div
                        key={index}
                        className="flex items-center justify-between"
                      >
                        <div className="flex items-center gap-2">
                          <div className="bg-muted flex h-8 w-8 items-center justify-center rounded-full text-sm font-medium">
                            {index + 1}
                          </div>
                          <div>
                            <p className="text-sm font-medium">{backer.name}</p>
                            <p className="text-muted-foreground text-xs">
                              {format(new Date(backer.date), "MMM d, yyyy")}
                            </p>
                          </div>
                        </div>
                        <span className="font-medium">
                          {formatCurrency(backer.amount)}
                        </span>
                      </div>
                    ))}
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  )
}
