import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import type { AuthUser } from './auth.service'
import { ROLES_KEY } from './roles.decorator'

// Runs after JwtAuthGuard — req.user is already an AuthUser by this point.
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<Array<'admin' | 'edit'>>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ])
    if (!required || required.length === 0) return true

    const user = context.switchToHttp().getRequest().user as AuthUser
    if (!required.includes(user.role)) {
      throw new ForbiddenException('Bạn không có quyền thực hiện thao tác này')
    }
    return true
  }
}
