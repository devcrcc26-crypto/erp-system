import { ReviewTier } from '@prisma/client';
import { computeRequiredTiers } from './required-tiers.util';

const ALL_IDS = {
  designerUserId: 'user-designer',
  supportingDesignerUserId: 'user-supporting',
  ownerUserId: 'user-owner',
  reviewerUserId: 'user-reviewer',
  disciplineLeadUserId: 'user-lead',
  chiefUserId: 'user-chief',
  instituteChiefUserId: 'user-institute-chief',
};

describe('computeRequiredTiers', () => {
  it('1. full team all 5 distinct users → 4 tiers in order, DISCIPLINE_OWNER excluded', () => {
    const result = computeRequiredTiers(ALL_IDS);
    expect(result).toEqual([
      ReviewTier.REVIEWER,
      ReviewTier.DISCIPLINE_LEAD,
      ReviewTier.DEPT_CHIEF,
      ReviewTier.INSTITUTE_CHIEF,
    ]);
  });

  it('2. DISCIPLINE_OWNER is never included, regardless of ownerUserId', () => {
    const result = computeRequiredTiers({
      ...ALL_IDS,
      ownerUserId: ALL_IDS.designerUserId,
    });
    expect(result).not.toContain(ReviewTier.DISCIPLINE_OWNER);
    expect(result).toContain(ReviewTier.DISCIPLINE_LEAD);
  });

  it('3. ownerUserId null → DISCIPLINE_OWNER still excluded', () => {
    const result = computeRequiredTiers({ ...ALL_IDS, ownerUserId: null });
    expect(result).not.toContain(ReviewTier.DISCIPLINE_OWNER);
  });

  it('4. reviewerUserId null → REVIEWER removed', () => {
    const result = computeRequiredTiers({ ...ALL_IDS, reviewerUserId: null });
    expect(result).not.toContain(ReviewTier.REVIEWER);
  });

  it('5. reviewerUserId === designerUserId → REVIEWER removed', () => {
    const result = computeRequiredTiers({
      ...ALL_IDS,
      reviewerUserId: ALL_IDS.designerUserId,
    });
    expect(result).not.toContain(ReviewTier.REVIEWER);
  });

  it('6. reviewerUserId === ownerUserId → REVIEWER removed', () => {
    const result = computeRequiredTiers({
      ...ALL_IDS,
      reviewerUserId: ALL_IDS.ownerUserId,
    });
    expect(result).not.toContain(ReviewTier.REVIEWER);
  });

  it('7. chiefUserId === disciplineLeadUserId → DEPT_CHIEF removed', () => {
    const result = computeRequiredTiers({
      ...ALL_IDS,
      chiefUserId: ALL_IDS.disciplineLeadUserId,
    });
    expect(result).not.toContain(ReviewTier.DEPT_CHIEF);
  });

  it('8. chiefUserId === instituteChiefUserId → DEPT_CHIEF removed', () => {
    const result = computeRequiredTiers({
      ...ALL_IDS,
      chiefUserId: ALL_IDS.instituteChiefUserId,
    });
    expect(result).not.toContain(ReviewTier.DEPT_CHIEF);
  });

  it('9. chiefUserId null → DEPT_CHIEF removed', () => {
    const result = computeRequiredTiers({ ...ALL_IDS, chiefUserId: null });
    expect(result).not.toContain(ReviewTier.DEPT_CHIEF);
  });

  it('10. instituteChiefUserId null → INSTITUTE_CHIEF removed', () => {
    const result = computeRequiredTiers({ ...ALL_IDS, instituteChiefUserId: null });
    expect(result).not.toContain(ReviewTier.INSTITUTE_CHIEF);
  });

  it('10a. instituteChiefUserId null but instituteChiefName set → INSTITUTE_CHIEF kept', () => {
    const result = computeRequiredTiers(
      { ...ALL_IDS, instituteChiefUserId: null },
      'External Chief Engineer',
    );
    expect(result).toContain(ReviewTier.INSTITUTE_CHIEF);
  });

  it('10b. instituteChiefUserId null and instituteChiefName null → INSTITUTE_CHIEF removed', () => {
    const result = computeRequiredTiers(
      { ...ALL_IDS, instituteChiefUserId: null },
      null,
    );
    expect(result).not.toContain(ReviewTier.INSTITUTE_CHIEF);
  });

  it('11. designer=owner and reviewer null → [DISCIPLINE_LEAD, DEPT_CHIEF, INSTITUTE_CHIEF]', () => {
    const result = computeRequiredTiers({
      ...ALL_IDS,
      ownerUserId: ALL_IDS.designerUserId,
      reviewerUserId: null,
    });
    expect(result).toEqual([
      ReviewTier.DISCIPLINE_LEAD,
      ReviewTier.DEPT_CHIEF,
      ReviewTier.INSTITUTE_CHIEF,
    ]);
  });

  it('12. only lead and institute chief → [DISCIPLINE_LEAD, INSTITUTE_CHIEF]', () => {
    const result = computeRequiredTiers({
      designerUserId: 'user-a',
      supportingDesignerUserId: null,
      ownerUserId: null,
      reviewerUserId: null,
      disciplineLeadUserId: 'user-lead',
      chiefUserId: null,
      instituteChiefUserId: 'user-institute',
    });
    expect(result).toEqual([
      ReviewTier.DISCIPLINE_LEAD,
      ReviewTier.INSTITUTE_CHIEF,
    ]);
  });

  it('13. only lead (all others null) → [DISCIPLINE_LEAD]', () => {
    const result = computeRequiredTiers({
      designerUserId: 'user-a',
      supportingDesignerUserId: null,
      ownerUserId: null,
      reviewerUserId: null,
      disciplineLeadUserId: 'user-lead',
      chiefUserId: null,
      instituteChiefUserId: null,
    });
    expect(result).toEqual([ReviewTier.DISCIPLINE_LEAD]);
  });

  it('14. result is always in canonical REVIEW_TIER_ORDER sequence', () => {
    const ORDER = [
      ReviewTier.DISCIPLINE_OWNER,
      ReviewTier.REVIEWER,
      ReviewTier.DISCIPLINE_LEAD,
      ReviewTier.DEPT_CHIEF,
      ReviewTier.INSTITUTE_CHIEF,
    ];
    const result = computeRequiredTiers(ALL_IDS);
    const indices = result.map((t) => ORDER.indexOf(t));
    for (let i = 1; i < indices.length; i++) {
      expect(indices[i]).toBeGreaterThan(indices[i - 1]);
    }
  });

  it('15. DISCIPLINE_LEAD never removed regardless of input', () => {
    const variations = [
      ALL_IDS,
      { ...ALL_IDS, ownerUserId: null, reviewerUserId: null, chiefUserId: null, instituteChiefUserId: null },
      { ...ALL_IDS, ownerUserId: ALL_IDS.designerUserId, reviewerUserId: ALL_IDS.designerUserId },
      { ...ALL_IDS, chiefUserId: ALL_IDS.disciplineLeadUserId },
    ];
    for (const input of variations) {
      expect(computeRequiredTiers(input)).toContain(ReviewTier.DISCIPLINE_LEAD);
    }
  });
});
