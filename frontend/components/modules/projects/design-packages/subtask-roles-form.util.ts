import type { DesignPackage } from '@/lib/api/epc.types';
import type { SiteRepType, UpdateDesignPackageRequest } from '@/lib/api/epc.types';

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
  siteRepType?: SiteRepType;
  siteRepresentativeUserId?: string;
  siteRepName?: string;
  siteRepEmail?: string;
  siteRepPhone?: string;
  siteRepCompany?: string;
  consultantName?: string;
  consultantTitle?: string;
  consultantEmail?: string;
  consultantPhone?: string;
  consultantCompany?: string;
}

function resolveSiteRepType(subtask: DesignPackage): SiteRepType {
  if (subtask.siteRepType === 'INTERNAL' || subtask.siteRepType === 'EXTERNAL') {
    return subtask.siteRepType;
  }
  return subtask.siteRepresentativeUserId ? 'INTERNAL' : 'EXTERNAL';
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
    siteRepType: resolveSiteRepType(subtask),
    siteRepresentativeUserId: subtask.siteRepresentativeUserId ?? undefined,
    siteRepName: subtask.siteRepName ?? undefined,
    siteRepEmail: subtask.siteRepEmail ?? undefined,
    siteRepPhone: subtask.siteRepPhone ?? undefined,
    siteRepCompany: subtask.siteRepCompany ?? undefined,
    consultantName: subtask.consultantName ?? undefined,
    consultantTitle: subtask.consultantTitle ?? undefined,
    consultantEmail: subtask.consultantEmail ?? undefined,
    consultantPhone: subtask.consultantPhone ?? undefined,
    consultantCompany: subtask.consultantCompany ?? undefined,
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
    siteRepType: 'EXTERNAL',
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
    siteRepType: values.siteRepType ?? defaults.siteRepType,
  };
}

export function toSubtaskRolesPayload(
  values: SubtaskRolesFormValues,
): UpdateDesignPackageRequest {
  const isExternal = values.instituteChiefMode === 'EXTERNAL_PERSON';
  const siteRepType = values.siteRepType ?? 'EXTERNAL';
  const isInternalSiteRep = siteRepType === 'INTERNAL';
  return {
    designerUserId: values.designerUserId,
    supportingDesignerUserId: values.supportingDesignerUserId,
    disciplineOwnerUserId: values.disciplineOwnerUserId,
    reviewerUserId: values.reviewerUserId,
    disciplinaryLeaderUserId: values.disciplinaryLeaderUserId,
    deptDeputyChiefUserId: values.deptDeputyChiefUserId,
    instituteChiefUserId: isExternal ? undefined : values.instituteChiefUserId,
    instituteChiefName: isExternal ? values.instituteChiefName : undefined,
    siteRepType,
    siteRepresentativeUserId: isInternalSiteRep
      ? values.siteRepresentativeUserId
      : null,
    siteRepName: isInternalSiteRep ? null : values.siteRepName,
    siteRepEmail: isInternalSiteRep ? null : values.siteRepEmail,
    siteRepPhone: isInternalSiteRep ? null : values.siteRepPhone,
    siteRepCompany: isInternalSiteRep ? null : values.siteRepCompany,
    consultantName: values.consultantName,
    consultantTitle: values.consultantTitle,
    consultantEmail: values.consultantEmail,
    consultantPhone: values.consultantPhone,
    consultantCompany: values.consultantCompany,
  };
}
