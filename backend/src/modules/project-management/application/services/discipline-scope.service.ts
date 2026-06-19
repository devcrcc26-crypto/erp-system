import { ForbiddenException, Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../shared/prisma/prisma.service';
import { activeOnly } from '../../../../shared/prisma/soft-delete.util';
import { PermissionService } from '../../../../shared/permissions/permission.service';
import { PmContext } from '../types/pm-context.type';

const BYPASS_ROLE_NAMES = new Set([
  'System Administrator',
  'Managing Director',
  'Project Manager',
]);

/** Discipline assignee columns used for responsibility scoping. */
const ASSIGNEE_OR = (userId: string) => [
  { designerUserId: userId },
  { ownerUserId: userId },
  { reviewerUserId: userId },
  { disciplineLeadUserId: userId },
  { chiefUserId: userId },
];

/**
 * Enforces discipline-level responsibility scoping for reads and navigation.
 * PM / admin roles bypass per product rules.
 */
@Injectable()
export class DisciplineScopeService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly permissionService: PermissionService,
  ) {}

  /**
   * Returns true when the user has company-wide discipline visibility.
   */
  async hasDisciplineScopeBypass(
    ctx: PmContext,
    projectId?: string,
  ): Promise<boolean> {
    const roleNames = await this.permissionService.getUserRoleNames(
      ctx.userId,
      ctx.companyId,
    );
    if (roleNames.some((name) => BYPASS_ROLE_NAMES.has(name))) {
      return true;
    }

    if (projectId !== undefined) {
      const project = await this.prisma.project.findFirst({
        where: activeOnly({ id: projectId, companyId: ctx.companyId }),
        select: { projectManagerId: true },
      });
      if (project?.projectManagerId === ctx.userId) {
        return true;
      }
    }

    return false;
  }

  /**
   * Task discipline IDs the user is assigned on within a project.
   */
  async getAssignedDisciplineIds(
    ctx: PmContext,
    projectId: string,
  ): Promise<string[]> {
    const rows = await this.prisma.taskDiscipline.findMany({
      where: activeOnly({
        companyId: ctx.companyId,
        task: { projectId, deletedAt: null },
        OR: ASSIGNEE_OR(ctx.userId),
      }),
      select: { id: true },
    });
    return rows.map((row) => row.id);
  }

  /**
   * Project IDs where the user has at least one discipline assignment.
   */
  async getAssignedProjectIds(ctx: PmContext): Promise<string[]> {
    const rows = await this.prisma.taskDiscipline.findMany({
      where: activeOnly({
        companyId: ctx.companyId,
        OR: ASSIGNEE_OR(ctx.userId),
      }),
      select: { task: { select: { projectId: true } } },
      distinct: ['taskId'],
    });
    return [...new Set(rows.map((row) => row.task.projectId))];
  }

  /**
   * Throws 403 when user cannot access the discipline (non-bypass).
   */
  async assertDisciplineAccess(
    ctx: PmContext,
    projectId: string,
    taskDisciplineId: string,
  ): Promise<void> {
    if (await this.hasDisciplineScopeBypass(ctx, projectId)) {
      return;
    }

    const row = await this.prisma.taskDiscipline.findFirst({
      where: activeOnly({
        id: taskDisciplineId,
        companyId: ctx.companyId,
        task: { projectId, deletedAt: null },
        OR: ASSIGNEE_OR(ctx.userId),
      }),
      select: { id: true },
    });

    if (!row) {
      throw new ForbiddenException('You are not assigned to this task discipline');
    }
  }

  /**
   * Prisma where fragment limiting disciplines to user assignments.
   */
  async disciplineWhereForUser(
    ctx: PmContext,
    projectId: string,
  ): Promise<{ id?: { in: string[] }; OR?: ReturnType<typeof ASSIGNEE_OR> }> {
    if (await this.hasDisciplineScopeBypass(ctx, projectId)) {
      return {};
    }
    return { OR: ASSIGNEE_OR(ctx.userId) };
  }
}
