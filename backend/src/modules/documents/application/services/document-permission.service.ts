import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { FolderContextType } from '@prisma/client';
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

    throw new ForbiddenException('Missing permission: documents.create');
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
          select: { contextType: true },
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
  ): Promise<{ contextType: FolderContextType }> {
    const folder = await this.prisma.documentFolder.findFirst({
      where: activeOnly({ id: folderId, companyId }),
      select: { contextType: true },
    });
    if (!folder) {
      throw new NotFoundException('Folder not found');
    }
    return folder;
  }
}
