import { Injectable } from '@nestjs/common';
import {
  ExternalReviewTriggerType,
  Prisma,
  ProjectChangeRequestSource,
  ProjectChangeRequestStatus,
} from '@prisma/client';
import { PrismaTx } from '../../infrastructure/repositories/epc-workflow.repository';

/**
 * Creates formal change requests from external review boundary events.
 */
@Injectable()
export class ProjectChangeRequestService {

  /**
   * Drafts a change request from an external review trigger (idempotent per trigger).
   */
  async createFromExternalTrigger(
    tx: PrismaTx,
    input: {
      companyId: string;
      projectId: string;
      triggerId: string;
      triggerType: ExternalReviewTriggerType;
      sourceEntityId: string;
      title: string;
      description?: string;
      actorId: string;
    },
  ): Promise<void> {
    const existing = await tx.projectChangeRequest.findFirst({
      where: {
        companyId: input.companyId,
        externalReviewTriggerId: input.triggerId,
        deletedAt: null,
      },
    });
    if (existing) {
      return;
    }

    const changeNumber = `CR-${input.triggerId.slice(0, 8).toUpperCase()}`;
    const sourceType =
      input.triggerType === ExternalReviewTriggerType.RFI
        ? ProjectChangeRequestSource.RFI
        : input.triggerType === ExternalReviewTriggerType.CHANGE_REQUEST
          ? ProjectChangeRequestSource.EXTERNAL_TRIGGER
          : ProjectChangeRequestSource.SUBMITTAL_REVIEW;

    await tx.projectChangeRequest.create({
      data: {
        companyId: input.companyId,
        projectId: input.projectId,
        changeNumber,
        title: input.title,
        description: input.description,
        status: ProjectChangeRequestStatus.DRAFT,
        sourceType,
        sourceEntityId: input.sourceEntityId,
        externalReviewTriggerId: input.triggerId,
        createdBy: input.actorId,
        updatedBy: input.actorId,
      },
    });
  }
}
