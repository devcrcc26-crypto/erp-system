import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import { FolderContextType, Prisma } from '@prisma/client';
import { PaginationQueryDto } from '../../../../shared/dtos/pagination-query.dto';
import { PrismaService } from '../../../../shared/prisma/prisma.service';
import { activeOnly } from '../../../../shared/prisma/soft-delete.util';
import {
  ALLOWED_UPLOAD_MIME_TYPES,
  STORAGE_BUCKETS,
  STORAGE_SERVICE,
  type StorageBucket,
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
  ProjectDocumentFileTypeFilter,
  ProjectDocumentListQueryDto,
  UpdateDocumentDto,
  UpdateDocumentFolderDto,
  UploadDocumentVersionDto,
  UpsertDocumentAccessDto,
} from '../dtos/document.dtos';
import { DocumentPermissionService } from './document-permission.service';

type RequestContext = { companyId: string; userId: string };

/** Presigned URL lifetime used when the caller does not ask for one. */
const DEFAULT_DOWNLOAD_URL_EXPIRES_IN_SECONDS = 900;

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
    private readonly documentPermissionService: DocumentPermissionService,
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

  /**
   * Lists all current documents stored under a project's document folder tree.
   */
  async listProjectDocuments(
    ctx: RequestContext,
    projectId: string,
    query: ProjectDocumentListQueryDto,
  ): Promise<PaginatedResult<unknown>> {
    const project = await this.prisma.project.findFirst({
      where: activeOnly({ id: projectId, companyId: ctx.companyId }),
      select: { id: true },
    });
    if (!project) {
      throw new NotFoundException('Project not found');
    }

    const projectFolder = await this.prisma.documentFolder.findFirst({
      where: activeOnly({
        companyId: ctx.companyId,
        contextType: FolderContextType.PROJECT,
        contextId: projectId,
      }),
      select: { id: true, path: true },
    });

    if (!projectFolder) {
      return buildPaginatedResult([], 0, query.page, query.limit);
    }

    const folders = await this.prisma.documentFolder.findMany({
      where: activeOnly({
        companyId: ctx.companyId,
        OR: [
          { id: projectFolder.id },
          { path: { startsWith: `${projectFolder.path}/` } },
        ],
      }),
      select: {
        id: true,
        name: true,
        path: true,
        contextType: true,
        contextId: true,
      },
    });

    const scopedFolderIds = this.filterProjectDocumentFolderIds(folders, query);

    if (scopedFolderIds.length === 0) {
      return buildPaginatedResult([], 0, query.page, query.limit);
    }

    const folderById = new Map(folders.map((folder) => [folder.id, folder]));
    const where = this.buildProjectDocumentWhere(
      ctx.companyId,
      scopedFolderIds,
      query,
    );

    const { skip, take } = buildPrismaPagination(query.page, query.limit);
    const orderBy = buildOrderBy(
      query.sortBy ?? 'createdAt',
      query.sortOrder ?? 'desc',
    );

    const [rows, total] = await Promise.all([
      this.prisma.document.findMany({
        where,
        skip,
        take,
        orderBy,
        include: {
          folder: {
            select: {
              id: true,
              name: true,
              path: true,
              contextType: true,
              contextId: true,
            },
          },
          versions: {
            orderBy: { versionNumber: 'desc' },
            take: 1,
            include: {
              engineeringDocumentVersions: {
                where: activeOnly({ companyId: ctx.companyId }),
                take: 1,
                include: {
                  engineeringDocument: {
                    select: {
                      id: true,
                      title: true,
                      documentNumber: true,
                      documentType: true,
                      taskDisciplineId: true,
                      taskDiscipline: {
                        select: {
                          id: true,
                          disciplineName: true,
                          disciplineIndex: true,
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      }),
      this.prisma.document.count({ where }),
    ]);

    const data = rows.map((document) => {
      const folder = folderById.get(document.folderId) ?? document.folder;
      const edv =
        document.versions[0]?.engineeringDocumentVersions[0] ?? null;
      const engineeringDocument = edv?.engineeringDocument ?? null;

      return {
        id: document.id,
        folderId: document.folderId,
        companyId: document.companyId,
        name: document.name,
        fileType: document.fileType,
        fileSizeBytes: document.fileSizeBytes,
        version: document.version,
        isCurrent: document.isCurrent,
        createdAt: document.createdAt.toISOString(),
        updatedAt: document.updatedAt.toISOString(),
        folderName: folder?.name ?? '',
        folderPath: folder?.path ?? '',
        folderContextType: folder?.contextType ?? '',
        folderContextId: folder?.contextId ?? null,
        taskDisciplineId:
          engineeringDocument?.taskDisciplineId ??
          (folder?.contextType === FolderContextType.TASK_DISCIPLINE
            ? folder.contextId
            : null),
        disciplineName:
          engineeringDocument?.taskDiscipline?.disciplineName ??
          (folder?.contextType === FolderContextType.TASK_DISCIPLINE
            ? folder.name
            : null),
        disciplineIndex:
          engineeringDocument?.taskDiscipline?.disciplineIndex ?? null,
        engineeringDocumentId: engineeringDocument?.id ?? null,
        engineeringDocumentTitle: engineeringDocument?.title ?? null,
        engineeringDocumentNumber: engineeringDocument?.documentNumber ?? null,
        engineeringDocumentType: engineeringDocument?.documentType ?? null,
        engineeringRevisionLabel: edv?.revisionLabel ?? null,
        displayTitle:
          engineeringDocument?.title?.trim() ||
          document.name,
      };
    });

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
      include: { folder: true },
    });
    if (!document) {
      throw new NotFoundException('Document not found');
    }

    await this.documentPermissionService.assertCanUpload(
      ctx.userId,
      ctx.companyId,
      document.folderId,
    );

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
          select: {
            id: true,
            firstName: true,
            lastName: true,
            chineseName: true,
            email: true,
          },
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

  /**
   * @param expiresIn Optional URL lifetime in seconds (validated 1-3600 at the
   * controller); omitted keeps the default download lifetime.
   */
  async getDownloadUrl(
    ctx: RequestContext,
    id: string,
    expiresIn?: number,
  ): Promise<{ url: string; expiresIn: number }> {
    const document = await this.prisma.document.findFirst({
      where: activeOnly({ id, companyId: ctx.companyId }),
    });
    if (!document) {
      throw new NotFoundException('Document not found');
    }

    return this.buildPresignedDownloadUrl(
      document.fileKey,
      document.folderId,
      ctx.companyId,
      expiresIn,
    );
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
    folderId?: string,
    companyId?: string,
    expiresIn = DEFAULT_DOWNLOAD_URL_EXPIRES_IN_SECONDS,
  ): Promise<{ url: string; expiresIn: number }> {
    let bucket: StorageBucket = STORAGE_BUCKETS.DOCUMENTS;

    if (folderId && companyId) {
      const folder = await this.prisma.documentFolder.findFirst({
        where: activeOnly({ id: folderId, companyId }),
        select: { contextType: true },
      });
      if (
        folder?.contextType === FolderContextType.APPROVAL ||
        folder?.contextType === FolderContextType.LEAVE ||
        folder?.contextType === FolderContextType.OVERTIME ||
        folder?.contextType === FolderContextType.FLIGHT ||
        folder?.contextType === FolderContextType.BUSINESS_TRIP ||
        folder?.contextType === FolderContextType.OFFICIAL_SEAL ||
        folder?.contextType === FolderContextType.PROJECT_SEAL ||
        folder?.contextType === FolderContextType.VEHICLE_REFUELING ||
        folder?.contextType === FolderContextType.EXPENSE_CLAIM ||
        folder?.contextType === FolderContextType.PURCHASE_REQUEST ||
        folder?.contextType === FolderContextType.MATERIAL_REQUISITION ||
        folder?.contextType === FolderContextType.CONSUMABLES_REQUISITION ||
        folder?.contextType === FolderContextType.PER_DIEM ||
        folder?.contextType === FolderContextType.VEHICLE_APPLICATION ||
        folder?.contextType === FolderContextType.INSPECTION_REPAIR ||
        folder?.contextType === FolderContextType.EMPLOYEE_CONTRACT ||
        folder?.contextType === FolderContextType.EXIT_PERMIT
      ) {
        bucket = STORAGE_BUCKETS.HR;
      }
    } else if (
      (fileKey.includes('/approvals/') && fileKey.includes('/responses/')) ||
      fileKey.includes('/hr/leave/') ||
      fileKey.includes('/hr/overtime/') ||
      fileKey.includes('/hr/flight/') ||
      fileKey.includes('/hr/business-trips/') ||
      fileKey.includes('/hr/expense-claim/') ||
      fileKey.includes('/hr/purchase-requests/') ||
      fileKey.includes('/hr/material-requisition/') ||
      fileKey.includes('/official-seal/') ||
      fileKey.includes('/project-seal/') ||
      fileKey.includes('/vehicle-refueling/') ||
      fileKey.includes('/hr/exit-permits/')
    ) {
      bucket = STORAGE_BUCKETS.HR;
    }

    const url = await this.storage.getPresignedDownloadUrl(
      bucket,
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

  private filterProjectDocumentFolderIds(
    folders: Array<{
      id: string;
      path: string;
      contextType: FolderContextType;
      contextId: string | null;
    }>,
    query: ProjectDocumentListQueryDto,
  ): string[] {
    let scoped = folders;

    if (query.folderContextType) {
      scoped = scoped.filter(
        (folder) => folder.contextType === query.folderContextType,
      );
    }

    if (query.taskDisciplineId) {
      const disciplineFolder = folders.find(
        (folder) =>
          folder.contextType === FolderContextType.TASK_DISCIPLINE &&
          folder.contextId === query.taskDisciplineId,
      );
      if (!disciplineFolder) {
        return [];
      }
      const disciplinePrefix = `${disciplineFolder.path}/`;
      scoped = scoped.filter(
        (folder) =>
          folder.id === disciplineFolder.id ||
          folder.path.startsWith(disciplinePrefix),
      );
    }

    if (scoped.length === 0) {
      return [];
    }

    return scoped.map((folder) => folder.id);
  }

  private buildProjectDocumentWhere(
    companyId: string,
    folderIds: string[],
    query: ProjectDocumentListQueryDto,
  ): Prisma.DocumentWhereInput {
    const where: Prisma.DocumentWhereInput = activeOnly({
      companyId,
      folderId: { in: folderIds },
      isCurrent: true,
    });

    if (query.uploadedFrom || query.uploadedTo) {
      where.createdAt = {
        ...(query.uploadedFrom
          ? { gte: new Date(`${query.uploadedFrom}T00:00:00.000Z`) }
          : {}),
        ...(query.uploadedTo
          ? { lte: new Date(`${query.uploadedTo}T23:59:59.999Z`) }
          : {}),
      };
    }

    if (query.fileType) {
      const fileTypeClause = this.buildProjectDocumentFileTypeWhere(query.fileType);
      if (fileTypeClause) {
        where.AND = [
          ...(Array.isArray(where.AND)
            ? where.AND
            : where.AND
              ? [where.AND]
              : []),
          fileTypeClause,
        ];
      }
    }

    const searchTerm = query.search?.trim();
    if (searchTerm) {
      where.OR = [
        { name: { contains: searchTerm, mode: 'insensitive' } },
        {
          folder: {
            name: { contains: searchTerm, mode: 'insensitive' },
          },
        },
        {
          folder: {
            path: { contains: searchTerm, mode: 'insensitive' },
          },
        },
        {
          versions: {
            some: {
              engineeringDocumentVersions: {
                some: {
                  ...activeOnly({ companyId }),
                  engineeringDocument: {
                    ...activeOnly({ companyId }),
                    OR: [
                      {
                        title: {
                          contains: searchTerm,
                          mode: 'insensitive',
                        },
                      },
                      {
                        documentNumber: {
                          contains: searchTerm,
                          mode: 'insensitive',
                        },
                      },
                    ],
                  },
                },
              },
            },
          },
        },
      ];
    }

    return where;
  }

  private buildProjectDocumentFileTypeWhere(
    fileType: ProjectDocumentFileTypeFilter,
  ): Prisma.DocumentWhereInput | null {
    switch (fileType) {
      case 'pdf':
        return {
          fileType: { contains: 'pdf', mode: 'insensitive' },
        };
      case 'image':
        return {
          fileType: { startsWith: 'image/', mode: 'insensitive' },
        };
      case 'word':
        return {
          fileType: { contains: 'word', mode: 'insensitive' },
        };
      case 'excel':
        return {
          OR: [
            { fileType: { contains: 'excel', mode: 'insensitive' } },
            { fileType: { contains: 'spreadsheet', mode: 'insensitive' } },
          ],
        };
      case 'other':
        return {
          NOT: {
            OR: [
              { fileType: { contains: 'pdf', mode: 'insensitive' } },
              { fileType: { startsWith: 'image/', mode: 'insensitive' } },
              { fileType: { contains: 'word', mode: 'insensitive' } },
              { fileType: { contains: 'excel', mode: 'insensitive' } },
              { fileType: { contains: 'spreadsheet', mode: 'insensitive' } },
            ],
          },
        };
      default:
        return null;
    }
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
