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

    if (
      folder.contextType === FolderContextType.MEETING &&
      folder.contextId &&
      (await this.canUploadMeetingFolder(userId, companyId, folder, roleNames))
    ) {
      return;
    }

    if (
      folder.contextType === FolderContextType.RISK &&
      folder.contextId &&
      (await this.canUploadRiskFolder(userId, companyId, folder, roleNames))
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

    if (
      folder.contextType === FolderContextType.RISK &&
      folder.contextId &&
      (await this.canUploadRiskFolder(userId, companyId, folder, roleNames))
    ) {
      return;
    }

    if (
      await this.canAccessHrAttachmentFolder(
        userId,
        companyId,
        folder.contextType,
        folder.contextId,
      )
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

    if (
      await this.canAccessHrAttachmentFolder(
        userId,
        companyId,
        document.folder.contextType,
        document.folder.contextId,
      )
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
   * Meeting attachment folders: creator, attendee, FK role on any project
   * subtask, or full access.
   */
  private async canUploadMeetingFolder(
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

    const meeting = await this.prisma.meeting.findFirst({
      where: {
        id: folder.contextId,
        deletedAt: null,
        project: activeOnly({ companyId }),
      },
      select: { createdBy: true, projectId: true },
    });
    if (!meeting) {
      return false;
    }

    if (meeting.createdBy === userId) {
      return true;
    }

    const isAttendee = await this.prisma.meetingAttendee.findFirst({
      where: { meetingId: folder.contextId, userId },
      select: { id: true },
    });
    if (isAttendee) {
      return true;
    }

    const hasFkRole = await this.prisma.designPackage.findFirst({
      where: activeOnly({
        companyId,
        taskDiscipline: { task: { projectId: meeting.projectId, deletedAt: null } },
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
    return Boolean(hasFkRole);
  }

  /**
   * Risk attachment folders: owner, creator, discipline lead on the risk's
   * project, or full access. Mirrors RisksService#assertCanAccessRisk.
   */
  private async canUploadRiskFolder(
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

    const risk = await this.prisma.risk.findFirst({
      where: activeOnly({
        id: folder.contextId,
        project: activeOnly({ companyId }),
      }),
      select: { ownerId: true, createdBy: true, projectId: true },
    });
    if (!risk) {
      return false;
    }

    if (risk.ownerId === userId || risk.createdBy === userId) {
      return true;
    }

    const isDLead = await this.prisma.taskDiscipline.findFirst({
      where: activeOnly({
        companyId,
        task: { projectId: risk.projectId, deletedAt: null },
        disciplineLeadUserId: userId,
      }),
      select: { id: true },
    });
    return Boolean(isDLead);
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

  /**
   * Leave / overtime / approval / seal / purchase / expense / material /
   * consumables / employee profile attachment folders:
   * HR viewers, user managers, owner, or assigned approval-tier approver may
   * download without documents.view.
   */
  private async canAccessHrAttachmentFolder(
    userId: string,
    companyId: string,
    contextType: FolderContextType,
    contextId: string | null,
  ): Promise<boolean> {
    if (
      contextType === FolderContextType.EMPLOYEE_PROFILE ||
      contextType === FolderContextType.EMPLOYEE_CONTRACT
    ) {
      if (!contextId) {
        return false;
      }
      if (contextId === userId) {
        return true;
      }
      const [usersView, usersEdit, hrView] = await Promise.all([
        this.permissionService.hasPermission(userId, companyId, 'users', 'view'),
        this.permissionService.hasPermission(userId, companyId, 'users', 'edit'),
        this.permissionService.hasPermission(userId, companyId, 'hr', 'view'),
      ]);
      return usersView || usersEdit || hrView;
    }

    if (
      contextType !== FolderContextType.LEAVE &&
      contextType !== FolderContextType.OVERTIME &&
      contextType !== FolderContextType.APPROVAL &&
      contextType !== FolderContextType.FLIGHT &&
      contextType !== FolderContextType.BUSINESS_TRIP &&
      contextType !== FolderContextType.OFFICIAL_SEAL &&
      contextType !== FolderContextType.PROJECT_SEAL &&
      contextType !== FolderContextType.VEHICLE_REFUELING &&
      contextType !== FolderContextType.EXIT_PERMIT &&
      contextType !== FolderContextType.PURCHASE_REQUEST &&
      contextType !== FolderContextType.EXPENSE_CLAIM &&
      contextType !== FolderContextType.MATERIAL_REQUISITION &&
      contextType !== FolderContextType.CONSUMABLES_REQUISITION
    ) {
      return false;
    }
    if (!contextId) {
      return false;
    }

    const [hrView, approvalsAdmin] = await Promise.all([
      this.permissionService.hasPermission(userId, companyId, 'hr', 'view'),
      this.permissionService.hasPermission(
        userId,
        companyId,
        'approvals',
        'edit',
      ),
    ]);
    if (hrView || approvalsAdmin) {
      return true;
    }

    if (contextType === FolderContextType.LEAVE) {
      const leave = await this.prisma.leaveRequest.findFirst({
        where: activeOnly({ id: contextId, companyId }),
        select: {
          employeeId: true,
          approvalRequest: {
            select: {
              tiers: { select: { approverId: true } },
            },
          },
        },
      });
      if (!leave) {
        return false;
      }
      if (leave.employeeId === userId) {
        return true;
      }
      return (
        leave.approvalRequest?.tiers.some((t) => t.approverId === userId) ??
        false
      );
    }

    if (contextType === FolderContextType.OVERTIME) {
      const sheet = await this.prisma.overtimeSheet.findFirst({
        where: activeOnly({ id: contextId, companyId }),
        select: {
          employeeId: true,
          approvalRequest: {
            select: {
              tiers: { select: { approverId: true } },
            },
          },
        },
      });
      if (!sheet) {
        return false;
      }
      if (sheet.employeeId === userId) {
        return true;
      }
      return (
        sheet.approvalRequest?.tiers.some((t) => t.approverId === userId) ??
        false
      );
    }

    if (contextType === FolderContextType.FLIGHT) {
      const flight = await this.prisma.flightApplication.findFirst({
        where: activeOnly({ id: contextId, companyId }),
        select: {
          submittedBy: true,
          passengers: { select: { employeeId: true } },
          approvalRequest: {
            select: {
              tiers: { select: { approverId: true } },
            },
          },
        },
      });
      if (!flight) {
        return false;
      }
      if (flight.submittedBy === userId) {
        return true;
      }
      if (flight.passengers.some((p) => p.employeeId === userId)) {
        return true;
      }
      return (
        flight.approvalRequest?.tiers.some((t) => t.approverId === userId) ??
        false
      );
    }

    if (contextType === FolderContextType.BUSINESS_TRIP) {
      const trip = await this.prisma.businessTrip.findFirst({
        where: activeOnly({ id: contextId, companyId }),
        select: {
          submittedBy: true,
          passengers: { select: { employeeId: true } },
          approvalRequest: {
            select: {
              tiers: { select: { approverId: true } },
            },
          },
        },
      });
      if (!trip) {
        return false;
      }
      if (trip.submittedBy === userId) {
        return true;
      }
      if (trip.passengers.some((p) => p.employeeId === userId)) {
        return true;
      }
      return (
        trip.approvalRequest?.tiers.some((t) => t.approverId === userId) ??
        false
      );
    }

    if (contextType === FolderContextType.OFFICIAL_SEAL) {
      const seal = await this.prisma.officialSeal.findFirst({
        where: activeOnly({ id: contextId, companyId }),
        select: {
          employeeId: true,
          approvalRequest: {
            select: {
              tiers: { select: { approverId: true } },
            },
          },
        },
      });
      if (!seal) {
        return false;
      }
      if (seal.employeeId === userId) {
        return true;
      }
      return (
        seal.approvalRequest?.tiers.some((t) => t.approverId === userId) ??
        false
      );
    }

    if (contextType === FolderContextType.PROJECT_SEAL) {
      const seal = await this.prisma.projectSeal.findFirst({
        where: activeOnly({ id: contextId, companyId }),
        select: {
          employeeId: true,
          approvalRequest: {
            select: {
              tiers: { select: { approverId: true } },
            },
          },
        },
      });
      if (!seal) {
        return false;
      }
      if (seal.employeeId === userId) {
        return true;
      }
      return (
        seal.approvalRequest?.tiers.some((t) => t.approverId === userId) ??
        false
      );
    }

    if (contextType === FolderContextType.VEHICLE_REFUELING) {
      const refueling = await this.prisma.vehicleRefueling.findFirst({
        where: activeOnly({ id: contextId, companyId }),
        select: {
          employeeId: true,
          approvalRequest: {
            select: {
              tiers: { select: { approverId: true } },
            },
          },
        },
      });
      if (!refueling) {
        return false;
      }
      if (refueling.employeeId === userId) {
        return true;
      }
      return (
        refueling.approvalRequest?.tiers.some((t) => t.approverId === userId) ??
        false
      );
    }

    if (contextType === FolderContextType.EXIT_PERMIT) {
      const permit = await this.prisma.exitPermit.findFirst({
        where: activeOnly({ id: contextId, companyId }),
        select: {
          employeeId: true,
          createdBy: true,
          submittedBy: true,
          approvalRequest: {
            select: {
              tiers: { select: { approverId: true } },
            },
          },
        },
      });
      if (!permit) {
        return false;
      }
      // Employee, whoever filed it (on-behalf), or an approver in its chain.
      if (
        permit.employeeId === userId ||
        permit.createdBy === userId ||
        permit.submittedBy === userId
      ) {
        return true;
      }
      return (
        permit.approvalRequest?.tiers.some((t) => t.approverId === userId) ??
        false
      );
    }

    if (
      contextType === FolderContextType.PURCHASE_REQUEST ||
      contextType === FolderContextType.EXPENSE_CLAIM ||
      contextType === FolderContextType.MATERIAL_REQUISITION ||
      contextType === FolderContextType.CONSUMABLES_REQUISITION
    ) {
      // Mirrors each module's assertCanView: owner, filer or tier approver.
      const where = activeOnly({ id: contextId, companyId });
      const select = {
        employeeId: true,
        createdBy: true,
        approvalRequest: {
          select: {
            tiers: { select: { approverId: true } },
          },
        },
      } as const;
      const record =
        contextType === FolderContextType.PURCHASE_REQUEST
          ? await this.prisma.purchaseRequest.findFirst({ where, select })
          : contextType === FolderContextType.EXPENSE_CLAIM
            ? await this.prisma.expenseClaim.findFirst({ where, select })
            : contextType === FolderContextType.MATERIAL_REQUISITION
              ? await this.prisma.materialRequisition.findFirst({
                  where,
                  select,
                })
              : await this.prisma.consumablesRequisition.findFirst({
                  where,
                  select,
                });
      if (!record) {
        return false;
      }
      if (record.employeeId === userId || record.createdBy === userId) {
        return true;
      }
      return (
        record.approvalRequest?.tiers.some((t) => t.approverId === userId) ??
        false
      );
    }

    // APPROVAL folder - requester or any tier approver
    const request = await this.prisma.approvalRequest.findFirst({
      where: activeOnly({ id: contextId, companyId }),
      select: {
        requestedBy: true,
        tiers: { select: { approverId: true } },
      },
    });
    if (!request) {
      return false;
    }
    return (
      request.requestedBy === userId ||
      request.tiers.some((t) => t.approverId === userId)
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
