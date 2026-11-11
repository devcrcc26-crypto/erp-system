import { monthsTouchedByRange } from '../../../site-assignment/application/utils/site-assignment.util';
import {
  formatMonthYearLabel,
  monthKeyFromDate,
} from './earliest-allowed-date.util';
import { parseUtcDateOnly } from '../../../site-assignment/application/utils/site-assignment.util';
import {
  monthsOfDateKeys,
  workFromHomeFormDates,
} from '../../../work-schedule/application/services/work-from-home-range.util';

export type LateSubmissionMeta = {
  isLate: true;
  reason: string | null;
  monthLabel: string;
  month: number;
  year: number;
};

/**
 * Derives approver-facing late submission metadata from an approval request row.
 */
export function lateSubmissionMetaFromApprovalRequest(input: {
  isLateSubmission: boolean;
  lateReason: string | null;
  categoryCode: string | null;
  formData: unknown;
}): LateSubmissionMeta | null {
  if (!input.isLateSubmission) {
    return null;
  }
  const primary = primaryDateFromApprovalForm(
    input.categoryCode,
    input.formData,
  );
  if (!primary) {
    return null;
  }
  const { month, year } = monthKeyFromDate(primary);
  return {
    isLate: true,
    reason: input.lateReason,
    monthLabel: formatMonthYearLabel(month, year),
    month,
    year,
  };
}

export function primaryDateFromApprovalForm(
  categoryCode: string | null,
  formData: unknown,
): Date | null {
  if (!formData || typeof formData !== 'object') {
    return null;
  }
  const data = formData as Record<string, unknown>;
  if (categoryCode === 'SITE_ASSIGNMENT' && typeof data.startDate === 'string') {
    return parseUtcDateOnly(data.startDate);
  }
  if (categoryCode === 'WORK_FROM_HOME') {
    const first =
      typeof data.startDate === 'string'
        ? data.startDate
        : typeof data.date === 'string'
          ? data.date
          : null;
    return first ? parseUtcDateOnly(first) : null;
  }
  if (categoryCode === 'FIELD_MOVEMENT_LOG') {
    const month = Number(data.month);
    const year = Number(data.year);
    if (Number.isFinite(month) && Number.isFinite(year)) {
      return new Date(Date.UTC(year, month - 1, 1));
    }
  }
  return null;
}

/** Calendar months affected by an approval request (for payroll stale marking). */
export function payrollMonthsFromApprovalRequest(input: {
  categoryCode: string | null;
  formData: unknown;
}): Array<{ month: number; year: number }> {
  if (!input.formData || typeof input.formData !== 'object') {
    return [];
  }
  const data = input.formData as Record<string, unknown>;
  if (
    input.categoryCode === 'SITE_ASSIGNMENT' &&
    typeof data.startDate === 'string' &&
    typeof data.endDate === 'string'
  ) {
    return monthsTouchedByRange(
      parseUtcDateOnly(data.startDate),
      parseUtcDateOnly(data.endDate),
    );
  }
  if (input.categoryCode === 'WORK_FROM_HOME') {
    return monthsOfDateKeys(workFromHomeFormDates(data));
  }
  if (input.categoryCode === 'FIELD_MOVEMENT_LOG') {
    const month = Number(data.month);
    const year = Number(data.year);
    if (Number.isFinite(month) && Number.isFinite(year)) {
      return [{ month, year }];
    }
  }
  return [];
}
