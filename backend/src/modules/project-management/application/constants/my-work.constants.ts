/** In-app notification event when a user becomes discipline leader on a task. */
export const TASK_DISCIPLINE_LEADER_ASSIGNED_EVENT =
  'task.discipline_leader_assigned';

/** In-app notification event when a user is assigned a subtask role. */
export const SUBTASK_ROLE_ASSIGNED_EVENT = 'subtask.role_assigned';

export type SubtaskRoleField =
  | 'designerUserId'
  | 'reviewerUserId'
  | 'disciplinaryLeaderUserId'
  | 'deptDeputyChiefUserId'
  | 'instituteChiefUserId'
  | 'disciplineOwnerUserId'
  | 'supportingDesignerUserId'
  | 'siteRepresentativeUserId';

/**
 * Kept in exact sync with the frontend's canonical bilingual tier labels
 * (frontend/lib/utils/review-tier-display.ts, reviewTierBilingualLabel) for
 * the four fields that map onto ReviewTier. designerUserId/
 * supportingDesignerUserId have no ReviewTier equivalent and keep plain text.
 */
export const SUBTASK_ROLE_LABELS: Record<SubtaskRoleField, string> = {
  designerUserId: 'Designer (设计)',
  reviewerUserId: 'Reviewer (复核)',
  disciplinaryLeaderUserId: 'Disciplinary Leader (专册)',
  deptDeputyChiefUserId:
    '(Deputy) Chief Engineer of The Department (院审)',
  instituteChiefUserId: 'Chief Engineer of The Institute (司审)',
  disciplineOwnerUserId: 'Discipline Owner',
  supportingDesignerUserId: 'Supporting designer',
  siteRepresentativeUserId: 'Site Representative',
};
