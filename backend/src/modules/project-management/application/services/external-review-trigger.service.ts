import { Injectable } from '@nestjs/common';
import {
  ExternalReviewTriggerType,
  Prisma,
  SubmittalStatus,
} from '@prisma/client';
import { EpcSubmittalRepository } from '../../infrastructure/repositories/epc-submittal.repository';
import { PrismaTx } from '../../infrastructure/repositories/epc-workflow.repository';

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

/**
 * Records external review outcomes as triggers only — never mutates EDV workflow state.
 */
@Injectable()
export class ExternalReviewTriggerService {
  constructor(private readonly epcSubmittalRepository: EpcSubmittalRepository) {}

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
      note: 'Trigger only — revision orchestrator processes in Wave 6',
    };

    await this.epcSubmittalRepository.createExternalReviewTrigger(tx, {
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
  }
}
