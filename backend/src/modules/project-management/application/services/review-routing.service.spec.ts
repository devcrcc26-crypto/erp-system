import { CommentSeverity } from '../../domain/contracts/enums/comment-severity.enum';
import { ReviewRoutingService } from './review-routing.service';
import { ReviewTier } from '@prisma/client';

describe('review-routing.service', () => {
  const service = new ReviewRoutingService();

  it('keeps MINOR at current tier', () => {
    expect(
      service.route({
        severity: CommentSeverity.MINOR,
        currentTier: ReviewTier.REVIEWER,
      }),
    ).toEqual({
      escalate: false,
      nextTier: ReviewTier.REVIEWER,
      requiresLeadApproval: false,
    });
  });

  it('escalates MODERATE from discipline owner to reviewer', () => {
    const result = service.route({
      severity: CommentSeverity.MODERATE,
      currentTier: ReviewTier.DISCIPLINE_OWNER,
    });
    expect(result.escalate).toBe(true);
    expect(result.nextTier).toBe(ReviewTier.REVIEWER);
  });

  it('flags MODERATE at reviewer for lead approval without tier jump', () => {
    const result = service.route({
      severity: CommentSeverity.MODERATE,
      currentTier: ReviewTier.REVIEWER,
    });
    expect(result.escalate).toBe(false);
    expect(result.nextTier).toBe(ReviewTier.REVIEWER);
    expect(result.requiresLeadApproval).toBe(true);
  });

  it('escalates MAJOR to next tier', () => {
    const result = service.route({
      severity: CommentSeverity.MAJOR,
      currentTier: ReviewTier.DISCIPLINE_LEAD,
    });
    expect(result.nextTier).toBe(ReviewTier.DEPT_CHIEF);
    expect(result.requiresLeadApproval).toBe(true);
  });
});
