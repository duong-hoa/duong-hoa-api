import { Controller, Get, Query, UseGuards } from '@nestjs/common'
import { JwtAuthGuard } from '../auth/jwt-auth.guard'
import { AnalyticsService } from './analytics.service'
import type { RangeType } from './analytics.types'

// Mirrors getAnalyticsData from src/lib/actions.ts (called by the admin dashboard).
@UseGuards(JwtAuthGuard)
@Controller('admin/analytics')
export class AnalyticsController {
  constructor(private readonly analyticsService: AnalyticsService) {}

  @Get()
  getAnalytics(
    @Query('rangeType') rangeType?: RangeType,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    return this.analyticsService.getAnalyticsData(rangeType || 'realtime', startDate, endDate)
  }
}
