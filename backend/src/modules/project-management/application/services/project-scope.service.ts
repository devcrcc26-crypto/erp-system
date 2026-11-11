import { Injectable, NotFoundException } from '@nestjs/common';
import { Project } from '@prisma/client';
import { PrismaService } from '../../../../shared/prisma/prisma.service';
import { activeOnly } from '../../../../shared/prisma/soft-delete.util';
import { PmModuleKey } from '../../domain/project-modules.const';
import { PmContext } from '../types/pm-context.type';
import { TaskAccessScopeService } from './task-access-scope.service';

@Injectable()
export class ProjectScopeService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly taskAccessScopeService: TaskAccessScopeService,
  ) {}

  /**
   * Loads an active project scoped to the caller's company or throws 404.
   */
  async getProjectOrThrow(ctx: PmContext, projectId: string): Promise<Project> {
    return this.taskAccessScopeService.assertProjectReadable(ctx, projectId);
  }

  /**
   * Asserts the caller may open a PM module on this project.
   * Uses the same visibility as project reads (full access, Project Admin,
   * department leadership, discipline assignee, or subtask role) - never
   * ProjectTeam membership or visibleModules.
   */
  async assertModuleAccess(
    ctx: PmContext,
    projectId: string,
    _module: PmModuleKey,
  ): Promise<void> {
    await this.taskAccessScopeService.assertProjectReadable(ctx, projectId);
  }

  /**
   * Project IDs where the user is an active team member.
   */
  async getTeamProjectIds(ctx: PmContext): Promise<string[]> {
    const rows = await this.prisma.projectTeam.findMany({
      where: activeOnly({
        userId: ctx.userId,
        project: activeOnly({ companyId: ctx.companyId }),
      }),
      select: { projectId: true },
    });

    return [...new Set(rows.map((row) => row.projectId))];
  }

  /**
   * Prisma where fragment enforcing project tenancy for child entities.
   */
  getProjectIdWhere(
    ctx: PmContext,
    projectId: string,
  ): {
    projectId: string;
    project: { companyId: string; deletedAt: null };
  } {
    return {
      projectId,
      project: { companyId: ctx.companyId, deletedAt: null },
    };
  }
}
