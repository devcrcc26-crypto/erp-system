import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Project } from '@prisma/client';
import { PrismaService } from '../../../../shared/prisma/prisma.service';
import { activeOnly } from '../../../../shared/prisma/soft-delete.util';
import { PermissionService } from '../../../../shared/permissions/permission.service';
import { isSystemAdministrator } from '../../../../shared/permissions/system-admin.util';
import {
  canAccessModule,
  PmModuleKey,
} from '../../domain/project-modules.const';
import { PmContext } from '../types/pm-context.type';

@Injectable()
export class ProjectScopeService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly permissionService: PermissionService,
  ) {}

  /**
   * Loads an active project scoped to the caller's company or throws 404.
   */
  async getProjectOrThrow(ctx: PmContext, projectId: string): Promise<Project> {
    const project = await this.prisma.project.findFirst({
      where: activeOnly({ id: projectId, companyId: ctx.companyId }),
    });
    if (!project) {
      throw new NotFoundException('Project not found');
    }

    if (await this.hasSystemAdministratorBypass(ctx)) {
      return project;
    }

    const teamMembership = await this.prisma.projectTeam.findFirst({
      where: activeOnly({ projectId, userId: ctx.userId }),
      select: { id: true },
    });
    if (!teamMembership) {
      throw new NotFoundException('Project not found');
    }

    return project;
  }

  /**
   * Asserts the caller's project team membership allows access to a PM module.
   */
  async assertModuleAccess(
    ctx: PmContext,
    projectId: string,
    module: PmModuleKey,
  ): Promise<void> {
    if (await this.hasSystemAdministratorBypass(ctx)) {
      return;
    }

    const membership = await this.prisma.projectTeam.findFirst({
      where: activeOnly({
        projectId,
        userId: ctx.userId,
      }),
      select: { visibleModules: true },
    });

    if (!membership) {
      throw new NotFoundException('Project not found');
    }

    if (!canAccessModule(membership.visibleModules, module)) {
      throw new ForbiddenException(
        `You do not have access to the ${module} module on this project.`,
      );
    }
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

  private async hasSystemAdministratorBypass(ctx: PmContext): Promise<boolean> {
    const roleNames = await this.permissionService.getUserRoleNames(
      ctx.userId,
      ctx.companyId,
    );
    return isSystemAdministrator(roleNames);
  }
}
