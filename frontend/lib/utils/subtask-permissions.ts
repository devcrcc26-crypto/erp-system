/**
 * Task-discipline leader may manage subtasks and roles (matches backend assertDisciplineWritable).
 */
export function canManageSubtaskAsDisciplineLeader(
  discipline: { disciplineLeadUserId?: string | null } | null | undefined,
  currentUserId: string | undefined,
  isSystemAdministrator = false,
): boolean {
  if (isSystemAdministrator) {
    return true;
  }
  return (
    Boolean(currentUserId) &&
    discipline?.disciplineLeadUserId === currentUserId
  );
}
