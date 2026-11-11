import type { PrismaService } from '../prisma/prisma.service';
import { ForbiddenException } from '@nestjs/common';
import type { PermissionService } from '../permissions/permission.service';
import {
  assertPermissionOrSupervisor,
  canViewAnyThroughTeam,
  canViewThroughTeam,
  getSubordinateIds,
  hasDirectReports,
  resolveTeamScopedEmployeeIds,
  teamScopeWhere,
} from './team-scope.util';

const COMPANY = 'company-1';

/** In-memory reports-to tree: id → manager id. */
function fakePrisma(managers: Record<string, string | null>): PrismaService {
  const reportsTo = (filter: unknown): string[] => {
    const where = filter as { reportsToUserId?: string | { in: string[] } };
    const wanted =
      typeof where.reportsToUserId === 'string'
        ? [where.reportsToUserId]
        : (where.reportsToUserId?.in ?? []);
    return Object.keys(managers).filter((id) =>
      wanted.includes(managers[id] ?? ''),
    );
  };
  return {
    user: {
      findMany: async ({ where }: { where: unknown }) =>
        reportsTo(where).map((id) => ({ id })),
      count: async ({ where }: { where: unknown }) => reportsTo(where).length,
    },
    department: { findMany: async () => [] },
    discipline: { findMany: async () => [] },
  } as unknown as PrismaService;
}

// gm ← manager ← lead ← engineer; peer reports to gm too.
const TREE = {
  gm: null,
  manager: 'gm',
  peer: 'gm',
  lead: 'manager',
  engineer: 'lead',
};

describe('team scope', () => {
  const prisma = fakePrisma(TREE);

  it('walks the full subordinate chain, not just direct reports', async () => {
    await expect(getSubordinateIds(prisma, 'manager', COMPANY)).resolves.toEqual([
      'lead',
      'engineer',
    ]);
    const scope = await resolveTeamScopedEmployeeIds(prisma, 'gm', COMPANY);
    expect(scope.sort()).toEqual(['engineer', 'gm', 'lead', 'manager', 'peer']);
  });

  it('reports direct reports only for users someone reports to', async () => {
    await expect(hasDirectReports(prisma, 'lead', COMPANY)).resolves.toBe(true);
    await expect(hasDirectReports(prisma, 'engineer', COMPANY)).resolves.toBe(false);
  });

  it("never shows a report's draft or cancelled record", async () => {
    const view = (status: string, employeeId = 'engineer') =>
      canViewThroughTeam(prisma, 'manager', COMPANY, { employeeId, status });
    await expect(view('SUBMITTED')).resolves.toBe(true);
    await expect(view('DRAFT')).resolves.toBe(false);
    await expect(view('CANCELLED')).resolves.toBe(false);
    // Own records in any status; never someone outside the chain.
    await expect(view('DRAFT', 'manager')).resolves.toBe(true);
    await expect(view('SUBMITTED', 'peer')).resolves.toBe(false);
  });

  it('builds a list filter of own records plus the visible team records', () => {
    expect(teamScopeWhere('manager', ['manager', 'lead', 'engineer'])).toEqual({
      OR: [
        { employeeId: 'manager' },
        {
          employeeId: { in: ['lead', 'engineer'] },
          status: { notIn: ['DRAFT', 'CANCELLED'] },
        },
      ],
    });
    // Narrowing to someone outside the team matches nothing.
    expect(
      teamScopeWhere('manager', ['manager', 'lead'], 'peer', ['CANCELLED']),
    ).toEqual({
      OR: [{ employeeId: { in: [] }, status: { notIn: ['CANCELLED'] } }],
    });
  });

  it('lets a supervisor open a trip where any traveller is in their team', async () => {
    const trip = (status: string) =>
      canViewAnyThroughTeam(prisma, 'lead', COMPANY, {
        employeeIds: ['peer', 'engineer'],
        status,
      });
    await expect(trip('APPROVED')).resolves.toBe(true);
    await expect(trip('DRAFT')).resolves.toBe(false);
    await expect(
      canViewAnyThroughTeam(prisma, 'lead', COMPANY, {
        employeeIds: ['peer', 'lead'],
        status: 'APPROVED',
      }),
    ).resolves.toBe(false);
  });

  it('opens team list routes to module users and supervisors only', async () => {
    const permissions = (granted: boolean) =>
      ({ hasPermission: async () => granted }) as unknown as PermissionService;
    const gate = (userId: string, granted: boolean) =>
      assertPermissionOrSupervisor(permissions(granted), prisma, userId, COMPANY, [
        { module: 'flight', action: 'view' },
      ]);
    await expect(gate('engineer', true)).resolves.toBeUndefined();
    await expect(gate('lead', false)).resolves.toBeUndefined();
    await expect(gate('engineer', false)).rejects.toBeInstanceOf(ForbiddenException);
  });
});
