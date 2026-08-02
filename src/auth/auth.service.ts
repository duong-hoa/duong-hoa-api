import { Injectable, UnauthorizedException } from '@nestjs/common'
import { JwtService } from '@nestjs/jwt'
import * as bcrypt from 'bcryptjs'
import { PrismaService } from '../prisma/prisma.service'

export type AuthUser = {
  id: string
  email: string
  name: string
  role: 'admin' | 'edit'
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
  ) {}

  async login(email: string, password: string) {
    const account = await this.prisma.adminUser.findUnique({ where: { email: email.toLowerCase() } })
    if (!account) {
      throw new UnauthorizedException('invalid_credentials')
    }

    const isPasswordMatch = await bcrypt.compare(password, account.passwordHash)
    if (!isPasswordMatch) {
      throw new UnauthorizedException('invalid_credentials')
    }

    const user: AuthUser = {
      id: account.id,
      email: account.email,
      name: account.displayName,
      role: account.role === 'admin' ? 'admin' : 'edit',
    }
    const accessToken = this.jwt.sign({ sub: user.id, email: user.email, name: user.name, role: user.role })
    return { accessToken, user }
  }

  verifyToken(token: string): AuthUser | null {
    try {
      const payload = this.jwt.verify<{ sub: string; email: string; name: string; role: string }>(token)
      return { id: payload.sub, email: payload.email, name: payload.name, role: payload.role === 'admin' ? 'admin' : 'edit' }
    } catch {
      return null
    }
  }
}
