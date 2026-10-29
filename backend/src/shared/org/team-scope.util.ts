import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { activeOnly } from '../prisma/soft-delete.util';

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

  const ids = new Set<string>([userId]);

  // Walk the reports-to tree (BFS) so Department Head / Discipline Lead
  // and any supervisor with nested reports see the full chain.
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
      if (!ids.has(row.id)) {
        ids.add(row.id);
        frontier.push(row.id);
      }
    }
  }

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
