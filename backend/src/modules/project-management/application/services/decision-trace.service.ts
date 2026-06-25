import { Injectable, NotFoundException } from '@nestjs/common';
import {
  WorkflowEntityType,
  WorkflowEventLog,
  WorkflowEventPhase,
} from '@prisma/client';
import { PrismaService } from '../../../../shared/prisma/prisma.service';
import { activeOnly } from '../../../../shared/prisma/soft-delete.util';
import { PmContext } from '../types/pm-context.type';

export interface DecisionTraceEntry {
  readonly id: string;
  readonly entityType: WorkflowEntityType;
  readonly entityId: string;
  readonly engineeringDocumentVersionId: string | null;
  readonly revisionLabel: string | null;
  readonly action: string;
  readonly phase: WorkflowEventPhase;
  readonly actorId: string;
  readonly beforeState: Record<string, unknown>;
  readonly afterState: Record<string, unknown>;
  readonly reason: string | null;
  readonly correlationId: string | null;
  readonly correctsEventId: string | null;
  readonly createdAt: string;
  readonly loop: 'INTERNAL' | 'EXTERNAL';
}

export interface DecisionTraceView {
  readonly engineeringDocumentId: string;
  readonly taskDisciplineId: string;
  readonly documentNumber: string | null;
  readonly title: string;
  readonly entries: readonly DecisionTraceEntry[];
}

const EXTERNAL_ACTION_PREFIXES = [
  'EXTERNAL_',
  'SUBMITTAL_REVIEW',
  'REVISION_TRIGGERED_EXTERNAL',
  'TRIGGER_REVISION',
] as const;

/**
 * Event-log query builder for DecisionTraceView lineage.
 */
@Injectable()
export class DecisionTraceService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Builds chronological decision trace across all EDV revisions for a document.
   */
  async buildForEngineeringDocument(
    ctx: PmContext,
    engineeringDocumentId: string,
  ): Promise<DecisionTraceView> {
    const document = await this.prisma.engineeringDocument.findFirst({
      where: activeOnly({ id: engineeringDocumentId, companyId: ctx.companyId }),
      select: {
        id: true,
        taskDisciplineId: true,
        documentNumber: true,
        title: true,
        versions: {
          where: activeOnly({}),
          select: { id: true, revisionLabel: true },
          orderBy: { createdAt: 'asc' },
        },
      },
    });
    if (!document) {
      throw new NotFoundException('Engineering document not found');
    }

    const edvIds = document.versions.map((v) => v.id);
    const revisionByEdvId = new Map(
      document.versions.map((v) => [v.id, v.revisionLabel]),
    );

    const events =
      edvIds.length === 0
        ? []
        : await this.prisma.workflowEventLog.findMany({
            where: {
              companyId: ctx.companyId,
              entityType: WorkflowEntityType.EngineeringDocumentVersion,
              entityId: { in: edvIds },
              phase: {
                in: [
                  WorkflowEventPhase.INTENT,
                  WorkflowEventPhase.COMMITTED,
                  WorkflowEventPhase.CORRECTION,
                ],
              },
            },
            orderBy: { createdAt: 'asc' },
          });

    return {
      engineeringDocumentId: document.id,
      taskDisciplineId: document.taskDisciplineId,
      documentNumber: document.documentNumber,
      title: document.title,
      entries: events.map((event) =>
        this.mapEvent(event, revisionByEdvId.get(event.entityId) ?? null),
      ),
    };
  }

  private mapEvent(
    event: WorkflowEventLog,
    revisionLabel: string | null,
  ): DecisionTraceEntry {
    const loop = this.resolveLoop(event.action);
    return {
      id: event.id,
      entityType: event.entityType,
      entityId: event.entityId,
      engineeringDocumentVersionId:
        event.entityType === WorkflowEntityType.EngineeringDocumentVersion
          ? event.entityId
          : null,
      revisionLabel,
      action: event.action,
      phase: event.phase,
      actorId: event.actorId,
      beforeState: event.beforeState as Record<string, unknown>,
      afterState: event.afterState as Record<string, unknown>,
      reason: event.reason,
      correlationId: event.correlationId,
      correctsEventId: event.correctsEventId,
      createdAt: event.createdAt.toISOString(),
      loop,
    };
  }

  private resolveLoop(action: string): 'INTERNAL' | 'EXTERNAL' {
    const upper = action.toUpperCase();
    for (const prefix of EXTERNAL_ACTION_PREFIXES) {
      if (upper.includes(prefix)) {
        return 'EXTERNAL';
      }
    }
    return 'INTERNAL';
  }
}
