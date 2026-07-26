import { Body, Controller, Get, Post, Req } from '@nestjs/common'
import type { Request } from 'express'
import { AuthService } from './auth.service'
import { LoginDto } from './dto/login.dto'

// POST /auth/login replaces the Auth.js Credentials sign-in flow (src/auth.ts).
// GET /auth/session replaces both the Auth.js session cookie read and
// src/app/api/admin/session-debug/route.ts — since this backend is a
// stateless bearer-token API rather than a cookie session app, "session" here
// means "does the caller's Authorization header hold a valid token".
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('login')
  login(@Body() dto: LoginDto) {
    return this.authService.login(dto.email, dto.password)
  }

  @Get('session')
  session(@Req() req: Request) {
    const authHeader = req.headers.authorization ?? ''
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null
    const user = token ? this.authService.verifyToken(token) : null

    const cookieHeader = req.headers.cookie ?? ''
    const cookieNames = cookieHeader
      .split(';')
      .map((part) => part.split('=')[0]?.trim())
      .filter((name): name is string => Boolean(name))

    return {
      hasSession: Boolean(user),
      user: user ? { email: user.email, name: user.name, role: user.role } : null,
      cookieNames,
      hasAuthjsSessionCookie: false,
      host: req.headers.host ?? null,
      forwardedHost: (req.headers['x-forwarded-host'] as string) ?? null,
      forwardedProto: (req.headers['x-forwarded-proto'] as string) ?? null,
    }
  }
}
