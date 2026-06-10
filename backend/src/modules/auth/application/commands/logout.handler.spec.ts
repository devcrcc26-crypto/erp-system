import { UnauthorizedException } from '@nestjs/common';
import { AuditService } from '../../../audit/application/services/audit.service';
import { IAuthRepository } from '../../domain/repositories/auth.repository.interface';
import { LogoutHandler } from './logout.handler';
import { LogoutCommand } from './logout.command';

describe('LogoutHandler', () => {
  let authRepository: jest.Mocked<
    Pick<IAuthRepository, 'findSessionById' | 'deleteSession'>
  >;
  let auditService: jest.Mocked<Pick<AuditService, 'create'>>;
  let handler: LogoutHandler;

  beforeEach(() => {
    authRepository = {
      findSessionById: jest.fn(),
      deleteSession: jest.fn(),
    };
    auditService = { create: jest.fn().mockResolvedValue(undefined) };
    handler = new LogoutHandler(
      authRepository as unknown as IAuthRepository,
      auditService as unknown as AuditService,
    );
  });

  it('writes audit log before deleting the session', async () => {
    authRepository.findSessionById.mockResolvedValue({
      id: 'session-1',
      userId: 'user-1',
      companyId: 'company-1',
      ipAddress: '127.0.0.1',
      deviceInfo: 'jest',
    } as Awaited<ReturnType<IAuthRepository['findSessionById']>>);

    const result = await handler.execute(
      new LogoutCommand('session-1', 'user-1'),
    );

    expect(result.message).toBe('Logged out successfully');
    expect(auditService.create).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user-1',
        companyId: 'company-1',
        sessionId: 'session-1',
        module: 'auth',
        action: 'logout',
      }),
    );
    expect(authRepository.deleteSession).toHaveBeenCalledWith('session-1');
    expect(auditService.create.mock.invocationCallOrder[0]).toBeLessThan(
      authRepository.deleteSession.mock.invocationCallOrder[0],
    );
  });

  it('rejects invalid sessions', async () => {
    authRepository.findSessionById.mockResolvedValue(null);

    await expect(
      handler.execute(new LogoutCommand('session-1', 'user-1')),
    ).rejects.toBeInstanceOf(UnauthorizedException);

    expect(auditService.create).not.toHaveBeenCalled();
    expect(authRepository.deleteSession).not.toHaveBeenCalled();
  });
});
