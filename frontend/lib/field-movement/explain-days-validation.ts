import type { FieldMovementFieldValues } from '@/lib/generated/field-movement-field-rules';
import {
  validateFieldMovementValues,
  type FieldMovementSelection,
} from '@/lib/generated/field-movement-field-rules';
import { effectiveScan } from '@/lib/generated/field-movement-issue-compatibility';

export interface ExplainDayScanContext {
  clockInLocal: string | null;
  clockOutLocal: string | null;
  correctedClockInLocal?: string | null;
  correctedClockOutLocal?: string | null;
}

export interface ExplainDayValidationRow extends ExplainDayScanContext {
  date: string;
  isHalfDay: boolean;
  scheduledEndTime: string;
  scheduledStartTime: string;
}

/**
 * Field matrix validation plus scan ordering constraints for a single day.
 */
export function validateExplainDayRow(
  selection: FieldMovementSelection,
  values: FieldMovementFieldValues,
  row: ExplainDayValidationRow,
  options?: { requireLateReason?: boolean; lateReason?: string },
): Record<string, string> {
  const errors: Record<string, string> = {};
  const issues = validateFieldMovementValues(selection, values, {
    requireDate: false,
  });
  for (const issue of issues) {
    if (!errors[issue.field]) {
      errors[issue.field] = issue.message;
    }
  }

  if (options?.requireLateReason && (options.lateReason?.trim().length ?? 0) < 3) {
    errors.lateReason = 'Late entry reason is required (at least 3 characters)';
  }

  if (
    selection.reasonType === 'EARLY_LEAVE' &&
    values.timeOut &&
    values.timeOut >= row.scheduledEndTime
  ) {
    errors.timeOut = `Departure must be before scheduled end (${row.scheduledEndTime})`;
  }

  const existingIn = effectiveScan(
    row.correctedClockInLocal,
    row.clockInLocal,
  );
  const existingOut = effectiveScan(
    row.correctedClockOutLocal,
    row.clockOutLocal,
  );

  if (selection.reasonType === 'FORGOT') {
    if (
      (selection.forgotDirection === 'OUT' || selection.forgotDirection === 'BOTH') &&
      values.clockOutTime &&
      existingIn &&
      values.clockOutTime <= existingIn
    ) {
      errors.clockOutTime = 'Stated clock-out must be after the recorded clock-in';
    }
    if (
      (selection.forgotDirection === 'IN' || selection.forgotDirection === 'BOTH') &&
      values.clockInTime &&
      existingOut &&
      values.clockInTime >= existingOut
    ) {
      errors.clockInTime = 'Stated clock-in must be before the recorded clock-out';
    }
  }

  if (selection.reasonType === 'EARLY_LEAVE' && values.timeOut && existingIn) {
    if (values.timeOut <= existingIn) {
      errors.timeOut = 'Departure must be after the recorded clock-in';
    }
  }

  return errors;
}

export function explainDayRowIsValid(
  selection: FieldMovementSelection,
  values: FieldMovementFieldValues,
  row: ExplainDayValidationRow,
  options?: { requireLateReason?: boolean; lateReason?: string },
): boolean {
  return (
    Object.keys(validateExplainDayRow(selection, values, row, options)).length ===
    0
  );
}
