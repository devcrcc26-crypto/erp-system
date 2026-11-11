import { SessionCapabilitiesService } from './session-capabilities.service';

type Flags = { canView: boolean; canCreate: boolean; canEdit: boolean; canDelete: boolean };

const NONE: Flags = { canView: false, canCreate: false, canEdit: false, canDelete: false };

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
    getUserRoleNames: jest.fn().mockResolvedValue(['HR Officer']),
    getUserModulePermissionsMap: jest.fn(
      async (_userId: string, _companyId: string, modules: string[]) =>
        Object.fromEntries(
          modules.map((module) => [module, { ...NONE, ...(grants[module] ?? {}) }]),
        ),
    ),
  };
  const pmModuleSettings = {
    isEnabled: jest.fn().mockResolvedValue(false),
  };
  return new SessionCapabilitiesService(
    permissionService as never,
    emptyPrisma as never,
    pmModuleSettings as never,
  );
}

describe('SessionCapabilitiesService - canEditUsers', () => {
  it('is true only with users.edit (the permission PATCH /users/:id checks)', async () => {
    const caps = await serviceWith({
      users: { canView: true, canEdit: true },
      hr: { canView: true },
    }).resolve('user-1', 'company-1');
    expect(caps.canEditUsers).toBe(true);
  });

  it('is false for hr.view (and users.view) without users.edit', async () => {
    const caps = await serviceWith({
      users: { canView: true },
      hr: { canView: true, canEdit: true },
    }).resolve('user-1', 'company-1');
    expect(caps.canViewHr).toBe(true);
    expect(caps.canManageUsers).toBe(true);
    expect(caps.canEditUsers).toBe(false);
  });
});
