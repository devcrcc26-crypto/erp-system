export const PROJECT_ADMINISTRATOR_ROLE = 'Project Administrator';

/** Company Role.name for System Administrator - company-wide full access. */
export const SYSTEM_ADMINISTRATOR_ROLE = 'System Administrator';

/**
 * Returns true when the user holds the Project Administrator role.
 */
export function isProjectAdministrator(roleNames: readonly string[]): boolean {
  return roleNames.includes(PROJECT_ADMINISTRATOR_ROLE);
}

/**
 * Company-wide unrestricted project/task data access
 * (System Admin, Managing Director, Project Manager, Project Administrator).
 */
export function hasFullProjectDataAccess(
  roleNames: readonly string[],
): boolean {
  return roleNames.some((name) =>
    [
      SYSTEM_ADMINISTRATOR_ROLE,
      'Managing Director',
      'Project Manager',
      PROJECT_ADMINISTRATOR_ROLE,
    ].includes(name),
  );
}

/**
 * Project Admin-class roles: all projects readable. Site Coordinator /
 * Document Controller included for company-wide project read scope after
 * ProjectTeam bypass removal - write for these two remains gated by creator
 * via isProjectAdminWritable. Project Administrator now has unrestricted
 * write via hasFullProjectDataAccess above.
 */
export function hasProjectAdminAccess(
  roleNames: readonly string[],
): boolean {
  return roleNames.some((name) =>
    [
      PROJECT_ADMINISTRATOR_ROLE,
      'Site Coordinator',
      'Document Controller',
    ].includes(name),
  );
}

/**
 * True when a Project Admin may mutate this project (creator only).
 * Callers must already know the user has Project Admin access.
 */
export function isProjectAdminWritable(
  project: { createdBy: string },
  userId: string,
): boolean {
  return project.createdBy === userId;
}
