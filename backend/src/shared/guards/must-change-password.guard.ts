import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Request } from 'express';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { PrismaService } from '../prisma/prisma.service';
import { AuthenticatedUser } from '../types/jwt-payload.type';

const ALLOWED_WHEN_MUST_CHANGE = new Set([
  'POST /auth/change-password',
  'POST /auth/logout',
  'POST /auth/refresh',
  'GET /auth/me',
]);

/**
 * When mustChangePassword is true, only password-change (and session end/refresh/me)
 * endpoints are reachable. Enforced on the backend for every authenticated request.
 */
@Injectable()
export class MustChangePasswordGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) {
      return true;
    }

    const request = context.switchToHttp().getRequest<Request>();
    const user = request.user as AuthenticatedUser | undefined;
    if (!user?.userId) {
      return true;
    }

    const routeKey = `${request.method.toUpperCase()} ${this.normalizePath(request.path)}`;
    if (ALLOWED_WHEN_MUST_CHANGE.has(routeKey)) {
      return true;
    }

    const record = await this.prisma.user.findFirst({
      where: { id: user.userId, deletedAt: null },
      select: { mustChangePassword: true },
    });

    if (record?.mustChangePassword) {
      throw new ForbiddenException({
        message: 'You must change your password before continuing.',
        error: 'MUST_CHANGE_PASSWORD',
      });
    }

    return true;
  }

  private normalizePath(path: string): string {
    const withoutQuery = path.split('?')[0] ?? path;
    // Strip global API prefix if present (e.g. /api/auth/me → /auth/me).
    if (withoutQuery.startsWith('/api/')) {
      return withoutQuery.slice(4);
    }
    return withoutQuery;
  }
}
