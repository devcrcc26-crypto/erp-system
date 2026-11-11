/**
 * Who may create/manage subtasks and open the discipline workspace page:
 * discipline leader of that task-discipline, or elevated company roles
 * (System Administrator / Managing Director / Project Manager / Project Administrator
 * - mirrored by EPC `navFullAccess`).
 *
 * Designers and approval-tier assignees are intentionally excluded.
 */
export function canManageSubtaskAsDisciplineLeader(
  discipline: { disciplineLeadUserId?: string | null } | null | undefined,
  currentUserId: string | undefined,
  hasElevatedAccess = false,
): boolean {
  if (hasElevatedAccess) {
    return true;
  }
  return (
    Boolean(currentUserId) &&
    discipline?.disciplineLeadUserId === currentUserId
  );
}

/**
 * True when the user may open `/projects/.../disciplines/:taskDisciplineId`.
 * Same gate as create/manage subtask.
 */
export function canAccessDisciplineWorkspace(
  discipline: { disciplineLeadUserId?: string | null } | null | undefined,
  currentUserId: string | undefined,
  hasElevatedAccess = false,
): boolean {
  return canManageSubtaskAsDisciplineLeader(
    discipline,
    currentUserId,
    hasElevatedAccess,
  );
}
