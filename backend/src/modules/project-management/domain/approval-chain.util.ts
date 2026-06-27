export type PackageApprovalChainOverrides = {
  packageOwnerUserId: string | null;
  packageReviewerUserId: string | null;
  packageDisciplineLeadUserId: string | null;
  packageChiefUserId: string | null;
  packageInstituteChiefUserId: string | null;
};

export type DisciplineApprovalChain = {
  ownerUserId: string | null;
  reviewerUserId: string | null;
  disciplineLeadUserId: string | null;
  chiefUserId: string | null;
  instituteChiefUserId: string | null;
  designerUserId: string | null;
  supportingDesignerUserId: string | null;
};

export type EffectiveApprovalChain = {
  designerUserId: string | null;
  supportingDesignerUserId: string | null;
  ownerUserId: string | null;
  reviewerUserId: string | null;
  disciplineLeadUserId: string | null;
  chiefUserId: string | null;
  instituteChiefUserId: string | null;
};

/**
 * Resolves the effective approval chain — package-level FKs override discipline defaults.
 */
export function getEffectiveApprovalChain(
  pkg: PackageApprovalChainOverrides,
  discipline: DisciplineApprovalChain,
): EffectiveApprovalChain {
  return {
    designerUserId: discipline.designerUserId,
    supportingDesignerUserId: discipline.supportingDesignerUserId,
    ownerUserId: pkg.packageOwnerUserId ?? discipline.ownerUserId,
    reviewerUserId: pkg.packageReviewerUserId ?? discipline.reviewerUserId,
    disciplineLeadUserId:
      pkg.packageDisciplineLeadUserId ?? discipline.disciplineLeadUserId,
    chiefUserId: pkg.packageChiefUserId ?? discipline.chiefUserId,
    instituteChiefUserId:
      pkg.packageInstituteChiefUserId ?? discipline.instituteChiefUserId,
  };
}
