import { ConflictException } from '@nestjs/common';
import { AuditLogSource } from '@prisma/client';
import { UserManagementService } from './user-management.service';
import { AUTH_AUDIT_MODULE } from '../../../auth/application/constants/login-security.constants';

describe('UserManagementService login name', () => {
  const companyId = 'company-1';
  const actorId = 'admin-1';
  const targetId = 'user-1';

  let prisma: {
    user: {
      findFirst: jest.Mock;
      update: jest.Mock;
    };
  };
  let auditService: { create: jest.Mock };
  let permissionService: { hasPermission: jest.Mock };
  let service: UserManagementService;

  beforeEach(() => {
    prisma = {
      user: {
        findFirst: jest.fn(),
        update: jest.fn(),
      },
    };
    auditService = { create: jest.fn().mockResolvedValue(undefined) };
    permissionService = {
      hasPermission: jest.fn().mockResolvedValue(false),
    };

    service = new UserManagementService(
      prisma as never,
      {} as never,
      {} as never,
      auditService as never,
      {} as never,
      {} as never,
      {} as never,
      permissionService as never,
    );
  });

  describe('visibility via getUser', () => {
    const baseUser = {
      id: targetId,
      companyId,
      firstName: 'Abebe',
      middleName: 'Bekele',
      lastName: 'Kebede',
      loginName: 'Abebe Bekele Kebede',
      yearsOfExperience: null,
      yearsOfExperienceAsOf: null,
      bankAccountNumber: null,
      userRoles: [],
    };

    it('includes loginName for HR (users.view)', async () => {
      prisma.user.findFirst.mockResolvedValue(baseUser);
      permissionService.hasPermission.mockImplementation(
        async (_u: string, _c: string, module: string) => module === 'users',
      );

      const result = (await service.getUser(
        { companyId, userId: actorId },
        targetId,
      )) as { loginName?: string };

      expect(result.loginName).toBe('Abebe Bekele Kebede');
    });

    it('includes loginName for the employee themself', async () => {
      prisma.user.findFirst.mockResolvedValue(baseUser);
      permissionService.hasPermission.mockResolvedValue(false);

      const result = (await service.getUser(
        { companyId, userId: targetId },
        targetId,
      )) as { loginName?: string };

      expect(result.loginName).toBe('Abebe Bekele Kebede');
    });

    it('omits loginName for another employee without HR permission', async () => {
      prisma.user.findFirst.mockResolvedValue(baseUser);
      permissionService.hasPermission.mockResolvedValue(false);

      const result = (await service.getUser(
        { companyId, userId: 'other-employee' },
        targetId,
      )) as { loginName?: string };

      expect(result.loginName).toBeUndefined();
    });
  });

  describe('updateLoginName', () => {
    it('rejects duplicate normalised login names', async () => {
      prisma.user.findFirst
        .mockResolvedValueOnce({ id: targetId, loginName: 'Old Name' })
        .mockResolvedValueOnce({ id: 'other-user' });

      try {
        await service.updateLoginName(
          { companyId, userId: actorId },
          targetId,
          'Abebe  Bekele',
        );
        fail('expected ConflictException');
      } catch (error: unknown) {
        expect(error).toBeInstanceOf(ConflictException);
        expect((error as ConflictException).message).toBe(
          'Another user already has this login name',
        );
      }
    });

    it('updates loginName and writes an audit log entry', async () => {
      prisma.user.findFirst
        .mockResolvedValueOnce({ id: targetId, loginName: 'Old Name' })
        .mockResolvedValueOnce(null);
      prisma.user.update.mockResolvedValue({
        id: targetId,
        loginName: 'New Login',
        firstName: 'Abebe',
        lastName: 'Kebede',
        yearsOfExperience: null,
        yearsOfExperienceAsOf: null,
      });

      await service.updateLoginName(
        { companyId, userId: actorId },
        targetId,
        'New Login',
      );

      expect(prisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            loginName: 'New Login',
            loginNameNormalized: 'new login',
          }),
        }),
      );
      expect(auditService.create).toHaveBeenCalledWith(
        expect.objectContaining({
          module: AUTH_AUDIT_MODULE,
          action: 'LOGIN_NAME_UPDATED',
          recordId: targetId,
          beforeValue: { loginName: 'Old Name' },
          afterValue: { loginName: 'New Login' },
          source: AuditLogSource.USER_ACTION,
        }),
      );
    });
  });

  describe('setLoginNameToFullName', () => {
    it('sets loginName from first + middle + last when null', async () => {
      prisma.user.findFirst
        // setLoginNameToFullName load
        .mockResolvedValueOnce({
          id: targetId,
          loginName: null,
          firstName: 'Abebe',
          middleName: 'Bekele',
          lastName: 'Kebede',
        })
        // updateLoginName existing
        .mockResolvedValueOnce({ id: targetId, loginName: null })
        // uniqueness check
        .mockResolvedValueOnce(null);

      prisma.user.update.mockResolvedValue({
        id: targetId,
        loginName: 'Abebe Bekele Kebede',
        firstName: 'Abebe',
        middleName: 'Bekele',
        lastName: 'Kebede',
        yearsOfExperience: null,
        yearsOfExperienceAsOf: null,
      });

      const result = (await service.setLoginNameToFullName(
        { companyId, userId: actorId },
        targetId,
      )) as { loginName?: string };

      expect(result.loginName).toBe('Abebe Bekele Kebede');
      expect(auditService.create).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'LOGIN_NAME_UPDATED',
          beforeValue: { loginName: null },
          afterValue: { loginName: 'Abebe Bekele Kebede' },
        }),
      );
    });
  });
});

