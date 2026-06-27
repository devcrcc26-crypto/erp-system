import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Request } from 'express';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { AuthenticatedUser } from '../types/jwt-payload.type';
import { DELEGATE_PERMISSION_CHECK_KEY } from './delegate-permission-check.decorator';
import { PermissionService } from './permission.service';
import { PERMISSION_ANY_KEY } from './require-any-permission.decorator';
import { PERMISSION_KEY, RequiredPermission } from './require-permission.decorator';

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly permissionService: PermissionService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isPublic) {
      return true;
    }

    const delegatesCheck = this.reflector.getAllAndOverride<boolean>(
      DELEGATE_PERMISSION_CHECK_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (delegatesCheck) {
      const request = context.switchToHttp().getRequest<Request>();
      const user = request.user as AuthenticatedUser | undefined;

      if (!user) {
        throw new ForbiddenException('Authentication required');
      }

      return true;
    }

    const requiredAny = this.reflector.getAllAndOverride<RequiredPermission[]>(
      PERMISSION_ANY_KEY,
      [context.getHandler(), context.getClass()],
    );

    const required = this.reflector.getAllAndOverride<RequiredPermission>(
      PERMISSION_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!required && (!requiredAny || requiredAny.length === 0)) {
      throw new ForbiddenException(
        'This endpoint requires explicit permission declaration.',
      );
    }

    const request = context.switchToHttp().getRequest<Request>();
    const user = request.user as AuthenticatedUser | undefined;

    if (!user) {
      throw new ForbiddenException('Authentication required');
    }

    if (requiredAny && requiredAny.length > 0) {
      const results = await Promise.all(
        requiredAny.map((permission) =>
          this.permissionService.hasPermission(
            user.userId,
            user.companyId,
            permission.module,
            permission.action,
          ),
        ),
      );

      if (results.some(Boolean)) {
        return true;
      }

      const labels = requiredAny
        .map((permission) => `${permission.module}.${permission.action}`)
        .join(', ');
      throw new ForbiddenException(`Missing permission (any of): ${labels}`);
    }

    const allowed = await this.permissionService.hasPermission(
      user.userId,
      user.companyId,
      required!.module,
      required!.action,
    );

    if (!allowed) {
      throw new ForbiddenException(
        `Missing permission: ${required!.module}.${required!.action}`,
      );
    }

    return true;
  }
}
