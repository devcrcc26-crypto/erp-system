import { Injectable, Logger } from '@nestjs/common';
import { WorkflowEventPhase, Prisma } from '@prisma/client';
import { PrismaService } from '../../../../shared/prisma/prisma.service';
import { EpcWorkflowRepository } from '../../infrastructure/repositories/epc-workflow.repository';

/**
 * Writes COMMITTED phase rows mirroring successful INTENT events.
 */
@Injectable()
export class WorkflowCommittedService {
  private readonly logger = new Logger(WorkflowCommittedService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly epcWorkflowRepository: EpcWorkflowRepository,
  ) {}

  /**
   * Commits all INTENT events for a correlation id (idempotent).
   */
  async commitByCorrelation(
    companyId: string,
    correlationId: string,
  ): Promise<number> {
    const intents = await this.epcWorkflowRepository.findIntentEventsByCorrelation(
      companyId,
      correlationId,
    );
    if (intents.length === 0) {
      return 0;
    }

    let written = 0;
    for (const intent of intents) {
      const exists = await this.prisma.workflowEventLog.findFirst({
        where: {
          companyId,
          phase: WorkflowEventPhase.COMMITTED,
          correlationId,
          entityType: intent.entityType,
          entityId: intent.entityId,
          action: intent.action,
        },
      });
      if (exists) {
        continue;
      }

      await this.prisma.workflowEventLog.create({
        data: {
          companyId,
          actorId: intent.actorId,
          entityType: intent.entityType,
          entityId: intent.entityId,
          action: intent.action,
          phase: WorkflowEventPhase.COMMITTED,
          beforeState: intent.beforeState as Prisma.InputJsonValue,
          afterState: intent.afterState as Prisma.InputJsonValue,
          reason: intent.reason,
          correlationId: intent.correlationId,
        },
      });
      written++;
    }

    if (written > 0) {
      this.logger.debug(
        `Committed ${written} workflow events correlation=${correlationId}`,
      );
    }
    return written;
  }
}
