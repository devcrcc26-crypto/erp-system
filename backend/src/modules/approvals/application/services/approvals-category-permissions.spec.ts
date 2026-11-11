import { describe, expect, it } from '@jest/globals';
import { ForbiddenException } from '@nestjs/common';
import type { PrismaService } from '../../../../shared/prisma/prisma.service';
import type { PermissionService } from '../../../../shared/permissions/permission.service';
import { ApprovalsService } from './approvals.service';

const CATEGORIES = [
  {
    id: '1',
    code: 'LEAVE_REQUEST',
    permissionModule: 'leave',
    isUserRequestable: true,
    sortOrder: 10,
  },
  {
    id: '2',
    code: 'VEHICLE_REFUELING',
    permissionModule: 'vehicle-refueling',
    isUserRequestable: true,
    sortOrder: 100,
  },
  {
    id: '3',
    code: 'PER_DIEM_SETTLEMENT',
    permissionModule: 'per-diem',
    isUserRequestable: true,
    sortOrder: 76,
  },
];

function makeService(input: {
  categories?: typeof CATEGORIES;
  roleNames?: string[];
  canCreateModules?: string[];
  /** When set, permission checks for userId `filer` use these modules. */
  filerCanCreateModules?: string[];
  filerRoleNames?: string[];
  paidAdvanceCount?: number;
}): ApprovalsService {
  const categories = input.categories ?? CATEGORIES;
  const roleNames = input.roleNames ?? ['Employee'];
  const canCreate = new Set(input.canCreateModules ?? ['leave', 'per-diem']);
  const paidAdvanceCount = input.paidAdvanceCount ?? 0;

  const prisma = {
    approvalCategory: {
      findMany: async (): Promise<typeof CATEGORIES> => categories,
      findFirst: async ({
        where,
      }: {
        where: { code?: string };
      }): Promise<(typeof CATEGORIES)[number] | null> =>
        categories.find((c) => c.code === where.code) ?? null,
    },
    perDiemRequest: {
      count: async (): Promise<number> => paidAdvanceCount,
    },
    // Who-may-file checks (no direct reports, Employee role, default policy).
    user: {
      findFirst: async () => ({ excludedFromHrProcesses: false }),
      count: async (): Promise<number> => 0,
    },
    userRole: {
      findFirst: async () => ({ role: { name: roleNames[0] ?? 'Employee' } }),
    },
    policySetting: { findMany: async () => [] },
  };

  const permissionService = {
    getUserRoleNames: async (userId: string): Promise<string[]> => {
      if (userId === 'filer' && input.filerRoleNames) {
        return input.filerRoleNames;
      }
      if (userId === 'filer' && input.filerCanCreateModules) {
        return input.filerRoleNames ?? ['HR Manager'];
      }
      return roleNames;
    },
    getUserModulePermissionsMap: async (
      _userId: string,
      _companyId: string,
      modules: string[],
    ): Promise<Record<string, { canCreate: boolean }>> => {
      const map: Record<string, { canCreate: boolean }> = {};
      for (const module of modules) {
        map[module] = { canCreate: canCreate.has(module) };
      }
      return map;
    },
    hasPermission: async (
      userId: string,
      _companyId: string,
      module: string,
      action: string,
    ): Promise<boolean> => {
      if (action !== 'create') {
        return false;
      }
      if (userId === 'filer' && input.filerCanCreateModules) {
        return input.filerCanCreateModules.includes(module);
      }
      return canCreate.has(module);
    },
  };

  return new ApprovalsService(
    prisma as unknown as PrismaService,
    {} as never,
    {} as never,
    {} as never,
    permissionService as unknown as PermissionService,
    {} as never,
    {} as never,
  );
}

describe('ApprovalsService - category create permissions', () => {
  it('hides Vehicle Refueling from a regular employee', async () => {
    const service = makeService({
      roleNames: ['Employee'],
      canCreateModules: ['leave', 'per-diem'],
      paidAdvanceCount: 1,
    });
    const rows = (await service.getCategories('c1', 'u1')) as Array<{
      code: string;
    }>;
    expect(rows.map((r) => r.code)).toEqual([
      'LEAVE_REQUEST',
      'PER_DIEM_SETTLEMENT',
    ]);
    expect(rows.map((r) => r.code)).not.toContain('VEHICLE_REFUELING');
  });

  it('shows Vehicle Refueling to a driver', async () => {
    const service = makeService({
      roleNames: ['Driver'],
      canCreateModules: ['leave', 'vehicle-refueling', 'per-diem'],
      paidAdvanceCount: 0,
    });
    const rows = (await service.getCategories('c1', 'u1')) as Array<{
      code: string;
    }>;
    expect(rows.map((r) => r.code)).toContain('VEHICLE_REFUELING');
    expect(rows.map((r) => r.code)).not.toContain('PER_DIEM_SETTLEMENT');
  });

  it('hides Per Diem Settlement without a paid unsettled advance', async () => {
    const service = makeService({
      canCreateModules: ['leave', 'per-diem'],
      paidAdvanceCount: 0,
    });
    const rows = (await service.getCategories('c1', 'u1')) as Array<{
      code: string;
    }>;
    expect(rows.map((r) => r.code)).not.toContain('PER_DIEM_SETTLEMENT');
  });

  it('shows Per Diem Settlement when a paid unsettled advance exists', async () => {
    const service = makeService({
      canCreateModules: ['leave', 'per-diem'],
      paidAdvanceCount: 2,
    });
    const rows = (await service.getCategories('c1', 'u1')) as Array<{
      code: string;
    }>;
    expect(rows.map((r) => r.code)).toContain('PER_DIEM_SETTLEMENT');
  });

  it('lets System Administrator see every requestable category', async () => {
    const service = makeService({
      roleNames: ['System Administrator'],
      canCreateModules: [],
      paidAdvanceCount: 0,
    });
    const rows = (await service.getCategories('c1', 'u1')) as Array<{
      code: string;
    }>;
    expect(rows.map((r) => r.code).sort()).toEqual(
      ['LEAVE_REQUEST', 'PER_DIEM_SETTLEMENT', 'VEHICLE_REFUELING'].sort(),
    );
  });

  it('returns 403 when submitting a category without create permission', async () => {
    const service = makeService({
      roleNames: ['Employee'],
      canCreateModules: ['leave'],
    });
    await expect(
      service.submitRequest(
        {
          categoryCode: 'VEHICLE_REFUELING',
          title: 'Fuel',
          formData: {},
        },
        'c1',
        'u1',
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('checks create permission on the filer for on-behalf submits', async () => {
    // Subject has create; filer does not → must 403 (permission follows the filer).
    const service = makeService({
      roleNames: ['Employee'],
      canCreateModules: ['vehicle-refueling'],
      filerRoleNames: ['Employee'],
      filerCanCreateModules: ['leave'],
    });
    await expect(
      service.submitRequest(
        {
          categoryCode: 'VEHICLE_REFUELING',
          title: 'Fuel',
          formData: {},
        },
        'c1',
        'subject',
        { createdByUserId: 'filer' },
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
});
