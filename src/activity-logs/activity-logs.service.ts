import { Injectable } from '@nestjs/common'
import type { ActivityLog } from '@prisma/client'
import { PrismaService } from '../prisma/prisma.service'

function toActivityLogRow(log: ActivityLog) {
  return {
    id: log.id,
    user_id: log.userId,
    user_email: log.userEmail,
    action: log.action,
    target_table: log.targetTable,
    target_id: log.targetId,
    target_name: log.targetName,
    old_data: log.oldData,
    new_data: log.newData,
    created_at: log.createdAt,
  }
}

// Mirrors getActivityLogs from src/lib/admin-actions.ts. There is currently
// no write path for this table anywhere in the app (the DB triggers that
// used to populate it were dropped along with the old auth provider) —
// only reads.
@Injectable()
export class ActivityLogsService {
  constructor(private readonly prisma: PrismaService) {}

  async getActivityLogs(userId?: string) {
    const logs = await this.prisma.activityLog.findMany({
      where: userId ? { userId } : undefined,
      orderBy: { createdAt: 'desc' },
    })
    return logs.map(toActivityLogRow)
  }
}
