import type {
  AttendanceDayFlag,
  CreateFieldMovementEntryDto,
  FieldMovementExplanationStatus,
  FieldMovementReason,
  FlaggedDay,
} from '@/lib/api/attendance.types';
import type { FieldMovementEntryErrors } from '@/components/modules/attendance/FieldMovementEntryFields';
import {
  deriveIssueTypeFromFlagged,
  normalizeExplanationStatus,
} from '@/lib/field-movement/explain-days-selection';
import type { FieldMovementIssueType } from '@/lib/generated/field-movement-issue-compatibility';
import {
  availableForgotDirections,
  availableReasonTypesForFlag,
  countStorageEntries,
  selectionFromStorageReason,
  type FieldMovementFieldValues,
  type FieldMovementReasonType,
  type FieldMovementSelection,
  type ForgotDirection,
  validateFieldMovementValues,
} from '@/lib/generated/field-movement-field-rules';

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
  clockInLocal: string | null;
  clockOutLocal: string | null;
  correctedClockInLocal: string | null;
  correctedClockOutLocal: string | null;
  issueType: FieldMovementIssueType | null;
  explanationStatus: FieldMovementExplanationStatus;
  selectable: boolean;
  scheduledStartTime: string;
  scheduledEndTime: string;
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

export function defaultScheduledEndTime(
  dateStr: string,
  isHalfDay: boolean,
  override?: string,
): string {
  if (override) {
    return override;
  }
  if (isHalfDay) {
    return '12:30';
  }
  return new Date(dateStr).getDay() === 6 ? '12:30' : '17:30';
}

export function defaultScheduledStartTime(
  isHalfDay: boolean,
  override?: string,
): string {
  if (override) {
    return override;
  }
  return isHalfDay ? '08:00' : '08:00';
}

function hydrateFromDraftEntries(
  entries: CreateFieldMovementEntryDto[] | undefined,
): Pick<
  DayEntry,
  | 'reasonType'
  | 'forgotDirection'
  | 'location'
  | 'timeOut'
  | 'returnTime'
  | 'clockInTime'
  | 'clockOutTime'
  | 'reasonNote'
> | null {
  if (!entries || entries.length === 0) {
    return null;
  }
  const first = entries[0]!;
  const second = entries[1];
  const paired =
    second &&
    ((first.reason === 'FORGOT_CLOCK_IN' &&
      second.reason === 'FORGOT_CLOCK_OUT') ||
      (first.reason === 'FORGOT_CLOCK_OUT' &&
        second.reason === 'FORGOT_CLOCK_IN'))
      ? second.reason
      : null;
  const selection = selectionFromStorageReason(first.reason, paired);
  const entryForVisit = entries.find((e) => e.reason === 'FIELD_VISIT');
  const entryEarly = entries.find((e) => e.reason === 'EARLY_LEAVE');
  const forgotIn = entries.find((e) => e.reason === 'FORGOT_CLOCK_IN');
  const forgotOut = entries.find((e) => e.reason === 'FORGOT_CLOCK_OUT');
  const notes =
    entries.map((e) => e.notes?.trim()).find((n) => n && n.length > 0) ?? '';

  if (selection.reasonType === 'FIELD_VISIT' && entryForVisit) {
    return {
      reasonType: 'FIELD_VISIT',
      forgotDirection: null,
      location: entryForVisit.destination ?? '',
      timeOut: entryForVisit.departureTime ?? '',
      returnTime: entryForVisit.returnTime ?? '',
      clockInTime: '',
      clockOutTime: '',
      reasonNote: notes,
    };
  }
  if (selection.reasonType === 'EARLY_LEAVE' && entryEarly) {
    return {
      reasonType: 'EARLY_LEAVE',
      forgotDirection: null,
      location: '',
      timeOut: entryEarly.departureTime ?? '',
      returnTime: '',
      clockInTime: '',
      clockOutTime: '',
      reasonNote: notes,
    };
  }
  return {
    reasonType: selection.reasonType,
    forgotDirection: selection.forgotDirection ?? null,
    location: '',
    timeOut: '',
    returnTime: '',
    clockInTime: forgotIn?.returnTime ?? '',
    clockOutTime: forgotOut?.departureTime ?? '',
    reasonNote: notes,
  };
}

export function toDayEntry(day: FlaggedDay): DayEntry {
  const explanationStatus = normalizeExplanationStatus(
    day.explanationStatus,
    day.alreadySubmitted,
  );
  const issueType = deriveIssueTypeFromFlagged(day);
  const selectable =
    day.selectable ??
    (!day.alreadySubmitted && explanationStatus !== 'SUBMITTED' &&
      explanationStatus !== 'APPROVED');
  const scheduledEnd = defaultScheduledEndTime(
    day.date,
    day.isHalfDay,
    day.scheduledEndTime,
  );
  const scheduledStart = defaultScheduledStartTime(
    day.isHalfDay,
    day.scheduledStartTime,
  );
  const draftHydrated = hydrateFromDraftEntries(day.draftEntries);
  const base: DayEntry = {
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
    clockInLocal: day.clockInLocal,
    clockOutLocal: day.clockOutLocal,
    correctedClockInLocal: day.correctedClockInLocal,
    correctedClockOutLocal: day.correctedClockOutLocal,
    issueType,
    explanationStatus,
    selectable,
    scheduledStartTime: scheduledStart,
    scheduledEndTime: scheduledEnd,
    selected: false,
    reasonType: null,
    forgotDirection: null,
    location: '',
    timeOut: '',
    returnTime: '',
    clockInTime: '',
    clockOutTime: '',
    reasonNote: '',
    lateReason: day.lateReason?.trim() ?? '',
    errors: {},
    filledViaBulk: false,
  };
  if (draftHydrated) {
    return {
      ...base,
      ...draftHydrated,
      lateReason: day.lateReason?.trim() ?? base.lateReason,
      explanationStatus:
        explanationStatus === 'NOT_EXPLAINED' ? 'DRAFT' : explanationStatus,
    };
  }
  return base;
}

/** Days saved as draft on the server (or fully explained locally for review). */
export function dayHasDraftExplanation(day: DayEntry): boolean {
  return (
    day.explanationStatus === 'DRAFT' &&
    day.reasonType !== null &&
    !day.alreadySubmitted
  );
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
