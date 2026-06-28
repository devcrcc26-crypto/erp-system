import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  ExternalReviewTriggerMode,
  ExternalReviewTriggerStatus,
  ExternalReviewTriggerType,
  Prisma,
  SubmittalStatus,
} from '@prisma/client';
import { PrismaService } from '../../../../shared/prisma/prisma.service';
import {
  buildPaginatedResult,
  buildPrismaPagination,
  PaginatedResult,
} from '../../../../shared/utils/pagination.util';
import { ExternalReviewTriggerListQueryDto, ConfigureRevisionTriggerDto } from '../dtos/pm.dtos';
import { PmContext } from '../types/pm-context.type';
import { EpcSubmittalRepository } from '../../infrastructure/repositories/epc-submittal.repository';
import { PrismaTx } from '../../infrastructure/repositories/epc-workflow.repository';
import { ProjectScopeService } from './project-scope.service';
import { ProjectChangeRequestService } from './project-change-request.service';
import { resolveSourceEntityLabel } from '../utils/source-entity.util';

export interface ExternalReviewTriggerInput {
  readonly companyId: string;
  readonly projectId: string;
  readonly submittalId: string;
  readonly submittalReviewId: string;
  readonly reviewStatus: SubmittalStatus;
  readonly comments?: string;
  readonly submittalItemIds: readonly string[];
  readonly actorId: string;
}

export interface MappedExternalReviewTrigger {
  id: string;
  projectId: string;
  triggerType: ExternalReviewTriggerType;
  sourceEntityType: string;
  sourceEntityId: string;
  sourceEntityLabel: string;
  submittalId: string | null;
  linkedDesignPackageId: string | null;
  triggerMode: ExternalReviewTriggerMode;
  status: ExternalReviewTriggerStatus;
  createdAt: string;
}

/**
 * Records external review outcomes as triggers only - never mutates EDV workflow state.
 */
@Injectable()
export class ExternalReviewTriggerService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly epcSubmittalRepository: EpcSubmittalRepository,
    private readonly projectChangeRequestService: ProjectChangeRequestService,
    private readonly projectScopeService: ProjectScopeService,
  ) {}

  /**
   * Lists external review triggers for a project.
   */
  async listTriggers(
    ctx: PmContext,
    projectId: string,
    query: ExternalReviewTriggerListQueryDto,
  ): Promise<PaginatedResult<MappedExternalReviewTrigger>> {
    await this.projectScopeService.getProjectOrThrow(ctx, projectId);

    const status =
      (query.status as ExternalReviewTriggerStatus | undefined) ??
      ExternalReviewTriggerStatus.PENDING;
    const { skip, take } = buildPrismaPagination(query.page, query.limit);

    const where: Prisma.ExternalReviewTriggerWhereInput = {
      companyId: ctx.companyId,
      projectId,
      status,
    };

    const [rows, total] = await Promise.all([
      this.prisma.externalReviewTrigger.findMany({
        where,
        skip,
        take,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.externalReviewTrigger.count({ where }),
    ]);

    const mapped = await Promise.all(
      rows.map(async (row) => ({
        id: row.id,
        projectId: row.projectId,
        triggerType: row.triggerType,
        sourceEntityType: row.sourceEntityType,
        sourceEntityId: row.sourceEntityId,
        sourceEntityLabel: await resolveSourceEntityLabel(
          this.prisma,
          projectId,
          row.sourceEntityType,
          row.sourceEntityId,
        ),
        submittalId: row.submittalId,
        linkedDesignPackageId: row.linkedDesignPackageId,
        triggerMode: row.triggerMode,
        status: row.status,
        createdAt: row.createdAt.toISOString(),
      })),
    );

    return buildPaginatedResult(mapped, total, query.page, query.limit);
  }

  /**
   * Returns a single external review trigger with source reference details.
   */
  async getTrigger(
    ctx: PmContext,
    projectId: string,
    triggerId: string,
  ): Promise<MappedExternalReviewTrigger & { payload: unknown }> {
    await this.projectScopeService.getProjectOrThrow(ctx, projectId);

    const row = await this.prisma.externalReviewTrigger.findFirst({
      where: { id: triggerId, companyId: ctx.companyId, projectId },
    });
    if (!row) {
      throw new NotFoundException('External review trigger not found');
    }

    return {
      id: row.id,
      projectId: row.projectId,
      triggerType: row.triggerType,
      sourceEntityType: row.sourceEntityType,
      sourceEntityId: row.sourceEntityId,
      sourceEntityLabel: await resolveSourceEntityLabel(
        this.prisma,
        projectId,
        row.sourceEntityType,
        row.sourceEntityId,
      ),
      submittalId: row.submittalId,
      linkedDesignPackageId: row.linkedDesignPackageId,
      triggerMode: row.triggerMode,
      status: row.status,
      createdAt: row.createdAt.toISOString(),
      payload: row.payload,
    };
  }

  /**
   * Configures trigger mode while trigger is still PENDING (discipline leader only).
   */
  async configureTriggerMode(
    ctx: PmContext,
    projectId: string,
    triggerId: string,
    dto: ConfigureRevisionTriggerDto,
  ): Promise<MappedExternalReviewTrigger> {
    await this.projectScopeService.getProjectOrThrow(ctx, projectId);

    const trigger = await this.prisma.externalReviewTrigger.findFirst({
      where: { id: triggerId, companyId: ctx.companyId, projectId },
    });
    if (!trigger) {
      throw new NotFoundException('External review trigger not found');
    }
    if (trigger.status !== ExternalReviewTriggerStatus.PENDING) {
      throw new BadRequestException('Only PENDING triggers can be configured');
    }
    if (!trigger.linkedDesignPackageId) {
      throw new BadRequestException('Trigger has no linked design package');
    }

    const disciplineLeadUserId =
      await this.epcSubmittalRepository.findPackageDisciplineLeadUserId(
        ctx.companyId,
        trigger.linkedDesignPackageId,
      );
    if (!disciplineLeadUserId) {
      throw new NotFoundException('Linked design package discipline not found');
    }
    if (disciplineLeadUserId !== ctx.userId) {
      throw new ForbiddenException(
        'Only the discipline leader can configure a revision trigger.',
      );
    }

    await this.epcSubmittalRepository.updateTriggerMode(
      ctx.companyId,
      triggerId,
      dto.triggerMode as ExternalReviewTriggerMode,
    );

    const updated = await this.prisma.externalReviewTrigger.findFirst({
      where: { id: triggerId, companyId: ctx.companyId, projectId },
    });
    if (!updated) {
      throw new NotFoundException('External review trigger not found');
    }

    return {
      id: updated.id,
      projectId: updated.projectId,
      triggerType: updated.triggerType,
      sourceEntityType: updated.sourceEntityType,
      sourceEntityId: updated.sourceEntityId,
      sourceEntityLabel: await resolveSourceEntityLabel(
        this.prisma,
        projectId,
        updated.sourceEntityType,
        updated.sourceEntityId,
      ),
      submittalId: updated.submittalId,
      linkedDesignPackageId: updated.linkedDesignPackageId,
      triggerMode: updated.triggerMode,
      status: updated.status,
      createdAt: updated.createdAt.toISOString(),
    };
  }

  /**
   * Creates PENDING RFI/CR trigger drafts for revise/reject outcomes.
   */
  async recordFromSubmittalReview(
    tx: PrismaTx,
    input: ExternalReviewTriggerInput,
  ): Promise<void> {
    if (
      input.reviewStatus !== SubmittalStatus.REVISE_AND_RESUBMIT &&
      input.reviewStatus !== SubmittalStatus.REJECTED
    ) {
      return;
    }

    const triggerType =
      input.reviewStatus === SubmittalStatus.REVISE_AND_RESUBMIT
        ? ExternalReviewTriggerType.RFI
        : ExternalReviewTriggerType.CHANGE_REQUEST;

    const payload: Prisma.InputJsonValue = {
      reviewStatus: input.reviewStatus,
      comments: input.comments ?? null,
      note: 'Trigger only - revision orchestrator processes in Wave 6',
    };

    const triggerId = await this.epcSubmittalRepository.createExternalReviewTrigger(tx, {
      companyId: input.companyId,
      projectId: input.projectId,
      triggerType,
      sourceEntityType: 'SubmittalReview',
      sourceEntityId: input.submittalReviewId,
      submittalId: input.submittalId,
      submittalItemIds: input.submittalItemIds,
      payload,
      createdBy: input.actorId,
    });

    await this.projectChangeRequestService.createFromExternalTrigger(tx, {
      companyId: input.companyId,
      projectId: input.projectId,
      triggerId,
      triggerType,
      sourceEntityId: input.submittalReviewId,
      title:
        triggerType === ExternalReviewTriggerType.RFI
          ? 'Submittal RFI revision'
          : 'Submittal change request',
      description: input.comments,
      actorId: input.actorId,
    });
  }
}
