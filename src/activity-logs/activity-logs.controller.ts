import { Controller, Get, Query, UseGuards } from '@nestjs/common'
import { JwtAuthGuard } from '../auth/jwt-auth.guard'
import { ActivityLogsService } from './activity-logs.service'

@UseGuards(JwtAuthGuard)
@Controller('admin/activity-logs')
export class ActivityLogsController {
  constructor(private readonly activityLogsService: ActivityLogsService) {}

  @Get()
  getActivityLogs(@Query('userId') userId?: string) {
    return this.activityLogsService.getActivityLogs(userId)
  }
}
