import type { DesignPackage } from '@/lib/api/epc.types';
import { reviewTierBilingualLabel } from '@/lib/utils/review-tier-display';

const SUBTASK_ROLE_FIELDS: ReadonlyArray<{
  key: keyof Pick<
    DesignPackage,
    | 'designerUserId'
    | 'supportingDesignerUserId'
    | 'reviewerUserId'
    | 'disciplinaryLeaderUserId'
    | 'deptDeputyChiefUserId'
    | 'instituteChiefUserId'
    | 'disciplineOwnerUserId'
  >;
  label: string;
}> = [
  { key: 'designerUserId', label: 'Designer' },
  { key: 'supportingDesignerUserId', label: 'Supporting designer' },
  { key: 'reviewerUserId', label: reviewTierBilingualLabel('REVIEWER') },
  { key: 'disciplinaryLeaderUserId', label: reviewTierBilingualLabel('DISCIPLINE_LEAD') },
  { key: 'deptDeputyChiefUserId', label: reviewTierBilingualLabel('DEPT_CHIEF') },
  { key: 'instituteChiefUserId', label: reviewTierBilingualLabel('INSTITUTE_CHIEF') },
  { key: 'disciplineOwnerUserId', label: reviewTierBilingualLabel('DISCIPLINE_OWNER') },
];

/**
 * Returns the first assigned subtask role label or "Unassigned".
 */
export function summarizeSubtaskRoles(pkg: DesignPackage): string {
  for (const field of SUBTASK_ROLE_FIELDS) {
    if (pkg[field.key]) {
      return field.label;
    }
  }
  return 'Unassigned';
}
