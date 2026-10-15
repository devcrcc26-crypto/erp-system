/**
 * Bulk-explain issue grouping and reason compatibility for field movements.
 *
 * Shared with the frontend: `npm run sync:shared` copies this file to
 * frontend/lib/generated/. Keep it dependency-free (no imports at all, not even
 * the Prisma client or sibling modules); enum-backed values are string-literal
 * unions checked against Prisma in field-movement-shared-config.spec.ts.
 */

/** Local mirrors of field-movement-field-rules types (kept equal by the spec). */
type FieldMovementReasonType = 'FIELD_VISIT' | 'EARLY_LEAVE' | 'FORGOT';

interface FieldMovementSelection {
  reasonType: FieldMovementReasonType | null;
  forgotDirection?: 'IN' | 'OUT' | 'BOTH' | null;
}

/** Attendance issue grouping for bulk explain compatibility. */
export type FieldMovementIssueType =
  | 'MISSING_CLOCK_OUT'
  | 'MISSING_CLOCK_IN'
  | 'EARLY_DEPARTURE'
  | 'NO_SCANS';

/** UI-facing reason codes (includes FORGOT_BOTH before storage split). */
export type CompatibleIssueReason =
  | 'FORGOT_CLOCK_OUT'
  | 'FORGOT_CLOCK_IN'
  | 'FORGOT_BOTH'
  | 'EARLY_LEAVE'
  | 'FIELD_VISIT';

const COMPATIBLE_BY_ISSUE: Record<
  FieldMovementIssueType,
  readonly CompatibleIssueReason[]
> = {
  MISSING_CLOCK_OUT: ['FORGOT_CLOCK_OUT', 'EARLY_LEAVE', 'FIELD_VISIT'],
  MISSING_CLOCK_IN: ['FORGOT_CLOCK_IN', 'FIELD_VISIT'],
  EARLY_DEPARTURE: ['EARLY_LEAVE', 'FIELD_VISIT'],
  NO_SCANS: ['FIELD_VISIT', 'FORGOT_BOTH'],
};

/** Attendance day flags (= Prisma AttendanceDayFlag). */
export const ATTENDANCE_FLAGS_FOR_ISSUE = [
  'MISSING_CLOCK_IN',
  'MISSING_CLOCK_OUT',
  'EARLY_LEAVE',
  'ON_LEAVE_BUT_SCANNED',
  'SCAN_AFTER_SEPARATION',
  'NONE',
] as const;

export type AttendanceFlagForIssue =
  (typeof ATTENDANCE_FLAGS_FOR_ISSUE)[number];

export function effectiveScan(
  corrected: string | null | undefined,
  raw: string | null | undefined,
): string | null {
  const value = corrected ?? raw ?? null;
  return value && value.trim().length > 0 ? value : null;
}

/**
 * Maps attendance flag + scans to a single issue type for bulk selection rules.
 */
export function deriveIssueType(day: {
  flag: AttendanceFlagForIssue;
  clockInLocal: string | null;
  clockOutLocal: string | null;
  correctedClockInLocal?: string | null;
  correctedClockOutLocal?: string | null;
}): FieldMovementIssueType | null {
  if (
    day.flag === 'NONE' ||
    day.flag === 'ON_LEAVE_BUT_SCANNED' ||
    day.flag === 'SCAN_AFTER_SEPARATION'
  ) {
    return null;
  }
  const clockIn = effectiveScan(
    day.correctedClockInLocal,
    day.clockInLocal,
  );
  const clockOut = effectiveScan(
    day.correctedClockOutLocal,
    day.clockOutLocal,
  );
  if (!clockIn && !clockOut) {
    return 'NO_SCANS';
  }
  if (day.flag === 'EARLY_LEAVE') {
    return 'EARLY_DEPARTURE';
  }
  if (day.flag === 'MISSING_CLOCK_IN') {
    return 'MISSING_CLOCK_IN';
  }
  if (day.flag === 'MISSING_CLOCK_OUT') {
    return 'MISSING_CLOCK_OUT';
  }
  return null;
}

export function compatibleReasonsForIssue(
  issue: FieldMovementIssueType,
): CompatibleIssueReason[] {
  return [...COMPATIBLE_BY_ISSUE[issue]];
}

/** Reasons valid for every issue in the set (bulk explain form). */
export function intersectionCompatibleReasons(
  issues: FieldMovementIssueType[],
): CompatibleIssueReason[] {
  if (issues.length === 0) {
    return [];
  }
  const first = issues[0]!;
  let intersection = new Set<CompatibleIssueReason>(
    COMPATIBLE_BY_ISSUE[first],
  );
  for (const issue of issues.slice(1)) {
    const allowed = new Set(COMPATIBLE_BY_ISSUE[issue]);
    intersection = new Set(
      [...intersection].filter((reason) => allowed.has(reason)),
    );
  }
  return [...intersection];
}

export function selectionFromCompatibleReason(
  reason: CompatibleIssueReason,
): FieldMovementSelection {
  switch (reason) {
    case 'FORGOT_CLOCK_OUT':
      return { reasonType: 'FORGOT', forgotDirection: 'OUT' };
    case 'FORGOT_CLOCK_IN':
      return { reasonType: 'FORGOT', forgotDirection: 'IN' };
    case 'FORGOT_BOTH':
      return { reasonType: 'FORGOT', forgotDirection: 'BOTH' };
    case 'EARLY_LEAVE':
      return { reasonType: 'EARLY_LEAVE', forgotDirection: null };
    case 'FIELD_VISIT':
      return { reasonType: 'FIELD_VISIT', forgotDirection: null };
    default: {
      const _exhaustive: never = reason;
      return _exhaustive;
    }
  }
}

/** Multi-select requires the same issue group as the anchor row. */
export function canSelectWithCurrent(
  anchorIssue: FieldMovementIssueType | null,
  candidateIssue: FieldMovementIssueType,
): boolean {
  if (anchorIssue === null) {
    return true;
  }
  return anchorIssue === candidateIssue;
}

export function anchorIssueFromSelected(
  issues: ReadonlyArray<FieldMovementIssueType | null | undefined>,
): FieldMovementIssueType | null {
  for (const issue of issues) {
    if (issue) {
      return issue;
    }
  }
  return null;
}

/** Unique UI reason types implied by compatible issue reasons. */
export function reasonTypesFromCompatibleReasons(
  reasons: CompatibleIssueReason[],
): FieldMovementReasonType[] {
  const types = new Set<FieldMovementReasonType>();
  for (const reason of reasons) {
    const selection = selectionFromCompatibleReason(reason);
    if (selection.reasonType) {
      types.add(selection.reasonType);
    }
  }
  return [...types];
}

export interface ExplainDaysRowForSelectAll {
  id: string;
  issueType: FieldMovementIssueType | null;
  selectable: boolean;
}

/**
 * Returns row ids that select-all should tick (same issue group as anchor).
 */
export function idsForSelectAllCompatible<T extends ExplainDaysRowForSelectAll>(
  rows: readonly T[],
  anchorIssue: FieldMovementIssueType | null,
): string[] {
  return rows
    .filter(
      (row) =>
        row.selectable &&
        row.issueType !== null &&
        canSelectWithCurrent(anchorIssue, row.issueType),
    )
    .map((row) => row.id);
}

/**
 * When no anchor yet, prefer the last select-all issue (remaining unexplained of
 * that group), otherwise the first selectable row's issue.
 */
export function resolveSelectAllAnchor(
  rows: readonly ExplainDaysRowForSelectAll[],
  selectedIds: ReadonlySet<string>,
  preferredIssue: FieldMovementIssueType | null = null,
): FieldMovementIssueType | null {
  const selectedIssues = rows
    .filter((row) => selectedIds.has(row.id))
    .map((row) => row.issueType);
  const fromSelection = anchorIssueFromSelected(selectedIssues);
  if (fromSelection) {
    return fromSelection;
  }
  if (preferredIssue !== null) {
    const hasPreferred = rows.some(
      (row) =>
        row.selectable &&
        row.issueType !== null &&
        canSelectWithCurrent(preferredIssue, row.issueType),
    );
    if (hasPreferred) {
      return preferredIssue;
    }
  }
  const firstSelectable = rows.find(
    (row) => row.selectable && row.issueType !== null,
  );
  return firstSelectable?.issueType ?? null;
}

export function countStorageEntriesForCompatibleReason(
  reason: CompatibleIssueReason,
): number {
  return reason === 'FORGOT_BOTH' ? 2 : 1;
}
