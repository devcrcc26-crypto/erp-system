import type { DesignPackage } from '@prisma/client';
import type { SubtaskRoleAssignment } from '../services/task-assignment-notification.service';
import type { SubtaskRoleField } from '../constants/my-work.constants';

const SUBTASK_ROLE_FIELDS: SubtaskRoleField[] = [
  'designerUserId',
  'reviewerUserId',
  'disciplinaryLeaderUserId',
  'deptDeputyChiefUserId',
  'instituteChiefUserId',
  'disciplineOwnerUserId',
  'supportingDesignerUserId',
  'siteRepresentativeUserId',
];

/**
 * Collects non-null subtask role assignments from a design package row.
 */
export function collectSubtaskRoleAssignments(
  pkg: Pick<DesignPackage, SubtaskRoleField>,
): SubtaskRoleAssignment[] {
  const assignments: SubtaskRoleAssignment[] = [];
  for (const field of SUBTASK_ROLE_FIELDS) {
    const userId = pkg[field];
    if (userId) {
      assignments.push({ userId, roleField: field });
    }
  }
  return assignments;
}

/**
 * Returns assignments that are newly set or changed to a different user.
 */
export function diffNewSubtaskRoleAssignments(
  before: Pick<DesignPackage, SubtaskRoleField>,
  after: Pick<DesignPackage, SubtaskRoleField>,
): SubtaskRoleAssignment[] {
  const assignments: SubtaskRoleAssignment[] = [];
  for (const field of SUBTASK_ROLE_FIELDS) {
    const nextUserId = after[field];
    if (!nextUserId || before[field] === nextUserId) {
      continue;
    }
    assignments.push({ userId: nextUserId, roleField: field });
  }
  return assignments;
}
