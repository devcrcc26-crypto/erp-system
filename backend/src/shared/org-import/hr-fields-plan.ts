import { normaliseEthiopianPhone } from '../utils/ethiopian-phone.util';
import type { DirectoryHrFieldRow } from './directory-sheet';

/**
 * Plans the HR-directory import of phone, secondary phone, seniority and
 * education for confirmed matches. It fills empty fields only: a different
 * existing value is reported, never overwritten.
 */

export type HrField = 'phone' | 'secondaryPhone' | 'seniority' | 'education';

export interface HrValueMap {
  seniority: {
    levels: Array<{ name: string; nameZh?: string; sortOrder?: number }>;
    map: Record<string, string>;
  };
  education: { map: Record<string, string> };
}

export interface HrFieldUser {
  id: string;
  phone: string | null;
  secondaryPhone: string | null;
  seniorityLevelName: string | null;
  educationLevel: string | null;
}

export type HrFindingKind = 'fill' | 'same' | 'difference' | 'skipped';

export interface HrFieldFinding {
  rowIndex: number;
  userId: string;
  field: HrField;
  kind: HrFindingKind;
  /** Value from the sheet after mapping / normalising. */
  sheetValue: string | null;
  dbValue: string | null;
  note?: string;
}

export interface HrFieldFill {
  userId: string;
  rowIndex: number;
  phone?: string;
  secondaryPhone?: string;
  seniorityLevelName?: string;
  educationLevel?: string;
}

export interface HrFieldPlan {
  findings: HrFieldFinding[];
  fills: HrFieldFill[];
  /** Rows whose matched user was also matched by another row. */
  duplicateMatchRows: number[];
}

/** Lowercase, trimmed, inner whitespace collapsed. */
export function normaliseLabel(value: string): string {
  return value.trim().replace(/\s+/g, ' ').toLowerCase();
}

function lookup(map: Record<string, string>, raw: string): string | null {
  const key = normaliseLabel(raw);
  for (const [label, target] of Object.entries(map)) {
    if (normaliseLabel(label) === key) return target;
  }
  return null;
}

interface PhoneCell {
  value: string;
  note?: string;
}

function readPhone(raw: string | null): PhoneCell | null {
  if (!raw) return null;
  const parsed = normaliseEthiopianPhone(raw);
  if (!parsed.ok) {
    return { value: raw.trim(), note: 'kept original text (not a valid Ethiopian number)' };
  }
  return parsed.fixedDoubledPrefix
    ? { value: parsed.value, note: 'fixed doubled (+2519) prefix' }
    : { value: parsed.value };
}

export function planHrFieldImport(
  rows: readonly DirectoryHrFieldRow[],
  /** Confirmed match per sheet row (rowIndex → user); unmatched rows absent. */
  matchedUsers: ReadonlyMap<number, HrFieldUser>,
  valueMap: HrValueMap,
  educationLevels: ReadonlySet<string>,
): HrFieldPlan {
  const findings: HrFieldFinding[] = [];
  const fills: HrFieldFill[] = [];

  // Phones per row; a secondary equal to the primary is dropped.
  const phones = new Map<number, { primary: PhoneCell | null; secondary: PhoneCell | null; sameAsPrimary: boolean }>();
  for (const row of rows) {
    const primary = readPhone(row.phoneRaw);
    let secondary = readPhone(row.secondaryPhoneRaw);
    const sameAsPrimary = Boolean(primary && secondary && primary.value === secondary.value);
    if (sameAsPrimary) secondary = null;
    phones.set(row.rowIndex, { primary, secondary, sameAsPrimary });
  }

  // A number on more than one row (either column) is skipped everywhere.
  const rowsByNumber = new Map<string, Set<number>>();
  for (const [rowIndex, cell] of phones) {
    for (const phone of [cell.primary, cell.secondary]) {
      if (!phone) continue;
      const set = rowsByNumber.get(phone.value) ?? new Set<number>();
      set.add(rowIndex);
      rowsByNumber.set(phone.value, set);
    }
  }

  // A user matched by two rows cannot be told apart: skip both.
  const rowsByUser = new Map<string, number[]>();
  for (const row of rows) {
    const user = matchedUsers.get(row.rowIndex);
    if (!user) continue;
    rowsByUser.set(user.id, [...(rowsByUser.get(user.id) ?? []), row.rowIndex]);
  }
  const duplicateMatchRows = [...rowsByUser.values()]
    .filter((list) => list.length > 1)
    .flat()
    .sort((a, b) => a - b);
  const duplicateSet = new Set(duplicateMatchRows);

  for (const row of rows) {
    const user = matchedUsers.get(row.rowIndex);
    if (!user || duplicateSet.has(row.rowIndex)) continue;
    const fill: HrFieldFill = { userId: user.id, rowIndex: row.rowIndex };
    const add = (
      field: HrField,
      sheetValue: string | null,
      dbValue: string | null,
      equals: (a: string, b: string) => boolean,
      note?: string,
    ): boolean => {
      if (sheetValue === null) return false;
      if (dbValue === null || dbValue === '') {
        findings.push({ rowIndex: row.rowIndex, userId: user.id, field, kind: 'fill', sheetValue, dbValue: null, note });
        return true;
      }
      const kind: HrFindingKind = equals(sheetValue, dbValue) ? 'same' : 'difference';
      findings.push({ rowIndex: row.rowIndex, userId: user.id, field, kind, sheetValue, dbValue, note });
      return false;
    };
    const skip = (field: HrField, sheetValue: string | null, note: string): void => {
      findings.push({ rowIndex: row.rowIndex, userId: user.id, field, kind: 'skipped', sheetValue, dbValue: null, note });
    };
    const exact = (a: string, b: string): boolean => a === b;
    const sameLabel = (a: string, b: string): boolean => normaliseLabel(a) === normaliseLabel(b);

    const cell = phones.get(row.rowIndex)!;
    const phoneFields: Array<[HrField, PhoneCell | null, string | null]> = [
      ['phone', cell.primary, user.phone],
      ['secondaryPhone', cell.secondary, user.secondaryPhone],
    ];
    for (const [field, phone, dbValue] of phoneFields) {
      if (!phone) continue;
      const shared = rowsByNumber.get(phone.value)?.size ?? 0;
      if (shared > 1) {
        skip(field, phone.value, `number appears on ${shared} sheet rows`);
        continue;
      }
      if (add(field, phone.value, dbValue, exact, phone.note)) {
        fill[field as 'phone' | 'secondaryPhone'] = phone.value;
      }
    }
    if (cell.sameAsPrimary) {
      skip('secondaryPhone', cell.primary?.value ?? null, 'same number as primary; primary only');
    }

    if (row.seniorityRaw) {
      const level = lookup(valueMap.seniority.map, row.seniorityRaw);
      if (!level) {
        skip('seniority', row.seniorityRaw, 'no mapping for this value');
      } else if (add('seniority', level, user.seniorityLevelName, sameLabel)) {
        fill.seniorityLevelName = level;
      }
    }

    if (row.educationRaw) {
      const level = lookup(valueMap.education.map, row.educationRaw);
      if (!level || !educationLevels.has(level)) {
        skip('education', row.educationRaw, level ? `unknown level ${level}` : 'no mapping for this value');
      } else if (add('education', level, user.educationLevel, exact)) {
        fill.educationLevel = level;
      }
    }

    if (fill.phone || fill.secondaryPhone || fill.seniorityLevelName || fill.educationLevel) {
      fills.push(fill);
    }
  }

  return { findings, fills, duplicateMatchRows };
}
