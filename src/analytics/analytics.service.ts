import { Injectable } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import * as crypto from 'crypto'
import { PrismaService } from '../prisma/prisma.service'
import type { AnalyticsPayload, GA4Row, RangeType } from './analytics.types'

// Direct port of getAnalyticsData (and its GA4 service-account JWT helpers)
// from src/lib/actions.ts, plus getContentCreatedAtStats from
// src/lib/repos/analytics.ts. Behavior, fallback shapes, and computed fields
// are kept identical — only the DB access (Prisma instead of raw `pg`) and
// env access (ConfigService instead of process.env directly) changed.
@Injectable()
export class AnalyticsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  private async getContentCreatedAtStats() {
    const [pages, posts, mapLocations] = await Promise.all([
      this.prisma.page.findMany({ select: { createdAt: true } }),
      this.prisma.post.findMany({ select: { createdAt: true } }),
      this.prisma.mapLocation.findMany({ select: { createdAt: true } }),
    ])

    return {
      pages: pages.map((p) => ({ created_at: p.createdAt?.toISOString() ?? null })),
      posts: posts.map((p) => ({ created_at: p.createdAt?.toISOString() ?? null })),
      mapLocations: mapLocations.map((p) => ({ created_at: p.createdAt?.toISOString() ?? null })),
    }
  }

  private generateJWT(clientEmail: string, privateKey: string): string {
    const formattedKey = privateKey.replace(/\\n/g, '\n')

    const header = { alg: 'RS256', typ: 'JWT' }
    const now = Math.floor(Date.now() / 1000)
    const claim = {
      iss: clientEmail,
      scope: 'https://www.googleapis.com/auth/analytics.readonly',
      aud: 'https://oauth2.googleapis.com/token',
      exp: now + 3600,
      iat: now,
    }

    const base64Header = Buffer.from(JSON.stringify(header)).toString('base64url')
    const base64Claim = Buffer.from(JSON.stringify(claim)).toString('base64url')

    const signatureInput = `${base64Header}.${base64Claim}`
    const signer = crypto.createSign('RSA-SHA256')
    signer.update(signatureInput)
    const signature = signer.sign(formattedKey, 'base64url')

    return `${signatureInput}.${signature}`
  }

  private async getAccessToken(clientEmail: string, privateKey: string): Promise<string> {
    const jwt = this.generateJWT(clientEmail, privateKey)
    const res = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
        assertion: jwt,
      }),
    })

    if (!res.ok) {
      const errText = await res.text()
      throw new Error(`Failed to get Google access token: ${errText}`)
    }

    const data = await res.json()
    return data.access_token as string
  }

  private async runGA4Report(accessToken: string, propertyId: string, payload: unknown) {
    const res = await fetch(
      `https://analyticsdata.googleapis.com/v1beta/properties/${propertyId}:runRealtimeReport`,
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      },
    )

    if (!res.ok) {
      const errText = await res.text()
      throw new Error(`GA4 API error: ${errText}`)
    }

    return res.json()
  }

  private async runGA4StandardReport(accessToken: string, propertyId: string, payload: unknown) {
    const res = await fetch(`https://analyticsdata.googleapis.com/v1beta/properties/${propertyId}:runReport`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })

    if (!res.ok) {
      const errText = await res.text()
      throw new Error(`GA4 API error: ${errText}`)
    }

    return res.json()
  }

  async getAnalyticsData(
    rangeType: RangeType = 'realtime',
    customStartDate?: string,
    customEndDate?: string,
  ): Promise<AnalyticsPayload> {
    const contentStats = await this.getContentCreatedAtStats()

    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
    const contentGrowthMap: Record<string, { pages: number; blogs: number; locations: number }> = {}

    const now = new Date()
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
      const key = `${monthNames[d.getMonth()]} ${d.getFullYear()}`
      contentGrowthMap[key] = { pages: 0, blogs: 0, locations: 0 }
    }

    const addContentToTimeline = (createdAtStr: string | null, type: 'pages' | 'blogs' | 'locations') => {
      if (!createdAtStr) return
      const date = new Date(createdAtStr)
      Object.keys(contentGrowthMap).forEach((monthKey) => {
        const [mName, yStr] = monthKey.split(' ')
        const mIdx = monthNames.indexOf(mName)
        const yVal = parseInt(yStr, 10)
        const keyDate = new Date(yVal, mIdx, 1)
        if (date <= new Date(keyDate.getFullYear(), keyDate.getMonth() + 1, 0)) {
          contentGrowthMap[monthKey][type]++
        }
      })
    }

    contentStats.pages.forEach((p) => addContentToTimeline(p.created_at, 'pages'))
    contentStats.posts.forEach((b) => addContentToTimeline(b.created_at, 'blogs'))
    contentStats.mapLocations.forEach((l) => addContentToTimeline(l.created_at, 'locations'))

    const contentGrowth = Object.entries(contentGrowthMap).map(([month, stats]) => ({ month, ...stats }))

    const propertyId = this.config.get<string>('GA_PROPERTY_ID')
    const clientEmail = this.config.get<string>('GOOGLE_CLIENT_EMAIL')
    const privateKey = this.config.get<string>('GOOGLE_PRIVATE_KEY')?.replace(/\\n/g, '\n')

    const fallbackResult = (errorMsg: string): AnalyticsPayload => ({
      errorMsg,
      rangeType,
      rangeLabel: '',
      kpis: {
        totalVisits: 0,
        activeToday: 0,
        activeThisMonth: 0,
        newVisitors: 0,
        returningVisitors: 0,
        avgTimeSeconds: 0,
        totalPageViews: 0,
        bounceRate: 0,
        totalSearches: 0,
        totalQrScans: 0,
      },
      charts: { trafficTrend: [], userGrowth: [], contentGrowth, countryShare: [], pageStats: [], qrStats: [] },
    })

    if (!propertyId || !clientEmail || !privateKey) {
      return fallbackResult(
        'Thiếu cấu hình Google Analytics 4 (GA_PROPERTY_ID, GOOGLE_CLIENT_EMAIL, GOOGLE_PRIVATE_KEY) trong file .env.',
      )
    }

    try {
      const accessToken = await this.getAccessToken(clientEmail, privateKey)

      if (rangeType === 'realtime') {
        const kpisReportPromise = this.runGA4Report(accessToken, propertyId, {
          metrics: [{ name: 'activeUsers' }, { name: 'screenPageViews' }, { name: 'eventCount' }],
        })
        const customEventsPromise = this.runGA4Report(accessToken, propertyId, {
          dimensions: [{ name: 'eventName' }],
          metrics: [{ name: 'eventCount' }],
        })
        const trendReportPromise = this.runGA4Report(accessToken, propertyId, {
          dimensions: [{ name: 'minutesAgo' }],
          metrics: [{ name: 'activeUsers' }, { name: 'eventCount' }],
          orderBys: [{ dimension: { dimensionName: 'minutesAgo' }, desc: true }],
        })
        const countryReportPromise = this.runGA4Report(accessToken, propertyId, {
          dimensions: [{ name: 'country' }],
          metrics: [{ name: 'activeUsers' }],
          orderBys: [{ metric: { metricName: 'activeUsers' }, desc: true }],
          limit: 5,
        })
        const pagesReportPromise = this.runGA4Report(accessToken, propertyId, {
          dimensions: [{ name: 'unifiedScreenName' }],
          metrics: [{ name: 'screenPageViews' }],
          orderBys: [{ metric: { metricName: 'screenPageViews' }, desc: true }],
          limit: 20,
        })

        const [kpisReport, customEventsReport, trendReport, countryReport, pagesReport] = await Promise.all([
          kpisReportPromise,
          customEventsPromise,
          trendReportPromise,
          countryReportPromise,
          pagesReportPromise,
        ])

        const kpiValues = kpisReport.rows?.[0]?.metricValues || []
        const activeToday = parseInt(kpiValues[0]?.value || '0', 10)
        const totalPageViews = parseInt(kpiValues[1]?.value || '0', 10)
        const totalVisits = parseInt(kpiValues[2]?.value || '0', 10)

        const activeThisMonth = activeToday
        const newVisitors = 0
        const returningVisitors = 0
        const avgTimeSeconds = 0
        const bounceRate = 0

        let totalSearches = 0
        let totalQrScans = 0
        customEventsReport.rows?.forEach((row: GA4Row) => {
          const eName = row.dimensionValues?.[0]?.value
          const eCount = parseInt(row.metricValues?.[0]?.value || '0', 10)
          if (eName === 'view_search_results' || eName === 'search') {
            totalSearches += eCount
          } else if (eName === 'qr_scan') {
            totalQrScans += eCount
          }
        })

        const trafficTrend = (trendReport.rows || []).map((row: GA4Row) => {
          const minutesAgo = row.dimensionValues?.[0]?.value || '0'
          return {
            date: `${minutesAgo}p trước`,
            visits: parseInt(row.metricValues?.[1]?.value || '0', 10),
            users: parseInt(row.metricValues?.[0]?.value || '0', 10),
          }
        })

        let cumulative = 0
        const userGrowth = trafficTrend.map((t: { date: string; visits: number; users: number }) => {
          cumulative += t.users
          return { date: t.date, totalUsers: cumulative }
        })

        const rawCountries = countryReport.rows || []
        const countryTotalVisits = rawCountries.reduce(
          (acc: number, row: GA4Row) => acc + parseInt(row.metricValues?.[0]?.value || '0', 10),
          0,
        )
        const countryShare = rawCountries.map((row: GA4Row) => {
          const count = parseInt(row.metricValues?.[0]?.value || '0', 10)
          return {
            country: row.dimensionValues?.[0]?.value || 'Khác',
            count,
            percentage: countryTotalVisits > 0 ? parseFloat(((count / countryTotalVisits) * 100).toFixed(1)) : 0,
          }
        })

        const rawPages = pagesReport.rows || []
        const pageTotalViews = rawPages.reduce(
          (acc: number, row: GA4Row) => acc + parseInt(row.metricValues?.[0]?.value || '0', 10),
          0,
        )
        const pageStats = rawPages.map((row: GA4Row) => {
          const views = parseInt(row.metricValues?.[0]?.value || '0', 10)
          return {
            path: row.dimensionValues?.[0]?.value || '/',
            views,
            percentage: pageTotalViews > 0 ? parseFloat(((views / pageTotalViews) * 100).toFixed(1)) : 0,
          }
        })

        const qrStats: Array<{ path: string; scans: number; percentage: number }> = []

        return {
          rangeType,
          rangeLabel: '30 phút qua',
          kpis: {
            totalVisits,
            activeToday,
            activeThisMonth,
            newVisitors,
            returningVisitors,
            avgTimeSeconds,
            totalPageViews,
            bounceRate,
            totalSearches,
            totalQrScans,
          },
          charts: { trafficTrend, userGrowth, contentGrowth, countryShare, pageStats, qrStats },
        }
      }

      let startDate = '30daysAgo'
      let endDate = 'today'
      let rangeLabel = '30 ngày qua'

      if (rangeType === 'today') {
        startDate = 'today'
        endDate = 'today'
        rangeLabel = 'Hôm nay'
      } else if (rangeType === '7days') {
        startDate = '7daysAgo'
        endDate = 'today'
        rangeLabel = '7 ngày qua'
      } else if (rangeType === '30days') {
        startDate = '30daysAgo'
        endDate = 'today'
        rangeLabel = '30 ngày qua'
      } else if (rangeType === 'custom') {
        startDate = customStartDate || '30daysAgo'
        endDate = customEndDate || 'today'
        const formatDate = (dateStr: string) => {
          const parts = dateStr.split('-')
          return parts.length === 3 ? `${parts[2]}/${parts[1]}/${parts[0]}` : dateStr
        }
        rangeLabel = `${formatDate(startDate)} - ${formatDate(endDate)}`
      }

      const dateRanges = [{ startDate, endDate }]

      const kpisReportPromise = this.runGA4StandardReport(accessToken, propertyId, {
        dateRanges,
        metrics: [
          { name: 'sessions' },
          { name: 'activeUsers' },
          { name: 'newUsers' },
          { name: 'screenPageViews' },
          { name: 'bounceRate' },
          { name: 'averageSessionDuration' },
        ],
      })
      const customEventsPromise = this.runGA4StandardReport(accessToken, propertyId, {
        dateRanges,
        dimensions: [{ name: 'eventName' }],
        metrics: [{ name: 'eventCount' }],
      })
      const trendReportPromise = this.runGA4StandardReport(accessToken, propertyId, {
        dateRanges,
        dimensions: [{ name: 'date' }],
        metrics: [{ name: 'sessions' }, { name: 'activeUsers' }],
        orderBys: [{ dimension: { dimensionName: 'date' } }],
      })
      const countryReportPromise = this.runGA4StandardReport(accessToken, propertyId, {
        dateRanges,
        dimensions: [{ name: 'country' }],
        metrics: [{ name: 'sessions' }],
        orderBys: [{ metric: { metricName: 'sessions' }, desc: true }],
        limit: 5,
      })
      const pagesReportPromise = this.runGA4StandardReport(accessToken, propertyId, {
        dateRanges,
        dimensions: [{ name: 'pagePath' }],
        metrics: [{ name: 'screenPageViews' }],
        orderBys: [{ metric: { metricName: 'screenPageViews' }, desc: true }],
        limit: 20,
      })
      const qrReportPromise = this.runGA4StandardReport(accessToken, propertyId, {
        dateRanges,
        dimensions: [{ name: 'pagePath' }],
        metrics: [{ name: 'eventCount' }],
        dimensionFilter: { filter: { fieldName: 'eventName', stringFilter: { value: 'qr_scan' } } },
        limit: 20,
      }).catch((err) => {
        console.error('Error fetching standard QR stats:', err)
        return null
      })

      const [kpisReport, customEventsReport, trendReport, countryReport, pagesReport, qrReport] = await Promise.all([
        kpisReportPromise,
        customEventsPromise,
        trendReportPromise,
        countryReportPromise,
        pagesReportPromise,
        qrReportPromise,
      ])

      const kpiValues = kpisReport.rows?.[0]?.metricValues || []
      const totalVisits = parseInt(kpiValues[0]?.value || '0', 10)
      const activeToday = parseInt(kpiValues[1]?.value || '0', 10)
      const newVisitors = parseInt(kpiValues[2]?.value || '0', 10)
      const totalPageViews = parseInt(kpiValues[3]?.value || '0', 10)
      const bounceRate = parseFloat(kpiValues[4]?.value || '0') * 100
      const avgTimeSeconds = Math.round(parseFloat(kpiValues[5]?.value || '0'))

      const activeThisMonth = activeToday
      const returningVisitors = Math.max(0, activeThisMonth - newVisitors)

      let totalSearches = 0
      let totalQrScans = 0
      customEventsReport.rows?.forEach((row: GA4Row) => {
        const eName = row.dimensionValues?.[0]?.value
        const eCount = parseInt(row.metricValues?.[0]?.value || '0', 10)
        if (eName === 'view_search_results' || eName === 'search') {
          totalSearches += eCount
        } else if (eName === 'qr_scan') {
          totalQrScans += eCount
        }
      })

      const trafficTrend = (trendReport.rows || []).map((row: GA4Row) => {
        const rawDate = row.dimensionValues?.[0]?.value || ''
        const day = rawDate.substring(6, 8)
        const month = rawDate.substring(4, 6)
        return {
          date: `${day}/${month}`,
          visits: parseInt(row.metricValues?.[0]?.value || '0', 10),
          users: parseInt(row.metricValues?.[1]?.value || '0', 10),
        }
      })

      let cumulative = Math.max(0, activeThisMonth - 2000)
      const userGrowth = trafficTrend.map((t: { date: string; visits: number; users: number }) => {
        cumulative += Math.round(t.users * 0.15)
        return { date: t.date, totalUsers: cumulative }
      })

      const rawCountries = countryReport.rows || []
      const countryTotalVisits = rawCountries.reduce(
        (acc: number, row: GA4Row) => acc + parseInt(row.metricValues?.[0]?.value || '0', 10),
        0,
      )
      const countryShare = rawCountries.map((row: GA4Row) => {
        const count = parseInt(row.metricValues?.[0]?.value || '0', 10)
        return {
          country: row.dimensionValues?.[0]?.value || 'Khác',
          count,
          percentage: countryTotalVisits > 0 ? parseFloat(((count / countryTotalVisits) * 100).toFixed(1)) : 0,
        }
      })

      const rawPages = pagesReport.rows || []
      const pageTotalViews = rawPages.reduce(
        (acc: number, row: GA4Row) => acc + parseInt(row.metricValues?.[0]?.value || '0', 10),
        0,
      )
      const pageStats = rawPages.map((row: GA4Row) => {
        const views = parseInt(row.metricValues?.[0]?.value || '0', 10)
        return {
          path: row.dimensionValues?.[0]?.value || '/',
          views,
          percentage: pageTotalViews > 0 ? parseFloat(((views / pageTotalViews) * 100).toFixed(1)) : 0,
        }
      })

      const rawQr = qrReport?.rows || []
      const qrTotalScans = rawQr.reduce(
        (acc: number, row: GA4Row) => acc + parseInt(row.metricValues?.[0]?.value || '0', 10),
        0,
      )
      const qrStats = rawQr.map((row: GA4Row) => {
        const scans = parseInt(row.metricValues?.[0]?.value || '0', 10)
        return {
          path: row.dimensionValues?.[0]?.value || '/',
          scans,
          percentage: qrTotalScans > 0 ? parseFloat(((scans / qrTotalScans) * 100).toFixed(1)) : 0,
        }
      })

      return {
        rangeType,
        rangeLabel,
        kpis: {
          totalVisits,
          activeToday,
          activeThisMonth,
          newVisitors,
          returningVisitors,
          avgTimeSeconds,
          totalPageViews,
          bounceRate: parseFloat(bounceRate.toFixed(1)),
          totalSearches,
          totalQrScans,
        },
        charts: { trafficTrend, userGrowth, contentGrowth, countryShare, pageStats, qrStats },
      }
    } catch (err: unknown) {
      console.error('Error fetching GA4 reports:', err)
      return {
        errorMsg: err instanceof Error ? err.message : 'Có lỗi xảy ra khi kết nối API GA4.',
        rangeType,
        rangeLabel: '',
        kpis: {
          totalVisits: 0,
          activeToday: 0,
          activeThisMonth: 0,
          newVisitors: 0,
          returningVisitors: 0,
          avgTimeSeconds: 0,
          totalPageViews: 0,
          bounceRate: 0,
          totalSearches: 0,
          totalQrScans: 0,
        },
        charts: { trafficTrend: [], userGrowth: [], contentGrowth, countryShare: [], pageStats: [], qrStats: [] },
      }
    }
  }
}
