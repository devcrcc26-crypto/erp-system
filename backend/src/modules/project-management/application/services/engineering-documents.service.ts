import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { EdvStatus, Prisma, WorkflowEntityType } from '@prisma/client';
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
  TaskDisciplineScopeRepository,
} from '../../infrastructure/repositories/epc-storage.repository';
import { EngineeringDocumentFolderService } from './engineering-document-folder.service';
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
    private readonly workflowEventLogService: WorkflowEventLogService,
    private readonly workflowKernel: WorkflowKernelService,
  ) {}

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

    await this.folderService.ensureDisciplineFolder(
      ctx,
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

    const created = await this.engineeringDocumentRepository.create({
      company: { connect: { id: ctx.companyId } },
      taskDiscipline: { connect: { id: taskDisciplineId } },
      documentType: dto.documentType,
      documentNumber: dto.documentNumber,
      title: dto.title,
      metadata,
      createdBy: ctx.userId,
      updatedBy: ctx.userId,
      versions: {
        create: {
          company: { connect: { id: ctx.companyId } },
          documentVersion: { connect: { id: dto.documentVersionId } },
          revisionLabel: '0',
          status: EdvStatus.DRAFT,
          createdBy: ctx.userId,
          updatedBy: ctx.userId,
        },
      },
    });

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
    await this.assertDisciplineScope(ctx, projectId, taskDisciplineId);

    const document = await this.engineeringDocumentRepository.findById(
      ctx.companyId,
      engineeringDocumentId,
    );
    if (!document || document.taskDisciplineId !== taskDisciplineId) {
      throw new NotFoundException('Engineering document not found');
    }

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

    const version = await this.engineeringDocumentVersionRepository.create({
      company: { connect: { id: ctx.companyId } },
      engineeringDocument: { connect: { id: engineeringDocumentId } },
      documentVersion: { connect: { id: dto.documentVersionId } },
      revisionLabel,
      status: EdvStatus.DRAFT,
      createdBy: ctx.userId,
      updatedBy: ctx.userId,
    });

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
    await this.assertDisciplineScope(ctx, projectId, taskDisciplineId);
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
   * Updates EDV revision label only — status changes must use transitionEdvStatus.
   */
  async updateVersion(
    ctx: PmContext,
    projectId: string,
    taskDisciplineId: string,
    engineeringDocumentId: string,
    versionId: string,
    dto: UpdateEngineeringDocumentVersionDto,
  ): Promise<MappedEngineeringDocumentVersion> {
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

    const row = await this.engineeringDocumentVersionRepository.update(versionId, {
      revisionLabel: dto.revisionLabel,
      updatedBy: ctx.userId,
    });

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

  private async assertDisciplineScope(
    ctx: PmContext,
    projectId: string,
    taskDisciplineId: string,
  ): Promise<{ id: string; disciplineName: string; taskId: string }> {
    const discipline = await this.taskDisciplineScopeRepository.findScoped(
      ctx.companyId,
      taskDisciplineId,
      projectId,
    );
    if (!discipline) {
      throw new NotFoundException('Task discipline not found');
    }
    return discipline;
  }
}
