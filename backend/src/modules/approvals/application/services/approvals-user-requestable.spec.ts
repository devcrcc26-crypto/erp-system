import { describe, expect, it, jest } from '@jest/globals';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import type { PrismaService } from '../../../../shared/prisma/prisma.service';
import type { PermissionService } from '../../../../shared/permissions/permission.service';
import { ApprovalsService } from './approvals.service';

function makeService(prisma: unknown, hasPermission = true): ApprovalsService {
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
    hasPermission: async (): Promise<boolean> => hasPermission,
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

/** Prisma mocks for the who-may-file checks (user, reports, role, policy). */
function filingMocks(options: {
  directReports?: number;
  primaryRole?: string;
  excludedFromHrProcesses?: boolean;
} = {}): Record<string, unknown> {
  return {
    user: {
      findFirst: async () => ({
        excludedFromHrProcesses: options.excludedFromHrProcesses ?? false,
      }),
      count: async () => options.directReports ?? 0,
    },
    userRole: {
      findFirst: async () => ({
        role: { name: options.primaryRole ?? 'Employee' },
      }),
    },
    policySetting: { findMany: async () => [] },
  };
}

const NEW_REQUEST_CODES = [
  'LEAVE_REQUEST',
  'PURCHASE_REQUEST',
  'SITE_ASSIGNMENT',
  'WORK_FROM_HOME',
  'FLIGHT_APPLICATION',
  'BUSINESS_TRIP',
];

async function visibleCodes(
  filing: Parameters<typeof filingMocks>[0],
  hasPermission = false,
): Promise<string[]> {
  const service = makeService(
    {
      approvalCategory: {
        findMany: async () =>
          NEW_REQUEST_CODES.map((code) => ({ code, isUserRequestable: true })),
      },
      perDiemRequest: { count: async () => 0 },
      ...filingMocks(filing),
    },
    hasPermission,
  );
  const rows = (await service.getCategories('company-1', 'user-1')) as Array<{
    code: string;
  }>;
  return rows.map((row) => row.code);
}

describe('ApprovalsService - New Request lists only what the user can file', () => {
  it('hides purchase requests and site assignments from a normal employee', async () => {
    expect(await visibleCodes({})).toEqual([
      'LEAVE_REQUEST',
      'WORK_FROM_HOME',
      'FLIGHT_APPLICATION',
      'BUSINESS_TRIP',
    ]);
  });

  it('shows site assignments to a supervisor with direct reports', async () => {
    expect(await visibleCodes({ directReports: 2 })).toContain('SITE_ASSIGNMENT');
  });

  it('shows purchase requests to HR Manager and above', async () => {
    expect(await visibleCodes({ primaryRole: 'HR Manager' })).toContain(
      'PURCHASE_REQUEST',
    );
  });

  it('hides work from home when the employee is excluded from HR processes', async () => {
    expect(await visibleCodes({ excludedFromHrProcesses: true })).not.toContain(
      'WORK_FROM_HOME',
    );
  });
});

describe('ApprovalsService - isUserRequestable', () => {
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
      ...filingMocks(),
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
