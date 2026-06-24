import { Injectable } from '@nestjs/common';
import { CommentSeverity } from '../../domain/contracts/enums/comment-severity.enum';
import { ReviewTier } from '@prisma/client';

export interface ReviewRoutingInput {
  readonly severity: CommentSeverity;
  readonly currentTier: ReviewTier;
}

export interface ReviewRoutingResult {
  readonly escalate: boolean;
  readonly nextTier: ReviewTier | null;
  readonly requiresLeadApproval: boolean;
}

/**
 * Routes review comments by severity - MINOR stays at tier, MAJOR escalates.
 */
@Injectable()
export class ReviewRoutingService {
  /**
   * Determines whether a comment severity requires tier escalation.
   */
  route(input: ReviewRoutingInput): ReviewRoutingResult {
    const { severity, currentTier } = input;

    if (severity === CommentSeverity.MINOR) {
      return {
        escalate: false,
        nextTier: currentTier,
        requiresLeadApproval: false,
      };
    }

    if (severity === CommentSeverity.MODERATE) {
      return {
        escalate: currentTier === ReviewTier.DISCIPLINE_OWNER,
        nextTier:
          currentTier === ReviewTier.DISCIPLINE_OWNER
            ? ReviewTier.REVIEWER
            : currentTier,
        requiresLeadApproval: currentTier === ReviewTier.REVIEWER,
      };
    }

    // MAJOR - escalate to next governance tier when possible
    const tierOrder: ReviewTier[] = [
      ReviewTier.DISCIPLINE_OWNER,
      ReviewTier.REVIEWER,
      ReviewTier.DISCIPLINE_LEAD,
      ReviewTier.DEPT_CHIEF,
    ];
    const index = tierOrder.indexOf(currentTier);
    const nextTier =
      index >= 0 && index < tierOrder.length - 1
        ? tierOrder[index + 1]!
        : null;

    return {
      escalate: nextTier !== null && nextTier !== currentTier,
      nextTier: nextTier ?? currentTier,
      requiresLeadApproval: true,
    };
  }
}
