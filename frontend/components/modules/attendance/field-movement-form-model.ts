import type { AttendanceDayFlag, FieldMovementReason, FlaggedDay } from '@/lib/api/attendance.types';
import type { FieldMovementEntryErrors } from '@/components/modules/attendance/FieldMovementEntryFields';
import {
  availableForgotDirections,
  availableReasonTypesForFlag,
  countStorageEntries,
  type FieldMovementFieldValues,
  type FieldMovementReasonType,
  type FieldMovementSelection,
  type ForgotDirection,
  validateFieldMovementValues,
} from '@/lib/field-movement/field-movement-field-rules';

export type DayErrors = FieldMovementEntryErrors & {
  lateReason?: string;
};

export type DayEntry = {
  id: string;
  date: string;
  flag: AttendanceDayFlag;
  isHalfDay: boolean;
  availableReasons: FieldMovementReason[];
  alreadySubmitted: boolean;
  submittedLog: {
    id: string;
    requestNumber: string;
    status: string;
    approvalRequestId: string | null;
    pendingTierLabel: string | null;
    pendingApproverName: string | null;
  } | null;
  coverMessage: string | null;
  bothScansMissing: boolean;
  selected: boolean;
  reasonType: FieldMovementReasonType | null;
  forgotDirection: ForgotDirection | null;
  location: string;
  timeOut: string;
  returnTime: string;
  clockInTime: string;
  clockOutTime: string;
  reasonNote: string;
  lateReason: string;
  errors: DayErrors;
  filledViaBulk: boolean;
};

export function daySelection(day: DayEntry): FieldMovementSelection {
  return {
    reasonType: day.reasonType,
    forgotDirection: day.forgotDirection,
  };
}

export function dayFieldValues(day: DayEntry): FieldMovementFieldValues {
  return {
    date: day.date,
    location: day.location,
    timeOut: day.timeOut,
    returnTime: day.returnTime,
    clockInTime: day.clockInTime,
    clockOutTime: day.clockOutTime,
    reasonNote: day.reasonNote,
  };
}

export function availableReasonTypesForDay(day: DayEntry): FieldMovementReasonType[] {
  return availableReasonTypesForFlag(day.flag, {
    bothScansMissing: day.bothScansMissing,
  });
}

export function availableForgotDirectionsForDay(day: DayEntry): ForgotDirection[] {
  return availableForgotDirections({
    flag: day.flag,
    bothScansMissing: day.bothScansMissing,
  });
}

export function toDayEntry(day: FlaggedDay): DayEntry {
  return {
    id: day.id,
    date: day.date,
    flag: day.flag,
    isHalfDay: day.isHalfDay,
    availableReasons: day.availableReasons,
    alreadySubmitted: day.alreadySubmitted,
    submittedLog: day.submittedLog
      ? {
          id: day.submittedLog.id,
          requestNumber: day.submittedLog.requestNumber,
          status: day.submittedLog.status,
          approvalRequestId: day.submittedLog.approvalRequestId,
          pendingTierLabel: day.submittedLog.pendingTierLabel,
          pendingApproverName: day.submittedLog.pendingApproverName,
        }
      : null,
    coverMessage: day.coverMessage ?? null,
    bothScansMissing:
      !(day.correctedClockInLocal ?? day.clockInLocal) &&
      !(day.correctedClockOutLocal ?? day.clockOutLocal),
    selected: !day.alreadySubmitted,
    reasonType: null,
    forgotDirection: null,
    location: '',
    timeOut: '',
    returnTime: '',
    clockInTime: '',
    clockOutTime: '',
    reasonNote: '',
    lateReason: '',
    errors: {},
    filledViaBulk: false,
  };
}

/** Intersection of reason types valid for every selected day. */
export function getValidBulkReasons(
  selectedDays: DayEntry[],
): FieldMovementReasonType[] {
  if (selectedDays.length === 0) {
    return [];
  }
  let intersection = new Set(availableReasonTypesForDay(selectedDays[0]!));
  for (const day of selectedDays.slice(1)) {
    const allowed = new Set(availableReasonTypesForDay(day));
    intersection = new Set(
      [...intersection].filter((value) => allowed.has(value)),
    );
  }
  return [...intersection];
}

/** Union of directions any selected day supports (BOTH only if a day offers it). */
export function getValidBulkForgotDirections(
  selectedDays: DayEntry[],
): ForgotDirection[] {
  if (selectedDays.length === 0) {
    return [];
  }
  const union = new Set<ForgotDirection>();
  for (const day of selectedDays) {
    for (const direction of availableForgotDirectionsForDay(day)) {
      union.add(direction);
    }
  }
  if (
    !selectedDays.some((day) =>
      availableForgotDirectionsForDay(day).includes('BOTH'),
    )
  ) {
    union.delete('BOTH');
  }
  return [...union];
}

export function canApplySelectionToDay(
  day: DayEntry,
  selection: FieldMovementSelection,
): boolean {
  if (!selection.reasonType) {
    return false;
  }
  if (!availableReasonTypesForDay(day).includes(selection.reasonType)) {
    return false;
  }
  if (selection.reasonType !== 'FORGOT') {
    return true;
  }
  if (!selection.forgotDirection) {
    return false;
  }
  return availableForgotDirectionsForDay(day).includes(selection.forgotDirection);
}

export function validationErrorsForDay(
  day: DayEntry,
  options?: { requireLateReason?: boolean; scheduledEndBefore?: string },
): DayErrors {
  const errors: DayErrors = {};
  if (!day.reasonType) {
    errors.reasonType = 'Reason type is required';
    return errors;
  }
  const issues = validateFieldMovementValues(daySelection(day), dayFieldValues(day), {
    requireDate: false,
  });
  for (const issue of issues) {
    if (!errors[issue.field]) {
      errors[issue.field] = issue.message;
    }
  }
  if (options?.requireLateReason && day.lateReason.trim().length < 3) {
    errors.lateReason = 'Late entry reason is required (at least 3 characters)';
  }
  if (
    day.reasonType === 'EARLY_LEAVE' &&
    options?.scheduledEndBefore &&
    day.timeOut
  ) {
    if (day.timeOut >= options.scheduledEndBefore) {
      errors.timeOut = `Departure must be before scheduled end (${options.scheduledEndBefore})`;
    }
  }
  return errors;
}

export function dayIsFullyExplained(
  day: DayEntry,
  requireLateReason = false,
  scheduledEndBefore?: string,
): boolean {
  if (!day.selected || !day.reasonType) {
    return false;
  }
  const errors = validationErrorsForDay(day, {
    requireLateReason,
    scheduledEndBefore,
  });
  return Object.keys(errors).length === 0;
}

export function storageEntryCountForDay(day: DayEntry): number {
  if (!day.reasonType) {
    return 0;
  }
  return countStorageEntries(daySelection(day));
}

/** Log-level late reason from per-day values (API stores one string on the log). */
export function combineLateReasons(days: DayEntry[]): string | undefined {
  const unique = [
    ...new Set(
      days
        .map((day) => day.lateReason.trim())
        .filter((value) => value.length > 0),
    ),
  ];
  if (unique.length === 0) {
    return undefined;
  }
  return unique.join('\n');
}

export function emptyFieldValues(): FieldMovementFieldValues {
  return {
    location: '',
    timeOut: '',
    returnTime: '',
    clockInTime: '',
    clockOutTime: '',
    reasonNote: '',
  };
}
