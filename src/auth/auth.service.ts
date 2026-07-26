import { Injectable, UnauthorizedException } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { JwtService } from '@nestjs/jwt'

export type AuthUser = {
  id: 'admin'
  email: string
  name: 'Admin'
  role: 'admin'
}

// Mirrors src/auth.ts: a single fixed admin account sourced from env vars,
// plain string compare (the current app never hashes ADMIN_PASSWORD), same
// InvalidLoginError-style rejection on any mismatch or missing config.
@Injectable()
export class AuthService {
  constructor(
    private readonly config: ConfigService,
    private readonly jwt: JwtService,
  ) {}

  private validateCredentials(email: string, password: string): AuthUser {
    const adminEmail = this.config.get<string>('ADMIN_EMAIL')
    const adminPassword = this.config.get<string>('ADMIN_PASSWORD')

    if (!adminEmail || !adminPassword) {
      throw new UnauthorizedException('invalid_credentials')
    }

    const isEmailMatch = email.toLowerCase() === adminEmail.toLowerCase()
    const isPasswordMatch = password === adminPassword
    if (!isEmailMatch || !isPasswordMatch) {
      throw new UnauthorizedException('invalid_credentials')
    }

    return { id: 'admin', email, name: 'Admin', role: 'admin' }
  }

  login(email: string, password: string) {
    const user = this.validateCredentials(email, password)
    const accessToken = this.jwt.sign({ sub: user.id, email: user.email, role: user.role })
    return { accessToken, user }
  }

  verifyToken(token: string): AuthUser | null {
    try {
      const payload = this.jwt.verify<{ sub: string; email: string; role: string }>(token)
      return { id: 'admin', email: payload.email, name: 'Admin', role: 'admin' }
    } catch {
      return null
    }
  }
}
