import { describe, expect, it, jest } from '@jest/globals';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import type { PrismaService } from '../../../../shared/prisma/prisma.service';
import type { PermissionService } from '../../../../shared/permissions/permission.service';
import { ApprovalsService } from './approvals.service';

function makeService(prisma: unknown): ApprovalsService {
  const permissionService = {
    getUserRoleNames: async (): Promise<string[]> => ['Employee'],
    getUserModulePermissionsMap: async (
      _userId: string,
      _companyId: string,
      modules: string[],
    ): Promise<Record<string, { canCreate: boolean }>> => {
      const map: Record<string, { canCreate: boolean }> = {};
      for (const module of modules) {
        map[module] = { canCreate: true };
      }
      return map;
    },
    hasPermission: async (): Promise<boolean> => true,
  };
  return new ApprovalsService(
    prisma as PrismaService,
    {} as never,
    {} as never,
    {} as never,
    permissionService as unknown as PermissionService,
    {} as never,
    {} as never,
  );
}

describe('ApprovalsService — isUserRequestable', () => {
  it('lists only user-requestable categories the user may create', async () => {
    const findMany = jest.fn(async () => [
      {
        code: 'LEAVE_REQUEST',
        permissionModule: 'leave',
        isUserRequestable: true,
      },
    ]);
    const service = makeService({
      approvalCategory: { findMany },
      perDiemRequest: { count: async () => 0 },
    });

    const rows = await service.getCategories('company-1', 'user-1');
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          companyId: 'company-1',
          isActive: true,
          isUserRequestable: true,
        }),
      }),
    );
    expect(rows).toEqual([
      expect.objectContaining({ code: 'LEAVE_REQUEST' }),
    ]);
  });

  it('rejects submit for a non-requestable category with 400', async () => {
    const service = makeService({
      approvalCategory: {
        findFirst: async () => ({
          id: 'cat-1',
          code: 'PAYROLL_RUN',
          isActive: true,
          isUserRequestable: false,
          permissionModule: 'payroll',
          numberPrefix: 'PR',
          approvalRules: [],
        }),
      },
    });

    await expect(
      service.submitRequest(
        {
          categoryCode: 'PAYROLL_RUN',
          title: 'September payroll',
          formData: { month: 9, year: 2026 },
        },
        'company-1',
        'user-1',
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('returns 404 when the category is missing', async () => {
    const service = makeService({
      approvalCategory: {
        findFirst: async () => null,
      },
    });

    await expect(
      service.submitRequest(
        {
          categoryCode: 'MISSING',
          title: 'x',
          formData: {},
        },
        'company-1',
        'user-1',
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
