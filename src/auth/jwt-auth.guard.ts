import { ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common'
import { AuthGuard } from '@nestjs/passport'

// Guards every /admin/* route. Mirrors requireAdmin()/`if (!session?.user)
// throw new Error('Chưa đăng nhập')` from src/lib/admin-actions.ts.
@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  handleRequest<TUser = unknown>(err: unknown, user: TUser, _info: unknown, _context: ExecutionContext): TUser {
    if (err || !user) {
      throw new UnauthorizedException('Chưa đăng nhập')
    }
    return user
  }
}
