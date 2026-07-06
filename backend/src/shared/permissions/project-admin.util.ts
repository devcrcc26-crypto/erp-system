export const PROJECT_ADMINISTRATOR_ROLE = 'Project Administrator';

/**
 * Returns true when the user holds the Project Administrator role.
 */
export function isProjectAdministrator(roleNames: readonly string[]): boolean {
  return roleNames.includes(PROJECT_ADMINISTRATOR_ROLE);
}

/**
 * Returns true for roles with company-wide project/task data access (comment-8 phase 5).
 */
export function hasFullProjectDataAccess(roleNames: readonly string[]): boolean {
  return roleNames.some((name) =>
    [
      'System Administrator',
      PROJECT_ADMINISTRATOR_ROLE,
      'Managing Director',
      'Project Manager',
    ].includes(name),
  );
}
