import { ReviewTier } from '@prisma/client';
import { ReviewSlaService } from './review-sla.service';
import { EpcReviewRepository } from '../../infrastructure/repositories/epc-review.repository';
import { EpcWorkflowRepository } from '../../infrastructure/repositories/epc-workflow.repository';

describe('ReviewSlaService', () => {
  const epcReviewRepository = {} as EpcReviewRepository;
  const epcWorkflowRepository = {} as EpcWorkflowRepository;
  const service = new ReviewSlaService(epcReviewRepository, epcWorkflowRepository);

  it('computes REVIEWER SLA deadline as 48h from open', () => {
    const openedAt = new Date('2026-06-18T00:00:00.000Z');
    const deadline = service.computeDeadline(openedAt, ReviewTier.REVIEWER);
    expect(deadline.toISOString()).toBe('2026-06-20T00:00:00.000Z');
  });

  it('advances tier from REVIEWER to DISCIPLINE_LEAD', () => {
    expect(service.getNextTier(ReviewTier.REVIEWER)).toBe(
      ReviewTier.DISCIPLINE_LEAD,
    );
  });

  it('advances tier from DEPT_CHIEF to INSTITUTE_CHIEF', () => {
    expect(service.getNextTier(ReviewTier.DEPT_CHIEF)).toBe(
      ReviewTier.INSTITUTE_CHIEF,
    );
  });

  it('returns null next tier at INSTITUTE_CHIEF (final tier)', () => {
    expect(service.getNextTier(ReviewTier.INSTITUTE_CHIEF)).toBeNull();
  });
});
