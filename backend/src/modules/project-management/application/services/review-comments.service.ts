import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../../shared/prisma/prisma.service';
import { CommentStatus } from '../../domain/contracts/enums/comment-status.enum';
import {
  AddReviewCommentDto,
  TransitionReviewCommentDto,
  UpdateReviewCommentDto,
  VerifyReviewCommentDto,
} from '../dtos/engineering-document.dtos';
import { PmContext } from '../types/pm-context.type';
import { WorkflowResultSnapshot } from '../../domain/contracts/workflow-kernel.contract';
import {
  CommentEdvSnapshot,
  resolveSingleCommentRevisionContext,
} from '../utils/comment-revision-context.util';
import { WorkflowKernelService } from './workflow-kernel.service';
import { EpcReviewRepository } from '../../infrastructure/repositories/epc-review.repository';

export interface MappedCommentAttachment {
  documentVersionId: string;
  name: string;
}

export interface MappedReviewCommentDetail {
  id: string;
  reviewSessionId: string;
  designPackageId: string;
  engineeringDocumentVersionId: string;
  body: string | null;
  severity: string;
  status: CommentStatus | string;
  createdBy: string;
  authorName: string;
  assignedToUserId: string;
  assigneeName: string;
  createdAt: string;
  updatedAt: string;
  resolutionNote: string | null;
  resolvedAt: string | null;
  verifiedAt: string | null;
  commentedOn: CommentEdvSnapshot;
  responseRevision: CommentEdvSnapshot | null;
  attachment: MappedCommentAttachment | null;
  responseAttachment: MappedCommentAttachment | null;
  files: readonly {
    id: string;
    documentVersionId: string;
    fileName: string;
    isResponseFile: boolean;
  }[];
}

/**
 * Thin wrapper over WorkflowKernel for review comment mutations.
 */
@Injectable()
export class ReviewCommentsService {
  constructor(
    private readonly workflowKernel: WorkflowKernelService,
    private readonly epcReviewRepository: EpcReviewRepository,
    private readonly prisma: PrismaService,
  ) {}

  /**
   * Returns a single review comment with author and assignee metadata.
   */
  async getComment(
    ctx: PmContext,
    commentId: string,
  ): Promise<MappedReviewCommentDetail> {
    const comment = await this.epcReviewRepository.findCommentWithUsers(
      ctx.companyId,
      commentId,
    );
    if (!comment) {
      throw new NotFoundException('Review comment not found');
    }

    const revisionContext = await resolveSingleCommentRevisionContext(
      this.prisma,
      ctx.companyId,
      {
        id: comment.id,
        engineeringDocumentVersionId: comment.engineeringDocumentVersionId,
        resolutionNote: comment.resolutionNote,
        resolvedAt: comment.resolvedAt,
        verifiedAt: comment.verifiedAt,
      },
    );

    return mapReviewCommentDetail(comment, revisionContext);
  }

  /**
   * Adds a review comment via WorkflowKernel.
   */
  async addComment(
    ctx: PmContext,
    dto: AddReviewCommentDto,
  ): Promise<WorkflowResultSnapshot> {
    return this.workflowKernel.execute({
      type: 'AddReviewComment',
      companyId: ctx.companyId,
      actorId: ctx.userId,
      reviewSessionId: dto.reviewSessionId,
      engineeringDocumentVersionId: dto.engineeringDocumentVersionId,
      body: dto.body,
      commentDocumentVersionId: dto.commentDocumentVersionId,
      severity: dto.severity,
      assignedToUserId: dto.assignedToUserId,
      idempotencyKey: dto.idempotencyKey,
    });
  }

  /**
   * Transitions comment status via comment state machine.
   */
  async transitionComment(
    ctx: PmContext,
    commentId: string,
    dto: TransitionReviewCommentDto,
  ): Promise<WorkflowResultSnapshot> {
    return this.workflowKernel.execute({
      type: 'TransitionCommentStatus',
      companyId: ctx.companyId,
      actorId: ctx.userId,
      reviewCommentId: commentId,
      targetStatus: dto.targetStatus as CommentStatus,
      resolutionNote: dto.resolutionNote,
      responseDocumentVersionId: dto.responseDocumentVersionId,
      additionalResponseDocumentVersionIds: dto.additionalResponseDocumentVersionIds,
      idempotencyKey: dto.idempotencyKey,
    });
  }

  /**
   * Verifies a RESOLVED comment.
   */
  async verifyComment(
    ctx: PmContext,
    commentId: string,
    dto: VerifyReviewCommentDto,
  ): Promise<WorkflowResultSnapshot> {
    return this.workflowKernel.execute({
      type: 'VerifyReviewComment',
      companyId: ctx.companyId,
      actorId: ctx.userId,
      reviewCommentId: commentId,
      idempotencyKey: dto.idempotencyKey,
    });
  }

  /**
   * Removes an OPEN comment authored by the current user.
   */
  async removeComment(
    ctx: PmContext,
    commentId: string,
  ): Promise<WorkflowResultSnapshot> {
    return this.workflowKernel.execute({
      type: 'RemoveReviewComment',
      companyId: ctx.companyId,
      actorId: ctx.userId,
      reviewCommentId: commentId,
    });
  }

  /**
   * Updates an OPEN comment authored by the current user.
   */
  async updateComment(
    ctx: PmContext,
    commentId: string,
    dto: UpdateReviewCommentDto,
  ): Promise<WorkflowResultSnapshot> {
    return this.workflowKernel.execute({
      type: 'UpdateReviewComment',
      companyId: ctx.companyId,
      actorId: ctx.userId,
      reviewCommentId: commentId,
      engineeringDocumentVersionId: dto.engineeringDocumentVersionId,
      body: dto.body,
      commentDocumentVersionId: dto.commentDocumentVersionId,
      severity: dto.severity,
      assignedToUserId: dto.assignedToUserId,
      idempotencyKey: dto.idempotencyKey,
    });
  }
}

function formatUserName(user: {
  firstName: string;
  lastName: string;
  chineseName?: string | null;
  email: string | null;
}): string {
  const english = `${user.firstName} ${user.lastName}`.trim();
  const chinese = user.chineseName?.trim();
  if (english && chinese) {
    return `${english} (${chinese})`;
  }
  return english || chinese || user.email || 'Unknown user';
}

function mapReviewCommentDetail(
  comment: NonNullable<
    Awaited<ReturnType<EpcReviewRepository['findCommentWithUsers']>>
  >,
  revisionContext: Awaited<ReturnType<typeof resolveSingleCommentRevisionContext>>,
): MappedReviewCommentDetail {
  const commentedOn = revisionContext?.commentedOn ?? {
    engineeringDocumentVersionId: comment.engineeringDocumentVersionId,
    engineeringDocumentId: '',
    documentVersionId: '',
    documentTitle: 'Document',
    revisionLabel: '-',
  };

  return {
    id: comment.id,
    reviewSessionId: comment.reviewSessionId,
    designPackageId: comment.reviewSession.designPackageId,
    engineeringDocumentVersionId: comment.engineeringDocumentVersionId,
    body: comment.body,
    severity: comment.severity,
    status: comment.status,
    createdBy: comment.createdBy,
    authorName: formatUserName(comment.author),
    assignedToUserId: comment.assignedToUserId,
    assigneeName: formatUserName(comment.assignedToUser),
    createdAt: comment.createdAt.toISOString(),
    updatedAt: comment.updatedAt.toISOString(),
    resolutionNote: revisionContext?.resolutionNote ?? comment.resolutionNote,
    resolvedAt: revisionContext?.resolvedAt ?? comment.resolvedAt?.toISOString() ?? null,
    verifiedAt: revisionContext?.verifiedAt ?? comment.verifiedAt?.toISOString() ?? null,
    commentedOn,
    responseRevision: revisionContext?.responseRevision ?? null,
    attachment: comment.commentDocumentVersion
      ? {
          documentVersionId: comment.commentDocumentVersion.id,
          name: comment.commentDocumentVersion.document.name,
        }
      : null,
    responseAttachment: comment.responseDocumentVersion
      ? {
          documentVersionId: comment.responseDocumentVersion.id,
          name: comment.responseDocumentVersion.document.name,
        }
      : null,
    files: comment.files.map((f) => ({
      id: f.id,
      documentVersionId: f.documentVersionId,
      fileName: f.fileName,
      isResponseFile: f.isResponseFile,
    })),
  };
}
