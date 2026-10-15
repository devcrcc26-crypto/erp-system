import type { PayrollEntryFlag } from '@prisma/client';
import type { EmploymentWindow } from '../../../../shared/employment/employment-window.util';

export const LEAVER_FINAL_MONTH_NOTE =
  'Leaver final month — final settlement handled outside the system';
export const LOGIN_DISABLED_STILL_EMPLOYED_NOTE =
  'Login disabled but employment is still open — separate the employee or re-enable login';

function formatYmd(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export const CONTRACT_ENDED_NOT_RENEWED_NOTE =
  'Contract ended — renew, convert or separate; paid on the ended contract terms';

/**
 * Adds employment flags on top of the contract/attendance flag. An entry holds
 * one flag, so an existing data-problem flag wins and the employment notes are
 * appended. Employment flag priority: leaver final month, inactive in month,
 * contract ended not renewed, login disabled while employed.
 */
export function resolveEmploymentEntryFlag(input: {
  baseFlag: PayrollEntryFlag;
  baseNote?: string;
  window: EmploymentWindow | null;
  isActive: boolean;
  /** e.g. "Inactive (Suspended) 10 days — unpaid"; set when the month has inactive days. */
  inactiveNote?: string | null;
  /** Date the last contract ended when pay continues on it (no renewal). */
  contractEndedOn?: Date | null;
  /** Final-settlement lines when at least one item is enabled in policy. */
  settlementNotes?: string[] | null;
}): { flag: PayrollEntryFlag; flagNote?: string } {
  const notes: string[] = [];
  let employmentFlag: PayrollEntryFlag | null = null;

  if (input.window?.leftInMonth && input.window.end) {
    employmentFlag ??= 'LEAVER_FINAL_MONTH';
    const leaving = `leaving date ${formatYmd(input.window.end)}`;
    if (input.settlementNotes && input.settlementNotes.length > 0) {
      notes.push(
        `Leaver final month (${leaving}) — final settlement per policy: ${input.settlementNotes.join('; ')}`,
      );
    } else {
      notes.push(`${LEAVER_FINAL_MONTH_NOTE} (${leaving})`);
    }
  }
  if (input.inactiveNote) {
    employmentFlag ??= 'INACTIVE_IN_MONTH';
    notes.push(input.inactiveNote);
  }
  if (input.contractEndedOn) {
    employmentFlag ??= 'CONTRACT_ENDED_NOT_RENEWED';
    notes.push(`${CONTRACT_ENDED_NOT_RENEWED_NOTE} (ended ${formatYmd(input.contractEndedOn)})`);
  }
  // Login turned off by an inactive period is expected, not a data problem.
  if (
    !input.isActive &&
    !input.inactiveNote &&
    input.window?.overlapsMonth &&
    input.window.end == null
  ) {
    employmentFlag ??= 'LOGIN_DISABLED_STILL_EMPLOYED';
    notes.push(LOGIN_DISABLED_STILL_EMPLOYED_NOTE);
  }

  if (!employmentFlag) {
    return { flag: input.baseFlag, flagNote: input.baseNote };
  }
  if (input.baseFlag !== 'NONE') {
    return {
      flag: input.baseFlag,
      flagNote: [input.baseNote, ...notes].filter(Boolean).join('; '),
    };
  }
  return { flag: employmentFlag, flagNote: notes.join('; ') };
}
