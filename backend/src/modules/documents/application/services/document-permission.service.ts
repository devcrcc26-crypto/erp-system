import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { FolderContextType, SubmittalStatus } from '@prisma/client';
import { PermissionService } from '../../../../shared/permissions/permission.service';
import { PrismaService } from '../../../../shared/prisma/prisma.service';
import { activeOnly } from '../../../../shared/prisma/soft-delete.util';

const PM_FOLDER_MODULES: Partial<Record<FolderContextType, string>> = {
  RFI: 'rfis',
  ISSUE: 'issues',
  SUBMITTAL: 'submittals',
  DAILY_LOG: 'daily_logs',
  MEETING: 'meetings',
  CORRESPONDENCE: 'correspondence',
  RISK: 'risks',
  PUNCH_ITEM: 'punch_items',
};

/**
 * Resolves document module access, including schedule-based access for EPC folders.
 */
@Injectable()
export class DocumentPermissionService {
  constructor(
    private readonly permissionService: PermissionService,
    private readonly prisma: PrismaService,
  ) {}

  /**
   * Asserts the user may upload into the target folder.
   */
  async assertCanUpload(
    userId: string,
    companyId: string,
    folderId: string,
  ): Promise<void> {
    if (await this.permissionService.hasPermission(userId, companyId, 'documents', 'create')) {
      return;
    }

    const folder = await this.findFolderOrThrow(folderId, companyId);
    if (await this.hasPmModuleWriteForFolder(userId, companyId, folder.contextType)) {
      return;
    }
    if (await this.hasScheduleWriteForFolder(userId, companyId, folder.contextType)) {
      return;
    }

    if (
      folder.contextType === FolderContextType.TASK_DISCIPLINE &&
      folder.contextId &&
      (await this.isAssignedDisciplineUploader(userId, companyId, folder.contextId))
    ) {
      return;
    }

    if (
      folder.contextType === FolderContextType.SUBMITTAL &&
      folder.contextId &&
      (await this.canUploadSubmittalFolder(userId, companyId, folder.contextId))
    ) {
      return;
    }

    throw new ForbiddenException('Missing permission: documents.create');
  }

  /**
   * True when the user may upload into a TASK_DISCIPLINE folder: discipline-level
   * lead/designer, or any package-chain assignee on an active subtask (designers
   * and review-tier holders who attach markup during approve/return).
   */
  private async isAssignedDisciplineUploader(
    userId: string,
    companyId: string,
    taskDisciplineId: string,
  ): Promise<boolean> {
    const discipline = await this.prisma.taskDiscipline.findFirst({
      where: activeOnly({ id: taskDisciplineId, companyId }),
      select: {
        disciplineLeadUserId: true,
        designerUserId: true,
        supportingDesignerUserId: true,
      },
    });
    if (
      discipline?.disciplineLeadUserId === userId ||
      discipline?.designerUserId === userId ||
      discipline?.supportingDesignerUserId === userId
    ) {
      return true;
    }

    const packageAssignment = await this.prisma.designPackage.findFirst({
      where: activeOnly({
        companyId,
        taskDisciplineId,
        OR: [
          { designerUserId: userId },
          { supportingDesignerUserId: userId },
          { reviewerUserId: userId },
          { disciplinaryLeaderUserId: userId },
          { deptDeputyChiefUserId: userId },
          { instituteChiefUserId: userId },
          { disciplineOwnerUserId: userId },
        ],
      }),
      select: { id: true },
    });
    return packageAssignment !== null;
  }

  /**
   * Asserts the user may list documents in the target folder.
   */
  async assertCanViewFolder(
    userId: string,
    companyId: string,
    folderId: string,
  ): Promise<void> {
    if (await this.permissionService.hasPermission(userId, companyId, 'documents', 'view')) {
      return;
    }

    const folder = await this.findFolderOrThrow(folderId, companyId);
    if (await this.hasPmModuleReadForFolder(userId, companyId, folder.contextType)) {
      return;
    }
    if (await this.hasScheduleReadForFolder(userId, companyId, folder.contextType)) {
      return;
    }
    if (
      folder.contextType === FolderContextType.TASK_DISCIPLINE &&
      folder.contextId &&
      (await this.isAssignedDisciplineViewer(userId, companyId, folder.contextId))
    ) {
      return;
    }

    if (
      folder.contextType === FolderContextType.SUBMITTAL &&
      folder.contextId &&
      (await this.isAssignedSubmittalViewer(userId, companyId, folder.contextId))
    ) {
      return;
    }

    throw new ForbiddenException('Missing permission: documents.view');
  }

  /**
   * Asserts the user may read document metadata and versions.
   */
  async assertCanViewDocument(
    userId: string,
    companyId: string,
    documentId: string,
  ): Promise<void> {
    if (await this.permissionService.hasPermission(userId, companyId, 'documents', 'view')) {
      return;
    }

    const document = await this.prisma.document.findFirst({
      where: activeOnly({ id: documentId, companyId }),
      select: {
        folder: {
          select: { contextType: true, contextId: true },
        },
      },
    });
    if (!document) {
      throw new NotFoundException('Document not found');
    }

    if (
      await this.hasPmModuleReadForFolder(
        userId,
        companyId,
        document.folder.contextType,
      )
    ) {
      return;
    }

    if (
      await this.hasScheduleReadForFolder(
        userId,
        companyId,
        document.folder.contextType,
      )
    ) {
      return;
    }

    if (
      document.folder.contextType === FolderContextType.TASK_DISCIPLINE &&
      document.folder.contextId &&
      (await this.isAssignedDisciplineViewer(
        userId,
        companyId,
        document.folder.contextId,
      ))
    ) {
      return;
    }

    if (
      document.folder.contextType === FolderContextType.SUBMITTAL &&
      document.folder.contextId &&
      (await this.isAssignedSubmittalViewer(
        userId,
        companyId,
        document.folder.contextId,
      ))
    ) {
      return;
    }

    throw new ForbiddenException('Missing permission: documents.view');
  }

  /**
   * Asserts the user may download a specific document version file.
   */
  async assertCanViewDocumentVersion(
    userId: string,
    companyId: string,
    documentVersionId: string,
  ): Promise<void> {
    const version = await this.prisma.documentVersion.findFirst({
      where: {
        id: documentVersionId,
        document: activeOnly({ companyId }),
      },
      select: { documentId: true },
    });
    if (!version) {
      throw new NotFoundException('Document version not found');
    }

    await this.assertCanViewDocument(userId, companyId, version.documentId);
  }

  /**
   * True when the user is assigned on the discipline row or any active
   * subtask under it (designer, supporting, reviewer, or review-tier FKs).
   */
  private async isAssignedDisciplineViewer(
    userId: string,
    companyId: string,
    taskDisciplineId: string,
  ): Promise<boolean> {
    const discipline = await this.prisma.taskDiscipline.findFirst({
      where: activeOnly({ id: taskDisciplineId, companyId }),
      select: {
        disciplineLeadUserId: true,
        designerUserId: true,
        supportingDesignerUserId: true,
        task: { select: { supervisingChiefUserId: true } },
      },
    });
    if (
      discipline?.disciplineLeadUserId === userId ||
      discipline?.designerUserId === userId ||
      discipline?.supportingDesignerUserId === userId ||
      discipline?.task.supervisingChiefUserId === userId
    ) {
      return true;
    }

    const packageAssignment = await this.prisma.designPackage.findFirst({
      where: activeOnly({
        companyId,
        taskDisciplineId,
        OR: [
          { designerUserId: userId },
          { supportingDesignerUserId: userId },
          { reviewerUserId: userId },
          { disciplinaryLeaderUserId: userId },
          { deptDeputyChiefUserId: userId },
          { instituteChiefUserId: userId },
          { disciplineOwnerUserId: userId },
        ],
      }),
      select: { id: true },
    });
    return packageAssignment !== null;
  }

  /**
   * Submittal attachment folders: creator, assignee, discipline lead, or TD lead.
   */
  private async isAssignedSubmittalViewer(
    userId: string,
    companyId: string,
    submittalId: string,
  ): Promise<boolean> {
    const submittal = await this.prisma.submittal.findFirst({
      where: activeOnly({
        id: submittalId,
        project: activeOnly({ companyId }),
      }),
      select: {
        submittedBy: true,
        assignedTo: true,
        reviewedBy: true,
        taskDiscipline: {
          select: { disciplineLeadUserId: true },
        },
      },
    });
    if (!submittal) {
      return false;
    }

    if (
      submittal.submittedBy === userId ||
      submittal.assignedTo === userId ||
      submittal.reviewedBy === userId
    ) {
      return true;
    }

    return submittal.taskDiscipline?.disciplineLeadUserId === userId;
  }

  /**
   * Submittal folder uploads: submitter only while draft or revise-and-resubmit.
   */
  private async canUploadSubmittalFolder(
    userId: string,
    companyId: string,
    submittalId: string,
  ): Promise<boolean> {
    const submittal = await this.prisma.submittal.findFirst({
      where: activeOnly({
        id: submittalId,
        project: activeOnly({ companyId }),
      }),
      select: {
        submittedBy: true,
        status: true,
      },
    });
    if (!submittal || submittal.submittedBy !== userId) {
      return false;
    }

    return (
      submittal.status === SubmittalStatus.DRAFT ||
      submittal.status === SubmittalStatus.REVISE_AND_RESUBMIT
    );
  }

  private async hasPmModuleWriteForFolder(
    userId: string,
    companyId: string,
    contextType: FolderContextType,
  ): Promise<boolean> {
    const module = PM_FOLDER_MODULES[contextType];
    if (!module) {
      return false;
    }

    const [canCreate, canEdit] = await Promise.all([
      this.permissionService.hasPermission(userId, companyId, module, 'create'),
      this.permissionService.hasPermission(userId, companyId, module, 'edit'),
    ]);
    return canCreate || canEdit;
  }

  private async hasPmModuleReadForFolder(
    userId: string,
    companyId: string,
    contextType: FolderContextType,
  ): Promise<boolean> {
    const module = PM_FOLDER_MODULES[contextType];
    if (!module) {
      return false;
    }

    const [canView, canCreate, canEdit] = await Promise.all([
      this.permissionService.hasPermission(userId, companyId, module, 'view'),
      this.permissionService.hasPermission(userId, companyId, module, 'create'),
      this.permissionService.hasPermission(userId, companyId, module, 'edit'),
    ]);
    return canView || canCreate || canEdit;
  }

  private async hasScheduleWriteForFolder(
    userId: string,
    companyId: string,
    contextType: FolderContextType,
  ): Promise<boolean> {
    if (!this.isProjectScopedFolder(contextType)) {
      return false;
    }

    const [canCreate, canEdit] = await Promise.all([
      this.permissionService.hasPermission(userId, companyId, 'schedule', 'create'),
      this.permissionService.hasPermission(userId, companyId, 'schedule', 'edit'),
    ]);
    return canCreate || canEdit;
  }

  private async hasScheduleReadForFolder(
    userId: string,
    companyId: string,
    contextType: FolderContextType,
  ): Promise<boolean> {
    if (!this.isProjectScopedFolder(contextType)) {
      return false;
    }

    const [canView, canApprove] = await Promise.all([
      this.permissionService.hasPermission(userId, companyId, 'schedule', 'view'),
      this.permissionService.hasPermission(userId, companyId, 'schedule', 'approve'),
    ]);
    return canView || canApprove;
  }

  private isProjectScopedFolder(contextType: FolderContextType): boolean {
    return (
      contextType === FolderContextType.PROJECT ||
      contextType === FolderContextType.TASK_DISCIPLINE
    );
  }

  private async findFolderOrThrow(
    folderId: string,
    companyId: string,
  ): Promise<{ contextType: FolderContextType; contextId: string | null }> {
    const folder = await this.prisma.documentFolder.findFirst({
      where: activeOnly({ id: folderId, companyId }),
      select: { contextType: true, contextId: true },
    });
    if (!folder) {
      throw new NotFoundException('Folder not found');
    }
    return folder;
  }
}
