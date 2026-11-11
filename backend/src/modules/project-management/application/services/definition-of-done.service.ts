import { ConflictException, Injectable } from '@nestjs/common';
import { CommentStatus as DomainCommentStatus } from '../../domain/contracts/enums/comment-status.enum';
import {
  canApprovePackage,
  canCloseReviewSession,
} from '../../domain/comment-state-machine';

/**
 * Definition-of-done guards for review approval and session close.
 */
@Injectable()
export class DefinitionOfDoneService {
  /**
   * Blocks package/session approval when open comments remain.
   */
  assertPackageApprovalAllowed(
    commentStatuses: readonly DomainCommentStatus[],
  ): void {
    if (!canApprovePackage(commentStatuses)) {
      throw new ConflictException(
        'Approval blocked: all comments must be VERIFIED or CLOSED',
      );
    }
  }

  /**
   * Blocks session close when comments are not VERIFIED or CLOSED.
   */
  assertSessionCloseAllowed(
    commentStatuses: readonly DomainCommentStatus[],
  ): void {
    if (!canCloseReviewSession(commentStatuses)) {
      throw new ConflictException(
        'Session cannot close until all comments are VERIFIED or CLOSED',
      );
    }
  }
}
