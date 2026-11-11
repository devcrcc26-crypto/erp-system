import { Prisma } from '@prisma/client';

/** TaskDiscipline assignee columns (deprecated defaults; still used for visibility). */
export function disciplineAssigneeOr(
  userId: string,
): Prisma.TaskDisciplineWhereInput[] {
  return [
    { disciplineLeadUserId: userId },
    { designerUserId: userId },
    { ownerUserId: userId },
    { reviewerUserId: userId },
    { chiefUserId: userId },
    { instituteChiefUserId: userId },
    { supportingDesignerUserId: userId },
  ];
}

/** DesignPackage (subtask) role columns - canonical per comment-8 phase 4. */
export function subtaskRoleOr(userId: string): Prisma.DesignPackageWhereInput[] {
  return [
    { designerUserId: userId },
    { reviewerUserId: userId },
    { disciplinaryLeaderUserId: userId },
    { deptDeputyChiefUserId: userId },
    { instituteChiefUserId: userId },
    { disciplineOwnerUserId: userId },
    { supportingDesignerUserId: userId },
    { siteRepresentativeUserId: userId },
  ];
}
