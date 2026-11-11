import type { ReviewTier, SubtaskRole } from '@/lib/api/epc.types';
import { isExternalInstituteChief } from '@/lib/utils/institute-chief';

export interface ResolvedSubtaskRoles {
  primaryRole: SubtaskRole | null;
  secondaryReviewRole: ReviewTier | null;
}

export interface PackageRoleFields {
  designerUserId: string | null;
  supportingDesignerUserId: string | null;
  reviewerUserId: string | null;
  disciplinaryLeaderUserId: string | null;
  deptDeputyChiefUserId: string | null;
  instituteChiefUserId: string | null;
  instituteChiefName?: string | null;
  disciplineOwnerUserId: string | null;
}

export interface DisciplineRoleFields {
  designerUserId?: string | null;
  supportingDesignerUserId?: string | null;
  reviewerUserId?: string | null;
  disciplineLeadUserId?: string | null;
  chiefUserId?: string | null;
  instituteChiefUserId?: string | null;
  ownerUserId?: string | null;
}

interface EffectiveChain {
  designerUserId: string | null;
  supportingDesignerUserId: string | null;
  reviewerUserId: string | null;
  disciplineLeadUserId: string | null;
  chiefUserId: string | null;
  instituteChiefUserId: string | null;
  ownerUserId: string | null;
}

/**
 * Highest reviewer-tier role held on the effective chain, or null.
 * Precedence: REVIEWER > DISCIPLINE_LEAD > DEPT_CHIEF > INSTITUTE_CHIEF.
 */
function resolveReviewerTier(
  chain: EffectiveChain,
  currentUserId: string,
): ReviewTier | null {
  if (chain.reviewerUserId === currentUserId) {
    return 'REVIEWER';
  }
  if (chain.disciplineLeadUserId === currentUserId) {
    return 'DISCIPLINE_LEAD';
  }
  if (chain.chiefUserId === currentUserId) {
    return 'DEPT_CHIEF';
  }
  if (chain.instituteChiefUserId === currentUserId) {
    return 'INSTITUTE_CHIEF';
  }
  return null;
}

/**
 * Resolves a user's primary routing role and secondary review-tier role on a
 * subtask - mirrors backend `resolveSubtaskRoles` (domain/subtask-role-resolver.util.ts)
 * and applies the same package-FK-wins-over-discipline-default merge as
 * `getEffectiveApprovalChain`. Precedence: DESIGNER > SUPPORTING_DESIGNER >
 * REVIEWER > DISCIPLINE_LEAD > DEPT_CHIEF > INSTITUTE_CHIEF > DISCIPLINE_OWNER.
 *
 * secondaryReviewRole is only populated when primaryRole is DESIGNER or
 * SUPPORTING_DESIGNER and the same user also holds one of the four
 * reviewer-tier roles (DISCIPLINE_OWNER never counts as a secondary role).
 */
export function resolvePackageRoles(
  pkg: PackageRoleFields,
  taskDiscipline: DisciplineRoleFields,
  currentUserId: string,
): ResolvedSubtaskRoles {
  const chain: EffectiveChain = {
    designerUserId: pkg.designerUserId ?? taskDiscipline.designerUserId ?? null,
    supportingDesignerUserId:
      pkg.supportingDesignerUserId ?? taskDiscipline.supportingDesignerUserId ?? null,
    reviewerUserId: pkg.reviewerUserId ?? taskDiscipline.reviewerUserId ?? null,
    disciplineLeadUserId:
      pkg.disciplinaryLeaderUserId ?? taskDiscipline.disciplineLeadUserId ?? null,
    chiefUserId: pkg.deptDeputyChiefUserId ?? taskDiscipline.chiefUserId ?? null,
    instituteChiefUserId: isExternalInstituteChief(pkg)
      ? null
      : (pkg.instituteChiefUserId ?? taskDiscipline.instituteChiefUserId ?? null),
    ownerUserId: pkg.disciplineOwnerUserId ?? taskDiscipline.ownerUserId ?? null,
  };

  if (chain.designerUserId === currentUserId) {
    return {
      primaryRole: 'DESIGNER',
      secondaryReviewRole: resolveReviewerTier(chain, currentUserId),
    };
  }
  if (chain.supportingDesignerUserId === currentUserId) {
    return {
      primaryRole: 'SUPPORTING_DESIGNER',
      secondaryReviewRole: resolveReviewerTier(chain, currentUserId),
    };
  }

  const reviewerTier = resolveReviewerTier(chain, currentUserId);
  if (reviewerTier) {
    return { primaryRole: reviewerTier, secondaryReviewRole: null };
  }

  if (chain.ownerUserId === currentUserId) {
    return { primaryRole: 'DISCIPLINE_OWNER', secondaryReviewRole: null };
  }

  if (taskDiscipline.designerUserId === currentUserId) {
    return {
      primaryRole: 'DESIGNER',
      secondaryReviewRole: resolveReviewerTier(chain, currentUserId),
    };
  }
  if (taskDiscipline.supportingDesignerUserId === currentUserId) {
    return {
      primaryRole: 'SUPPORTING_DESIGNER',
      secondaryReviewRole: resolveReviewerTier(chain, currentUserId),
    };
  }
  if (taskDiscipline.reviewerUserId === currentUserId) {
    return { primaryRole: 'REVIEWER', secondaryReviewRole: null };
  }
  if (taskDiscipline.disciplineLeadUserId === currentUserId) {
    return { primaryRole: 'DISCIPLINE_LEAD', secondaryReviewRole: null };
  }
  if (taskDiscipline.chiefUserId === currentUserId) {
    return { primaryRole: 'DEPT_CHIEF', secondaryReviewRole: null };
  }
  if (taskDiscipline.instituteChiefUserId === currentUserId) {
    return { primaryRole: 'INSTITUTE_CHIEF', secondaryReviewRole: null };
  }
  if (taskDiscipline.ownerUserId === currentUserId) {
    return { primaryRole: 'DISCIPLINE_OWNER', secondaryReviewRole: null };
  }

  return { primaryRole: null, secondaryReviewRole: null };
}
