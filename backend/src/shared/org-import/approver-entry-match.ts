import { normalizeLoginName } from '../../modules/auth/application/utils/login-name.util';
import { normaliseName } from './name-normalise';

export type ApproverEntry = {
  fullName: string;
  chineseName?: string | null;
  role?: string | null;
};

export type SplitPinyinName = {
  lastName: string;
  firstName: string;
  middleName: string | null;
};

/** Surname = first token; given names = remainder (pinyin, surname first in fullName). */
export function splitPinyinFullName(fullName: string): SplitPinyinName {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) {
    return { lastName: '', firstName: '', middleName: null };
  }
  if (parts.length === 1) {
    return { lastName: parts[0]!, firstName: '', middleName: null };
  }
  const lastName = parts[0]!;
  const firstName = parts.slice(1).join(' ');
  return { lastName, firstName, middleName: null };
}

export type ExistingUserMatch = {
  id: string;
  loginNameNormalized: string | null;
  chineseName: string | null;
  firstName: string;
  lastName: string;
  middleName: string | null;
};

export type ApproverMatchResult =
  | { kind: 'EXISTS'; userId: string; via: 'login' | 'reversed' | 'chinese' }
  | { kind: 'COLLISION'; userId: string; reason: string }
  | { kind: 'NEW' };

function reversedLoginKey(fullName: string): string {
  const tokens = fullName.trim().split(/\s+/).filter(Boolean);
  return normalizeLoginName([...tokens].reverse().join(' '));
}

/** Match an approver JSON row to an existing user before create. */
export function matchApproverEntry(
  entry: ApproverEntry,
  existingByLogin: Map<string, ExistingUserMatch>,
  existingByChinese: Map<string, ExistingUserMatch>,
): ApproverMatchResult {
  const fullName = entry.fullName.trim();
  const loginKey = normalizeLoginName(fullName);
  const reversedKey = reversedLoginKey(fullName);
  const chinese = entry.chineseName?.trim();

  const byLogin = existingByLogin.get(loginKey);
  if (byLogin) {
    return { kind: 'EXISTS', userId: byLogin.id, via: 'login' };
  }

  const byReversed = existingByLogin.get(reversedKey);
  if (byReversed && namesCompatible(fullName, byReversed)) {
    return { kind: 'EXISTS', userId: byReversed.id, via: 'reversed' };
  }

  if (chinese) {
    const byZh = existingByChinese.get(chinese);
    if (byZh) {
      return { kind: 'EXISTS', userId: byZh.id, via: 'chinese' };
    }
  }

  if (existingByLogin.has(loginKey)) {
    const other = existingByLogin.get(loginKey)!;
    return {
      kind: 'COLLISION',
      userId: other.id,
      reason: 'loginNameNormalized taken',
    };
  }

  return { kind: 'NEW' };
}

function namesCompatible(fullName: string, user: ExistingUserMatch): boolean {
  const sheet = normaliseName(fullName).toLowerCase();
  const db = normaliseName(
    [user.firstName, user.middleName, user.lastName].filter(Boolean).join(' '),
  ).toLowerCase();
  const rev = normaliseName(fullName).split(/\s+/).reverse().join(' ').toLowerCase();
  return sheet === db || rev === db;
}
