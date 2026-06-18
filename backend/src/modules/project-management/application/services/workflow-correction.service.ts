import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { WorkflowEventPhase, Prisma } from '@prisma/client';
import { PrismaService } from '../../../../shared/prisma/prisma.service';
import { PmContext } from '../types/pm-context.type';
import { MappedWorkflowEventLog, mapWorkflowEventLog } from '../../infrastructure/mappers/engineering-document.mapper';

export interface CreateWorkflowCorrectionDto {
  readonly reason: string;
  readonly afterState?: Record<string, unknown>;
}

/**
 * Append-only CORRECTION events referencing prior log rows.
 */
@Injectable()
export class WorkflowCorrectionService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Appends a CORRECTION event for a prior workflow log entry.
   */
  async correctEvent(
    ctx: PmContext,
    eventId: string,
    dto: CreateWorkflowCorrectionDto,
  ): Promise<MappedWorkflowEventLog> {
    const original = await this.prisma.workflowEventLog.findFirst({
      where: { id: eventId, companyId: ctx.companyId },
    });
    if (!original) {
      throw new NotFoundException('Workflow event not found');
    }
    if (original.phase === WorkflowEventPhase.CORRECTION) {
      throw new BadRequestException('Cannot correct a CORRECTION event');
    }
    if (!dto.reason.trim()) {
      throw new BadRequestException('Correction reason is required');
    }

    const row = await this.prisma.workflowEventLog.create({
      data: {
        companyId: ctx.companyId,
        actorId: ctx.userId,
        entityType: original.entityType,
        entityId: original.entityId,
        action: `CORRECTION_${original.action}`,
        phase: WorkflowEventPhase.CORRECTION,
        beforeState: original.afterState as Prisma.InputJsonValue,
        afterState: (dto.afterState ?? original.afterState) as object,
        reason: dto.reason,
        correlationId: original.correlationId,
        correctsEventId: original.id,
      },
    });

    return mapWorkflowEventLog(row);
  }
}
