import type { PayrollEntryFlag } from '@prisma/client';
import { NOT_ENROLLED_PAYROLL_NOTE } from '../../../attendance/application/utils/attendance-enrolment.util';

export interface EntryAttendanceFlagInput {
  hasContract: boolean;
  /** The month's attendance record, if any. */
  attendance: { matchMethod?: string | null } | null | undefined;
  /** Resolution of a missing-from-file row when there is no record. */
  missingResolution?: string | null;
  monthEndBasic: number;
}

export interface EntryAttendanceFlag {
  flag: PayrollEntryFlag;
  flagNote?: string;
  /** Non-blocking note for the entry's notes (does not set a flag). */
  entryNote?: string;
}

/**
 * Entry flag from contract / attendance presence. A "Needs enrolment" record
 * counts as attendance (no MISSING_ATTENDANCE) and adds a non-blocking note.
 */
export function resolveEntryAttendanceFlag(
  input: EntryAttendanceFlagInput,
): EntryAttendanceFlag {
  const entryNote =
    input.attendance?.matchMethod === 'NEEDS_ENROLMENT'
      ? NOT_ENROLLED_PAYROLL_NOTE
      : undefined;

  if (!input.hasContract && input.attendance) {
    return {
      flag: 'MISSING_CONTRACT',
      flagNote: 'No overlapping contract found for this month',
      entryNote,
    };
  }
  if (input.hasContract && !input.attendance) {
    const suffix: Record<string, string> = {
      NEEDS_ENROLMENT: ' (Needs enrolment)',
      PENDING: ' (Pending resolution)',
      MARKED_EXEMPT: ' (Marked exempt)',
      MANUAL_PRESENT: ' (Manual present)',
    };
    return {
      flag: 'MISSING_ATTENDANCE',
      flagNote: `No attendance record found for this month${
        suffix[input.missingResolution ?? ''] ?? ''
      }`,
    };
  }
  if (input.monthEndBasic === 0) {
    return {
      flag: 'ZERO_SALARY',
      flagNote: 'Basic salary is zero on month-end contract',
      entryNote,
    };
  }
  return { flag: 'NONE', entryNote };
}
