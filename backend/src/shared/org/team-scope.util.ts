import { ForbiddenException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { PermissionService } from '../permissions/permission.service';
import { PrismaService } from '../prisma/prisma.service';
import { activeOnly } from '../prisma/soft-delete.util';

/**
 * Everyone below `userId` in the reports-to tree: direct reports, their
 * reports, and so on (BFS; cycle-safe). Excludes the user themselves.
 */
export async function getSubordinateIds(
  prisma: PrismaService,
  userId: string,
  companyId: string,
): Promise<string[]> {
  const seen = new Set<string>([userId]);
  const subordinates: string[] = [];
  let frontier = [userId];
  while (frontier.length > 0) {
    const reports = await prisma.user.findMany({
      where: activeOnly({
        companyId,
        isActive: true,
        reportsToUserId: { in: frontier },
      }),
      select: { id: true },
    });
    frontier = [];
    for (const row of reports) {
      if (!seen.has(row.id)) {
        seen.add(row.id);
        subordinates.push(row.id);
        frontier.push(row.id);
      }
    }
  }
  return subordinates;
}

/** True when at least one active user reports directly to `userId`. */
export async function hasDirectReports(
  prisma: PrismaService,
  userId: string,
  companyId: string,
): Promise<boolean> {
  const count = await prisma.user.count({
    where: activeOnly({ companyId, isActive: true, reportsToUserId: userId }),
  });
  return count > 0;
}

/**
 * Employee ids the viewer may see on team-scoped HR lists:
 * self, reports-to descendants, department members (if department leader),
 * and discipline members (if discipline leader).
 */
export async function resolveTeamScopedEmployeeIds(
  prisma: PrismaService,
  userId: string,
  companyId: string,
): Promise<string[]> {
  const [ledDepartments, ledDisciplines] = await Promise.all([
    prisma.department.findMany({
      where: activeOnly({ companyId, leaderUserId: userId }),
      select: { id: true },
    }),
    prisma.discipline.findMany({
      where: activeOnly({ companyId, leaderId: userId }),
      select: { id: true },
    }),
  ]);

  // Department Head / Discipline Lead and any supervisor see the full chain.
  const ids = new Set<string>([
    userId,
    ...(await getSubordinateIds(prisma, userId, companyId)),
  ]);

  const orFilters: Prisma.UserWhereInput[] = [];
  if (ledDepartments.length > 0) {
    orFilters.push({
      departmentId: { in: ledDepartments.map((row) => row.id) },
    });
  }
  if (ledDisciplines.length > 0) {
    orFilters.push({
      engineeringDisciplineId: { in: ledDisciplines.map((row) => row.id) },
    });
  }

  if (orFilters.length > 0) {
    const members = await prisma.user.findMany({
      where: activeOnly({
        companyId,
        isActive: true,
        OR: orFilters,
      }),
      select: { id: true },
    });
    for (const row of members) {
      ids.add(row.id);
    }
  }

  return [...ids];
}

/**
 * True when `employeeId` is in the viewer's team scope (self or reports / led org).
 */
export async function isEmployeeInTeamScope(
  prisma: PrismaService,
  viewerId: string,
  companyId: string,
  employeeId: string,
): Promise<boolean> {
  if (viewerId === employeeId) {
    return true;
  }
  const scoped = await resolveTeamScopedEmployeeIds(prisma, viewerId, companyId);
  return scoped.includes(employeeId);
}

/** Statuses only the owner (and HR) sees: unsent drafts and cancelled requests. */
export const OWNER_ONLY_STATUSES = ['DRAFT', 'CANCELLED'] as const;
type OwnerOnlyStatus = (typeof OWNER_ONLY_STATUSES)[number];

/**
 * Prisma `where` fragment for a team-scoped list: the viewer's own records
 * (any status) plus their team's records except drafts and cancelled ones.
 * `hiddenStatuses` must only name values of the module's status enum (pass
 * `['CANCELLED']` when it has no DRAFT). `employeeId` narrows to one person,
 * only when that person is in scope.
 */
export function teamScopeWhere<S extends OwnerOnlyStatus = OwnerOnlyStatus>(
  viewerId: string,
  teamIds: readonly string[],
  employeeId?: string | null,
  hiddenStatuses: readonly S[] = OWNER_ONLY_STATUSES as unknown as readonly S[],
): {
  OR: Array<
    | { employeeId: string }
    | { employeeId: { in: string[] }; status: { notIn: S[] } }
  >;
} {
  const others = teamIds.filter((id) => id !== viewerId);
  const narrowed = employeeId
    ? others.filter((id) => id === employeeId)
    : others;
  const includeSelf = !employeeId || employeeId === viewerId;
  return {
    OR: [
      ...(includeSelf ? [{ employeeId: viewerId }] : []),
      { employeeId: { in: narrowed }, status: { notIn: [...hiddenStatuses] } },
    ],
  };
}

/**
 * True when the viewer may open `employeeId`'s record through their team
 * scope (never for someone else's draft or cancelled record).
 */
export async function canViewThroughTeam(
  prisma: PrismaService,
  viewerId: string,
  companyId: string,
  record: { employeeId: string; status: string },
): Promise<boolean> {
  if (record.employeeId === viewerId) {
    return true;
  }
  if ((OWNER_ONLY_STATUSES as readonly string[]).includes(record.status)) {
    return false;
  }
  const subordinates = await resolveTeamScopedEmployeeIds(prisma, viewerId, companyId);
  return subordinates.includes(record.employeeId);
}

/**
 * Like `canViewThroughTeam` for records that involve several people (flight
 * and business-trip passengers, submitter): true when any of them other than
 * the viewer is in the viewer's team and the record is not a draft or
 * cancelled.
 */
export async function canViewAnyThroughTeam(
  prisma: PrismaService,
  viewerId: string,
  companyId: string,
  record: { employeeIds: readonly string[]; status: string },
): Promise<boolean> {
  if ((OWNER_ONLY_STATUSES as readonly string[]).includes(record.status)) {
    return false;
  }
  const others = record.employeeIds.filter((id) => id !== viewerId);
  if (others.length === 0) {
    return false;
  }
  const team = await resolveTeamScopedEmployeeIds(prisma, viewerId, companyId);
  return others.some((id) => team.includes(id));
}

/** The viewer's team without the viewer (empty for non-supervisors). */
export async function resolveTeamMemberIds(
  prisma: PrismaService,
  viewerId: string,
  companyId: string,
): Promise<string[]> {
  const team = await resolveTeamScopedEmployeeIds(prisma, viewerId, companyId);
  return team.filter((id) => id !== viewerId);
}

/**
 * Route gate for team lists: any of `permissions`, or the caller supervises
 * someone. Use with `@DelegatePermissionCheck()`; the service still scopes
 * the rows (own + team for non-managers).
 */
export async function assertPermissionOrSupervisor(
  permissionService: PermissionService,
  prisma: PrismaService,
  userId: string,
  companyId: string,
  permissions: ReadonlyArray<{
    module: string;
    action: Parameters<PermissionService['hasPermission']>[3];
  }>,
): Promise<void> {
  for (const { module, action } of permissions) {
    if (await permissionService.hasPermission(userId, companyId, module, action)) {
      return;
    }
  }
  if (await hasDirectReports(prisma, userId, companyId)) {
    return;
  }
  throw new ForbiddenException('Missing permission for this list');
}
