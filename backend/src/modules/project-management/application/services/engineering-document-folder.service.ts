import { Injectable, NotFoundException } from '@nestjs/common';
import { FolderContextType } from '@prisma/client';
import { PrismaService } from '../../../../shared/prisma/prisma.service';
import { activeOnly } from '../../../../shared/prisma/soft-delete.util';
import { PmContext } from '../../application/types/pm-context.type';

@Injectable()
export class EngineeringDocumentFolderService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Returns or creates the discipline storage folder for engineering file uploads.
   */
  async ensureDisciplineFolder(
    ctx: PmContext,
    taskDisciplineId: string,
    disciplineName: string,
  ): Promise<{ id: string; path: string }> {
    const existing = await this.prisma.documentFolder.findFirst({
      where: activeOnly({
        companyId: ctx.companyId,
        contextType: FolderContextType.TASK_DISCIPLINE,
        contextId: taskDisciplineId,
      }),
      select: { id: true, path: true },
    });

    if (existing) {
      return existing;
    }

    const path = `/disciplines/${disciplineName}`;
    const folder = await this.prisma.documentFolder.create({
      data: {
        companyId: ctx.companyId,
        name: disciplineName,
        path,
        contextType: FolderContextType.TASK_DISCIPLINE,
        contextId: taskDisciplineId,
        isSystem: true,
        createdBy: ctx.userId,
        updatedBy: ctx.userId,
      },
      select: { id: true, path: true },
    });

    return folder;
  }

  /**
   * Resolves discipline folder by ID — throws if missing.
   */
  async getDisciplineFolderOrThrow(
    ctx: PmContext,
    taskDisciplineId: string,
  ): Promise<{ id: string; path: string }> {
    const folder = await this.prisma.documentFolder.findFirst({
      where: activeOnly({
        companyId: ctx.companyId,
        contextType: FolderContextType.TASK_DISCIPLINE,
        contextId: taskDisciplineId,
      }),
      select: { id: true, path: true },
    });

    if (!folder) {
      throw new NotFoundException('Discipline folder not found');
    }

    return folder;
  }
}
