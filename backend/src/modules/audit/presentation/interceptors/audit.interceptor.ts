import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Request } from 'express';
import { from, Observable, switchMap, tap } from 'rxjs';
import { Prisma } from '@prisma/client';
import { AuthenticatedUser } from '../../../../shared/types/jwt-payload.type';
import { AuditSnapshotService } from '../../application/services/audit-snapshot.service';
import { AuditService } from '../../application/services/audit.service';
import {
  looksLikeEntityUuid,
  toAuditJsonSnapshot,
} from '../../application/utils/audit-value.util';

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

@Injectable()
export class AuditInterceptor implements NestInterceptor {
  constructor(
    private readonly auditService: AuditService,
    private readonly auditSnapshotService: AuditSnapshotService,
  ) {}

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
    const params = request.params as Record<string, string>;
    const recordType = this.extractRecordType(path, params);
    const recordId = this.extractRecordId(params);

    if (action === 'create') {
      return next.handle().pipe(
        tap((responseBody: unknown) => {
          void this.writeAuditLog(
            user,
            request,
            action,
            moduleName,
            recordType,
            this.extractRecordId(params, responseBody),
            undefined,
            responseBody,
          );
        }),
      );
    }

    return from(
      this.auditSnapshotService.capture(
        user.companyId,
        recordType,
        recordId,
      ),
    ).pipe(
      switchMap((beforeValue) =>
        next.handle().pipe(
          tap((responseBody: unknown) => {
            void this.writeAuditLog(
              user,
              request,
              action,
              moduleName,
              recordType,
              this.extractRecordId(params, responseBody) || recordId,
              beforeValue,
              responseBody,
            );
          }),
        ),
      ),
    );
  }

  private async writeAuditLog(
    user: AuthenticatedUser,
    request: Request,
    action: string,
    module: string,
    recordType: string,
    recordId: string,
    beforeValue: Prisma.InputJsonValue | undefined,
    responseBody: unknown,
  ): Promise<void> {
    const data = this.extractData(responseBody);
    const afterValue =
      action === 'delete'
        ? undefined
        : data
          ? toAuditJsonSnapshot(data)
          : undefined;

    await this.auditService.create(
      this.auditService.buildFromRequestContext({
        userId: user.userId,
        companyId: user.companyId,
        sessionId: user.sessionId,
        module,
        action,
        recordType,
        recordId,
        beforeValue,
        afterValue,
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

  private extractRecordType(
    path: string,
    params: Record<string, string>,
  ): string {
    const segments = path.replace(/^\/api\/?/, '').split('/').filter(Boolean);
    if (segments.length === 0) {
      return 'unknown';
    }

    const lastSegment = segments[segments.length - 1];
    const paramValues = Object.values(params);
    const targetsRecord =
      looksLikeEntityUuid(lastSegment) ||
      paramValues.some((value) => value === lastSegment);

    if (targetsRecord && segments.length >= 2) {
      return segments[segments.length - 2].replace(/-/g, '_');
    }

    return segments[0].replace(/-/g, '_');
  }

  private extractRecordId(
    params: Record<string, string>,
    responseBody?: unknown,
  ): string {
    const fromResponse = this.extractId(this.extractData(responseBody));
    if (fromResponse) {
      return fromResponse;
    }

    if (params.id) {
      return params.id;
    }

    const namedIdEntries = Object.entries(params).filter(
      ([key]) => key !== 'projectId' && /Id$/i.test(key),
    );
    if (namedIdEntries.length > 0) {
      return namedIdEntries[namedIdEntries.length - 1][1];
    }

    const paramValues = Object.values(params);
    for (let index = paramValues.length - 1; index >= 0; index -= 1) {
      const value = paramValues[index];
      if (looksLikeEntityUuid(value)) {
        return value;
      }
    }

    return 'unknown';
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
}
