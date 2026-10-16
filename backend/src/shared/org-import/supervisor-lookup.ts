import { normalizeLoginName } from '../../modules/auth/application/utils/login-name.util';
import { seedNameKeys, type DirectoryUser } from './employee-matching';
import { normaliseName } from './name-normalise';
import {
  normaliseSupervisorName,
  supervisorLookupKeys,
} from './supervisor-normalise';

export interface AccountUser extends DirectoryUser {
  loginName: string | null;
  chineseName: string | null;
  excludedFromHrProcesses: boolean;
}

/** Builds normalised key → user id (last write wins; collisions kept in a set externally). */
export function buildSupervisorAccountIndex(
  users: readonly AccountUser[],
): Map<string, string> {
  const index = new Map<string, string>();
  for (const user of users) {
    const keys = new Set<string>();
    for (const key of seedNameKeys(user)) {
      keys.add(key.toLowerCase());
    }
    if (user.loginName) {
      keys.add(normaliseName(user.loginName).toLowerCase());
      keys.add(normalizeLoginName(user.loginName));
    }
    if (user.chineseName) {
      keys.add(user.chineseName.trim());
    }
    const parts = [user.firstName, user.middleName, user.lastName]
      .filter(Boolean)
      .join(' ');
    if (parts) {
      keys.add(normaliseName(parts).toLowerCase());
    }
    for (const key of keys) {
      if (key) index.set(key, user.id);
    }
  }
  return index;
}

export function resolveSupervisorUserId(
  reportToRaw: string | null,
  index: Map<string, string>,
): { canonical: string | null; userId: string | null } {
  if (!reportToRaw?.trim()) {
    return { canonical: null, userId: null };
  }
  const canonical = normaliseSupervisorName(reportToRaw);
  if (!canonical) return { canonical: null, userId: null };
  for (const key of supervisorLookupKeys(canonical)) {
    const hit = index.get(key);
    if (hit) return { canonical, userId: hit };
  }
  return { canonical, userId: null };
}
