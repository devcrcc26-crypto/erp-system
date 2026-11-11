// GENERATED from backend/src/modules/attendance/application/utils/field-movement-field-rules.ts - do not edit; run npm run sync:shared (in backend/)

/**
 * Single source of truth for field-movement entry field visibility,
 * required/optional labels, and validation.
 *
 * Storage reasons remain FORGOT_CLOCK_IN / FORGOT_CLOCK_OUT; UI "Both"
 * expands to one entry of each.
 *
 * Shared with the frontend: `npm run sync:shared` copies this file to
 * frontend/lib/generated/. Keep it dependency-free (no imports at all, not even
 * the Prisma client); enum-backed values are string-literal unions checked
 * against Prisma in field-movement-shared-config.spec.ts.
 */

export type FieldMovementReasonType =
  | 'FIELD_VISIT'
  | 'EARLY_LEAVE'
  | 'FORGOT';

export type ForgotDirection = 'IN' | 'OUT' | 'BOTH';

/** UI / API field keys used by forms and validators. */
export type FieldMovementFieldKey =
  | 'date'
  | 'timeOut'
  | 'returnTime'
  | 'clockInTime'
  | 'clockOutTime'
  | 'forgotDirection'
  | 'location'
  | 'reasonNote'
  | 'attachment';

export type FieldPresence = 'required' | 'optional' | 'hidden';

/** Canonical storage reasons persisted on FieldMovementEntry (= Prisma FieldMovementReason). */
export const FIELD_MOVEMENT_STORAGE_REASONS = [
  'FIELD_VISIT',
  'EARLY_LEAVE',
  'FORGOT_CLOCK_IN',
  'FORGOT_CLOCK_OUT',
] as const;

export type FieldMovementStorageReason =
  (typeof FIELD_MOVEMENT_STORAGE_REASONS)[number];

export interface FieldMovementSelection {
  reasonType: FieldMovementReasonType | null;
  forgotDirection?: ForgotDirection | null;
}

export interface FieldMovementFieldValues {
  date?: string | null;
  timeOut?: string | null;
  returnTime?: string | null;
  clockInTime?: string | null;
  clockOutTime?: string | null;
  location?: string | null;
  reasonNote?: string | null;
  attachment?: string | null;
}

export interface FieldMovementFieldRule {
  key: FieldMovementFieldKey;
  presence: FieldPresence;
  /** i18n key under pages.approvals.fieldMovement.fields.* */
  labelKey: string;
}

export interface FieldValidationIssue {
  field: FieldMovementFieldKey;
  code: string;
  message: string;
}

/** HH:mm 24-hour. */
export const TIME_HH_MM = /^\d{2}:\d{2}$/;

export const FIELD_MOVEMENT_FIELD_KEYS: FieldMovementFieldKey[] = [
  'date',
  'timeOut',
  'returnTime',
  'clockInTime',
  'clockOutTime',
  'forgotDirection',
  'location',
  'reasonNote',
  'attachment',
];

const LABEL_KEYS: Record<FieldMovementFieldKey, string> = {
  date: 'date',
  timeOut: 'timeOut',
  returnTime: 'returnTime',
  clockInTime: 'clockInTime',
  clockOutTime: 'clockOutTime',
  forgotDirection: 'forgotDirection',
  location: 'location',
  reasonNote: 'reasonNote',
  attachment: 'attachment',
};

/**
 * Resolves visibility for every field given the current reason / direction.
 */
export function resolveFieldPresence(
  selection: FieldMovementSelection,
): Record<FieldMovementFieldKey, FieldPresence> {
  const hidden = Object.fromEntries(
    FIELD_MOVEMENT_FIELD_KEYS.map((key) => [key, 'hidden' as FieldPresence]),
  ) as Record<FieldMovementFieldKey, FieldPresence>;

  if (!selection.reasonType) {
    return hidden;
  }

  const base: Record<FieldMovementFieldKey, FieldPresence> = {
    ...hidden,
    date: 'required',
    reasonNote: 'required',
    attachment: 'optional',
  };

  if (selection.reasonType === 'FIELD_VISIT') {
    return {
      ...base,
      timeOut: 'required',
      returnTime: 'optional',
      location: 'required',
    };
  }

  if (selection.reasonType === 'EARLY_LEAVE') {
    return {
      ...base,
      timeOut: 'required',
    };
  }

  // FORGOT
  const direction = selection.forgotDirection ?? null;
  const withDirection: Record<FieldMovementFieldKey, FieldPresence> = {
    ...base,
    forgotDirection: 'required',
  };
  if (direction === 'IN' || direction === 'BOTH') {
    withDirection.clockInTime = 'required';
  }
  if (direction === 'OUT' || direction === 'BOTH') {
    withDirection.clockOutTime = 'required';
  }
  return withDirection;
}

/**
 * Ordered rules for rendering (skips hidden). Labels come from labelKey.
 */
export function getVisibleFieldRules(
  selection: FieldMovementSelection,
): FieldMovementFieldRule[] {
  const presence = resolveFieldPresence(selection);
  return FIELD_MOVEMENT_FIELD_KEYS.filter(
    (key) => presence[key] !== 'hidden',
  ).map((key) => ({
    key,
    presence: presence[key],
    labelKey: LABEL_KEYS[key],
  }));
}

/**
 * Clears values for fields that become hidden when reason/direction changes.
 */
export function clearHiddenFieldValues(
  selection: FieldMovementSelection,
  values: FieldMovementFieldValues,
): FieldMovementFieldValues {
  const presence = resolveFieldPresence(selection);
  const next: FieldMovementFieldValues = { ...values };
  if (presence.timeOut === 'hidden') {
    next.timeOut = '';
  }
  if (presence.returnTime === 'hidden') {
    next.returnTime = '';
  }
  if (presence.clockInTime === 'hidden') {
    next.clockInTime = '';
  }
  if (presence.clockOutTime === 'hidden') {
    next.clockOutTime = '';
  }
  if (presence.location === 'hidden') {
    next.location = '';
  }
  if (presence.reasonNote === 'hidden') {
    next.reasonNote = '';
  }
  if (presence.attachment === 'hidden') {
    next.attachment = null;
  }
  return next;
}

/**
 * Strips hidden fields so they are never submitted.
 */
export function stripHiddenFieldValues(
  selection: FieldMovementSelection,
  values: FieldMovementFieldValues,
): FieldMovementFieldValues {
  const presence = resolveFieldPresence(selection);
  const out: FieldMovementFieldValues = {};
  for (const key of FIELD_MOVEMENT_FIELD_KEYS) {
    if (key === 'forgotDirection') {
      continue;
    }
    if (presence[key] === 'hidden') {
      continue;
    }
    const value = values[key as keyof FieldMovementFieldValues];
    if (value !== undefined) {
      (out as Record<string, unknown>)[key] = value;
    }
  }
  return out;
}

function isBlank(value: string | null | undefined): boolean {
  return value == null || value.trim().length === 0;
}

function parseHhMm(value: string): number | null {
  if (!TIME_HH_MM.test(value)) {
    return null;
  }
  const [h, m] = value.split(':').map((part) => Number(part));
  if (
    h == null ||
    m == null ||
    Number.isNaN(h) ||
    Number.isNaN(m) ||
    h > 23 ||
    m > 59
  ) {
    return null;
  }
  return h * 60 + m;
}

/**
 * Validates values against the field matrix. Does not check date availability
 * or attendance-flag eligibility (callers enforce those separately).
 */
export function validateFieldMovementValues(
  selection: FieldMovementSelection,
  values: FieldMovementFieldValues,
  options?: { requireDate?: boolean },
): FieldValidationIssue[] {
  const issues: FieldValidationIssue[] = [];
  const presence = resolveFieldPresence(selection);
  const requireDate = options?.requireDate !== false;

  if (!selection.reasonType) {
    issues.push({
      field: 'date',
      code: 'REASON_REQUIRED',
      message: 'Reason type is required',
    });
    return issues;
  }

  if (selection.reasonType === 'FORGOT' && !selection.forgotDirection) {
    issues.push({
      field: 'forgotDirection',
      code: 'FORGOT_DIRECTION_REQUIRED',
      message: 'Forgot direction (In / Out / Both) is required',
    });
  }

  for (const key of FIELD_MOVEMENT_FIELD_KEYS) {
    const rule = presence[key];
    if (rule === 'hidden' || key === 'forgotDirection') {
      continue;
    }
    if (key === 'date' && !requireDate) {
      continue;
    }
    if (key === 'attachment') {
      continue;
    }

    const raw = values[key as keyof FieldMovementFieldValues];
    const text = typeof raw === 'string' ? raw.trim() : raw;

    if (rule === 'required' && isBlank(text as string | null | undefined)) {
      issues.push({
        field: key,
        code: 'REQUIRED',
        message: `${key} is required`,
      });
      continue;
    }

    if (
      (key === 'timeOut' ||
        key === 'returnTime' ||
        key === 'clockInTime' ||
        key === 'clockOutTime') &&
      typeof text === 'string' &&
      text.length > 0 &&
      parseHhMm(text) == null
    ) {
      issues.push({
        field: key,
        code: 'INVALID_TIME',
        message: `${key} must be HH:mm (24-hour)`,
      });
    }

    if (
      key === 'location' &&
      typeof text === 'string' &&
      text.length > 0 &&
      text.length < 3
    ) {
      issues.push({
        field: key,
        code: 'LOCATION_TOO_SHORT',
        message: 'location must be at least 3 characters',
      });
    }

    if (
      key === 'reasonNote' &&
      typeof text === 'string' &&
      text.length > 0 &&
      text.length < 3
    ) {
      issues.push({
        field: key,
        code: 'NOTE_TOO_SHORT',
        message: 'reasonNote must be at least 3 characters',
      });
    }
  }

  if (presence.returnTime !== 'hidden') {
    const timeOut = values.timeOut?.trim() ?? '';
    const returnTime = values.returnTime?.trim() ?? '';
    if (returnTime && timeOut) {
      const outMins = parseHhMm(timeOut);
      const retMins = parseHhMm(returnTime);
      if (outMins != null && retMins != null && retMins <= outMins) {
        issues.push({
          field: 'returnTime',
          code: 'RETURN_AFTER_TIMEOUT',
          message: 'returnTime must be after timeOut',
        });
      }
    }
  }

  if (
    presence.clockInTime === 'required' &&
    presence.clockOutTime === 'required'
  ) {
    const clockIn = values.clockInTime?.trim() ?? '';
    const clockOut = values.clockOutTime?.trim() ?? '';
    if (clockIn && clockOut) {
      const inMins = parseHhMm(clockIn);
      const outMins = parseHhMm(clockOut);
      if (inMins != null && outMins != null && outMins <= inMins) {
        issues.push({
          field: 'clockOutTime',
          code: 'CLOCK_OUT_AFTER_IN',
          message: 'clockOutTime must be after clockInTime',
        });
      }
    }
  }

  // Reject values sent for hidden fields (backend strip / 400).
  for (const key of FIELD_MOVEMENT_FIELD_KEYS) {
    if (key === 'forgotDirection' || key === 'date' || key === 'attachment') {
      continue;
    }
    if (presence[key] !== 'hidden') {
      continue;
    }
    const raw = values[key as keyof FieldMovementFieldValues];
    if (typeof raw === 'string' && raw.trim().length > 0) {
      issues.push({
        field: key,
        code: 'FIELD_NOT_ALLOWED',
        message: `${key} is not allowed for this reason`,
      });
    }
  }

  return issues;
}

/**
 * How many stored entries one UI selection creates (Both = 2).
 */
export function countStorageEntries(selection: FieldMovementSelection): number {
  if (!selection.reasonType) {
    return 0;
  }
  if (
    selection.reasonType === 'FORGOT' &&
    selection.forgotDirection === 'BOTH'
  ) {
    return 2;
  }
  return 1;
}

export interface StorageEntryPayload {
  reason: FieldMovementStorageReason;
  destination?: string;
  departureTime?: string;
  returnTime?: string;
  notes?: string;
}

/**
 * Maps UI selection + values to one or two storage payloads.
 * FORGOT clock-in uses returnTime; clock-out uses departureTime (existing schema).
 */
export function toStorageEntries(
  selection: FieldMovementSelection,
  values: FieldMovementFieldValues,
): StorageEntryPayload[] {
  const cleaned = stripHiddenFieldValues(selection, values);
  const notes = cleaned.reasonNote?.trim() || undefined;

  if (selection.reasonType === 'FIELD_VISIT') {
    return [
      {
        reason: 'FIELD_VISIT',
        destination: cleaned.location?.trim() || undefined,
        departureTime: cleaned.timeOut?.trim() || undefined,
        returnTime: cleaned.returnTime?.trim() || undefined,
        notes,
      },
    ];
  }

  if (selection.reasonType === 'EARLY_LEAVE') {
    return [
      {
        reason: 'EARLY_LEAVE',
        departureTime: cleaned.timeOut?.trim() || undefined,
        notes,
      },
    ];
  }

  if (selection.reasonType !== 'FORGOT' || !selection.forgotDirection) {
    return [];
  }

  const entries: StorageEntryPayload[] = [];
  if (
    selection.forgotDirection === 'IN' ||
    selection.forgotDirection === 'BOTH'
  ) {
    entries.push({
      reason: 'FORGOT_CLOCK_IN',
      returnTime: cleaned.clockInTime?.trim() || undefined,
      notes,
    });
  }
  if (
    selection.forgotDirection === 'OUT' ||
    selection.forgotDirection === 'BOTH'
  ) {
    entries.push({
      reason: 'FORGOT_CLOCK_OUT',
      departureTime: cleaned.clockOutTime?.trim() || undefined,
      notes,
    });
  }
  return entries;
}

/**
 * Maps a storage reason (+ optional paired forgot) back to UI selection.
 */
export function selectionFromStorageReason(
  reason: FieldMovementStorageReason,
  pairedForgot?: FieldMovementStorageReason | null,
): FieldMovementSelection {
  if (reason === 'FIELD_VISIT') {
    return { reasonType: 'FIELD_VISIT' };
  }
  if (reason === 'EARLY_LEAVE') {
    return { reasonType: 'EARLY_LEAVE' };
  }
  if (
    (reason === 'FORGOT_CLOCK_IN' && pairedForgot === 'FORGOT_CLOCK_OUT') ||
    (reason === 'FORGOT_CLOCK_OUT' && pairedForgot === 'FORGOT_CLOCK_IN')
  ) {
    return { reasonType: 'FORGOT', forgotDirection: 'BOTH' };
  }
  if (reason === 'FORGOT_CLOCK_IN') {
    return { reasonType: 'FORGOT', forgotDirection: 'IN' };
  }
  return { reasonType: 'FORGOT', forgotDirection: 'OUT' };
}

/**
 * Which reason types are offered for a flagged day.
 */
export function availableReasonTypesForFlag(
  flag:
    | 'MISSING_CLOCK_IN'
    | 'MISSING_CLOCK_OUT'
    | 'EARLY_LEAVE'
    | 'ON_LEAVE_BUT_SCANNED'
    | 'SCAN_AFTER_SEPARATION'
    | 'NONE',
  options?: { bothScansMissing?: boolean },
): FieldMovementReasonType[] {
  if (
    flag === 'NONE' ||
    flag === 'ON_LEAVE_BUT_SCANNED' ||
    flag === 'SCAN_AFTER_SEPARATION'
  ) {
    return [];
  }
  if (flag === 'MISSING_CLOCK_IN') {
    return ['FIELD_VISIT', 'FORGOT'];
  }
  if (flag === 'EARLY_LEAVE') {
    return ['FIELD_VISIT', 'EARLY_LEAVE'];
  }
  // MISSING_CLOCK_OUT
  const types: FieldMovementReasonType[] = [
    'FIELD_VISIT',
    'EARLY_LEAVE',
    'FORGOT',
  ];
  void options;
  return types;
}

/**
 * Which forgot directions are valid for a day.
 */
export function availableForgotDirections(day: {
  flag:
    | 'MISSING_CLOCK_IN'
    | 'MISSING_CLOCK_OUT'
    | 'EARLY_LEAVE'
    | 'ON_LEAVE_BUT_SCANNED'
    | 'SCAN_AFTER_SEPARATION'
    | 'NONE';
  bothScansMissing: boolean;
}): ForgotDirection[] {
  if (
    day.flag === 'EARLY_LEAVE' ||
    day.flag === 'NONE' ||
    day.flag === 'ON_LEAVE_BUT_SCANNED' ||
    day.flag === 'SCAN_AFTER_SEPARATION'
  ) {
    return [];
  }
  const directions: ForgotDirection[] = [];
  if (day.flag === 'MISSING_CLOCK_IN' || day.bothScansMissing) {
    directions.push('IN');
  }
  if (day.flag === 'MISSING_CLOCK_OUT' || day.bothScansMissing) {
    directions.push('OUT');
  }
  if (day.bothScansMissing) {
    directions.push('BOTH');
  }
  return directions;
}

/**
 * Builds a clear 400 message naming the first offending field.
 */
export function formatValidationMessage(
  issues: FieldValidationIssue[],
  dateLabel?: string,
): string {
  const first = issues[0];
  if (!first) {
    return 'Invalid field movement entry';
  }
  const suffix = dateLabel ? ` on ${dateLabel}` : '';
  return `${first.message}${suffix}`;
}

/**
 * Strips hidden storage columns so they are never persisted.
 */
export function sanitizeStorageEntry(entry: {
  reason: FieldMovementStorageReason;
  destination?: string | null;
  departureTime?: string | null;
  returnTime?: string | null;
  notes?: string | null;
}): {
  destination: string | null;
  departureTime: string | null;
  returnTime: string | null;
  notes: string | null;
} {
  const notes = entry.notes?.trim() ? entry.notes.trim() : null;
  if (entry.reason === 'FIELD_VISIT') {
    return {
      destination: entry.destination?.trim() || null,
      departureTime: entry.departureTime?.trim() || null,
      returnTime: entry.returnTime?.trim() || null,
      notes,
    };
  }
  if (entry.reason === 'EARLY_LEAVE') {
    return {
      destination: null,
      departureTime: entry.departureTime?.trim() || null,
      returnTime: null,
      notes,
    };
  }
  if (entry.reason === 'FORGOT_CLOCK_IN') {
    return {
      destination: null,
      departureTime: null,
      returnTime: entry.returnTime?.trim() || null,
      notes,
    };
  }
  return {
    destination: null,
    departureTime: entry.departureTime?.trim() || null,
    returnTime: null,
    notes,
  };
}

/**
 * Validates a storage-shaped entry (backend DTO) using the same matrix.
 * Hidden fields present on the DTO produce FIELD_NOT_ALLOWED issues.
 */
export function validateStorageEntry(
  entry: {
    reason: FieldMovementStorageReason;
    destination?: string | null;
    departureTime?: string | null;
    returnTime?: string | null;
    notes?: string | null;
  },
  options?: {
    dateLabel?: string;
    /** When validating a "forgot both" pair, pass the sibling. */
    pairedForgot?: {
      reason: FieldMovementStorageReason;
      destination?: string | null;
      departureTime?: string | null;
      returnTime?: string | null;
      notes?: string | null;
    } | null;
  },
): FieldValidationIssue[] {
  if (
    options?.pairedForgot &&
    ((entry.reason === 'FORGOT_CLOCK_IN' &&
      options.pairedForgot.reason === 'FORGOT_CLOCK_OUT') ||
      (entry.reason === 'FORGOT_CLOCK_OUT' &&
        options.pairedForgot.reason === 'FORGOT_CLOCK_IN'))
  ) {
    const clockIn =
      entry.reason === 'FORGOT_CLOCK_IN' ? entry : options.pairedForgot;
    const clockOut =
      entry.reason === 'FORGOT_CLOCK_OUT' ? entry : options.pairedForgot;
    return validateFieldMovementValues(
      { reasonType: 'FORGOT', forgotDirection: 'BOTH' },
      {
        clockInTime: clockIn.returnTime,
        clockOutTime: clockOut.departureTime,
        reasonNote: entry.notes ?? options.pairedForgot.notes,
      },
      { requireDate: false },
    );
  }

  if (entry.reason === 'FIELD_VISIT') {
    return validateFieldMovementValues(
      { reasonType: 'FIELD_VISIT' },
      {
        location: entry.destination,
        timeOut: entry.departureTime,
        returnTime: entry.returnTime,
        reasonNote: entry.notes,
      },
      { requireDate: false },
    );
  }

  if (entry.reason === 'EARLY_LEAVE') {
    return validateFieldMovementValues(
      { reasonType: 'EARLY_LEAVE' },
      {
        timeOut: entry.departureTime,
        reasonNote: entry.notes,
        // Reject location / returnTime if present
        location: entry.destination,
        returnTime: entry.returnTime,
      },
      { requireDate: false },
    );
  }

  if (entry.reason === 'FORGOT_CLOCK_IN') {
    return validateFieldMovementValues(
      { reasonType: 'FORGOT', forgotDirection: 'IN' },
      {
        clockInTime: entry.returnTime,
        reasonNote: entry.notes,
        location: entry.destination,
        timeOut: entry.departureTime,
      },
      { requireDate: false },
    );
  }

  return validateFieldMovementValues(
    { reasonType: 'FORGOT', forgotDirection: 'OUT' },
    {
      clockOutTime: entry.departureTime,
      reasonNote: entry.notes,
      location: entry.destination,
      returnTime: entry.returnTime,
    },
    { requireDate: false },
  );
}
