import { Injectable } from '@nestjs/common';
import { CommentStatus } from '../../domain/contracts/enums/comment-status.enum';
import {
  AddReviewCommentDto,
  TransitionReviewCommentDto,
  VerifyReviewCommentDto,
} from '../dtos/engineering-document.dtos';
import { PmContext } from '../types/pm-context.type';
import { WorkflowResultSnapshot } from '../../domain/contracts/workflow-kernel.contract';
import { WorkflowKernelService } from './workflow-kernel.service';

/**
 * Thin wrapper over WorkflowKernel for review comment mutations.
 */
@Injectable()
export class ReviewCommentsService {
  constructor(private readonly workflowKernel: WorkflowKernelService) {}

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
}
