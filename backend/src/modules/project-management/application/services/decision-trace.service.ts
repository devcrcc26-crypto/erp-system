import { Injectable, NotFoundException } from '@nestjs/common';
import {
  WorkflowEntityType,
  WorkflowEventLog,
  WorkflowEventPhase,
} from '@prisma/client';
import { PrismaService } from '../../../../shared/prisma/prisma.service';
import { activeOnly } from '../../../../shared/prisma/soft-delete.util';
import { PmContext } from '../types/pm-context.type';
import { loadUserDisplayNameMap } from '../utils/pm-user-names.util';

export interface DecisionTraceEntry {
  readonly id: string;
  readonly entityType: WorkflowEntityType;
  readonly entityId: string;
  readonly engineeringDocumentVersionId: string | null;
  readonly revisionLabel: string | null;
  readonly action: string;
  readonly phase: WorkflowEventPhase;
  readonly actorId: string;
  readonly actorName: string | null;
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

const TRACE_PHASES: readonly WorkflowEventPhase[] = [
  WorkflowEventPhase.INTENT,
  WorkflowEventPhase.COMMITTED,
  WorkflowEventPhase.CORRECTION,
];

/**
 * Event-log query builder for DecisionTraceView lineage.
 */
@Injectable()
export class DecisionTraceService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Builds chronological decision trace across EDV revisions and related
   * review-session / review-comment approval lineage for a document.
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

    const relatedIds = await this.resolveRelatedWorkflowEntityIds(
      ctx.companyId,
      edvIds,
    );

    const events =
      edvIds.length === 0 &&
      relatedIds.sessionIds.length === 0 &&
      relatedIds.commentIds.length === 0
        ? []
        : await this.prisma.workflowEventLog.findMany({
            where: {
              companyId: ctx.companyId,
              phase: { in: [...TRACE_PHASES] },
              OR: [
                ...(edvIds.length > 0
                  ? [
                      {
                        entityType: WorkflowEntityType.EngineeringDocumentVersion,
                        entityId: { in: edvIds },
                      },
                    ]
                  : []),
                ...(relatedIds.sessionIds.length > 0
                  ? [
                      {
                        entityType: WorkflowEntityType.ReviewSession,
                        entityId: { in: relatedIds.sessionIds },
                      },
                    ]
                  : []),
                ...(relatedIds.commentIds.length > 0
                  ? [
                      {
                        entityType: WorkflowEntityType.ReviewComment,
                        entityId: { in: relatedIds.commentIds },
                      },
                    ]
                  : []),
                ...(relatedIds.packageIds.length > 0
                  ? [
                      {
                        entityType: WorkflowEntityType.DesignPackage,
                        entityId: { in: relatedIds.packageIds },
                      },
                    ]
                  : []),
              ],
            },
            orderBy: { createdAt: 'asc' },
          });

    const actorNameMap = await loadUserDisplayNameMap(
      this.prisma,
      ctx.companyId,
      events.map((event) => event.actorId),
    );

    return {
      engineeringDocumentId: document.id,
      taskDisciplineId: document.taskDisciplineId,
      documentNumber: document.documentNumber,
      title: document.title,
      entries: events.map((event) =>
        this.mapEvent(
          event,
          this.resolveRevisionLabel(event, revisionByEdvId),
          actorNameMap.get(event.actorId) ?? null,
        ),
      ),
    };
  }

  /**
   * Resolves review sessions, comments, and packages linked to this document's EDVs.
   */
  private async resolveRelatedWorkflowEntityIds(
    companyId: string,
    edvIds: readonly string[],
  ): Promise<{
    sessionIds: string[];
    commentIds: string[];
    packageIds: string[];
  }> {
    if (edvIds.length === 0) {
      return { sessionIds: [], commentIds: [], packageIds: [] };
    }

    const [packageItems, comments, snapshotSessions] = await Promise.all([
      this.prisma.designPackageItem.findMany({
        where: {
          companyId,
          engineeringDocumentVersionId: { in: [...edvIds] },
        },
        select: { designPackageId: true },
      }),
      this.prisma.reviewComment.findMany({
        where: activeOnly({
          companyId,
          engineeringDocumentVersionId: { in: [...edvIds] },
        }),
        select: { id: true, reviewSessionId: true },
      }),
      this.prisma.reviewContextSnapshot.findMany({
        where: {
          companyId,
          referencedVersionIds: { hasSome: [...edvIds] },
        },
        select: { reviewSessionId: true },
      }),
    ]);

    const packageIds = [
      ...new Set(packageItems.map((item) => item.designPackageId)),
    ];

    const packageSessions =
      packageIds.length === 0
        ? []
        : await this.prisma.reviewSession.findMany({
            where: activeOnly({
              companyId,
              designPackageId: { in: packageIds },
            }),
            select: { id: true },
          });

    const sessionIds = [
      ...new Set([
        ...packageSessions.map((session) => session.id),
        ...snapshotSessions.map((snapshot) => snapshot.reviewSessionId),
        ...comments.map((comment) => comment.reviewSessionId),
      ]),
    ];

    return {
      sessionIds,
      commentIds: comments.map((comment) => comment.id),
      packageIds,
    };
  }

  private resolveRevisionLabel(
    event: WorkflowEventLog,
    revisionByEdvId: Map<string, string>,
  ): string | null {
    if (event.entityType === WorkflowEntityType.EngineeringDocumentVersion) {
      return revisionByEdvId.get(event.entityId) ?? null;
    }

    const after = event.afterState as Record<string, unknown> | null;
    const before = event.beforeState as Record<string, unknown> | null;
    const edvIdCandidate =
      (typeof after?.engineeringDocumentVersionId === 'string'
        ? after.engineeringDocumentVersionId
        : null) ??
      (typeof before?.engineeringDocumentVersionId === 'string'
        ? before.engineeringDocumentVersionId
        : null);

    if (edvIdCandidate) {
      return revisionByEdvId.get(edvIdCandidate) ?? null;
    }

    return null;
  }

  private mapEvent(
    event: WorkflowEventLog,
    revisionLabel: string | null,
    actorName: string | null,
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
      actorName,
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
