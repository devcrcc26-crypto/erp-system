import { CallHandler, ExecutionContext } from '@nestjs/common';
import { lastValueFrom, of } from 'rxjs';
import { AuditService } from '../../application/services/audit.service';
import { AuditInterceptor } from './audit.interceptor';

describe('AuditInterceptor', () => {
  let auditService: jest.Mocked<Pick<AuditService, 'create' | 'buildFromRequestContext'>>;
  let interceptor: AuditInterceptor;

  const buildContext = (
    method: string,
    path: string,
    user?: { userId: string; companyId: string; sessionId: string },
  ): ExecutionContext =>
    ({
      switchToHttp: () => ({
        getRequest: () => ({
          method,
          path,
          user,
          params: { id: 'record-1' },
        }),
      }),
    }) as unknown as ExecutionContext;

  const next: CallHandler = {
    handle: () => of({ id: 'record-1', name: 'Test Branch' }),
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
    interceptor = new AuditInterceptor(auditService as unknown as AuditService);
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

  it('writes audit log on successful CUD', async () => {
    const user = {
      userId: 'user-1',
      companyId: 'company-1',
      sessionId: 'session-1',
    };

    await lastValueFrom(
      interceptor.intercept(
        buildContext('POST', '/api/branches', user),
        next,
      ),
    );

    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(auditService.create).toHaveBeenCalledWith(
      expect.objectContaining({
        companyId: 'company-1',
        userId: 'user-1',
        module: 'branches',
        action: 'create',
        recordId: 'record-1',
      }),
    );
  });
});
