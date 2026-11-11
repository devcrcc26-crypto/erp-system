import { Injectable } from '@nestjs/common';
import {
  BatchReviewApproveDto,
  BatchReviewReturnDto,
} from '../dtos/engineering-document.dtos';
import { PmContext } from '../types/pm-context.type';
import { WorkflowResultSnapshot } from '../../domain/contracts/workflow-kernel.contract';
import { WorkflowKernelService } from './workflow-kernel.service';

/**
 * Cross-package batch review operations (one kernel tx per package unit).
 */
@Injectable()
export class ReviewBatchService {
  constructor(private readonly workflowKernel: WorkflowKernelService) {}

  /**
   * Batch-approves EDVs for a design package.
   */
  async batchApprove(
    ctx: PmContext,
    projectId: string,
    dto: BatchReviewApproveDto,
  ): Promise<WorkflowResultSnapshot> {
    return this.workflowKernel.execute({
      type: 'BatchApproveEdvs',
      companyId: ctx.companyId,
      actorId: ctx.userId,
      designPackageId: dto.designPackageId,
      engineeringDocumentVersionIds: dto.engineeringDocumentVersionIds,
      reviewSessionId: dto.reviewSessionId,
      idempotencyKey: dto.idempotencyKey,
    });
  }

  /**
   * Batch-returns EDVs for a design package with comment template.
   */
  async batchReturn(
    ctx: PmContext,
    projectId: string,
    dto: BatchReviewReturnDto,
  ): Promise<WorkflowResultSnapshot> {
    return this.workflowKernel.execute({
      type: 'BatchReturnEdvs',
      companyId: ctx.companyId,
      actorId: ctx.userId,
      designPackageId: dto.designPackageId,
      engineeringDocumentVersionIds: dto.engineeringDocumentVersionIds,
      reviewSessionId: dto.reviewSessionId,
      commentTemplate: dto.commentTemplate,
      idempotencyKey: dto.idempotencyKey,
    });
  }
}
