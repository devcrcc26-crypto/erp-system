'use client';

import { useMemo } from 'react';
import type { ReviewTier } from '@/lib/api/epc.types';
import { useAuthStore } from '@/stores/auth.store';
import {
  resolvePackageRoles,
  type DisciplineRoleFields,
  type PackageRoleFields,
} from '@/lib/utils/subtask-role-resolver';
import { isExternalInstituteChief } from '@/lib/utils/institute-chief';

export interface PackageRoleLens {
  isPackageDesigner: boolean;
  isPackageSupportingDesigner: boolean;
  isPackageReviewer: boolean;
  isPackageDisciplineLeader: boolean;
  isPackageDeptChief: boolean;
  isPackageInstChief: boolean;
  canUploadToPackage: boolean;
  canSubmitPackage: boolean;
  canAcknowledgeComments: boolean;
  canStartWork: boolean;
  canRevise: boolean;
  canAddReviewComment: boolean;
  canApproveAtTier: boolean;
  canReturnForRework: boolean;
  canApproveOnBehalf: boolean;
  canCreateSubtask: boolean;
}

const ALL_FALSE: PackageRoleLens = {
  isPackageDesigner: false,
  isPackageSupportingDesigner: false,
  isPackageReviewer: false,
  isPackageDisciplineLeader: false,
  isPackageDeptChief: false,
  isPackageInstChief: false,
  canUploadToPackage: false,
  canSubmitPackage: false,
  canAcknowledgeComments: false,
  canStartWork: false,
  canRevise: false,
  canAddReviewComment: false,
  canApproveAtTier: false,
  canReturnForRework: false,
  canApproveOnBehalf: false,
  canCreateSubtask: false,
};

function heldReviewTier(lens: {
  isPackageDisciplineOwner: boolean;
  isPackageReviewer: boolean;
  isPackageDisciplineLeader: boolean;
  isPackageDeptChief: boolean;
  isPackageInstChief: boolean;
}): ReadonlySet<ReviewTier> {
  const held = new Set<ReviewTier>();
  if (lens.isPackageDisciplineOwner) {
    held.add('DISCIPLINE_OWNER');
  }
  if (lens.isPackageReviewer) {
    held.add('REVIEWER');
  }
  if (lens.isPackageDisciplineLeader) {
    held.add('DISCIPLINE_LEAD');
  }
  if (lens.isPackageDeptChief) {
    held.add('DEPT_CHIEF');
  }
  if (lens.isPackageInstChief) {
    held.add('INSTITUTE_CHIEF');
  }
  return held;
}

/**
 * Per-package action flags from resolvePackageRoles (package FK wins over discipline).
 */
export function usePackageRoleLens(
  pkg: PackageRoleFields | null | undefined,
  discipline: DisciplineRoleFields | null | undefined,
  currentTier?: ReviewTier | null,
): PackageRoleLens {
  const currentUserId = useAuthStore((state) => state.user?.id);

  return useMemo((): PackageRoleLens => {
    if (!pkg || !discipline || !currentUserId) {
      return ALL_FALSE;
    }

    const { primaryRole, secondaryReviewRole } = resolvePackageRoles(
      pkg,
      discipline,
      currentUserId,
    );

    const isPackageDesigner = primaryRole === 'DESIGNER';
    const isPackageSupportingDesigner = primaryRole === 'SUPPORTING_DESIGNER';
    const isPackageDisciplineOwner =
      primaryRole === 'DISCIPLINE_OWNER' ||
      secondaryReviewRole === 'DISCIPLINE_OWNER';
    const isPackageReviewer =
      primaryRole === 'REVIEWER' || secondaryReviewRole === 'REVIEWER';
    const isPackageDisciplineLeader =
      primaryRole === 'DISCIPLINE_LEAD' ||
      secondaryReviewRole === 'DISCIPLINE_LEAD';
    const isPackageDeptChief =
      primaryRole === 'DEPT_CHIEF' || secondaryReviewRole === 'DEPT_CHIEF';
    const isPackageInstChief =
      primaryRole === 'INSTITUTE_CHIEF' ||
      secondaryReviewRole === 'INSTITUTE_CHIEF';

    const canAddReviewComment =
      isPackageDisciplineOwner ||
      isPackageReviewer ||
      isPackageDisciplineLeader ||
      isPackageDeptChief ||
      isPackageInstChief;

    const held = heldReviewTier({
      isPackageDisciplineOwner,
      isPackageReviewer,
      isPackageDisciplineLeader,
      isPackageDeptChief,
      isPackageInstChief,
    });
    const canApproveAtTier =
      currentTier != null && held.has(currentTier) && canAddReviewComment;

    return {
      isPackageDesigner,
      isPackageSupportingDesigner,
      isPackageReviewer,
      isPackageDisciplineLeader,
      isPackageDeptChief,
      isPackageInstChief,
      canUploadToPackage: isPackageDesigner || isPackageSupportingDesigner,
      canSubmitPackage: isPackageDesigner,
      canAcknowledgeComments: isPackageDesigner,
      canStartWork: isPackageDesigner,
      canRevise: isPackageDesigner,
      canAddReviewComment,
      canApproveAtTier,
      canReturnForRework: canApproveAtTier,
      canApproveOnBehalf:
        isPackageDeptChief &&
        currentTier === 'INSTITUTE_CHIEF' &&
        isExternalInstituteChief(pkg),
      canCreateSubtask: isPackageDisciplineLeader,
    };
  }, [pkg, discipline, currentUserId, currentTier]);
}
