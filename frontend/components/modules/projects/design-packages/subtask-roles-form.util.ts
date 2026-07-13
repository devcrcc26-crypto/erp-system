import type { DesignPackage } from '@/lib/api/epc.types';
import type { UpdateDesignPackageRequest } from '@/lib/api/epc.types';

export type InstituteChiefMode = 'SYSTEM_USER' | 'EXTERNAL_PERSON';

export interface SubtaskRolesFormValues {
  designerUserId?: string;
  supportingDesignerUserId?: string;
  disciplineOwnerUserId?: string;
  reviewerUserId?: string;
  disciplinaryLeaderUserId?: string;
  deptDeputyChiefUserId?: string;
  instituteChiefMode?: InstituteChiefMode;
  instituteChiefUserId?: string;
  instituteChiefName?: string;
}

export function toSubtaskRolesFormValues(
  subtask: DesignPackage,
): SubtaskRolesFormValues {
  return {
    designerUserId: subtask.designerUserId ?? undefined,
    supportingDesignerUserId: subtask.supportingDesignerUserId ?? undefined,
    disciplineOwnerUserId: subtask.disciplineOwnerUserId ?? undefined,
    reviewerUserId: subtask.reviewerUserId ?? undefined,
    disciplinaryLeaderUserId: subtask.disciplinaryLeaderUserId ?? undefined,
    deptDeputyChiefUserId: subtask.deptDeputyChiefUserId ?? undefined,
    instituteChiefMode: subtask.instituteChiefName ? 'EXTERNAL_PERSON' : 'SYSTEM_USER',
    instituteChiefUserId: subtask.instituteChiefUserId ?? undefined,
    instituteChiefName: subtask.instituteChiefName ?? undefined,
  };
}

export interface TaskDisciplineRoleDefaults {
  designerUserId?: string | null;
  supportingDesignerUserId?: string | null;
  ownerUserId?: string | null;
  reviewerUserId?: string | null;
  disciplineLeadUserId?: string | null;
  chiefUserId?: string | null;
  instituteChiefUserId?: string | null;
}

/**
 * Default subtask role pickers from the parent task-discipline row.
 * When the current user is the discipline leader, they are pre-filled as subtask disciplinary leader.
 */
export function defaultSubtaskRolesFromDiscipline(
  discipline: TaskDisciplineRoleDefaults,
  currentUserId?: string,
): SubtaskRolesFormValues {
  const isDisciplineLeader =
    Boolean(currentUserId) &&
    discipline.disciplineLeadUserId === currentUserId;

  return {
    designerUserId: discipline.designerUserId ?? undefined,
    supportingDesignerUserId: discipline.supportingDesignerUserId ?? undefined,
    disciplineOwnerUserId: discipline.ownerUserId ?? undefined,
    reviewerUserId: discipline.reviewerUserId ?? undefined,
    disciplinaryLeaderUserId: isDisciplineLeader
      ? currentUserId
      : (discipline.disciplineLeadUserId ?? undefined),
    deptDeputyChiefUserId: discipline.chiefUserId ?? undefined,
    instituteChiefMode: 'SYSTEM_USER',
    instituteChiefUserId: discipline.instituteChiefUserId ?? undefined,
  };
}

/**
 * Merges task-discipline defaults into role form values when fields are empty
 * (e.g. after an admin cleared a picker).
 */
export function mergeSubtaskRolesWithDisciplineDefaults(
  values: SubtaskRolesFormValues,
  discipline: TaskDisciplineRoleDefaults,
  currentUserId?: string,
): SubtaskRolesFormValues {
  const defaults = defaultSubtaskRolesFromDiscipline(discipline, currentUserId);
  return {
    ...defaults,
    ...values,
    disciplinaryLeaderUserId:
      values.disciplinaryLeaderUserId ??
      defaults.disciplinaryLeaderUserId,
    designerUserId: values.designerUserId ?? defaults.designerUserId,
    supportingDesignerUserId:
      values.supportingDesignerUserId ?? defaults.supportingDesignerUserId,
    disciplineOwnerUserId:
      values.disciplineOwnerUserId ?? defaults.disciplineOwnerUserId,
    reviewerUserId: values.reviewerUserId ?? defaults.reviewerUserId,
    deptDeputyChiefUserId:
      values.deptDeputyChiefUserId ?? defaults.deptDeputyChiefUserId,
    instituteChiefUserId:
      values.instituteChiefUserId ?? defaults.instituteChiefUserId,
  };
}

export function toSubtaskRolesPayload(
  values: SubtaskRolesFormValues,
): UpdateDesignPackageRequest {
  const isExternal = values.instituteChiefMode === 'EXTERNAL_PERSON';
  return {
    designerUserId: values.designerUserId,
    supportingDesignerUserId: values.supportingDesignerUserId,
    disciplineOwnerUserId: values.disciplineOwnerUserId,
    reviewerUserId: values.reviewerUserId,
    disciplinaryLeaderUserId: values.disciplinaryLeaderUserId,
    deptDeputyChiefUserId: values.deptDeputyChiefUserId,
    instituteChiefUserId: isExternal ? undefined : values.instituteChiefUserId,
    instituteChiefName: isExternal ? values.instituteChiefName : undefined,
  };
}
