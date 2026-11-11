/**
 * Snapshot + diff helpers for overtime edits after approval.
 * OT type is derived from hour buckets (not a user-selected field).
 */

export type OvertimeEntrySnapshot = {
  id: string;
  date: string;
  startTime: string;
  endTime: string;
  endsAtEndOfDay: boolean;
  isHoliday: boolean;
  isOvernight: boolean;
  regularHours: number;
  nightHours: number;
  weekendHours: number;
  holidayHours: number;
  totalHours: number;
  taskDescription: string;
};

export type OvertimeApprovedSnapshot = {
  capturedAt: string;
  entries: OvertimeEntrySnapshot[];
};

export type OvertimeFieldChange = {
  field: 'date' | 'otType' | 'startTime' | 'endTime' | 'hours' | 'reason';
  from: string;
  to: string;
};

/** Whole-entry view for previous / current columns in the approver table. */
export type OvertimeEntryDiffSummary = {
  date: string;
  otType: string;
  startTime: string;
  endTime: string;
  hours: string;
  reason: string;
};

export type OvertimeEntryEditChange = {
  entryId: string;
  /** Entry date used for grouping in the approver UI (before date if removed). */
  entryDate: string;
  changes: OvertimeFieldChange[];
  /** Full previous entry (null when added). */
  before: OvertimeEntryDiffSummary | null;
  /** Full current entry (null when removed). */
  after: OvertimeEntryDiffSummary | null;
  added?: boolean;
  removed?: boolean;
};

export type OvertimeEditDiff = {
  editedAfterApproval: boolean;
  reasonOnly: boolean;
  entryChanges: OvertimeEntryEditChange[];
  summaryLines: Array<{ label: string; from: string; to: string }>;
};

type RawEntryLike = {
  id: string;
  date: Date | string;
  startTime: Date | string;
  endTime: Date | string;
  endsAtEndOfDay?: boolean | null;
  isHoliday?: boolean | null;
  isOvernight?: boolean | null;
  regularHours: unknown;
  nightHours: unknown;
  weekendHours: unknown;
  holidayHours: unknown;
  totalHours?: unknown;
  taskDescription: string;
};

/**
 * Formats a Date or HH:mm / ISO time string as HH:mm (UTC for Date).
 */
export function formatOtHhMm(value: Date | string): string {
  if (typeof value === 'string') {
    if (/^\d{2}:\d{2}/.test(value)) {
      return value.slice(0, 5);
    }
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) {
      return `${String(parsed.getUTCHours()).padStart(2, '0')}:${String(parsed.getUTCMinutes()).padStart(2, '0')}`;
    }
    return value;
  }
  return `${String(value.getUTCHours()).padStart(2, '0')}:${String(value.getUTCMinutes()).padStart(2, '0')}`;
}

/**
 * Formats a Date or YYYY-MM-DD as YYYY-MM-DD.
 */
export function formatOtDateOnly(value: Date | string): string {
  if (typeof value === 'string') {
    return value.slice(0, 10);
  }
  const y = value.getUTCFullYear();
  const m = String(value.getUTCMonth() + 1).padStart(2, '0');
  const d = String(value.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function toHours(value: unknown): number {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : 0;
}

/**
 * Human-readable OT type from hour buckets (Normal / Evening / Weekend / Holiday).
 */
export function describeOtType(entry: {
  regularHours: number;
  nightHours: number;
  weekendHours: number;
  holidayHours: number;
}): string {
  const parts: string[] = [];
  if (entry.holidayHours > 0) {
    parts.push('Holiday (2×)');
  }
  if (entry.weekendHours > 0) {
    parts.push('Sunday (2×)');
  }
  if (entry.nightHours > 0) {
    parts.push('Evening (1.75×)');
  }
  if (entry.regularHours > 0) {
    parts.push('Normal (1.5×)');
  }
  return parts.length > 0 ? parts.join(' + ') : 'Normal (1.5×)';
}

function formatHoursLabel(hours: number): string {
  const rounded = Math.round(hours * 100) / 100;
  return `${rounded}h`;
}

/**
 * Builds a durable snapshot of sheet entries at approval time.
 */
export function buildOvertimeApprovedSnapshot(
  entries: RawEntryLike[],
  capturedAt: Date = new Date(),
): OvertimeApprovedSnapshot {
  return {
    capturedAt: capturedAt.toISOString(),
    entries: entries.map((entry) => {
      const endsAtEndOfDay = Boolean(entry.endsAtEndOfDay);
      const regularHours = toHours(entry.regularHours);
      const nightHours = toHours(entry.nightHours);
      const weekendHours = toHours(entry.weekendHours);
      const holidayHours = toHours(entry.holidayHours);
      const totalHours =
        entry.totalHours !== undefined && entry.totalHours !== null
          ? toHours(entry.totalHours)
          : Math.round(
              (regularHours + nightHours + weekendHours + holidayHours) * 100,
            ) / 100;
      return {
        id: entry.id,
        date: formatOtDateOnly(entry.date),
        startTime: formatOtHhMm(entry.startTime),
        endTime: endsAtEndOfDay ? '24:00' : formatOtHhMm(entry.endTime),
        endsAtEndOfDay,
        isHoliday: Boolean(entry.isHoliday),
        isOvernight: Boolean(entry.isOvernight),
        regularHours,
        nightHours,
        weekendHours,
        holidayHours,
        totalHours,
        taskDescription: entry.taskDescription,
      };
    }),
  };
}

/**
 * Parses a stored JSON snapshot; returns null when missing or invalid.
 */
export function parseOvertimeApprovedSnapshot(
  value: unknown,
): OvertimeApprovedSnapshot | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }
  const record = value as Record<string, unknown>;
  if (!Array.isArray(record.entries)) {
    return null;
  }
  const entries: OvertimeEntrySnapshot[] = [];
  for (const raw of record.entries) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
      continue;
    }
    const e = raw as Record<string, unknown>;
    if (typeof e.id !== 'string' || typeof e.date !== 'string') {
      continue;
    }
    entries.push({
      id: e.id,
      date: e.date.slice(0, 10),
      startTime: String(e.startTime ?? ''),
      endTime: String(e.endTime ?? ''),
      endsAtEndOfDay: Boolean(e.endsAtEndOfDay),
      isHoliday: Boolean(e.isHoliday),
      isOvernight: Boolean(e.isOvernight),
      regularHours: toHours(e.regularHours),
      nightHours: toHours(e.nightHours),
      weekendHours: toHours(e.weekendHours),
      holidayHours: toHours(e.holidayHours),
      totalHours: toHours(e.totalHours),
      taskDescription: String(e.taskDescription ?? ''),
    });
  }
  return {
    capturedAt:
      typeof record.capturedAt === 'string'
        ? record.capturedAt
        : new Date(0).toISOString(),
    entries,
  };
}

function entryToSnapshot(entry: RawEntryLike): OvertimeEntrySnapshot {
  return buildOvertimeApprovedSnapshot([entry]).entries[0];
}

function diffOneEntry(
  before: OvertimeEntrySnapshot,
  after: OvertimeEntrySnapshot,
): OvertimeFieldChange[] {
  const changes: OvertimeFieldChange[] = [];
  if (before.date !== after.date) {
    changes.push({ field: 'date', from: before.date, to: after.date });
  }
  const beforeType = describeOtType(before);
  const afterType = describeOtType(after);
  if (beforeType !== afterType) {
    changes.push({ field: 'otType', from: beforeType, to: afterType });
  }
  if (before.startTime !== after.startTime) {
    changes.push({
      field: 'startTime',
      from: before.startTime,
      to: after.startTime,
    });
  }
  if (before.endTime !== after.endTime) {
    changes.push({
      field: 'endTime',
      from: before.endTime,
      to: after.endTime,
    });
  }
  if (before.totalHours !== after.totalHours) {
    changes.push({
      field: 'hours',
      from: formatHoursLabel(before.totalHours),
      to: formatHoursLabel(after.totalHours),
    });
  }
  if (before.taskDescription.trim() !== after.taskDescription.trim()) {
    changes.push({
      field: 'reason',
      from: before.taskDescription,
      to: after.taskDescription,
    });
  }
  return changes;
}

function toEntrySummary(entry: OvertimeEntrySnapshot): OvertimeEntryDiffSummary {
  return {
    date: entry.date,
    otType: describeOtType(entry),
    startTime: entry.startTime,
    endTime: entry.endTime,
    hours: formatHoursLabel(entry.totalHours),
    reason: entry.taskDescription.trim() || '—',
  };
}

function formatEntryWhole(summary: OvertimeEntryDiffSummary): string {
  return [
    `${summary.date} · ${summary.otType}`,
    `${summary.startTime} → ${summary.endTime} · ${summary.hours}`,
    summary.reason,
  ].join('\n');
}

/** Full field set for an added or removed entry (exact values). */
function snapshotAsChanges(
  entry: OvertimeEntrySnapshot,
  direction: 'added' | 'removed',
): OvertimeFieldChange[] {
  const empty = '—';
  const values: Array<[OvertimeFieldChange['field'], string]> = [
    ['date', entry.date],
    ['otType', describeOtType(entry)],
    ['startTime', entry.startTime],
    ['endTime', entry.endTime],
    ['hours', formatHoursLabel(entry.totalHours)],
    ['reason', entry.taskDescription || empty],
  ];
  return values.map(([field, value]) =>
    direction === 'added'
      ? { field, from: empty, to: value }
      : { field, from: value, to: empty },
  );
}

/**
 * Compares the last approved snapshot to current entries for approver UI.
 * Each changed entry includes full previous and current snapshots for a table.
 */
export function buildOvertimeEditDiff(
  snapshot: OvertimeApprovedSnapshot | null,
  currentEntries: RawEntryLike[],
): OvertimeEditDiff | null {
  if (!snapshot || snapshot.entries.length === 0) {
    return null;
  }

  const current = currentEntries.map(entryToSnapshot);
  const beforeById = new Map(snapshot.entries.map((e) => [e.id, e]));
  const afterById = new Map(current.map((e) => [e.id, e]));
  const entryChanges: OvertimeEntryEditChange[] = [];

  for (const after of current) {
    const before = beforeById.get(after.id);
    if (!before) {
      entryChanges.push({
        entryId: after.id,
        entryDate: after.date,
        changes: snapshotAsChanges(after, 'added'),
        before: null,
        after: toEntrySummary(after),
        added: true,
      });
      continue;
    }
    const changes = diffOneEntry(before, after);
    if (changes.length > 0) {
      entryChanges.push({
        entryId: after.id,
        entryDate: after.date,
        changes,
        before: toEntrySummary(before),
        after: toEntrySummary(after),
      });
    }
  }

  for (const before of snapshot.entries) {
    if (!afterById.has(before.id)) {
      entryChanges.push({
        entryId: before.id,
        entryDate: before.date,
        changes: snapshotAsChanges(before, 'removed'),
        before: toEntrySummary(before),
        after: null,
        removed: true,
      });
    }
  }

  if (entryChanges.length === 0) {
    return {
      editedAfterApproval: true,
      reasonOnly: false,
      entryChanges: [],
      summaryLines: [],
    };
  }

  const reasonOnly =
    entryChanges.every(
      (row) =>
        !row.added &&
        !row.removed &&
        row.changes.every((c) => c.field === 'reason'),
    ) &&
    entryChanges.some((row) => row.changes.length > 0);

  const summaryLines: Array<{ label: string; from: string; to: string }> = [];
  for (const row of entryChanges) {
    const kindLabel = row.added
      ? `Added · ${row.entryDate}`
      : row.removed
        ? `Removed · ${row.entryDate}`
        : `Updated · ${row.entryDate}`;
    summaryLines.push({
      label: kindLabel,
      from: row.before ? formatEntryWhole(row.before) : '—',
      to: row.after ? formatEntryWhole(row.after) : '—',
    });
  }

  return {
    editedAfterApproval: true,
    reasonOnly,
    entryChanges,
    summaryLines,
  };
}
