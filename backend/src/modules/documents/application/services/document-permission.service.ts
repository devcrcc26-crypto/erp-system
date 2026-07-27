import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { FolderContextType } from '@prisma/client';
import { PermissionService } from '../../../../shared/permissions/permission.service';
import { hasFullProjectDataAccess } from '../../../../shared/permissions/project-admin.util';
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
  CHANGE_REQUEST: 'change_requests',
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
    roleNames?: readonly string[],
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
      (await this.canUploadSubmittalFolder(userId, companyId, folder, roleNames))
    ) {
      return;
    }

    if (
      folder.contextType === FolderContextType.CHANGE_REQUEST &&
      folder.contextId &&
      (await this.canUploadCrFolder(userId, companyId, folder, roleNames))
    ) {
      return;
    }

    if (
      folder.contextType === FolderContextType.RFI &&
      folder.contextId &&
      (await this.canUploadRfiFolder(userId, companyId, folder, roleNames))
    ) {
      return;
    }

    if (
      folder.contextType === FolderContextType.ISSUE &&
      folder.contextId &&
      (await this.canUploadIssueFolder(userId, companyId, folder, roleNames))
    ) {
      return;
    }

    if (
      folder.contextType === FolderContextType.DAILY_LOG &&
      folder.contextId &&
      (await this.canUploadDailyLogFolder(userId, companyId, folder, roleNames))
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
    roleNames?: readonly string[],
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
      (await this.canAccessSubmittalFolder(userId, companyId, folder.contextId, roleNames))
    ) {
      return;
    }

    if (
      folder.contextType === FolderContextType.CHANGE_REQUEST &&
      folder.contextId &&
      (await this.canUploadCrFolder(userId, companyId, folder, roleNames))
    ) {
      return;
    }

    if (
      folder.contextType === FolderContextType.DAILY_LOG &&
      folder.contextId &&
      (await this.canUploadDailyLogFolder(userId, companyId, folder, roleNames))
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
    roleNames?: readonly string[],
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
      (await this.canAccessSubmittalFolder(
        userId,
        companyId,
        document.folder.contextId,
        roleNames,
      ))
    ) {
      return;
    }

    if (
      document.folder.contextType === FolderContextType.CHANGE_REQUEST &&
      document.folder.contextId &&
      (await this.canUploadCrFolder(
        userId,
        companyId,
        document.folder,
        roleNames,
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
    roleNames?: readonly string[],
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

    await this.assertCanViewDocument(
      userId,
      companyId,
      version.documentId,
      roleNames,
    );
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
   * Submittal attachment folders: participants and project-admin-class roles.
   */
  private async canAccessSubmittalFolder(
    userId: string,
    companyId: string,
    submittalId: string,
    roleNames?: readonly string[],
  ): Promise<boolean> {
    const resolvedRoles =
      roleNames ??
      (await this.permissionService.getUserRoleNames(userId, companyId));
    if (hasFullProjectDataAccess(resolvedRoles)) {
      return true;
    }

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

    return (
      submittal.submittedBy === userId ||
      submittal.assignedTo === userId ||
      submittal.reviewedBy === userId ||
      submittal.taskDiscipline?.disciplineLeadUserId === userId
    );
  }

  private async canUploadSubmittalFolder(
    userId: string,
    companyId: string,
    folder: { contextId: string | null },
    roleNames?: readonly string[],
  ): Promise<boolean> {
    if (!folder.contextId) {
      return false;
    }
    return this.canAccessSubmittalFolder(
      userId,
      companyId,
      folder.contextId,
      roleNames,
    );
  }

  /**
   * Change-request attachment folders: creator, assignee, package assignees, or full access.
   */
  private async canUploadCrFolder(
    userId: string,
    companyId: string,
    folder: { contextId: string | null },
    roleNames?: readonly string[],
  ): Promise<boolean> {
    if (!folder.contextId) {
      return false;
    }

    const resolvedRoles =
      roleNames ??
      (await this.permissionService.getUserRoleNames(userId, companyId));
    if (hasFullProjectDataAccess(resolvedRoles)) {
      return true;
    }

    const cr = await this.prisma.projectChangeRequest.findFirst({
      where: {
        id: folder.contextId,
        companyId,
        deletedAt: null,
      },
      select: {
        createdBy: true,
        assignedTo: true,
        linkedDesignPackageId: true,
      },
    });
    if (!cr) {
      return false;
    }

    if (cr.createdBy === userId || cr.assignedTo === userId) {
      return true;
    }

    if (!cr.linkedDesignPackageId) {
      return false;
    }

    const pkg = await this.prisma.designPackage.findFirst({
      where: activeOnly({
        id: cr.linkedDesignPackageId,
        companyId,
      }),
      select: {
        designerUserId: true,
        supportingDesignerUserId: true,
        reviewerUserId: true,
        disciplinaryLeaderUserId: true,
        deptDeputyChiefUserId: true,
        instituteChiefUserId: true,
        siteRepresentativeUserId: true,
      },
    });
    if (!pkg) {
      return false;
    }

    return [
      pkg.designerUserId,
      pkg.supportingDesignerUserId,
      pkg.reviewerUserId,
      pkg.disciplinaryLeaderUserId,
      pkg.deptDeputyChiefUserId,
      pkg.instituteChiefUserId,
      pkg.siteRepresentativeUserId,
    ]
      .filter((id): id is string => Boolean(id))
      .includes(userId);
  }

  /**
   * RFI attachment folders: raiser, assignee, linked design-package FKs, or full access.
   * Mirrors the access rule in RfisService#assertCanAccessRfi.
   */
  private async canUploadRfiFolder(
    userId: string,
    companyId: string,
    folder: { contextId: string | null },
    roleNames?: readonly string[],
  ): Promise<boolean> {
    if (!folder.contextId) {
      return false;
    }

    const resolvedRoles =
      roleNames ??
      (await this.permissionService.getUserRoleNames(userId, companyId));
    if (hasFullProjectDataAccess(resolvedRoles)) {
      return true;
    }

    const rfi = await this.prisma.rfi.findFirst({
      where: activeOnly({
        id: folder.contextId,
        companyId,
      }),
      select: {
        raisedBy: true,
        assignedTo: true,
        linkedDesignPackageId: true,
      },
    });
    if (!rfi) {
      return false;
    }

    if (rfi.raisedBy === userId || rfi.assignedTo === userId) {
      return true;
    }

    if (!rfi.linkedDesignPackageId) {
      return false;
    }

    const pkg = await this.prisma.designPackage.findFirst({
      where: activeOnly({
        id: rfi.linkedDesignPackageId,
        companyId,
      }),
      select: {
        designerUserId: true,
        supportingDesignerUserId: true,
        reviewerUserId: true,
        disciplinaryLeaderUserId: true,
        deptDeputyChiefUserId: true,
        instituteChiefUserId: true,
        siteRepresentativeUserId: true,
      },
    });
    if (!pkg) {
      return false;
    }

    return [
      pkg.designerUserId,
      pkg.supportingDesignerUserId,
      pkg.reviewerUserId,
      pkg.disciplinaryLeaderUserId,
      pkg.deptDeputyChiefUserId,
      pkg.instituteChiefUserId,
      pkg.siteRepresentativeUserId,
    ]
      .filter((id): id is string => Boolean(id))
      .includes(userId);
  }

  /**
   * Issue attachment folders: raiser, assignee, linked design-package FKs, or full access.
   */
  private async canUploadIssueFolder(
    userId: string,
    companyId: string,
    folder: { contextId: string | null },
    roleNames?: readonly string[],
  ): Promise<boolean> {
    if (!folder.contextId) {
      return false;
    }

    const resolvedRoles =
      roleNames ??
      (await this.permissionService.getUserRoleNames(userId, companyId));
    if (hasFullProjectDataAccess(resolvedRoles)) {
      return true;
    }

    const issue = await this.prisma.issue.findFirst({
      where: activeOnly({
        id: folder.contextId,
        companyId,
      }),
      select: {
        raisedBy: true,
        assignedTo: true,
        linkedDesignPackageId: true,
      },
    });
    if (!issue) {
      return false;
    }

    if (issue.raisedBy === userId || issue.assignedTo === userId) {
      return true;
    }

    if (!issue.linkedDesignPackageId) {
      return false;
    }

    const pkg = await this.prisma.designPackage.findFirst({
      where: activeOnly({
        id: issue.linkedDesignPackageId,
        companyId,
      }),
      select: {
        designerUserId: true,
        supportingDesignerUserId: true,
        reviewerUserId: true,
        disciplinaryLeaderUserId: true,
        deptDeputyChiefUserId: true,
        instituteChiefUserId: true,
        siteRepresentativeUserId: true,
      },
    });
    if (!pkg) {
      return false;
    }

    return [
      pkg.designerUserId,
      pkg.supportingDesignerUserId,
      pkg.reviewerUserId,
      pkg.disciplinaryLeaderUserId,
      pkg.deptDeputyChiefUserId,
      pkg.instituteChiefUserId,
      pkg.siteRepresentativeUserId,
    ]
      .filter((id): id is string => Boolean(id))
      .includes(userId);
  }

  /**
   * True when the user may upload into a DAILY_LOG folder as creator,
   * supervisor, full-access role, or FK package assignee on the project.
   */
  private async canUploadDailyLogFolder(
    userId: string,
    companyId: string,
    folder: { contextId: string | null },
    roleNames?: readonly string[],
  ): Promise<boolean> {
    if (!folder.contextId) {
      return false;
    }

    const resolvedRoles =
      roleNames ??
      (await this.permissionService.getUserRoleNames(userId, companyId));
    if (hasFullProjectDataAccess(resolvedRoles)) {
      return true;
    }

    const log = await this.prisma.dailyLog.findFirst({
      where: activeOnly({
        id: folder.contextId,
        companyId,
      }),
      select: {
        projectId: true,
        createdBy: true,
        supervisorId: true,
      },
    });
    if (!log) {
      return false;
    }

    if (log.createdBy === userId || log.supervisorId === userId) {
      return true;
    }

    const hasFkRole = await this.prisma.designPackage.findFirst({
      where: activeOnly({
        companyId,
        taskDiscipline: {
          task: {
            projectId: log.projectId,
          },
        },
        OR: [
          { designerUserId: userId },
          { disciplinaryLeaderUserId: userId },
          { reviewerUserId: userId },
          { supportingDesignerUserId: userId },
          { deptDeputyChiefUserId: userId },
          { instituteChiefUserId: userId },
        ],
      }),
      select: { id: true },
    });

    return hasFkRole !== null;
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
