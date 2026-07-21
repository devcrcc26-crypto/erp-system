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
   * Resolves discipline folder by ID - throws if missing.
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

  /**
   * Returns or creates the attachment folder for an RFI under the project folder.
   */
  async ensureRfiFolder(
    ctx: PmContext,
    projectId: string,
    rfiId: string,
    rfiNumber: string,
  ): Promise<DocumentFolderRef> {
    return this.ensureEntityFolder(
      ctx,
      projectId,
      FolderContextType.RFI,
      rfiId,
      `rfis/${this.toFolderSegment(rfiNumber)}`,
      this.toFolderSegment(rfiNumber),
    );
  }

  /**
   * Returns or creates the attachment folder for an issue under the project folder.
   */
  async ensureIssueFolder(
    ctx: PmContext,
    projectId: string,
    issueId: string,
    issueNumber: string,
  ): Promise<DocumentFolderRef> {
    return this.ensureEntityFolder(
      ctx,
      projectId,
      FolderContextType.ISSUE,
      issueId,
      `issues/${this.toFolderSegment(issueNumber)}`,
      this.toFolderSegment(issueNumber),
    );
  }

  /**
   * Returns or creates the attachment folder for a submittal under the project folder.
   */
  async ensureSubmittalFolder(
    ctx: PmContext,
    projectId: string,
    submittalId: string,
    submittalNumber: string,
  ): Promise<DocumentFolderRef> {
    return this.ensureEntityFolder(
      ctx,
      projectId,
      FolderContextType.SUBMITTAL,
      submittalId,
      `submittals/${this.toFolderSegment(submittalNumber)}`,
      this.toFolderSegment(submittalNumber),
    );
  }

  /**
   * Returns or creates the attachment folder for a change request under the project folder.
   */
  async ensureChangeRequestFolder(
    ctx: PmContext,
    projectId: string,
    changeRequestId: string,
    changeNumber: string,
  ): Promise<DocumentFolderRef> {
    return this.ensureEntityFolder(
      ctx,
      projectId,
      FolderContextType.CHANGE_REQUEST,
      changeRequestId,
      `change-requests/${this.toFolderSegment(changeNumber)}`,
      this.toFolderSegment(changeNumber),
    );
  }

  /**
   * Returns or creates the attachment folder for a daily log under the project folder.
   */
  async ensureDailyLogFolder(
    ctx: PmContext,
    projectId: string,
    dailyLogId: string,
    logDate: string,
  ): Promise<DocumentFolderRef> {
    const dateSegment = this.toFolderSegment(logDate);
    const uniqueSegment = `${dateSegment}-${dailyLogId.slice(0, 8)}`;
    return this.ensureEntityFolder(
      ctx,
      projectId,
      FolderContextType.DAILY_LOG,
      dailyLogId,
      `daily-logs/${uniqueSegment}`,
      dateSegment,
    );
  }

  /**
   * Returns or creates the attachment folder for a meeting under the project folder.
   */
  async ensureMeetingFolder(
    ctx: PmContext,
    projectId: string,
    meetingId: string,
    meetingNumber: string,
  ): Promise<DocumentFolderRef> {
    const segment = this.toFolderSegment(meetingNumber);
    return this.ensureEntityFolder(
      ctx,
      projectId,
      FolderContextType.MEETING,
      meetingId,
      `meetings/${segment}`,
      segment,
    );
  }

  /**
   * Returns or creates the attachment folder for correspondence under the project folder.
   */
  async ensureCorrespondenceFolder(
    ctx: PmContext,
    projectId: string,
    correspondenceId: string,
    referenceNumber: string,
  ): Promise<DocumentFolderRef> {
    const segment = this.toFolderSegment(referenceNumber);
    return this.ensureEntityFolder(
      ctx,
      projectId,
      FolderContextType.CORRESPONDENCE,
      correspondenceId,
      `correspondence/${segment}`,
      segment,
    );
  }

  /**
   * Returns or creates the attachment folder for a risk under the project folder.
   */
  async ensureRiskFolder(
    ctx: PmContext,
    projectId: string,
    riskId: string,
    riskIdCode: string,
  ): Promise<DocumentFolderRef> {
    const segment = this.toFolderSegment(riskIdCode);
    const uniqueSegment = `${segment}-${riskId.slice(0, 8)}`;
    return this.ensureEntityFolder(
      ctx,
      projectId,
      FolderContextType.RISK,
      riskId,
      `risks/${uniqueSegment}`,
      segment,
    );
  }

  /**
   * Returns or creates the attachment folder for a punch item under the project folder.
   */
  async ensurePunchItemFolder(
    ctx: PmContext,
    projectId: string,
    punchItemId: string,
    punchNumber: string,
  ): Promise<DocumentFolderRef> {
    const segment = this.toFolderSegment(punchNumber);
    return this.ensureEntityFolder(
      ctx,
      projectId,
      FolderContextType.PUNCH_ITEM,
      punchItemId,
      `punch-items/${segment}`,
      segment,
    );
  }

  /**
   * Resolves an entity attachment folder by context, if it exists.
   */
  async findEntityFolder(
    ctx: PmContext,
    contextType: FolderContextType,
    contextId: string,
  ): Promise<DocumentFolderRef | null> {
    return this.prisma.documentFolder.findFirst({
      where: activeOnly({
        companyId: ctx.companyId,
        contextType,
        contextId,
      }),
      select: { id: true, path: true },
    });
  }

  private async ensureEntityFolder(
    ctx: PmContext,
    projectId: string,
    contextType: FolderContextType,
    contextId: string,
    relativePath: string,
    folderName: string,
  ): Promise<DocumentFolderRef> {
    const existing = await this.findEntityFolder(ctx, contextType, contextId);
    if (existing) {
      return existing;
    }

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
    const path = `${projectFolder.path}/${relativePath}`;

    return this.prisma.documentFolder.create({
      data: {
        companyId: ctx.companyId,
        parentId: projectFolder.id,
        name: folderName,
        path,
        contextType,
        contextId,
        isSystem: true,
        createdBy: ctx.userId,
        updatedBy: ctx.userId,
      },
      select: { id: true, path: true },
    });
  }

  private toFolderSegment(value: string): string {
    const trimmed = value.trim();
    if (!trimmed) {
      return 'untitled';
    }
    return trimmed.replace(/[/\\]+/g, '-');
  }
}
