import { generateTemporaryPassword } from '../../src/modules/auth/application/utils/password-policy.util';
import { normalizeLoginName } from '../../src/modules/auth/application/utils/login-name.util';

export type UserForPasswordSetup = {
  id: string;
  loginName: string | null;
  passwordHash: string | null;
  employeeId: string | null;
  firstName: string;
  lastName: string;
  middleName: string | null;
  departmentName: string | null;
};

export type PlannedPasswordUpdate = {
  id: string;
  loginName: string;
  employeeId: string | null;
  departmentName: string;
  fullName: string;
};

export type PasswordSetupPlan = {
  toUpdate: PlannedPasswordUpdate[];
  skippedHasPassword: UserForPasswordSetup[];
  noLoginName: UserForPasswordSetup[];
};

/**
 * Classifies active users for initial password setup.
 * Approver-only users (no employeeId / excludedFromHrProcesses) are included when they have a loginName.
 */
export function planInitialPasswordUpdates(
  users: UserForPasswordSetup[],
  options: { reset: boolean },
): PasswordSetupPlan {
  const toUpdate: PlannedPasswordUpdate[] = [];
  const skippedHasPassword: UserForPasswordSetup[] = [];
  const noLoginName: UserForPasswordSetup[] = [];

  for (const user of users) {
    if (!user.loginName?.trim()) {
      noLoginName.push(user);
      continue;
    }
    const hasPassword = Boolean(user.passwordHash);
    if (hasPassword && !options.reset) {
      skippedHasPassword.push(user);
      continue;
    }
    toUpdate.push({
      id: user.id,
      loginName: user.loginName,
      employeeId: user.employeeId,
      departmentName: user.departmentName?.trim() || '',
      fullName: user.loginName,
    });
  }

  toUpdate.sort((a, b) => {
    const dept = a.departmentName.localeCompare(b.departmentName, undefined, {
      sensitivity: 'base',
    });
    if (dept !== 0) return dept;
    return a.fullName.localeCompare(b.fullName, undefined, {
      sensitivity: 'base',
    });
  });

  return { toUpdate, skippedHasPassword, noLoginName };
}

/**
 * Generates a temporary password that is never equal to the login name
 * (case/whitespace-insensitive) and uses the ambiguous-safe alphabet.
 */
export function generateUniqueTemporaryPassword(loginName: string): string {
  let temporaryPassword = generateTemporaryPassword(12);
  while (
    normalizeLoginName(temporaryPassword) === normalizeLoginName(loginName)
  ) {
    temporaryPassword = generateTemporaryPassword(12);
  }
  return temporaryPassword;
}

/** YYYY-MM-DD-HHmm for credentials filenames. */
export function formatCredentialsFileStamp(date = new Date()): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  const hh = String(date.getHours()).padStart(2, '0');
  const mm = String(date.getMinutes()).padStart(2, '0');
  return `${y}-${m}-${d}-${hh}${mm}`;
}

/** Prefer APP_URL; fall back to FRONTEND_URL; otherwise blank. */
export function resolveAppUrl(
  env: NodeJS.ProcessEnv = process.env,
): string {
  const raw = env.APP_URL ?? env.FRONTEND_URL ?? '';
  return raw.replace(/\/+$/, '');
}

/** Characters excluded from temporary passwords (0/O, 1/l/I). */
export const AMBIGUOUS_PASSWORD_CHARS = /[0O1lI]/;
