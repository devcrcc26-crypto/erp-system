import type { DesignPackage } from '@/lib/api/epc.types';
import type { UpdateDesignPackageRequest } from '@/lib/api/epc.types';

export interface SubtaskRolesFormValues {
  designerUserId?: string;
  supportingDesignerUserId?: string;
  disciplineOwnerUserId?: string;
  reviewerUserId?: string;
  disciplinaryLeaderUserId?: string;
  deptDeputyChiefUserId?: string;
  instituteChiefUserId?: string;
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
    instituteChiefUserId: subtask.instituteChiefUserId ?? undefined,
  };
}

export function toSubtaskRolesPayload(
  values: SubtaskRolesFormValues,
): UpdateDesignPackageRequest {
  return {
    designerUserId: values.designerUserId,
    supportingDesignerUserId: values.supportingDesignerUserId,
    disciplineOwnerUserId: values.disciplineOwnerUserId,
    reviewerUserId: values.reviewerUserId,
    disciplinaryLeaderUserId: values.disciplinaryLeaderUserId,
    deptDeputyChiefUserId: values.deptDeputyChiefUserId,
    instituteChiefUserId: values.instituteChiefUserId,
  };
}
