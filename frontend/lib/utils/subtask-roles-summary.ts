import type { DesignPackage } from '@/lib/api/epc.types';

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
  { key: 'reviewerUserId', label: 'Reviewer' },
  { key: 'disciplinaryLeaderUserId', label: 'Disciplinary leader' },
  { key: 'deptDeputyChiefUserId', label: 'Deputy chief' },
  { key: 'instituteChiefUserId', label: 'Institute chief' },
  { key: 'disciplineOwnerUserId', label: 'Discipline owner' },
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
