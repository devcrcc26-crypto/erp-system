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
