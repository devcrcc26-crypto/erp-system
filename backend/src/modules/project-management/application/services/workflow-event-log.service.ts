import { Injectable } from '@nestjs/common';
import {
  Prisma,
  WorkflowEntityType,
  WorkflowEventPhase,
} from '@prisma/client';
import { PaginationQueryDto } from '../../../../shared/dtos/pagination-query.dto';
import {
  buildPaginatedResult,
  buildPrismaPagination,
  PaginatedResult,
} from '../../../../shared/utils/pagination.util';
import { AppendWorkflowEventLogDto } from '../dtos/engineering-document.dtos';
import { PmContext } from '../types/pm-context.type';
import {
  mapWorkflowEventLog,
  MappedWorkflowEventLog,
} from '../../infrastructure/mappers/engineering-document.mapper';
import { WorkflowEventLogRepository } from '../../infrastructure/repositories/epc-storage.repository';

@Injectable()
export class WorkflowEventLogService {
  constructor(
    private readonly workflowEventLogRepository: WorkflowEventLogRepository,
  ) {}

  /**
   * Append-only event log write - no update or delete.
   */
  async append(
    ctx: PmContext,
    dto: AppendWorkflowEventLogDto,
  ): Promise<MappedWorkflowEventLog> {
    const row = await this.workflowEventLogRepository.append({
      company: { connect: { id: ctx.companyId } },
      actor: { connect: { id: ctx.userId } },
      entityType: dto.entityType,
      entityId: dto.entityId,
      action: dto.action,
      phase: dto.phase,
      beforeState: (dto.beforeState ?? {}) as Prisma.InputJsonValue,
      afterState: (dto.afterState ?? {}) as Prisma.InputJsonValue,
      reason: dto.reason,
      correlationId: dto.correlationId,
      correctsEventId: dto.correctsEventId,
    });
    return mapWorkflowEventLog(row);
  }

  /**
   * Lists append-only events for an entity.
   */
  async listByEntity(
    ctx: PmContext,
    entityType: WorkflowEntityType,
    entityId: string,
    query: PaginationQueryDto,
  ): Promise<PaginatedResult<MappedWorkflowEventLog>> {
    const { skip, take } = buildPrismaPagination(query.page, query.limit);
    const [rows, total] = await Promise.all([
      this.workflowEventLogRepository.findByEntity(
        ctx.companyId,
        entityType,
        entityId,
        skip,
        take,
      ),
      this.workflowEventLogRepository.countByEntity(
        ctx.companyId,
        entityType,
        entityId,
      ),
    ]);
    return buildPaginatedResult(
      rows.map(mapWorkflowEventLog),
      total,
      query.page,
      query.limit,
    );
  }

  /**
   * Convenience helper for dumb CRUD audit rows (COMMITTED phase).
   */
  async logCrud(
    ctx: PmContext,
    entityType: WorkflowEntityType,
    entityId: string,
    action: string,
    beforeState: Record<string, unknown> = {},
    afterState: Record<string, unknown> = {},
  ): Promise<void> {
    await this.workflowEventLogRepository.append({
      company: { connect: { id: ctx.companyId } },
      actor: { connect: { id: ctx.userId } },
      entityType,
      entityId,
      action,
      phase: WorkflowEventPhase.COMMITTED,
      beforeState: beforeState as Prisma.InputJsonValue,
      afterState: afterState as Prisma.InputJsonValue,
    });
  }
}
