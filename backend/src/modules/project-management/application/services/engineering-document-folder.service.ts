import { Injectable, NotFoundException } from '@nestjs/common';
import { FolderContextType } from '@prisma/client';
import { PrismaService } from '../../../../shared/prisma/prisma.service';
import { activeOnly } from '../../../../shared/prisma/soft-delete.util';
import { PmContext } from '../../application/types/pm-context.type';

export interface DocumentFolderRef {
  id: string;
  path: string;
}

@Injectable()
export class EngineeringDocumentFolderService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Returns or creates the root project document folder.
   */
  async ensureProjectFolder(
    ctx: PmContext,
    projectId: string,
    projectCode: string,
    projectName: string,
  ): Promise<DocumentFolderRef> {
    const existing = await this.prisma.documentFolder.findFirst({
      where: activeOnly({
        companyId: ctx.companyId,
        contextType: FolderContextType.PROJECT,
        contextId: projectId,
      }),
      select: { id: true, path: true },
    });

    if (existing) {
      return existing;
    }

    const folderLabel = this.toFolderSegment(projectCode || projectName);
    const path = `/projects/${folderLabel}`;

    return this.prisma.documentFolder.create({
      data: {
        companyId: ctx.companyId,
        name: folderLabel,
        path,
        contextType: FolderContextType.PROJECT,
        contextId: projectId,
        isSystem: true,
        createdBy: ctx.userId,
        updatedBy: ctx.userId,
      },
      select: { id: true, path: true },
    });
  }

  /**
   * Returns or creates the discipline folder nested under the project folder.
   */
  async ensureDisciplineFolder(
    ctx: PmContext,
    projectId: string,
    taskDisciplineId: string,
    disciplineName: string,
  ): Promise<DocumentFolderRef> {
    const project = await this.prisma.project.findFirst({
      where: activeOnly({ id: projectId, companyId: ctx.companyId }),
      select: { id: true, projectCode: true, name: true },
    });
    if (!project) {
      throw new NotFoundException('Project not found');
    }

    const projectFolder = await this.ensureProjectFolder(
      ctx,
      project.id,
      project.projectCode,
      project.name,
    );

    const disciplineLabel = this.toFolderSegment(disciplineName);
    const disciplinePath = `${projectFolder.path}/disciplines/${disciplineLabel}`;

    const existing = await this.prisma.documentFolder.findFirst({
      where: activeOnly({
        companyId: ctx.companyId,
        contextType: FolderContextType.TASK_DISCIPLINE,
        contextId: taskDisciplineId,
      }),
      select: { id: true, path: true, parentId: true, name: true },
    });

    if (existing) {
      if (
        existing.parentId !== projectFolder.id ||
        existing.path !== disciplinePath ||
        existing.name !== disciplineLabel
      ) {
        return this.prisma.documentFolder.update({
          where: { id: existing.id },
          data: {
            parentId: projectFolder.id,
            name: disciplineLabel,
            path: disciplinePath,
            updatedBy: ctx.userId,
          },
          select: { id: true, path: true },
        });
      }
      return { id: existing.id, path: existing.path };
    }

    return this.prisma.documentFolder.create({
      data: {
        companyId: ctx.companyId,
        parentId: projectFolder.id,
        name: disciplineLabel,
        path: disciplinePath,
        contextType: FolderContextType.TASK_DISCIPLINE,
        contextId: taskDisciplineId,
        isSystem: true,
        createdBy: ctx.userId,
        updatedBy: ctx.userId,
      },
      select: { id: true, path: true },
    });
  }

  /**
   * Resolves discipline folder by ID — throws if missing.
   */
  async getDisciplineFolderOrThrow(
    ctx: PmContext,
    taskDisciplineId: string,
  ): Promise<DocumentFolderRef> {
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

  private toFolderSegment(value: string): string {
    const trimmed = value.trim();
    if (!trimmed) {
      return 'untitled';
    }
    return trimmed.replace(/[/\\]+/g, '-');
  }
}
