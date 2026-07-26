import { Body, Controller, Delete, Get, Param, Post, Req, UseGuards } from '@nestjs/common'
import type { Request } from 'express'
import { ConfigService } from '@nestjs/config'
import { JwtAuthGuard } from '../auth/jwt-auth.guard'
import type { AuthUser } from '../auth/auth.service'
import { SaveAccountDto } from './dto/save-account.dto'

// Mirrors getAccounts/saveAccount/deleteAccount from src/lib/admin-actions.ts:
// the app runs a single fixed admin account sourced from env vars, so writes
// always return the same explanatory error instead of mutating anything.
@UseGuards(JwtAuthGuard)
@Controller('admin/accounts')
export class AccountsController {
  constructor(private readonly config: ConfigService) {}

  @Get()
  getAccounts(@Req() req: Request) {
    const user = req.user as AuthUser
    return [
      {
        id: 'admin',
        email: this.config.get<string>('ADMIN_EMAIL') || user.email || '',
        role: 'admin',
        display_name: 'Admin',
        raw_password: null,
        created_at: new Date(0).toISOString(),
      },
    ]
  }

  @Post()
  saveAccount(@Body() _data: SaveAccountDto) {
    return {
      error:
        'Hệ thống hiện dùng một tài khoản admin cố định qua biến môi trường. Vui lòng cập nhật ADMIN_EMAIL và ADMIN_PASSWORD để đổi thông tin đăng nhập.',
    }
  }

  @Delete(':id')
  deleteAccount(@Param('id') _id: string) {
    return { error: 'Không thể xóa tài khoản admin cố định được cấu hình bằng biến môi trường.' }
  }
}
