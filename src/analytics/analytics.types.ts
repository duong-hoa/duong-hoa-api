// Mirrors the analytics types from src/lib/actions.ts.
export type RangeType = 'realtime' | 'today' | '7days' | '30days' | 'custom'

export type AnalyticsPayload = {
  errorMsg?: string | null
  rangeType: RangeType
  rangeLabel: string
  kpis: {
    totalVisits: number
    activeToday: number
    activeThisMonth: number
    newVisitors: number
    returningVisitors: number
    avgTimeSeconds: number
    totalPageViews: number
    bounceRate: number
    totalSearches: number
    totalQrScans: number
  }
  charts: {
    trafficTrend: Array<{ date: string; visits: number; users: number }>
    userGrowth: Array<{ date: string; totalUsers: number }>
    contentGrowth: Array<{ month: string; pages: number; blogs: number; locations: number }>
    countryShare: Array<{ country: string; count: number; percentage: number }>
    pageStats: Array<{ path: string; views: number; percentage: number }>
    qrStats: Array<{ path: string; scans: number; percentage: number }>
  }
}

export interface GA4DimensionValue {
  value?: string
}

export interface GA4MetricValue {
  value?: string
}

export interface GA4Row {
  dimensionValues?: GA4DimensionValue[] | null
  metricValues?: GA4MetricValue[] | null
}
