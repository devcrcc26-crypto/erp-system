import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../shared/prisma/prisma.service';
import { activeOnly } from '../../../../shared/prisma/soft-delete.util';
import { disciplineAssigneeOr } from '../../domain/task-access-scope.util';
import { PmContext } from '../types/pm-context.type';
import { TaskAccessScopeService } from './task-access-scope.service';

/**
 * Enforces discipline-level responsibility scoping for reads and navigation.
 */
@Injectable()
export class DisciplineScopeService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly taskAccessScopeService: TaskAccessScopeService,
  ) {}

  /**
   * Returns true when the user has company-wide discipline visibility.
   */
  async hasDisciplineScopeBypass(
    ctx: PmContext,
    projectId?: string,
  ): Promise<boolean> {
    const profile = await this.taskAccessScopeService.resolveProfile(ctx);
    if (profile.hasFullProjectAccess) {
      return true;
    }

    if (projectId !== undefined) {
      const project = await this.prisma.project.findFirst({
        where: activeOnly({ id: projectId, companyId: ctx.companyId }),
        select: { responsiblePersonId: true },
      });
      if (project?.responsiblePersonId === ctx.userId) {
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
        OR: disciplineAssigneeOr(ctx.userId),
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
        OR: disciplineAssigneeOr(ctx.userId),
      }),
      select: { task: { select: { projectId: true } } },
      distinct: ['taskId'],
    });
    return [...new Set(rows.map((row) => row.task.projectId))];
  }

  /**
   * Throws 404 when user cannot access the discipline.
   */
  async assertDisciplineAccess(
    ctx: PmContext,
    projectId: string,
    taskDisciplineId: string,
  ): Promise<void> {
    if (await this.hasDisciplineScopeBypass(ctx, projectId)) {
      return;
    }

    await this.taskAccessScopeService.assertDisciplineReadable(
      ctx,
      projectId,
      taskDisciplineId,
    );
  }

  /**
   * Prisma where fragment limiting disciplines to user assignments.
   */
  async disciplineWhereForUser(
    ctx: PmContext,
    projectId: string,
  ): Promise<{ OR?: ReturnType<typeof disciplineAssigneeOr> }> {
    if (await this.hasDisciplineScopeBypass(ctx, projectId)) {
      return {};
    }
    return this.taskAccessScopeService.buildDisciplineListWhere(ctx, projectId);
  }
}
