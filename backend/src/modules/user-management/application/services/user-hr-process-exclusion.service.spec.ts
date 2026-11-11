import { BadRequestException } from '@nestjs/common';
import { AuditLogSource } from '@prisma/client';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { UserManagementService } from './user-management.service';
import { UpdateUserDto } from '../dtos/user-management.dtos';
import { resolveHrProcessExclusionUpdate } from '../utils/hr-process-exclusion.util';
import { UsersController } from '../../presentation/controllers/users.controller';
import { PERMISSION_KEY } from '../../../../shared/permissions/require-permission.decorator';

describe('approver-only flag (excludedFromHrProcesses) - users API', () => {
  describe('permission: users.edit', () => {
    const required = (method: keyof UsersController): unknown =>
      Reflect.getMetadata(PERMISSION_KEY, UsersController.prototype[method]);

    it('PATCH /users/:id (which carries the flag) requires users.edit', () => {
      expect(required('update')).toEqual({ module: 'users', action: 'edit' });
    });

    it('login name and HR password reset require users.edit too', () => {
      expect(required('updateLoginName')).toEqual({ module: 'users', action: 'edit' });
      expect(required('resetPassword')).toEqual({ module: 'users', action: 'edit' });
    });
  });

  describe('UpdateUserDto', () => {
    it('accepts the flag and a reason', async () => {
      const dto = plainToInstance(UpdateUserDto, {
        excludedFromHrProcesses: true,
        excludedReason: 'External director',
      });
      expect(await validate(dto)).toEqual([]);
    });

    it('rejects a non-boolean flag and an over-long reason', async () => {
      const dto = plainToInstance(UpdateUserDto, {
        excludedFromHrProcesses: 'yes',
        excludedReason: 'x'.repeat(501),
      });
      const fields = (await validate(dto)).map((error) => error.property).sort();
      expect(fields).toEqual(['excludedFromHrProcesses', 'excludedReason']);
    });
  });

  describe('resolveHrProcessExclusionUpdate', () => {
    const included = { excludedFromHrProcesses: false, excludedReason: null };
    const excluded = { excludedFromHrProcesses: true, excludedReason: 'Board member' };

    it('returns null when neither field is sent or nothing changes', () => {
      expect(resolveHrProcessExclusionUpdate(included, {})).toBeNull();
      expect(
        resolveHrProcessExclusionUpdate(excluded, {
          excludedFromHrProcesses: true,
          excludedReason: ' Board member ',
        }),
      ).toBeNull();
    });

    it('excludes with a trimmed reason', () => {
      expect(
        resolveHrProcessExclusionUpdate(included, {
          excludedFromHrProcesses: true,
          excludedReason: '  External director ',
        }),
      ).toEqual({ excludedFromHrProcesses: true, excludedReason: 'External director' });
    });

    it('including again clears the reason', () => {
      expect(
        resolveHrProcessExclusionUpdate(excluded, { excludedFromHrProcesses: false }),
      ).toEqual(included);
    });

    it('rejects a reason for an account that stays included', () => {
      expect(() =>
        resolveHrProcessExclusionUpdate(included, { excludedReason: 'why' }),
      ).toThrow(BadRequestException);
    });
  });

  describe('UserManagementService.updateUser', () => {
    const companyId = 'company-1';
    const actorId = 'hr-admin-1';
    const targetId = 'user-1';

    let prisma: { user: { findFirst: jest.Mock; update: jest.Mock } };
    let auditService: { create: jest.Mock };
    let service: UserManagementService;

    beforeEach(() => {
      prisma = {
        user: {
          findFirst: jest.fn().mockResolvedValue({
            id: targetId,
            employeeId: 'E-1',
            leavePolicyId: null,
            workScheduleId: null,
            loginName: 'Abebe Kebede',
            excludedFromHrProcesses: false,
            excludedReason: null,
          }),
          update: jest.fn().mockResolvedValue({
            id: targetId,
            firstName: 'Abebe',
            lastName: 'Kebede',
            yearsOfExperience: null,
            yearsOfExperienceAsOf: null,
            bankAccountNumber: null,
            userRoles: [],
          }),
        },
      };
      auditService = { create: jest.fn().mockResolvedValue(undefined) };
      service = new UserManagementService(
        prisma as never,
        {} as never,
        {} as never,
        auditService as never,
        {} as never,
        {} as never,
        {} as never,
        { hasPermission: jest.fn().mockResolvedValue(true) } as never,
      );
    });

    it('saves the flag and writes an audit entry with before / after', async () => {
      await service.updateUser({ companyId, userId: actorId }, targetId, {
        excludedFromHrProcesses: true,
        excludedReason: 'External director',
      });

      expect(prisma.user.update.mock.calls[0][0].data).toMatchObject({
        excludedFromHrProcesses: true,
        excludedReason: 'External director',
      });
      expect(auditService.create).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: actorId,
          companyId,
          module: 'users',
          action: 'HR_PROCESS_EXCLUSION_UPDATED',
          recordType: 'User',
          recordId: targetId,
          beforeValue: { excludedFromHrProcesses: false, excludedReason: null },
          afterValue: {
            excludedFromHrProcesses: true,
            excludedReason: 'External director',
          },
          source: AuditLogSource.USER_ACTION,
        }),
      );
    });

    it('does not touch or audit the flag on an ordinary profile edit', async () => {
      await service.updateUser({ companyId, userId: actorId }, targetId, {
        firstName: 'Abebe',
      });

      const data = prisma.user.update.mock.calls[0][0].data;
      expect(data).not.toHaveProperty('excludedFromHrProcesses');
      expect(data).not.toHaveProperty('excludedReason');
      expect(auditService.create).not.toHaveBeenCalled();
    });
  });
});
