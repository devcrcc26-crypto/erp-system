import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import { PaginationQueryDto } from '../../../../shared/dtos/pagination-query.dto';
import { PrismaService } from '../../../../shared/prisma/prisma.service';
import { activeOnly } from '../../../../shared/prisma/soft-delete.util';
import {
  ALLOWED_UPLOAD_MIME_TYPES,
  STORAGE_BUCKETS,
  STORAGE_SERVICE,
} from '../../../../shared/storage/storage.constants';
import { IStorageService } from '../../../../shared/storage/storage.interface';
import {
  buildOrderBy,
  buildPaginatedResult,
  buildPrismaPagination,
  PaginatedResult,
} from '../../../../shared/utils/pagination.util';
import {
  CreateDocumentFolderDto,
  DocumentFolderListQueryDto,
  UpdateDocumentDto,
  UpdateDocumentFolderDto,
  UploadDocumentVersionDto,
  UpsertDocumentAccessDto,
} from '../dtos/document.dtos';

type RequestContext = { companyId: string; userId: string };

interface UploadedFile {
  originalname: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
}

@Injectable()
export class DocumentService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(STORAGE_SERVICE) private readonly storage: IStorageService,
  ) {}

  async listFolders(
    ctx: RequestContext,
    query: DocumentFolderListQueryDto,
  ): Promise<PaginatedResult<unknown>> {
    if (query.contextId && !query.contextType) {
      throw new BadRequestException(
        'contextType is required when contextId is provided',
      );
    }

    const where = activeOnly({
      companyId: ctx.companyId,
      ...(query.contextType ? { contextType: query.contextType } : {}),
      ...(query.contextId ? { contextId: query.contextId } : {}),
      ...(query.parentId !== undefined
        ? { parentId: query.parentId || null }
        : {}),
    });
    const { skip, take } = buildPrismaPagination(query.page, query.limit);
    const [data, total] = await Promise.all([
      this.prisma.documentFolder.findMany({
        where,
        skip,
        take,
        orderBy: buildOrderBy(query.sortBy, query.sortOrder),
      }),
      this.prisma.documentFolder.count({ where }),
    ]);
    return buildPaginatedResult(data, total, query.page, query.limit);
  }

  async getFolder(ctx: RequestContext, id: string): Promise<unknown> {
    return this.findFolderOrThrow(id, ctx.companyId);
  }

  async createFolder(
    ctx: RequestContext,
    dto: CreateDocumentFolderDto,
  ): Promise<unknown> {
    let path = `/${dto.name}`;
    if (dto.parentId) {
      const parent = await this.findFolderOrThrow(dto.parentId, ctx.companyId);
      path = `${parent.path}/${dto.name}`;
    }

    return this.prisma.documentFolder.create({
      data: {
        companyId: ctx.companyId,
        parentId: dto.parentId,
        name: dto.name,
        path,
        contextType: dto.contextType,
        contextId: dto.contextId ?? null,
        isSystem: false,
        createdBy: ctx.userId,
        updatedBy: ctx.userId,
      },
    });
  }

  async updateFolder(
    ctx: RequestContext,
    id: string,
    dto: UpdateDocumentFolderDto,
  ): Promise<unknown> {
    const folder = await this.findFolderOrThrow(id, ctx.companyId);
    if (folder.isSystem) {
      throw new ForbiddenException('System folders cannot be modified');
    }

    let path = folder.path;
    if (dto.name && dto.name !== folder.name) {
      const parentPath = folder.parentId
        ? (await this.findFolderOrThrow(folder.parentId, ctx.companyId)).path
        : '';
      path = parentPath ? `${parentPath}/${dto.name}` : `/${dto.name}`;
    }

    return this.prisma.documentFolder.update({
      where: { id },
      data: {
        ...dto,
        path,
        updatedBy: ctx.userId,
      },
    });
  }

  async deleteFolder(ctx: RequestContext, id: string): Promise<void> {
    const folder = await this.findFolderOrThrow(id, ctx.companyId);
    if (folder.isSystem) {
      throw new ForbiddenException('System folders cannot be deleted');
    }

    const childCount = await this.prisma.documentFolder.count({
      where: activeOnly({ parentId: id, companyId: ctx.companyId }),
    });
    if (childCount > 0) {
      throw new BadRequestException('Folder contains subfolders');
    }

    const docCount = await this.prisma.document.count({
      where: activeOnly({ folderId: id, companyId: ctx.companyId }),
    });
    if (docCount > 0) {
      throw new BadRequestException('Folder contains documents');
    }

    await this.prisma.documentFolder.update({
      where: { id },
      data: { deletedAt: new Date(), deletedBy: ctx.userId },
    });
  }

  async listDocuments(
    ctx: RequestContext,
    folderId: string,
    query: PaginationQueryDto,
  ): Promise<PaginatedResult<unknown>> {
    await this.findFolderOrThrow(folderId, ctx.companyId);
    const where = activeOnly({
      companyId: ctx.companyId,
      folderId,
      isCurrent: true,
    });
    const { skip, take } = buildPrismaPagination(query.page, query.limit);
    const [data, total] = await Promise.all([
      this.prisma.document.findMany({
        where,
        skip,
        take,
        orderBy: buildOrderBy(query.sortBy, query.sortOrder),
      }),
      this.prisma.document.count({ where }),
    ]);
    return buildPaginatedResult(data, total, query.page, query.limit);
  }

  async getDocument(ctx: RequestContext, id: string): Promise<unknown> {
    const document = await this.prisma.document.findFirst({
      where: activeOnly({ id, companyId: ctx.companyId }),
      include: {
        folder: { select: { id: true, name: true, path: true } },
        versions: { orderBy: { versionNumber: 'desc' }, take: 5 },
      },
    });
    if (!document) {
      throw new NotFoundException('Document not found');
    }
    return document;
  }

  async uploadDocument(
    ctx: RequestContext,
    folderId: string,
    file: UploadedFile,
  ): Promise<unknown> {
    await this.findFolderOrThrow(folderId, ctx.companyId);
    await this.validateUpload(ctx.companyId, file);

    const documentId = randomUUID();
    const fileKey = this.buildFileKey(
      ctx.companyId,
      folderId,
      documentId,
      1,
      file.originalname,
    );

    await this.storage.upload({
      bucket: STORAGE_BUCKETS.DOCUMENTS,
      key: fileKey,
      body: file.buffer,
      contentType: file.mimetype,
      contentLength: file.size,
    });

    return this.prisma.$transaction(async (tx) => {
      const document = await tx.document.create({
        data: {
          id: documentId,
          companyId: ctx.companyId,
          folderId,
          name: file.originalname,
          fileKey,
          fileType: file.mimetype,
          fileSizeBytes: file.size,
          version: 1,
          isCurrent: true,
          createdBy: ctx.userId,
          updatedBy: ctx.userId,
        },
      });

      const version = await tx.documentVersion.create({
        data: {
          documentId: document.id,
          uploadedBy: ctx.userId,
          versionNumber: 1,
          fileKey,
          fileSizeBytes: file.size,
        },
      });

      return { ...document, currentVersionId: version.id };
    });
  }

  async uploadVersion(
    ctx: RequestContext,
    documentId: string,
    file: UploadedFile,
    dto: UploadDocumentVersionDto,
  ): Promise<unknown> {
    const document = await this.prisma.document.findFirst({
      where: activeOnly({ id: documentId, companyId: ctx.companyId }),
    });
    if (!document) {
      throw new NotFoundException('Document not found');
    }

    await this.validateUpload(ctx.companyId, file);
    const nextVersion = document.version + 1;
    const fileKey = this.buildFileKey(
      ctx.companyId,
      document.folderId,
      document.id,
      nextVersion,
      file.originalname,
    );

    await this.storage.upload({
      bucket: STORAGE_BUCKETS.DOCUMENTS,
      key: fileKey,
      body: file.buffer,
      contentType: file.mimetype,
      contentLength: file.size,
    });

    return this.prisma.$transaction(async (tx) => {
      await tx.documentVersion.create({
        data: {
          documentId: document.id,
          uploadedBy: ctx.userId,
          versionNumber: nextVersion,
          fileKey,
          fileSizeBytes: file.size,
          changeNote: dto.changeNote,
        },
      });

      return tx.document.update({
        where: { id: document.id },
        data: {
          name: file.originalname,
          fileKey,
          fileType: file.mimetype,
          fileSizeBytes: file.size,
          version: nextVersion,
          updatedBy: ctx.userId,
        },
      });
    });
  }

  async listVersions(ctx: RequestContext, documentId: string): Promise<unknown[]> {
    await this.getDocument(ctx, documentId);
    return this.prisma.documentVersion.findMany({
      where: { documentId },
      orderBy: { versionNumber: 'desc' },
      include: {
        uploader: {
          select: { id: true, firstName: true, lastName: true, email: true },
        },
      },
    });
  }

  async updateDocument(
    ctx: RequestContext,
    id: string,
    dto: UpdateDocumentDto,
  ): Promise<unknown> {
    await this.getDocument(ctx, id);
    return this.prisma.document.update({
      where: { id },
      data: {
        ...dto,
        expiryDate: dto.expiryDate ? new Date(dto.expiryDate) : undefined,
        updatedBy: ctx.userId,
      },
    });
  }

  async deleteDocument(ctx: RequestContext, id: string): Promise<void> {
    await this.getDocument(ctx, id);
    await this.prisma.document.update({
      where: { id },
      data: { deletedAt: new Date(), deletedBy: ctx.userId },
    });
  }

  async getDownloadUrl(
    ctx: RequestContext,
    id: string,
  ): Promise<{ url: string; expiresIn: number }> {
    const document = await this.prisma.document.findFirst({
      where: activeOnly({ id, companyId: ctx.companyId }),
    });
    if (!document) {
      throw new NotFoundException('Document not found');
    }

    return this.buildPresignedDownloadUrl(document.fileKey);
  }

  /**
   * Returns a presigned URL for a specific document version file (EDV-linked revision).
   */
  async getVersionDownloadUrl(
    ctx: RequestContext,
    documentVersionId: string,
  ): Promise<{ url: string; expiresIn: number }> {
    const version = await this.prisma.documentVersion.findFirst({
      where: {
        id: documentVersionId,
        document: activeOnly({ companyId: ctx.companyId }),
      },
      select: { fileKey: true },
    });
    if (!version) {
      throw new NotFoundException('Document version not found');
    }

    return this.buildPresignedDownloadUrl(version.fileKey);
  }

  private async buildPresignedDownloadUrl(
    fileKey: string,
  ): Promise<{ url: string; expiresIn: number }> {
    const expiresIn = 900;
    const url = await this.storage.getPresignedDownloadUrl(
      STORAGE_BUCKETS.DOCUMENTS,
      fileKey,
      expiresIn,
    );

    return { url, expiresIn };
  }

  async listFolderAccess(
    ctx: RequestContext,
    folderId: string,
  ): Promise<unknown[]> {
    await this.findFolderOrThrow(folderId, ctx.companyId);
    return this.prisma.documentAccess.findMany({
      where: activeOnly({ folderId }),
      include: { role: { select: { id: true, name: true } } },
    });
  }

  async upsertFolderAccess(
    ctx: RequestContext,
    folderId: string,
    dto: UpsertDocumentAccessDto,
  ): Promise<unknown> {
    await this.findFolderOrThrow(folderId, ctx.companyId);

    const role = await this.prisma.role.findFirst({
      where: activeOnly({ id: dto.roleId, companyId: ctx.companyId }),
    });
    if (!role) {
      throw new NotFoundException('Role not found');
    }

    return this.prisma.documentAccess.upsert({
      where: {
        folderId_roleId: { folderId, roleId: dto.roleId },
      },
      update: {
        canView: dto.canView ?? true,
        canUpload: dto.canUpload ?? false,
        canDownload: dto.canDownload ?? false,
        canDelete: dto.canDelete ?? false,
        updatedBy: ctx.userId,
        deletedAt: null,
        deletedBy: null,
      },
      create: {
        folderId,
        roleId: dto.roleId,
        canView: dto.canView ?? true,
        canUpload: dto.canUpload ?? false,
        canDownload: dto.canDownload ?? false,
        canDelete: dto.canDelete ?? false,
        createdBy: ctx.userId,
        updatedBy: ctx.userId,
      },
    });
  }

  async deleteFolderAccess(
    ctx: RequestContext,
    folderId: string,
    accessId: string,
  ): Promise<void> {
    await this.findFolderOrThrow(folderId, ctx.companyId);
    const access = await this.prisma.documentAccess.findFirst({
      where: activeOnly({ id: accessId, folderId }),
    });
    if (!access) {
      throw new NotFoundException('Document access rule not found');
    }
    await this.prisma.documentAccess.update({
      where: { id: accessId },
      data: { deletedAt: new Date(), deletedBy: ctx.userId },
    });
  }

  private async findFolderOrThrow(
    id: string,
    companyId: string,
  ): Promise<{
    id: string;
    name: string;
    path: string;
    parentId: string | null;
    isSystem: boolean;
  }> {
    const folder = await this.prisma.documentFolder.findFirst({
      where: activeOnly({ id, companyId }),
    });
    if (!folder) {
      throw new NotFoundException('Document folder not found');
    }
    return folder;
  }

  private async validateUpload(
    companyId: string,
    file: UploadedFile,
  ): Promise<void> {
    if (!file || !file.buffer?.length) {
      throw new BadRequestException('File is required');
    }

    if (!ALLOWED_UPLOAD_MIME_TYPES.has(file.mimetype)) {
      throw new BadRequestException(`File type not allowed: ${file.mimetype}`);
    }

    const maxMb = await this.getMaxUploadMb(companyId);
    const maxBytes = maxMb * 1024 * 1024;
    if (file.size > maxBytes) {
      throw new BadRequestException(
        `File exceeds maximum upload size of ${maxMb} MB`,
      );
    }
  }

  private async getMaxUploadMb(companyId: string): Promise<number> {
    const setting = await this.prisma.companySetting.findFirst({
      where: activeOnly({
        companyId,
        module: 'documents',
        key: 'max_upload_mb',
      }),
    });
    const parsed = setting ? Number.parseInt(setting.value, 10) : 50;
    return Number.isFinite(parsed) ? parsed : 50;
  }

  private buildFileKey(
    companyId: string,
    folderId: string,
    documentId: string,
    version: number,
    filename: string,
  ): string {
    const safeName = filename.replace(/[^a-zA-Z0-9._-]/g, '_');
    return `${companyId}/${folderId}/${documentId}/v${version}/${safeName}`;
  }
}
