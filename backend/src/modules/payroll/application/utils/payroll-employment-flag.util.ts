import type { PayrollEntryFlag } from '@prisma/client';
import type { EmploymentWindow } from '../../../../shared/employment/employment-window.util';

export const LEAVER_FINAL_MONTH_NOTE =
  'Leaver final month — final settlement handled outside the system';
export const LOGIN_DISABLED_STILL_EMPLOYED_NOTE =
  'Login disabled but employment is still open — separate the employee or re-enable login';

function formatYmd(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/**
 * Adds employment flags on top of the contract/attendance flag. An entry holds
 * one flag, so an existing data-problem flag wins and the employment note is appended.
 */
export function resolveEmploymentEntryFlag(input: {
  baseFlag: PayrollEntryFlag;
  baseNote?: string;
  window: EmploymentWindow | null;
  isActive: boolean;
}): { flag: PayrollEntryFlag; flagNote?: string } {
  const notes: string[] = [];
  let employmentFlag: PayrollEntryFlag | null = null;

  if (input.window?.leftInMonth && input.window.end) {
    employmentFlag = 'LEAVER_FINAL_MONTH';
    notes.push(`${LEAVER_FINAL_MONTH_NOTE} (leaving date ${formatYmd(input.window.end)})`);
  } else if (!input.isActive && input.window?.overlapsMonth && input.window.end == null) {
    employmentFlag = 'LOGIN_DISABLED_STILL_EMPLOYED';
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
