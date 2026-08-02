import { BadRequestException, Body, Controller, Delete, ForbiddenException, Get, Param, Post, Req, UseGuards } from '@nestjs/common'
import type { Request } from 'express'
import * as bcrypt from 'bcryptjs'
import { Prisma } from '@prisma/client'
import { PrismaService } from '../prisma/prisma.service'
import { JwtAuthGuard } from '../auth/jwt-auth.guard'
import { RolesGuard } from '../auth/roles.guard'
import { Roles } from '../auth/roles.decorator'
import type { AuthUser } from '../auth/auth.service'
import { SaveAccountDto } from './dto/save-account.dto'

function toAccountRow(account: { id: string; email: string; displayName: string; role: string; createdAt: Date }) {
  return {
    id: account.id,
    email: account.email,
    role: account.role === 'admin' ? 'admin' : 'edit',
    display_name: account.displayName,
    created_at: account.createdAt.toISOString(),
  }
}

// Only admins manage other accounts — RolesGuard runs after JwtAuthGuard has
// already confirmed the caller is logged in.
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('admin')
@Controller('admin/accounts')
export class AccountsController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  async getAccounts() {
    const accounts = await this.prisma.adminUser.findMany({ orderBy: { createdAt: 'asc' } })
    return accounts.map(toAccountRow)
  }

  @Post()
  async saveAccount(@Body() dto: SaveAccountDto, @Req() req: Request) {
    const currentUser = req.user as AuthUser
    const email = dto.email.trim().toLowerCase()

    if (dto.id) {
      const existing = await this.prisma.adminUser.findUnique({ where: { id: dto.id } })
      if (!existing) throw new BadRequestException('Không tìm thấy tài khoản')

      if (dto.id === currentUser.id && dto.role !== existing.role) {
        throw new BadRequestException('Không thể tự thay đổi quyền hạn của chính mình')
      }

      // Prevent demoting/removing the last remaining admin.
      if (existing.role === 'admin' && dto.role !== 'admin') {
        const adminCount = await this.prisma.adminUser.count({ where: { role: 'admin' } })
        if (adminCount <= 1) {
          throw new BadRequestException('Không thể hạ quyền tài khoản quản trị viên cuối cùng')
        }
      }

      const data: Prisma.AdminUserUpdateInput = {
        displayName: dto.displayName.trim(),
        role: dto.role,
      }
      if (dto.password) {
        data.passwordHash = await bcrypt.hash(dto.password, 10)
      }

      const updated = await this.prisma.adminUser.update({ where: { id: dto.id }, data })
      return toAccountRow(updated)
    }

    if (!dto.password) {
      throw new BadRequestException('Mật khẩu là bắt buộc khi tạo tài khoản')
    }

    const passwordHash = await bcrypt.hash(dto.password, 10)
    const created = await this.prisma.adminUser
      .create({ data: { email, passwordHash, displayName: dto.displayName.trim(), role: dto.role } })
      .catch((err) => {
        if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
          throw new BadRequestException('Email này đã được sử dụng')
        }
        throw err
      })

    return toAccountRow(created)
  }

  @Delete(':id')
  async deleteAccount(@Param('id') id: string, @Req() req: Request) {
    const currentUser = req.user as AuthUser
    if (id === currentUser.id) {
      throw new ForbiddenException('Không thể tự xóa tài khoản của bạn')
    }

    const target = await this.prisma.adminUser.findUnique({ where: { id } })
    if (!target) throw new BadRequestException('Không tìm thấy tài khoản')

    if (target.role === 'admin') {
      const adminCount = await this.prisma.adminUser.count({ where: { role: 'admin' } })
      if (adminCount <= 1) {
        throw new BadRequestException('Không thể xóa tài khoản quản trị viên cuối cùng')
      }
    }

    await this.prisma.adminUser.delete({ where: { id } })
    return { success: true }
  }
}
