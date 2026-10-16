import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { EdvStatus, Prisma, WorkflowEntityType } from '@prisma/client';
import { DocumentService } from '../../../documents/application/services/document.service';
import { PrismaService } from '../../../../shared/prisma/prisma.service';
import { activeOnly } from '../../../../shared/prisma/soft-delete.util';
import {
  buildPaginatedResult,
  buildPrismaPagination,
  PaginatedResult,
} from '../../../../shared/utils/pagination.util';
import { EdvStatus as DomainEdvStatus } from '../../domain/contracts/enums/edv-status.enum';
import { validateNewRevisionUpload } from '../../domain/edv-state-machine';
import {
  EngineeringDocumentListQueryDto,
  RegisterEngineeringDocumentDto,
  TransitionEdvStatusDto,
  UpdateEngineeringDocumentDto,
  UpdateEngineeringDocumentVersionDto,
  UploadEngineeringDocumentVersionDto,
  ReplaceDraftVersionFileDto,
} from '../dtos/engineering-document.dtos';
import { PmContext } from '../types/pm-context.type';
import {
  mapEngineeringDocument,
  mapEngineeringDocumentVersion,
  MappedEngineeringDocument,
  MappedEngineeringDocumentVersion,
} from '../../infrastructure/mappers/engineering-document.mapper';
import {
  EngineeringDocumentRepository,
  EngineeringDocumentVersionRepository,
  TaskDisciplineReviewRoles,
  TaskDisciplineScopeRepository,
} from '../../infrastructure/repositories/epc-storage.repository';
import { EngineeringDocumentFolderService, type DocumentFolderRef } from './engineering-document-folder.service';
import { ConflictGuardService } from './conflict-guard.service';
import { WorkflowEventLogService } from './workflow-event-log.service';
import { WorkflowKernelService } from './workflow-kernel.service';
import { WorkflowResultSnapshot } from '../../domain/contracts/workflow-kernel.contract';

@Injectable()
export class EngineeringDocumentsService {
  constructor(
    private readonly engineeringDocumentRepository: EngineeringDocumentRepository,
    private readonly engineeringDocumentVersionRepository: EngineeringDocumentVersionRepository,
    private readonly taskDisciplineScopeRepository: TaskDisciplineScopeRepository,
    private readonly folderService: EngineeringDocumentFolderService,
    private readonly conflictGuard: ConflictGuardService,
    private readonly workflowEventLogService: WorkflowEventLogService,
    private readonly workflowKernel: WorkflowKernelService,
    private readonly documentService: DocumentService,
    private readonly prisma: PrismaService,
  ) {}

  /**
   * Presigned download URL for an EDV file in a project context.
   */
  async getEdvDownloadUrl(
    ctx: PmContext,
    projectId: string,
    edvId: string,
  ): Promise<{
    url: string;
    fileName: string;
    fileSizeBytes: number;
    expiresIn: number;
  }> {
    const edv = await this.prisma.engineeringDocumentVersion.findFirst({
      where: activeOnly({ id: edvId, companyId: ctx.companyId }),
      include: {
        engineeringDocument: {
          include: {
            taskDiscipline: {
              include: { task: { select: { projectId: true } } },
            },
          },
        },
        documentVersion: {
          select: { id: true, fileSizeBytes: true },
        },
      },
    });
    if (
      !edv ||
      edv.engineeringDocument.taskDiscipline.task.projectId !== projectId
    ) {
      throw new NotFoundException('Engineering document version not found');
    }

    const presigned = await this.documentService.getVersionDownloadUrl(
      ctx,
      edv.documentVersionId,
    );

    return {
      url: presigned.url,
      expiresIn: presigned.expiresIn,
      fileName: edv.engineeringDocument.title,
      fileSizeBytes: edv.documentVersion.fileSizeBytes,
    };
  }

  /**
   * Lists engineering documents for a task discipline.
   */
  async list(
    ctx: PmContext,
    projectId: string,
    taskDisciplineId: string,
    query: EngineeringDocumentListQueryDto,
  ): Promise<PaginatedResult<MappedEngineeringDocument>> {
    await this.assertDisciplineScope(ctx, projectId, taskDisciplineId);
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const { skip, take } = buildPrismaPagination(page, limit);
    const [rows, total] = await Promise.all([
      this.engineeringDocumentRepository.findMany(
        ctx.companyId,
        taskDisciplineId,
        skip,
        take,
      ),
      this.engineeringDocumentRepository.count(ctx.companyId, taskDisciplineId),
    ]);
    return buildPaginatedResult(
      rows.map(mapEngineeringDocument),
      total,
      page,
      limit,
    );
  }

  /**
   * Gets a single engineering document with versions.
   */
  async getById(
    ctx: PmContext,
    projectId: string,
    taskDisciplineId: string,
    id: string,
  ): Promise<MappedEngineeringDocument> {
    await this.assertDisciplineScope(ctx, projectId, taskDisciplineId);
    const row = await this.engineeringDocumentRepository.findById(
      ctx.companyId,
      id,
    );
    if (!row || row.taskDisciplineId !== taskDisciplineId) {
      throw new NotFoundException('Engineering document not found');
    }
    return mapEngineeringDocument(row);
  }

  /**
   * Registers a core DocumentVersion as EngineeringDocument Rev 0 (status stored as DRAFT).
   */
  async registerFromUpload(
    ctx: PmContext,
    projectId: string,
    taskDisciplineId: string,
    dto: RegisterEngineeringDocumentDto,
  ): Promise<MappedEngineeringDocument> {
    const discipline = await this.assertDisciplineScope(
      ctx,
      projectId,
      taskDisciplineId,
    );
    await this.assertDesignerAssignment(ctx, discipline);

    if (!dto.documentNumber?.trim()) {
      throw new BadRequestException(
        'Document number is required for engineering documents.',
      );
    }

    await this.folderService.ensureDisciplineFolder(
      ctx,
      projectId,
      taskDisciplineId,
      discipline.disciplineName,
    );

    const docVersion = await this.taskDisciplineScopeRepository.findDocumentVersion(
      ctx.companyId,
      dto.documentVersionId,
    );
    if (!docVersion) {
      throw new NotFoundException('Document version not found');
    }

    const metadata = (dto.metadata ?? {}) as Prisma.InputJsonValue;

    const created = await this.engineeringDocumentRepository.createWithInitialCurrentVersion(
      {
        company: { connect: { id: ctx.companyId } },
        taskDiscipline: { connect: { id: taskDisciplineId } },
        documentType: dto.documentType,
        documentNumber: dto.documentNumber.trim(),
        title: dto.title,
        metadata,
        createdBy: ctx.userId,
        updatedBy: ctx.userId,
      },
      {
        company: { connect: { id: ctx.companyId } },
        documentVersion: { connect: { id: dto.documentVersionId } },
        revisionLabel: '0',
        status: EdvStatus.DRAFT,
        createdBy: ctx.userId,
        updatedBy: ctx.userId,
      },
    );

    const withVersions = await this.engineeringDocumentRepository.findById(
      ctx.companyId,
      created.id,
    );

    await this.workflowEventLogService.logCrud(
      ctx,
      WorkflowEntityType.EngineeringDocumentVersion,
      withVersions!.versions[0]!.id,
      'REGISTERED',
      {},
      { status: EdvStatus.DRAFT, revisionLabel: '0' },
    );

    return mapEngineeringDocument(withVersions!);
  }

  /**
   * Creates a new EDV row linked to an uploaded core DocumentVersion (dumb storage).
   */
  async uploadNewVersion(
    ctx: PmContext,
    projectId: string,
    taskDisciplineId: string,
    engineeringDocumentId: string,
    dto: UploadEngineeringDocumentVersionDto,
  ): Promise<MappedEngineeringDocumentVersion> {
    const discipline = await this.assertDisciplineScope(ctx, projectId, taskDisciplineId);
    await this.assertDesignerAssignment(ctx, discipline);

    const document = await this.engineeringDocumentRepository.findById(
      ctx.companyId,
      engineeringDocumentId,
    );
    if (!document || document.taskDisciplineId !== taskDisciplineId) {
      throw new NotFoundException('Engineering document not found');
    }

    await this.conflictGuard.assertNoActiveSessionForEngineeringDocument(
      ctx.companyId,
      engineeringDocumentId,
    );

    const docVersion = await this.taskDisciplineScopeRepository.findDocumentVersion(
      ctx.companyId,
      dto.documentVersionId,
    );
    if (!docVersion) {
      throw new NotFoundException('Document version not found');
    }

    const existingVersions =
      await this.engineeringDocumentVersionRepository.findByDocumentId(
        ctx.companyId,
        engineeringDocumentId,
      );

    // Return-for-rework reverts IN_REVIEW → DRAFT on the same EDV. Creating a
    // second draft via TransitionEdvStatus requires revision.trigger (primary
    // designer only) and fails for package/supporting designers. Replace the
    // returned draft's file instead - same permission model as upload itself.
    const isReworkUpload = await this.conflictGuard.isReturnedForRework(
      ctx.companyId,
      engineeringDocumentId,
    );

    if (isReworkUpload) {
      const returnedDraft =
        existingVersions.find(
          (v) => v.status === EdvStatus.DRAFT && v.isCurrent,
        ) ?? existingVersions.find((v) => v.status === EdvStatus.DRAFT);

      if (returnedDraft) {
        const previousDocumentVersionId = returnedDraft.documentVersionId;
        const row = await this.engineeringDocumentVersionRepository.update(
          returnedDraft.id,
          {
            documentVersion: { connect: { id: dto.documentVersionId } },
            updatedBy: ctx.userId,
          },
        );

        await this.engineeringDocumentVersionRepository.retargetPackageItemsToNewEdv(
          ctx.companyId,
          existingVersions
            .filter((prior) => prior.id !== returnedDraft.id)
            .filter((prior) => prior.status !== EdvStatus.LOCKED)
            .map((prior) => prior.id),
          returnedDraft.id,
        );

        await this.workflowEventLogService.logCrud(
          ctx,
          WorkflowEntityType.EngineeringDocumentVersion,
          returnedDraft.id,
          'VERSION_FILE_REPLACED',
          { documentVersionId: previousDocumentVersionId },
          { documentVersionId: dto.documentVersionId, reason: 'rework_upload' },
        );

        return mapEngineeringDocumentVersion(row);
      }
    }

    const lockstep = validateNewRevisionUpload({
      existingEdvStatuses: existingVersions.map((v) => v.status as DomainEdvStatus),
    });
    if (!lockstep.allowed) {
      throw new BadRequestException(lockstep.message);
    }

    for (const prior of existingVersions) {
      if (
        prior.status !== EdvStatus.LOCKED &&
        prior.status !== EdvStatus.SUPERSEDED
      ) {
        await this.workflowKernel.execute({
          type: 'TransitionEdvStatus',
          companyId: ctx.companyId,
          actorId: ctx.userId,
          engineeringDocumentVersionId: prior.id,
          targetStatus: DomainEdvStatus.SUPERSEDED,
          reason: 'Superseded by new revision upload',
        });
      }
    }

    const revisionLabel =
      dto.revisionLabel ??
      String(
        await this.engineeringDocumentVersionRepository.countByDocument(
          engineeringDocumentId,
        ),
      );

    const version = await this.engineeringDocumentVersionRepository.createAsCurrent(
      {
        company: { connect: { id: ctx.companyId } },
        engineeringDocument: { connect: { id: engineeringDocumentId } },
        documentVersion: { connect: { id: dto.documentVersionId } },
        revisionLabel,
        status: EdvStatus.DRAFT,
        createdBy: ctx.userId,
        updatedBy: ctx.userId,
      },
      ctx.companyId,
      engineeringDocumentId,
      ctx.userId,
    );

    await this.engineeringDocumentVersionRepository.retargetPackageItemsToNewEdv(
      ctx.companyId,
      existingVersions
        .filter((prior) => prior.status !== EdvStatus.LOCKED)
        .map((prior) => prior.id),
      version.id,
    );

    await this.workflowEventLogService.logCrud(
      ctx,
      WorkflowEntityType.EngineeringDocumentVersion,
      version.id,
      'VERSION_CREATED',
      {},
      { status: version.status, revisionLabel: version.revisionLabel },
    );

    return mapEngineeringDocumentVersion(version);
  }

  /**
   * Updates engineering document metadata.
   */
  async update(
    ctx: PmContext,
    projectId: string,
    taskDisciplineId: string,
    id: string,
    dto: UpdateEngineeringDocumentDto,
  ): Promise<MappedEngineeringDocument> {
    const discipline = await this.assertDisciplineScope(ctx, projectId, taskDisciplineId);
    await this.assertDesignerAssignment(ctx, discipline);
    const existing = await this.engineeringDocumentRepository.findById(
      ctx.companyId,
      id,
    );
    if (!existing || existing.taskDisciplineId !== taskDisciplineId) {
      throw new NotFoundException('Engineering document not found');
    }

    const row = await this.engineeringDocumentRepository.update(id, {
      title: dto.title,
      documentNumber: dto.documentNumber,
      metadata:
        dto.metadata !== undefined
          ? (dto.metadata as Prisma.InputJsonValue)
          : undefined,
      updatedBy: ctx.userId,
    });

    const refreshed = await this.engineeringDocumentRepository.findById(
      ctx.companyId,
      row.id,
    );
    return mapEngineeringDocument(refreshed!);
  }

  /**
   * Updates EDV revision label only - status changes must use transitionEdvStatus.
   */
  async updateVersion(
    ctx: PmContext,
    projectId: string,
    taskDisciplineId: string,
    engineeringDocumentId: string,
    versionId: string,
    dto: UpdateEngineeringDocumentVersionDto,
  ): Promise<MappedEngineeringDocumentVersion> {
    const discipline = await this.assertDisciplineScope(ctx, projectId, taskDisciplineId);
    await this.assertDesignerAssignment(ctx, discipline);

    const document = await this.engineeringDocumentRepository.findById(
      ctx.companyId,
      engineeringDocumentId,
    );
    if (!document || document.taskDisciplineId !== taskDisciplineId) {
      throw new NotFoundException('Engineering document not found');
    }

    const existing = await this.engineeringDocumentVersionRepository.findById(
      ctx.companyId,
      versionId,
    );
    if (!existing || existing.engineeringDocumentId !== engineeringDocumentId) {
      throw new NotFoundException('Engineering document version not found');
    }

    const row = await this.engineeringDocumentVersionRepository.update(versionId, {
      revisionLabel: dto.revisionLabel,
      updatedBy: ctx.userId,
    });

    return mapEngineeringDocumentVersion(row);
  }

  /**
   * Replaces the stored file on an active DRAFT EDV (e.g. after external revision trigger).
   */
  async replaceDraftVersionFile(
    ctx: PmContext,
    projectId: string,
    engineeringDocumentId: string,
    versionId: string,
    dto: ReplaceDraftVersionFileDto,
  ): Promise<MappedEngineeringDocumentVersion> {
    const document = await this.engineeringDocumentRepository.findById(
      ctx.companyId,
      engineeringDocumentId,
    );
    if (!document) {
      throw new NotFoundException('Engineering document not found');
    }

    const discipline = await this.assertDisciplineScope(
      ctx,
      projectId,
      document.taskDisciplineId,
    );
    await this.assertDesignerAssignment(ctx, discipline);

    const existing = await this.engineeringDocumentVersionRepository.findById(
      ctx.companyId,
      versionId,
    );
    if (!existing || existing.engineeringDocumentId !== engineeringDocumentId) {
      throw new NotFoundException('Engineering document version not found');
    }
    if (existing.status !== EdvStatus.DRAFT) {
      throw new BadRequestException(
        'Only draft revisions can receive a replacement file',
      );
    }

    const docVersion = await this.taskDisciplineScopeRepository.findDocumentVersion(
      ctx.companyId,
      dto.documentVersionId,
    );
    if (!docVersion) {
      throw new NotFoundException('Document version not found');
    }

    const row = await this.engineeringDocumentVersionRepository.update(versionId, {
      documentVersion: { connect: { id: dto.documentVersionId } },
      updatedBy: ctx.userId,
    });

    await this.workflowEventLogService.logCrud(
      ctx,
      WorkflowEntityType.EngineeringDocumentVersion,
      versionId,
      'VERSION_FILE_REPLACED',
      { documentVersionId: existing.documentVersionId },
      { documentVersionId: dto.documentVersionId },
    );

    return mapEngineeringDocumentVersion(row);
  }

  /**
   * Transitions EDV lifecycle status via WorkflowKernel Phase A.
   */
  async transitionEdvStatus(
    ctx: PmContext,
    projectId: string,
    taskDisciplineId: string,
    engineeringDocumentId: string,
    versionId: string,
    dto: TransitionEdvStatusDto,
  ): Promise<{
    version: MappedEngineeringDocumentVersion;
    workflow: WorkflowResultSnapshot;
  }> {
    await this.assertDisciplineScope(ctx, projectId, taskDisciplineId);

    const document = await this.engineeringDocumentRepository.findById(
      ctx.companyId,
      engineeringDocumentId,
    );
    if (!document || document.taskDisciplineId !== taskDisciplineId) {
      throw new NotFoundException('Engineering document not found');
    }

    const existing = await this.engineeringDocumentVersionRepository.findById(
      ctx.companyId,
      versionId,
    );
    if (!existing || existing.engineeringDocumentId !== engineeringDocumentId) {
      throw new NotFoundException('Engineering document version not found');
    }

    const workflow = await this.workflowKernel.execute({
      type: 'TransitionEdvStatus',
      companyId: ctx.companyId,
      actorId: ctx.userId,
      engineeringDocumentVersionId: versionId,
      targetStatus: dto.targetStatus as DomainEdvStatus,
      reason: dto.reason,
      idempotencyKey: dto.idempotencyKey,
    });

    const refreshed = await this.engineeringDocumentVersionRepository.findById(
      ctx.companyId,
      versionId,
    );

    return {
      version: mapEngineeringDocumentVersion(refreshed!),
      workflow,
    };
  }

  /**
   * Soft-deletes an engineering document.
   */
  async delete(
    ctx: PmContext,
    projectId: string,
    taskDisciplineId: string,
    id: string,
  ): Promise<void> {
    await this.assertDisciplineScope(ctx, projectId, taskDisciplineId);
    const existing = await this.engineeringDocumentRepository.findById(
      ctx.companyId,
      id,
    );
    if (!existing || existing.taskDisciplineId !== taskDisciplineId) {
      throw new NotFoundException('Engineering document not found');
    }
    await this.engineeringDocumentRepository.softDelete(id, ctx.userId);
  }

  /**
   * Ensures project + discipline folders exist and returns the discipline upload target.
   */
  async resolveUploadFolder(
    ctx: PmContext,
    projectId: string,
    taskDisciplineId: string,
  ): Promise<DocumentFolderRef> {
    const discipline = await this.assertDisciplineScope(
      ctx,
      projectId,
      taskDisciplineId,
    );

    return this.folderService.ensureDisciplineFolder(
      ctx,
      projectId,
      discipline.id,
      discipline.disciplineName,
    );
  }

  private async assertDisciplineScope(
    ctx: PmContext,
    projectId: string,
    taskDisciplineId: string,
  ): Promise<TaskDisciplineReviewRoles> {
    const discipline = await this.taskDisciplineScopeRepository.findWithReviewRoles(
      ctx.companyId,
      taskDisciplineId,
      projectId,
    );
    if (!discipline) {
      throw new NotFoundException('Task discipline not found');
    }
    return discipline;
  }

  /**
   * Asserts the caller is the discipline lead, designer, or supporting designer -
   * or a designer / supporting designer on any active subtask under this discipline.
   */
  private async assertDesignerAssignment(
    ctx: PmContext,
    discipline: TaskDisciplineReviewRoles,
  ): Promise<void> {
    const isDisciplineAssigned =
      discipline.disciplineLeadUserId === ctx.userId ||
      discipline.designerUserId === ctx.userId ||
      discipline.supportingDesignerUserId === ctx.userId;
    if (isDisciplineAssigned) {
      return;
    }

    const onPackage =
      await this.taskDisciplineScopeRepository.hasPackageDesignerAssignment(
        ctx.companyId,
        discipline.id,
        ctx.userId,
      );
    if (onPackage) {
      return;
    }

    throw new ForbiddenException('You are not assigned to this discipline');
  }
}
