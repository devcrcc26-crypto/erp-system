import { SessionCapabilitiesService } from './session-capabilities.service';

type Flags = {
  canView: boolean;
  canCreate: boolean;
  canEdit: boolean;
  canDelete: boolean;
  canApprove: boolean;
  canExport: boolean;
};

const NONE: Flags = {
  canView: false,
  canCreate: false,
  canEdit: false,
  canDelete: false,
  canApprove: false,
  canExport: false,
};

/** Prisma stand-in: every model call resolves to an empty result. */
const emptyPrisma = new Proxy(
  {},
  {
    get: () =>
      new Proxy(
        {},
        {
          get: (_m, method: string) => async () =>
            method === 'count' ? 0 : method.startsWith('findMany') ? [] : null,
        },
      ),
  },
);

function serviceWith(grants: Record<string, Partial<Flags>>): SessionCapabilitiesService {
  const permissionService = {
    getUserRoleNames: jest.fn().mockResolvedValue(['Managing Director']),
    getUserModulePermissionsMap: jest.fn(
      async (_userId: string, _companyId: string, modules: string[]) =>
        Object.fromEntries(
          modules.map((module) => [module, { ...NONE, ...(grants[module] ?? {}) }]),
        ),
    ),
  };
  return new SessionCapabilitiesService(
    permissionService as never,
    emptyPrisma as never,
    { isEnabled: jest.fn().mockResolvedValue(false) } as never,
  );
}

describe('SessionCapabilitiesService - payroll oversight (Managing Director)', () => {
  it('payroll-oversight.view opens payroll read-only: no create/edit/approve/export', async () => {
    const caps = await serviceWith({
      payroll: { canView: true },
      'payroll-oversight': { canView: true },
      users: { canView: true },
    }).resolve('md-1', 'company-1');

    expect(caps.canAccessPayroll).toBe(true);
    expect(caps.canCreatePayroll).toBe(false);
    expect(caps.canEditPayroll).toBe(false);
    expect(caps.canApprovePayroll).toBe(false);
    expect(caps.canExportPayroll).toBe(false);
    expect(caps.canManageUsers).toBe(true);
    expect(caps.canCreateUsers).toBe(false);
    expect(caps.canEditUsers).toBe(false);
  });

  it('payroll.view alone (own payslips) does not open the payroll runs', async () => {
    const caps = await serviceWith({ payroll: { canView: true } }).resolve(
      'employee-1',
      'company-1',
    );
    expect(caps.canAccessPayroll).toBe(false);
  });
});
