import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Request } from 'express';
import { Observable, tap } from 'rxjs';
import { AuthenticatedUser } from '../../../../shared/types/jwt-payload.type';
import { AuditService } from '../../application/services/audit.service';

const EXCLUDED_PATH_PREFIXES = [
  '/api/health',
  '/api/auth/login',
  '/api/auth/logout',
  '/api/auth/refresh',
  '/api/auth/forgot-password',
  '/api/auth/reset-password',
  '/api/docs',
  '/api/audit-logs',
  '/api/notifications',
];

const SENSITIVE_KEYS = new Set([
  'password',
  'passwordHash',
  'refreshToken',
  'accessToken',
  'token',
]);

@Injectable()
export class AuditInterceptor implements NestInterceptor {
  constructor(private readonly auditService: AuditService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest<Request>();
    const method = request.method.toUpperCase();

    if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) {
      return next.handle();
    }

    const path = request.path;
    if (EXCLUDED_PATH_PREFIXES.some((prefix) => path.startsWith(prefix))) {
      return next.handle();
    }

    const user = request.user as AuthenticatedUser | undefined;
    if (!user) {
      return next.handle();
    }

    const action = this.mapAction(method);
    const moduleName = this.extractModule(path);
    const recordType = this.extractRecordType(path);

    return next.handle().pipe(
      tap((responseBody: unknown) => {
        void this.writeAuditLog(
          user,
          request,
          action,
          moduleName,
          recordType,
          responseBody,
        );
      }),
    );
  }

  private async writeAuditLog(
    user: AuthenticatedUser,
    request: Request,
    action: string,
    module: string,
    recordType: string,
    responseBody: unknown,
  ): Promise<void> {
    const params = request.params as Record<string, string>;
    const data = this.extractData(responseBody);
    const recordId = params.id ?? this.extractId(data) ?? 'unknown';

    await this.auditService.create(
      this.auditService.buildFromRequestContext({
        userId: user.userId,
        companyId: user.companyId,
        sessionId: user.sessionId,
        module,
        action,
        recordType,
        recordId,
        afterValue: data
          ? (this.sanitize(data) as object)
          : undefined,
      }),
    );
  }

  private mapAction(method: string): string {
    switch (method) {
      case 'POST':
        return 'create';
      case 'PUT':
      case 'PATCH':
        return 'update';
      case 'DELETE':
        return 'delete';
      default:
        return method.toLowerCase();
    }
  }

  private extractModule(path: string): string {
    const segments = path.replace(/^\/api\/?/, '').split('/').filter(Boolean);
    return segments[0] ?? 'unknown';
  }

  private extractRecordType(path: string): string {
    const segments = path.replace(/^\/api\/?/, '').split('/').filter(Boolean);
    return segments[0]?.replace(/-/g, '_') ?? 'unknown';
  }

  private extractData(body: unknown): unknown {
    if (
      typeof body === 'object' &&
      body !== null &&
      'data' in body &&
      (body as { success?: boolean }).success === true
    ) {
      return (body as { data: unknown }).data;
    }
    return body;
  }

  private extractId(data: unknown): string | undefined {
    if (typeof data === 'object' && data !== null && 'id' in data) {
      const id = (data as { id: unknown }).id;
      return typeof id === 'string' ? id : undefined;
    }
    return undefined;
  }

  private sanitize(value: unknown): unknown {
    if (Array.isArray(value)) {
      return value.map((item) => this.sanitize(item));
    }
    if (typeof value === 'object' && value !== null) {
      const result: Record<string, unknown> = {};
      for (const [key, val] of Object.entries(value)) {
        if (SENSITIVE_KEYS.has(key)) {
          continue;
        }
        result[key] = this.sanitize(val);
      }
      return result;
    }
    return value;
  }
}
