import { isExternalInstituteChief } from './institute-chief.util';

export type PackageApprovalChainOverrides = {
  designerUserId: string | null;
  supportingDesignerUserId: string | null;
  disciplineOwnerUserId: string | null;
  reviewerUserId: string | null;
  disciplinaryLeaderUserId: string | null;
  deptDeputyChiefUserId: string | null;
  instituteChiefUserId: string | null;
  /** When set without instituteChiefUserId, blocks discipline fallback for Institute Chief. */
  instituteChiefName?: string | null;
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
 * Resolves the effective approval chain - subtask-level FKs override discipline defaults.
 */
export function getEffectiveApprovalChain(
  pkg: PackageApprovalChainOverrides,
  discipline: DisciplineApprovalChain,
): EffectiveApprovalChain {
  return {
    designerUserId: pkg.designerUserId ?? discipline.designerUserId,
    supportingDesignerUserId:
      pkg.supportingDesignerUserId ?? discipline.supportingDesignerUserId,
    ownerUserId: pkg.disciplineOwnerUserId ?? discipline.ownerUserId,
    reviewerUserId: pkg.reviewerUserId ?? discipline.reviewerUserId,
    disciplineLeadUserId:
      pkg.disciplinaryLeaderUserId ?? discipline.disciplineLeadUserId,
    chiefUserId: pkg.deptDeputyChiefUserId ?? discipline.chiefUserId,
    instituteChiefUserId: isExternalInstituteChief(pkg)
      ? null
      : (pkg.instituteChiefUserId ?? discipline.instituteChiefUserId),
  };
}
