import type { FieldMovementExplanationStatus } from '@/lib/api/attendance.types';
import {
  anchorIssueFromSelected,
  canSelectWithCurrent,
  deriveIssueType,
  idsForSelectAllCompatible,
  resolveSelectAllAnchor,
  type FieldMovementIssueType,
} from '@/lib/generated/field-movement-issue-compatibility';

export function isExplanationStatusLocked(
  status: FieldMovementExplanationStatus,
): boolean {
  return (
    status === 'SUBMITTED' ||
    status === 'APPROVED' ||
    status === 'RETURNED'
  );
}

export function normalizeExplanationStatus(
  status: FieldMovementExplanationStatus | undefined,
  alreadySubmitted: boolean,
): FieldMovementExplanationStatus {
  if (status) {
    if (status === 'RETURNED') {
      return 'SUBMITTED';
    }
    return status;
  }
  if (alreadySubmitted) {
    return 'SUBMITTED';
  }
  return 'NOT_EXPLAINED';
}

export interface ExplainDaysTableRow {
  id: string;
  issueType: FieldMovementIssueType | null;
  explanationStatus: FieldMovementExplanationStatus;
  selectable: boolean;
}

export function rowIsSelectable(row: ExplainDaysTableRow): boolean {
  if (!row.selectable) {
    return false;
  }
  return !isExplanationStatusLocked(row.explanationStatus);
}

/** Rows select-all should pick (skip drafts already explained). */
export function isUnexplainedForSelectAll(
  status: FieldMovementExplanationStatus,
): boolean {
  return status === 'NOT_EXPLAINED' || status === 'REJECTED';
}

export function selectionAnchorIssue(
  rows: readonly ExplainDaysTableRow[],
  selectedIds: ReadonlySet<string>,
): FieldMovementIssueType | null {
  const issues = rows
    .filter((row) => selectedIds.has(row.id))
    .map((row) => row.issueType);
  return anchorIssueFromSelected(issues);
}

export function canSelectRow(
  row: ExplainDaysTableRow,
  selectedIds: ReadonlySet<string>,
  allRows: readonly ExplainDaysTableRow[],
): boolean {
  if (!rowIsSelectable(row)) {
    return false;
  }
  if (row.issueType === null) {
    return false;
  }
  const anchor = selectionAnchorIssue(allRows, selectedIds);
  return canSelectWithCurrent(anchor, row.issueType);
}

export function selectAllTargetIds(
  rows: readonly ExplainDaysTableRow[],
  selectedIds: ReadonlySet<string>,
  preferredIssue: FieldMovementIssueType | null = null,
): string[] {
  const candidates = rows.filter(
    (row) =>
      rowIsSelectable(row) &&
      isUnexplainedForSelectAll(row.explanationStatus),
  );
  const anchor = resolveSelectAllAnchor(
    candidates,
    selectedIds,
    preferredIssue,
  );
  return idsForSelectAllCompatible(candidates, anchor);
}

export function deriveIssueTypeFromFlagged(day: {
  flag:
    | 'MISSING_CLOCK_IN'
    | 'MISSING_CLOCK_OUT'
    | 'EARLY_LEAVE'
    | 'ON_LEAVE_BUT_SCANNED'
    | 'SCAN_AFTER_SEPARATION'
    | 'NONE';
  clockInLocal: string | null;
  clockOutLocal: string | null;
  correctedClockInLocal?: string | null;
  correctedClockOutLocal?: string | null;
  issueType?: FieldMovementIssueType | null;
}): FieldMovementIssueType | null {
  if (day.issueType) {
    return day.issueType;
  }
  return deriveIssueType(day);
}
