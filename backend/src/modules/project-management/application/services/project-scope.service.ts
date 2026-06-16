import { Injectable, NotFoundException } from '@nestjs/common';
import { Project } from '@prisma/client';
import { PrismaService } from '../../../../shared/prisma/prisma.service';
import { activeOnly } from '../../../../shared/prisma/soft-delete.util';
import { PmContext } from '../types/pm-context.type';

@Injectable()
export class ProjectScopeService {
  constructor(private readonly prisma: PrismaService) {}

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
    return project;
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
