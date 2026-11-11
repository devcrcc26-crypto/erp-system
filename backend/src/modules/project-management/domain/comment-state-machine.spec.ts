import { CommentStatus } from './contracts/enums/comment-status.enum';
import {
  canApprovePackage,
  canCloseReviewSession,
  canTransitionCommentStatus,
  transitionCommentStatus,
} from './comment-state-machine';

describe('comment-state-machine', () => {
  describe('canTransitionCommentStatus', () => {
    it('allows designer OPEN → ACKNOWLEDGED', () => {
      expect(
        canTransitionCommentStatus(
          CommentStatus.OPEN,
          CommentStatus.ACKNOWLEDGED,
          'designer',
        ).allowed,
      ).toBe(true);
    });

    it('allows designer IN_PROGRESS → RESOLVED', () => {
      expect(
        canTransitionCommentStatus(
          CommentStatus.IN_PROGRESS,
          CommentStatus.RESOLVED,
          'designer',
        ).allowed,
      ).toBe(true);
    });

    it('allows reviewer RESOLVED → VERIFIED', () => {
      expect(
        canTransitionCommentStatus(
          CommentStatus.RESOLVED,
          CommentStatus.VERIFIED,
          'reviewer',
        ).allowed,
      ).toBe(true);
    });

    it('allows reviewer RESOLVED → IN_PROGRESS (reject resolution)', () => {
      expect(
        canTransitionCommentStatus(
          CommentStatus.RESOLVED,
          CommentStatus.IN_PROGRESS,
          'reviewer',
        ).allowed,
      ).toBe(true);
    });

    it('allows system VERIFIED → CLOSED only', () => {
      expect(
        canTransitionCommentStatus(
          CommentStatus.VERIFIED,
          CommentStatus.CLOSED,
          'system',
        ).allowed,
      ).toBe(true);
    });

    it('blocks designer RESOLVED → VERIFIED', () => {
      expect(
        canTransitionCommentStatus(
          CommentStatus.RESOLVED,
          CommentStatus.VERIFIED,
          'designer',
        ).allowed,
      ).toBe(false);
    });

    it('blocks system OPEN → CLOSED', () => {
      expect(
        canTransitionCommentStatus(
          CommentStatus.OPEN,
          CommentStatus.CLOSED,
          'system',
        ).allowed,
      ).toBe(false);
    });

    it('blocks transitions from CLOSED', () => {
      expect(
        canTransitionCommentStatus(
          CommentStatus.CLOSED,
          CommentStatus.OPEN,
          'reviewer',
        ).allowed,
      ).toBe(false);
    });
  });

  describe('transitionCommentStatus', () => {
    it('applies valid transition', () => {
      expect(
        transitionCommentStatus(
          CommentStatus.OPEN,
          CommentStatus.ACKNOWLEDGED,
          'designer',
        ),
      ).toBe(CommentStatus.ACKNOWLEDGED);
    });
  });

  describe('canCloseReviewSession', () => {
    it('returns true when all VERIFIED or CLOSED', () => {
      expect(
        canCloseReviewSession([
          CommentStatus.VERIFIED,
          CommentStatus.CLOSED,
        ]),
      ).toBe(true);
    });

    it('returns false when any RESOLVED remains', () => {
      expect(
        canCloseReviewSession([CommentStatus.VERIFIED, CommentStatus.RESOLVED]),
      ).toBe(false);
    });
  });

  describe('canApprovePackage', () => {
    it('returns false when OPEN comment exists', () => {
      expect(canApprovePackage([CommentStatus.VERIFIED, CommentStatus.OPEN])).toBe(
        false,
      );
    });

    it('returns true when all VERIFIED or CLOSED', () => {
      expect(
        canApprovePackage([CommentStatus.VERIFIED, CommentStatus.CLOSED]),
      ).toBe(true);
    });
  });
});
