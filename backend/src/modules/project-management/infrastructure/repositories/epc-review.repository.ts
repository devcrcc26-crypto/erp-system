import { Injectable } from '@nestjs/common';
import {
  CommentSeverity,
  CommentStatus,
  DesignPackage,
  DesignPackageDependency,
  DesignPackageDependencyType,
  EdvStatus,
  Prisma,
  ReviewComment,
  ReviewContextSnapshot,
  ReviewSession,
  ReviewSessionAttachment,
  ReviewSessionOutcome,
  ReviewSessionStatus,
  ReviewTier,
  TaskDiscipline,
  WorkflowEntityType,
  WorkflowEventPhase,
} from '@prisma/client';
import { PrismaService } from '../../../../shared/prisma/prisma.service';
import { activeOnly } from '../../../../shared/prisma/soft-delete.util';
import { PrismaTx } from './epc-workflow.repository';

export interface ReviewSessionWithSnapshot extends ReviewSession {
  contextSnapshot: ReviewContextSnapshot | null;
  comments: ReviewComment[];
}

export type ReviewSessionAttachmentWithRelations = ReviewSessionAttachment & {
  attachedByUser: {
    id: string;
    firstName: string;
    lastName: string;
    chineseName: string | null;
  };
  document: { id: string; name: string };
};

@Injectable()
export class EpcReviewRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findActiveSessionForPackage(
    tx: PrismaTx,
    companyId: string,
    designPackageId: string,
  ): Promise<ReviewSession | null> {
    return tx.reviewSession.findFirst({
      where: activeOnly({
        companyId,
        designPackageId,
        status: ReviewSessionStatus.ACTIVE,
      }),
    });
  }

  async findSessionById(
    tx: PrismaTx,
    companyId: string,
    reviewSessionId: string,
  ): Promise<ReviewSessionWithSnapshot | null> {
    return tx.reviewSession.findFirst({
      where: activeOnly({ id: reviewSessionId, companyId }),
      include: {
        contextSnapshot: true,
        comments: { where: { deletedAt: null }, orderBy: { createdAt: 'asc' } },
      },
    });
  }

  async findActiveSessionForEdv(
    tx: PrismaTx,
    companyId: string,
    engineeringDocumentVersionId: string,
  ): Promise<ReviewSession | null> {
    const item = await tx.designPackageItem.findFirst({
      where: { companyId, engineeringDocumentVersionId },
      select: { designPackageId: true },
    });
    if (!item) {
      return null;
    }
    return this.findActiveSessionForPackage(tx, companyId, item.designPackageId);
  }

  async findActiveSessionForEngineeringDocument(
    companyId: string,
    engineeringDocumentId: string,
  ): Promise<ReviewSession | null> {
    const versions = await this.prisma.engineeringDocumentVersion.findMany({
      where: activeOnly({ companyId, engineeringDocumentId }),
      select: { id: true },
    });

    for (const version of versions) {
      const session = await this.prisma.reviewSession.findFirst({
        where: activeOnly({
          companyId,
          status: ReviewSessionStatus.ACTIVE,
          designPackage: {
            items: { some: { engineeringDocumentVersionId: version.id } },
          },
        }),
      });
      if (session) {
        return session;
      }
    }

    return null;
  }

  /**
   * Finds a RETURNED_FOR_REWORK session covering any version of this document
   * (designer is expected to upload revisions while the package is returned).
   */
  async findReturnedSessionForEngineeringDocument(
    companyId: string,
    engineeringDocumentId: string,
  ): Promise<ReviewSession | null> {
    const versions = await this.prisma.engineeringDocumentVersion.findMany({
      where: activeOnly({ companyId, engineeringDocumentId }),
      select: { id: true },
    });

    for (const version of versions) {
      const session = await this.prisma.reviewSession.findFirst({
        where: activeOnly({
          companyId,
          status: ReviewSessionStatus.RETURNED_FOR_REWORK,
          designPackage: {
            items: { some: { engineeringDocumentVersionId: version.id } },
          },
        }),
      });
      if (session) {
        return session;
      }
    }

    return null;
  }

  async createReviewSession(
    tx: PrismaTx,
    input: {
      companyId: string;
      designPackageId: string;
      taskDisciplineId: string;
      assignedToUserId: string | null;
      currentTier: ReviewTier;
      slaDeadlineAt: Date;
      createdBy: string;
    },
  ): Promise<ReviewSession> {
    return tx.reviewSession.create({
      data: {
        company: { connect: { id: input.companyId } },
        designPackage: { connect: { id: input.designPackageId } },
        taskDiscipline: { connect: { id: input.taskDisciplineId } },
        assignedToUser: input.assignedToUserId
          ? { connect: { id: input.assignedToUserId } }
          : undefined,
        currentTier: input.currentTier,
        slaDeadlineAt: input.slaDeadlineAt,
        createdBy: input.createdBy,
        updatedBy: input.createdBy,
      },
    });
  }

  async createContextSnapshot(
    tx: PrismaTx,
    input: {
      companyId: string;
      reviewSessionId: string;
      referencedVersionIds: readonly string[];
      contentHash: string;
      capturedBy: string;
    },
  ): Promise<ReviewContextSnapshot> {
    return tx.reviewContextSnapshot.create({
      data: {
        companyId: input.companyId,
        reviewSessionId: input.reviewSessionId,
        referencedVersionIds: [...input.referencedVersionIds],
        contentHash: input.contentHash,
        capturedBy: input.capturedBy,
      },
    });
  }

  /**
   * Refreshes the frozen context for a reopened review session.
   */
  async upsertContextSnapshot(
    tx: PrismaTx,
    input: {
      companyId: string;
      reviewSessionId: string;
      referencedVersionIds: readonly string[];
      contentHash: string;
      capturedBy: string;
    },
  ): Promise<ReviewContextSnapshot> {
    const existing = await tx.reviewContextSnapshot.findUnique({
      where: { reviewSessionId: input.reviewSessionId },
    });
    if (!existing) {
      return this.createContextSnapshot(tx, input);
    }
    return tx.reviewContextSnapshot.update({
      where: { id: existing.id },
      data: {
        referencedVersionIds: [...input.referencedVersionIds],
        contentHash: input.contentHash,
        capturedBy: input.capturedBy,
      },
    });
  }

  async updateReviewSession(
    tx: PrismaTx,
    reviewSessionId: string,
    data: Prisma.ReviewSessionUpdateInput,
  ): Promise<ReviewSession> {
    return tx.reviewSession.update({
      where: { id: reviewSessionId },
      data,
    });
  }

  async createReviewComment(
    tx: PrismaTx,
    input: {
      companyId: string;
      reviewSessionId: string;
      engineeringDocumentVersionId: string;
      body?: string;
      commentDocumentVersionId?: string;
      severity: CommentSeverity;
      reviewTier?: ReviewTier;
      assignedToUserId: string;
      createdBy: string;
    },
  ): Promise<ReviewComment> {
    return tx.reviewComment.create({
      data: {
        companyId: input.companyId,
        reviewSessionId: input.reviewSessionId,
        engineeringDocumentVersionId: input.engineeringDocumentVersionId,
        body: input.body?.trim() || null,
        commentDocumentVersionId: input.commentDocumentVersionId,
        severity: input.severity,
        reviewTier: input.reviewTier,
        assignedToUserId: input.assignedToUserId,
        createdBy: input.createdBy,
        updatedBy: input.createdBy,
      },
    });
  }

  /**
   * Links additional (non-primary) EDVs to a review comment created via ReturnPackageForRework.
   */
  async createReviewCommentDocuments(
    tx: PrismaTx,
    input: {
      reviewCommentId: string;
      engineeringDocumentVersionIds: readonly string[];
      createdBy: string;
    },
  ): Promise<void> {
    if (input.engineeringDocumentVersionIds.length === 0) {
      return;
    }
    await tx.reviewCommentDocument.createMany({
      data: input.engineeringDocumentVersionIds.map((engineeringDocumentVersionId) => ({
        reviewCommentId: input.reviewCommentId,
        engineeringDocumentVersionId,
        createdBy: input.createdBy,
      })),
    });
  }

  /**
   * Links additional (non-primary) attachment files to a review comment created via ReturnPackageForRework.
   * fileName is resolved from the linked Document's registered name (same convention as the primary
   * commentDocumentVersion attachment display name).
   */
  async createReviewCommentFiles(
    tx: PrismaTx,
    input: {
      reviewCommentId: string;
      documentVersionIds: readonly string[];
      createdBy: string;
      isResponseFile?: boolean;
    },
  ): Promise<void> {
    if (input.documentVersionIds.length === 0) {
      return;
    }
    const versions = await tx.documentVersion.findMany({
      where: { id: { in: [...input.documentVersionIds] } },
      select: { id: true, document: { select: { name: true } } },
    });
    const nameById = new Map(versions.map((v) => [v.id, v.document.name]));
    await tx.reviewCommentFile.createMany({
      data: input.documentVersionIds.map((documentVersionId) => ({
        reviewCommentId: input.reviewCommentId,
        documentVersionId,
        fileName: nameById.get(documentVersionId) ?? 'Attachment',
        isResponseFile: input.isResponseFile ?? false,
        createdBy: input.createdBy,
      })),
    });
  }

  async findCommentById(
    tx: PrismaTx,
    companyId: string,
    reviewCommentId: string,
  ): Promise<(ReviewComment & { reviewSession: ReviewSession }) | null> {
    return tx.reviewComment.findFirst({
      where: activeOnly({ id: reviewCommentId, companyId }),
      include: { reviewSession: true },
    });
  }

  async findCommentWithUsers(
    companyId: string,
    reviewCommentId: string,
  ): Promise<
    | (ReviewComment & {
        author: {
          id: string;
          firstName: string;
          lastName: string;
          chineseName: string | null;
          email: string | null;
        };
        assignedToUser: {
          id: string;
          firstName: string;
          lastName: string;
          chineseName: string | null;
          email: string | null;
        };
        reviewSession: { id: string; designPackageId: string; status: ReviewSessionStatus };
        commentDocumentVersion: { id: string; document: { id: string; name: string } } | null;
        responseDocumentVersion: { id: string; document: { id: string; name: string } } | null;
        files: {
          id: string;
          documentVersionId: string;
          fileName: string;
          isResponseFile: boolean;
        }[];
      })
    | null
  > {
    return this.prisma.reviewComment.findFirst({
      where: activeOnly({ id: reviewCommentId, companyId }),
      include: {
        author: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            chineseName: true,
            email: true,
          },
        },
        assignedToUser: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            chineseName: true,
            email: true,
          },
        },
        reviewSession: {
          select: { id: true, designPackageId: true, status: true },
        },
        commentDocumentVersion: {
          select: { id: true, document: { select: { id: true, name: true } } },
        },
        responseDocumentVersion: {
          select: { id: true, document: { select: { id: true, name: true } } },
        },
        files: {
          select: {
            id: true,
            documentVersionId: true,
            fileName: true,
            isResponseFile: true,
          },
        },
      },
    });
  }

  async updateReviewComment(
    tx: PrismaTx,
    reviewCommentId: string,
    data: Prisma.ReviewCommentUpdateInput,
  ): Promise<ReviewComment> {
    return tx.reviewComment.update({
      where: { id: reviewCommentId },
      data,
    });
  }

  async softDeleteReviewComment(
    tx: PrismaTx,
    reviewCommentId: string,
    deletedBy: string,
  ): Promise<ReviewComment> {
    return tx.reviewComment.update({
      where: { id: reviewCommentId },
      data: {
        deletedAt: new Date(),
        deletedBy,
        updatedBy: deletedBy,
      },
    });
  }

  async listCommentStatusesForSession(
    tx: PrismaTx,
    companyId: string,
    reviewSessionId: string,
  ): Promise<CommentStatus[]> {
    const rows = await tx.reviewComment.findMany({
      where: activeOnly({ companyId, reviewSessionId }),
      select: { status: true },
    });
    return rows.map((r) => r.status);
  }

  async listCommentStatusesForPackageEdvs(
    tx: PrismaTx,
    companyId: string,
    designPackageId: string,
    reviewSessionId: string,
  ): Promise<CommentStatus[]> {
    const items = await tx.designPackageItem.findMany({
      where: { companyId, designPackageId },
      select: { engineeringDocumentVersionId: true },
    });
    const edvIds = items.map((i) => i.engineeringDocumentVersionId);
    if (edvIds.length === 0) {
      return [];
    }

    const rows = await tx.reviewComment.findMany({
      where: activeOnly({
        companyId,
        reviewSessionId,
        engineeringDocumentVersionId: { in: edvIds },
      }),
      select: { status: true },
    });
    return rows.map((r) => r.status);
  }

  async findPackageDependencies(
    tx: PrismaTx,
    companyId: string,
    designPackageId: string,
  ): Promise<DesignPackageDependency[]> {
    return tx.designPackageDependency.findMany({
      where: { companyId, designPackageId },
    });
  }

  async findPackageWithDiscipline(
    tx: PrismaTx,
    companyId: string,
    designPackageId: string,
  ): Promise<(DesignPackage & { taskDiscipline: TaskDiscipline }) | null> {
    return tx.designPackage.findFirst({
      where: activeOnly({ id: designPackageId, companyId }),
      include: { taskDiscipline: true },
    });
  }

  async findLockedEdvIdsForPackage(
    tx: PrismaTx,
    companyId: string,
    designPackageId: string,
  ): Promise<string[]> {
    const items = await tx.designPackageItem.findMany({
      where: { companyId, designPackageId },
      select: { engineeringDocumentVersionId: true },
    });
    if (items.length === 0) {
      return [];
    }

    const versions = await tx.engineeringDocumentVersion.findMany({
      where: activeOnly({
        companyId,
        id: { in: items.map((i) => i.engineeringDocumentVersionId) },
        status: EdvStatus.LOCKED,
      }),
      select: { id: true },
    });
    return versions.map((v) => v.id);
  }

  async markPackageSubmitted(
    tx: PrismaTx,
    designPackageId: string,
    updatedBy: string,
  ): Promise<void> {
    await tx.designPackage.update({
      where: { id: designPackageId },
      data: { submittedAt: new Date(), updatedBy },
    });
  }

  async appendWorkflowIntentEvent(
    tx: PrismaTx,
    input: {
      companyId: string;
      actorId: string;
      entityType: WorkflowEntityType;
      entityId: string;
      action: string;
      beforeState: Prisma.InputJsonValue;
      afterState: Prisma.InputJsonValue;
      reason?: string;
      correlationId?: string;
    },
  ): Promise<void> {
    await tx.workflowEventLog.create({
      data: {
        company: { connect: { id: input.companyId } },
        actor: { connect: { id: input.actorId } },
        entityType: input.entityType,
        entityId: input.entityId,
        action: input.action,
        phase: WorkflowEventPhase.INTENT,
        beforeState: input.beforeState,
        afterState: input.afterState,
        reason: input.reason,
        correlationId: input.correlationId,
      },
    });
  }

  async findAllOverdueActiveSessions(asOf: Date): Promise<ReviewSession[]> {
    return this.prisma.reviewSession.findMany({
      where: activeOnly({
        status: ReviewSessionStatus.ACTIVE,
        slaDeadlineAt: { lte: asOf },
        slaEscalatedAt: null,
      }),
    });
  }

  async findOverdueActiveSessions(
    companyId: string,
    asOf: Date,
  ): Promise<ReviewSession[]> {
    return this.prisma.reviewSession.findMany({
      where: activeOnly({
        companyId,
        status: ReviewSessionStatus.ACTIVE,
        slaDeadlineAt: { lte: asOf },
        slaEscalatedAt: null,
      }),
    });
  }

  /**
   * Marks a session SLA as escalated without changing tier or assignee.
   */
  async markSessionSlaOverdue(
    reviewSessionId: string,
    escalatedAt: Date,
    updatedBy: string,
  ): Promise<ReviewSession> {
    return this.prisma.reviewSession.update({
      where: { id: reviewSessionId },
      data: {
        slaEscalatedAt: escalatedAt,
        updatedBy,
      },
    });
  }

  async listActiveSessions(companyId: string): Promise<ReviewSession[]> {
    return this.prisma.reviewSession.findMany({
      where: activeOnly({ companyId, status: ReviewSessionStatus.ACTIVE }),
      orderBy: { openedAt: 'asc' },
    });
  }

  async closeSessionAsSuperseded(
    tx: PrismaTx,
    reviewSessionId: string,
    reason: string,
    updatedBy: string,
  ): Promise<ReviewSession> {
    return tx.reviewSession.update({
      where: { id: reviewSessionId },
      data: {
        status: ReviewSessionStatus.SUPERSEDED,
        outcome: ReviewSessionOutcome.SUPERSEDED,
        closedAt: new Date(),
        closedReason: reason,
        updatedBy,
      },
    });
  }

  async listSessionsForDiscipline(
    companyId: string,
    taskDisciplineId: string,
    status: ReviewSessionStatus | undefined,
    skip: number,
    take: number,
  ): Promise<{
    rows: Array<
      ReviewSession & {
        designPackage: { id: string; name: string };
        assignedToUser: {
          id: string;
          firstName: string;
          lastName: string;
          chineseName: string | null;
        } | null;
      }
    >;
    total: number;
  }> {
    const where = activeOnly({
      companyId,
      taskDisciplineId,
      ...(status ? { status } : {}),
    });

    const [rows, total] = await Promise.all([
      this.prisma.reviewSession.findMany({
        where,
        skip,
        take,
        orderBy: { openedAt: 'desc' },
        include: {
          designPackage: { select: { id: true, name: true } },
          assignedToUser: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              chineseName: true,
            },
          },
        },
      }),
      this.prisma.reviewSession.count({ where }),
    ]);

    return { rows, total };
  }

  async listSessionsForProject(
    companyId: string,
    projectId: string,
    status: ReviewSessionStatus | undefined,
    skip: number,
    take: number,
  ): Promise<{
    rows: Array<
      ReviewSession & {
        designPackage: { id: string; name: string };
        assignedToUser: {
          id: string;
          firstName: string;
          lastName: string;
          chineseName: string | null;
        } | null;
      }
    >;
    total: number;
  }> {
    const where = activeOnly({
      companyId,
      taskDiscipline: { task: { projectId } },
      ...(status ? { status } : {}),
    });

    const [rows, total] = await Promise.all([
      this.prisma.reviewSession.findMany({
        where,
        skip,
        take,
        orderBy: { openedAt: 'desc' },
        include: {
          designPackage: { select: { id: true, name: true } },
          assignedToUser: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              chineseName: true,
            },
          },
        },
      }),
      this.prisma.reviewSession.count({ where }),
    ]);

    return { rows, total };
  }

  async findSessionSnapshotForPackage(
    companyId: string,
    designPackageId: string,
    reviewSessionId: string,
  ): Promise<
    | (ReviewContextSnapshot & {
        reviewSession: ReviewSession;
        edvDetails: Array<{
          id: string;
          revisionLabel: string;
          status: EdvStatus;
          engineeringDocument: { id: string; title: string };
        }>;
      })
    | null
  > {
    const session = await this.prisma.reviewSession.findFirst({
      where: activeOnly({
        id: reviewSessionId,
        companyId,
        designPackageId,
      }),
      include: {
        contextSnapshot: true,
      },
    });

    if (!session?.contextSnapshot) {
      return null;
    }

    const edvDetails = await this.prisma.engineeringDocumentVersion.findMany({
      where: {
        companyId,
        id: { in: session.contextSnapshot.referencedVersionIds },
        deletedAt: null,
      },
      select: {
        id: true,
        revisionLabel: true,
        status: true,
        engineeringDocument: { select: { id: true, title: true } },
      },
    });

    return {
      ...session.contextSnapshot,
      reviewSession: session,
      edvDetails,
    };
  }

  /**
   * Loads a review session scoped to company (non-transactional reads).
   */
  async findSessionForCompany(
    companyId: string,
    reviewSessionId: string,
  ): Promise<ReviewSession | null> {
    return this.prisma.reviewSession.findFirst({
      where: activeOnly({ id: reviewSessionId, companyId }),
    });
  }

  /**
   * Creates a tier attachment on an active review session.
   */
  async createSessionAttachment(input: {
    companyId: string;
    reviewSessionId: string;
    tier: ReviewTier;
    attachedByUserId: string;
    documentId: string;
    purpose?: string;
    note?: string;
  }): Promise<ReviewSessionAttachmentWithRelations> {
    return this.prisma.reviewSessionAttachment.create({
      data: {
        company: { connect: { id: input.companyId } },
        reviewSession: { connect: { id: input.reviewSessionId } },
        tier: input.tier,
        attachedByUser: { connect: { id: input.attachedByUserId } },
        document: { connect: { id: input.documentId } },
        purpose: input.purpose,
        note: input.note,
      },
      include: {
        attachedByUser: {
          select: { id: true, firstName: true, lastName: true, chineseName: true },
        },
        document: { select: { id: true, name: true } },
      },
    });
  }

  /**
   * Lists all attachments for a review session ordered by attachedAt ASC.
   */
  async listSessionAttachments(
    companyId: string,
    reviewSessionId: string,
  ): Promise<ReviewSessionAttachmentWithRelations[]> {
    return this.prisma.reviewSessionAttachment.findMany({
      where: activeOnly({ companyId, reviewSessionId }),
      orderBy: { attachedAt: 'asc' },
      include: {
        attachedByUser: {
          select: { id: true, firstName: true, lastName: true, chineseName: true },
        },
        document: { select: { id: true, name: true } },
      },
    });
  }

  /**
   * Verifies a document exists for the tenant.
   */
  async findDocumentForCompany(
    companyId: string,
    documentId: string,
  ): Promise<{ id: string } | null> {
    return this.prisma.document.findFirst({
      where: activeOnly({ id: documentId, companyId }),
      select: { id: true },
    });
  }
}
