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
  | 'supportingDesignerUserId';

export const SUBTASK_ROLE_LABELS: Record<SubtaskRoleField, string> = {
  designerUserId: 'Designer (设计)',
  reviewerUserId: 'Reviewer (复核)',
  disciplinaryLeaderUserId: 'Disciplinary leader (专册)',
  deptDeputyChiefUserId:
    '(Deputy) Chief Engineer of The Department (院审)',
  instituteChiefUserId: 'Chief Engineer of The Institute (司审)',
  disciplineOwnerUserId: 'Discipline owner',
  supportingDesignerUserId: 'Supporting designer',
};
