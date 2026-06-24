import { CallHandler, ExecutionContext } from '@nestjs/common';
import { lastValueFrom, of } from 'rxjs';
import { AuditSnapshotService } from '../../application/services/audit-snapshot.service';
import { AuditService } from '../../application/services/audit.service';
import { AuditInterceptor } from './audit.interceptor';

describe('AuditInterceptor', () => {
  let auditService: jest.Mocked<Pick<AuditService, 'create' | 'buildFromRequestContext'>>;
  let auditSnapshotService: jest.Mocked<Pick<AuditSnapshotService, 'capture'>>;
  let interceptor: AuditInterceptor;

  const user = {
    userId: 'user-1',
    companyId: 'company-1',
    sessionId: 'session-1',
  };

  const buildContext = (
    method: string,
    path: string,
    params: Record<string, string> = { id: 'record-1' },
  ): ExecutionContext =>
    ({
      switchToHttp: () => ({
        getRequest: () => ({
          method,
          path,
          user,
          params,
        }),
      }),
    }) as unknown as ExecutionContext;

  const next: CallHandler = {
    handle: () =>
      of({
        success: true,
        data: { id: 'record-1', name: 'Updated Branch' },
      }),
  };

  beforeEach(() => {
    auditService = {
      create: jest.fn().mockResolvedValue(undefined),
      buildFromRequestContext: jest.fn().mockImplementation((partial) => ({
        ...partial,
        correlationId: 'corr-1',
        ipAddress: '127.0.0.1',
        deviceInfo: 'jest',
      })),
    };
    auditSnapshotService = {
      capture: jest.fn().mockResolvedValue({ id: 'record-1', name: 'Old Branch' }),
    };
    interceptor = new AuditInterceptor(
      auditService as unknown as AuditService,
      auditSnapshotService as unknown as AuditSnapshotService,
    );
  });

  it('skips GET requests', async () => {
    await lastValueFrom(
      interceptor.intercept(buildContext('GET', '/api/branches'), next),
    );
    expect(auditService.create).not.toHaveBeenCalled();
  });

  it('skips excluded auth paths', async () => {
    await lastValueFrom(
      interceptor.intercept(buildContext('POST', '/api/auth/login'), next),
    );
    expect(auditService.create).not.toHaveBeenCalled();
  });

  it('skips logout (audited in LogoutHandler before session deletion)', async () => {
    await lastValueFrom(
      interceptor.intercept(buildContext('POST', '/api/auth/logout'), next),
    );
    expect(auditService.create).not.toHaveBeenCalled();
  });

  it('writes audit log on successful create without before value', async () => {
    await lastValueFrom(
      interceptor.intercept(buildContext('POST', '/api/branches'), next),
    );

    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(auditSnapshotService.capture).not.toHaveBeenCalled();
    expect(auditService.create).toHaveBeenCalledWith(
      expect.objectContaining({
        companyId: 'company-1',
        userId: 'user-1',
        module: 'branches',
        action: 'create',
        recordId: 'record-1',
        beforeValue: undefined,
        afterValue: { id: 'record-1', name: 'Updated Branch' },
      }),
    );
  });

  it('captures before value on update', async () => {
    await lastValueFrom(
      interceptor.intercept(buildContext('PATCH', '/api/branches/record-1'), next),
    );

    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(auditSnapshotService.capture).toHaveBeenCalledWith(
      'company-1',
      'branches',
      'record-1',
    );
    expect(auditService.create).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'update',
        beforeValue: { id: 'record-1', name: 'Old Branch' },
        afterValue: { id: 'record-1', name: 'Updated Branch' },
      }),
    );
  });

  it('captures before value on delete without after value', async () => {
    await lastValueFrom(
      interceptor.intercept(buildContext('DELETE', '/api/branches/record-1'), next),
    );

    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(auditService.create).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'delete',
        beforeValue: { id: 'record-1', name: 'Old Branch' },
        afterValue: undefined,
      }),
    );
  });

  it('resolves alternate route param names for project issues', async () => {
    await lastValueFrom(
      interceptor.intercept(
        buildContext(
          'PATCH',
          '/api/projects/project-1/issues/issue-1',
          { projectId: 'project-1', issueId: 'issue-1' },
        ),
        next,
      ),
    );

    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(auditSnapshotService.capture).toHaveBeenCalledWith(
      'company-1',
      'issues',
      'issue-1',
    );
  });
});
