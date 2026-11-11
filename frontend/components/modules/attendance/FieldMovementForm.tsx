'use client';

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Button, Checkbox, Input, InputNumber, Select } from 'antd';
import dayjs from 'dayjs';
import {
  CalendarSearch,
  ChevronDown,
  CircleAlert,
  CircleCheck,
  ClipboardCheck,
  Info,
  Layers,
  Lock,
  Search,
  TriangleAlert,
  type LucideIcon,
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import DayCoverageNotice from '@/components/modules/hr/shared/DayCoverageNotice';
import HrFormPageShell from '@/components/modules/hr/shared/HrFormPageShell';
import StepperForm from '@/components/ui/StepperForm/StepperForm';
import { useAppMessage } from '@/hooks/use-app-message';
import { useSetHeaderExtra } from '@/hooks/use-set-header-extra';
import { ApiRequestError } from '@/lib/api/errors';
import {
  getEmployeeFlaggedDays,
  getMyAttendance,
  getMyFlaggedDays,
} from '@/lib/api/attendance.api';
import { formatOnBehalfEmployeeName } from '@/components/shared/OnBehalfSelector';
import { useEarliestAllowedDate } from '@/lib/query/backdating';
import { useOnBehalfEligibleEmployees } from '@/lib/query/on-behalf';
import { useCurrentUser } from '@/lib/query/profile';
import { useEpcTranslation } from '@/hooks/use-epc-translation';
import type {
  AttendanceDayFlag,
  CreateFieldMovementEntryDto,
  CreateFieldMovementLogDto,
  FlaggedDaysResponse,
} from '@/lib/api/attendance.types';
import {
  useCancelFieldMovementLog,
  useCreateFieldMovementLog,
  useSubmitFieldMovementLog,
} from '@/lib/query/attendance';
import {
  formatDateList,
  groupBy,
} from '@/lib/utils/date-format.util';
import { notifyApiError } from '@/lib/utils/notify-api-error';
import {
  clearHiddenFieldValues,
  countStorageEntries,
  type FieldMovementFieldKey,
  type FieldMovementFieldValues,
  type FieldMovementReasonType,
  type FieldMovementSelection,
  toStorageEntries,
  validateFieldMovementValues,
} from '@/lib/generated/field-movement-field-rules';
import ExplainDaysPanel from '@/components/modules/attendance/ExplainDaysPanel';
import FieldMovementEntryFields from '@/components/modules/attendance/FieldMovementEntryFields';
import {
  canApplySelectionToDay,
  combineLateReasons,
  dayFieldValues,
  dayHasDraftExplanation,
  dayIsFullyExplained,
  defaultScheduledEndTime,
  emptyFieldValues,
  getValidBulkForgotDirections,
  getValidBulkReasons,
  storageEntryCountForDay,
  toDayEntry,
  validationErrorsForDay,
  availableForgotDirectionsForDay,
  availableReasonTypesForDay,
  daySelection,
  type DayEntry,
  type DayErrors,
} from './field-movement-form-model';
import {
  DateTile,
  FLAG_LABELS,
  FLAG_TONES,
  FlagBadge,
  REASON_ICONS,
  formatLongDate,
} from './field-movement-display';

export {
  combineLateReasons,
  getValidBulkReasons,
  toDayEntry,
} from './field-movement-form-model';

const MONTH_OPTIONS = Array.from({ length: 12 }, (_, i) => ({
  value: i + 1,
  label: new Date(2026, i, 1).toLocaleString('en', { month: 'long' }),
}));

type FetchState =
  | 'idle'
  | 'loading'
  | 'no-data'
  | 'not-approved'
  | 'has-flags'
  | 'all-explained'
  | 'error';

function monthName(month: number | null): string {
  if (month == null) {
    return '-';
  }
  return MONTH_OPTIONS.find((o) => o.value === month)?.label ?? String(month);
}

function scheduledEndTime(dateStr: string, isHalfDay: boolean): string {
  return defaultScheduledEndTime(dateStr, isHalfDay);
}

function dayNeedsAttention(
  day: DayEntry,
  requireLateReason = false,
): boolean {
  if (!day.selected || day.alreadySubmitted) {
    return false;
  }
  return !dayIsFullyExplained(
    day,
    requireLateReason,
    scheduledEndTime(day.date, day.isHalfDay),
  );
}

function blockingLogLabel(log: NonNullable<DayEntry['submittedLog']>): string {
  if (log.status === 'DRAFT') {
    return `${log.requestNumber} - unsubmitted draft (not in Approvals yet)`;
  }
  if (log.pendingApproverName) {
    return `${log.requestNumber} - waiting on ${log.pendingApproverName}`;
  }
  return `${log.requestNumber} - ${log.status}`;
}

function plural(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? '' : 's'}`;
}

function daySummary(
  day: DayEntry,
  reasonTypeLabels: Record<FieldMovementReasonType, string>,
): string {
  if (!day.reasonType) {
    return '';
  }
  const parts = [reasonTypeLabels[day.reasonType]];
  if (day.location) {
    parts.push(day.location);
  }
  if (day.reasonType === 'FORGOT' && day.clockInTime) {
    parts.push(`in ${day.clockInTime}`);
  }
  if (day.reasonType === 'FORGOT' && day.clockOutTime) {
    parts.push(`out ${day.clockOutTime}`);
  } else if (day.timeOut) {
    parts.push(`out ${day.timeOut}`);
  }
  if (day.returnTime) {
    parts.push(`back ${day.returnTime}`);
  }
  return parts.join(' · ');
}

type DayState = 'locked' | 'excluded' | 'error' | 'ready' | 'pending';

function dayState(day: DayEntry, requireLateReason = false): DayState {
  if (day.alreadySubmitted) {
    return 'locked';
  }
  if (!day.selected) {
    return 'excluded';
  }
  if (Object.keys(day.errors).length > 0) {
    return 'error';
  }
  return dayIsFullyExplained(
    day,
    requireLateReason,
    scheduledEndTime(day.date, day.isHalfDay),
  )
    ? 'ready'
    : 'pending';
}

type FieldA11y = {
  id: string;
  'aria-describedby'?: string;
  'aria-invalid'?: boolean;
  'aria-required'?: boolean;
  status?: 'error';
};

/**
 * Label, hint and error wired to the control via id / aria-describedby.
 */
function Field({
  id,
  label,
  optional = false,
  required = false,
  optionalSuffix = '(optional)',
  hint,
  error,
  children,
}: {
  id: string;
  label: string;
  optional?: boolean;
  required?: boolean;
  optionalSuffix?: string;
  hint?: ReactNode;
  error?: string;
  children: (a11y: FieldA11y) => ReactNode;
}): React.ReactNode {
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const describedBy = [hintId, errorId].filter(Boolean).join(' ') || undefined;
  return (
    <div className="fm-field">
      <label htmlFor={id} className="fm-field__label">
        {label}
        {required ? (
          <span className="fm-field__required" aria-hidden>
            *
          </span>
        ) : null}
        {optional && !required ? (
          <span className="fm-field__optional">{optionalSuffix}</span>
        ) : null}
      </label>
      {hint ? (
        <p id={hintId} className="fm-field__hint">
          {hint}
        </p>
      ) : null}
      {children({
        id,
        'aria-describedby': describedBy,
        'aria-invalid': error ? true : undefined,
        'aria-required': required || undefined,
        status: error ? 'error' : undefined,
      })}
      {error ? (
        <p id={errorId} className="fm-field__error">
          <CircleAlert size={14} aria-hidden />
          {error}
        </p>
      ) : null}
    </div>
  );
}

function DayStatusBadge({
  day,
  requireLateReason = false,
}: {
  day: DayEntry;
  requireLateReason?: boolean;
}): React.ReactNode {
  const state = dayState(day, requireLateReason);
  if (state === 'locked' && day.coverMessage) {
    return (
      <span className="fm-badge fm-badge--amber" title={day.coverMessage}>
        <Lock size={13} aria-hidden />
        {day.coverMessage}
      </span>
    );
  }
  if (state === 'locked' && day.submittedLog) {
    return (
      <span className="fm-badge fm-badge--blue">
        <Lock size={13} aria-hidden />
        {blockingLogLabel(day.submittedLog)}
      </span>
    );
  }
  if (state === 'locked' || state === 'excluded') {
    return <span className="fm-badge fm-badge--neutral">Not included</span>;
  }
  if (state === 'error') {
    return (
      <span className="fm-badge fm-badge--red">
        <CircleAlert size={13} aria-hidden />
        Needs attention
      </span>
    );
  }
  if (state === 'ready') {
    return (
      <span className="fm-badge fm-badge--green">
        <CircleCheck size={13} aria-hidden />
        Ready
      </span>
    );
  }
  return (
    <span className="fm-badge fm-badge--amber">
      <TriangleAlert size={13} aria-hidden />
      Needs details
    </span>
  );
}

const NOTICE_ICONS: Record<'info' | 'warning' | 'success' | 'error', LucideIcon> = {
  info: Info,
  warning: TriangleAlert,
  success: CircleCheck,
  error: CircleAlert,
};

function Notice({
  tone,
  title,
  children,
  actions,
}: {
  tone: 'info' | 'warning' | 'success' | 'error';
  title: ReactNode;
  children?: ReactNode;
  actions?: ReactNode;
}): React.ReactNode {
  const Icon = NOTICE_ICONS[tone];
  return (
    <div className={`erp-notice erp-notice--${tone}`}>
      <span className="erp-notice-chip" aria-hidden>
        <Icon size={18} />
      </span>
      <div className="erp-notice-body">
        <p className="erp-notice-title m-0">{title}</p>
        {children ? (
          <div className="erp-notice-description m-0 mt-1">{children}</div>
        ) : null}
        {actions ? (
          <div className="mt-3 flex flex-wrap gap-2">{actions}</div>
        ) : null}
      </div>
    </div>
  );
}

/**
 * Full-page New Request form for Field Movement / Early Departure Log.
 */
export default function FieldMovementForm({
  onBehalf = false,
  onCancel,
  cancelLabel,
}: {
  /** "Add on behalf": pick the employee, then explain their flagged days. */
  onBehalf?: boolean;
  onCancel?: () => void;
  cancelLabel?: string;
} = {}): React.ReactNode {
  const router = useRouter();
  const messageApi = useAppMessage();
  const { t } = useEpcTranslation();
  const resolvedCancel =
    onCancel ?? (() => router.push('/approvals/new'));
  const resolvedCancelLabel = cancelLabel ?? t('hr.buttons.cancel');
  const currentUser = useCurrentUser();
  const eligibleQuery = useOnBehalfEligibleEmployees(
    currentUser.data?.id,
    currentUser.data?.companyId,
    onBehalf,
  );
  const [targetEmployeeId, setTargetEmployeeId] = useState<string | undefined>();
  const targetEmployee = eligibleQuery.data?.find(
    (employee) => employee.id === targetEmployeeId,
  );
  const targetName = targetEmployee
    ? formatOnBehalfEmployeeName(targetEmployee, { includeEmployeeId: false })
    : null;
  const effectiveEmployeeId = onBehalf
    ? targetEmployeeId
    : currentUser.data?.id;
  const earliestQuery = useEarliestAllowedDate(effectiveEmployeeId);
  const createMutation = useCreateFieldMovementLog();
  const submitMutation = useSubmitFieldMovementLog();
  const cancelMutation = useCancelFieldMovementLog();

  const [month, setMonth] = useState<number | null>(null);
  const [year, setYear] = useState<number | null>(null);
  const [fetchState, setFetchState] = useState<FetchState>('idle');
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [dayEntries, setDayEntries] = useState<DayEntry[]>([]);
  const [overallNotes, setOverallNotes] = useState('');
  const [bulkLateReason, setBulkLateReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [stepOneError, setStepOneError] = useState<string | null>(null);
  const [bulkSelection, setBulkSelection] = useState<FieldMovementSelection>({
    reasonType: null,
    forgotDirection: null,
  });
  const [bulkValues, setBulkValues] = useState<FieldMovementFieldValues>(
    emptyFieldValues(),
  );
  const [bulkApplySkipped, setBulkApplySkipped] = useState<string[]>([]);
  const [expandedDays, setExpandedDays] = useState<Set<number>>(new Set());
  const [draftLogId, setDraftLogId] = useState<string | null>(null);
  /** Log-level late reason kept across draft reload so Review can always show it. */
  const [logLateReason, setLogLateReason] = useState('');
  const logLateReasonRef = useRef('');
  function persistLogLateReason(value: string): void {
    const trimmed = value.trim();
    logLateReasonRef.current = trimmed;
    setLogLateReason(trimmed);
  }

  useSetHeaderExtra(null);

  const fmPrefix = 'pages.approvals.fieldMovement';
  const optionalSuffix = t(`${fmPrefix}.optionalSuffix`);
  const fieldLabels = useMemo(
    (): Record<FieldMovementFieldKey, string> => ({
      date: t(`${fmPrefix}.fields.date`),
      timeOut: t(`${fmPrefix}.fields.timeOut`),
      returnTime: t(`${fmPrefix}.fields.returnTime`),
      clockInTime: t(`${fmPrefix}.fields.clockInTime`),
      clockOutTime: t(`${fmPrefix}.fields.clockOutTime`),
      forgotDirection: t(`${fmPrefix}.fields.forgotDirection`),
      location: t(`${fmPrefix}.fields.location`),
      reasonNote: t(`${fmPrefix}.fields.reasonNote`),
      attachment: t(`${fmPrefix}.fields.attachment`),
    }),
    [t],
  );
  const reasonTypeLabels = useMemo(
    (): Record<FieldMovementReasonType, string> => ({
      FIELD_VISIT: t(`${fmPrefix}.reasonTypes.FIELD_VISIT`),
      EARLY_LEAVE: t(`${fmPrefix}.reasonTypes.EARLY_LEAVE`),
      FORGOT: t(`${fmPrefix}.reasonTypes.FORGOT`),
    }),
    [t],
  );
  const forgotDirectionLabels = useMemo(
    () => ({
      IN: t(`${fmPrefix}.forgotDirections.IN`),
      OUT: t(`${fmPrefix}.forgotDirections.OUT`),
      BOTH: t(`${fmPrefix}.forgotDirections.BOTH`),
    }),
    [t],
  );

  const selectableDays = useMemo(
    () => dayEntries.filter((day) => !day.alreadySubmitted),
    [dayEntries],
  );
  const orphanDraftIds = useMemo(() => {
    const ids = new Set<string>();
    for (const day of dayEntries) {
      if (day.submittedLog?.status === 'DRAFT') {
        ids.add(day.submittedLog.id);
      }
    }
    return [...ids];
  }, [dayEntries]);
  const selectedDays = useMemo(
    () => dayEntries.filter((day) => day.selected),
    [dayEntries],
  );
  const selectedCount = selectedDays.length;
  const selectedCoverageSpan = useMemo(() => {
    if (selectedDays.length === 0) {
      return null;
    }
    const sorted = [...selectedDays].sort((a, b) =>
      a.date.localeCompare(b.date),
    );
    return {
      from: sorted[0].date,
      to: sorted[sorted.length - 1].date,
    };
  }, [selectedDays]);
  const now = dayjs();
  const isBeforeCurrentMonth =
    month != null &&
    year != null &&
    (year < now.year() ||
      (year === now.year() && month < now.month() + 1));
  const needsLateReason =
    earliestQuery.data?.requiresLateReasonWhenBeforeCurrentMonth === true &&
    isBeforeCurrentMonth;
  const filledCount = selectedDays.filter((day) =>
    dayIsFullyExplained(
      day,
      needsLateReason,
      scheduledEndTime(day.date, day.isHalfDay),
    ),
  ).length;
  const allSelected =
    selectableDays.length > 0 &&
    selectableDays.every((day) => day.selected);
  const someSelected =
    selectableDays.some((day) => day.selected) && !allSelected;
  const anySelected = selectedCount > 0;
  const periodLabel =
    month != null && year != null ? `${monthName(month)} ${year}` : '-';
  const pendingRequestNumbers = useMemo(() => {
    return [
      ...new Set(
        dayEntries
          .map((day) => day.submittedLog?.requestNumber)
          .filter((value): value is string => Boolean(value)),
      ),
    ];
  }, [dayEntries]);

  const pendingApprovalMeta = useMemo(() => {
    const withMeta = dayEntries.find(
      (day) =>
        day.submittedLog?.approvalRequestId ||
        day.submittedLog?.pendingApproverName,
    )?.submittedLog;
    return withMeta ?? null;
  }, [dayEntries]);

  const bulkAvailableReasonTypes = useMemo(
    () => getValidBulkReasons(selectedDays),
    [selectedDays],
  );

  const bulkAvailableForgotDirections = useMemo(
    () => getValidBulkForgotDirections(selectedDays),
    [selectedDays],
  );

  const canApplyBulk = useMemo((): boolean => {
    if (!bulkSelection.reasonType || selectedCount === 0) {
      return false;
    }
    if (needsLateReason && bulkLateReason.trim().length < 3) {
      return false;
    }
    const issues = validateFieldMovementValues(bulkSelection, bulkValues, {
      requireDate: false,
    });
    return issues.length === 0;
  }, [
    bulkSelection,
    bulkValues,
    selectedCount,
    needsLateReason,
    bulkLateReason,
  ]);

  const bulkApplyBlockedHint = useMemo((): string | null => {
    if (!bulkSelection.reasonType || selectedCount === 0 || canApplyBulk) {
      return null;
    }
    if (needsLateReason && bulkLateReason.trim().length < 3) {
      return 'Enter a late entry reason (at least 3 characters) to enable Apply.';
    }
    const issues = validateFieldMovementValues(bulkSelection, bulkValues, {
      requireDate: false,
    });
    return issues[0]?.message ?? 'Complete the required fields to enable Apply.';
  }, [
    bulkSelection,
    bulkValues,
    selectedCount,
    canApplyBulk,
    needsLateReason,
    bulkLateReason,
  ]);

  const bulkStorageEntryCount = useMemo(() => {
    if (!bulkSelection.reasonType) {
      return 0;
    }
    const perDay = countStorageEntries(bulkSelection);
    const applicable = selectedDays.filter((day) =>
      canApplySelectionToDay(day, bulkSelection),
    ).length;
    return perDay * applicable;
  }, [bulkSelection, selectedDays]);

  function clearBulkFields(): void {
    setBulkSelection({ reasonType: null, forgotDirection: null });
    setBulkValues(emptyFieldValues());
    setBulkLateReason('');
  }

  const draftExplanationDays = useMemo(
    () => dayEntries.filter(dayHasDraftExplanation),
    [dayEntries],
  );

  const canProceedToStep3 =
    (draftLogId !== null && draftExplanationDays.length > 0) ||
    (selectedCount > 0 &&
      dayEntries.every(
        (day) =>
          !day.selected ||
          dayIsFullyExplained(
            day,
            needsLateReason,
            scheduledEndTime(day.date, day.isHalfDay),
          ),
      ));

  const unfilledSelectedCount = dayEntries.filter(
    (day) =>
      day.selected &&
      !dayIsFullyExplained(
        day,
        needsLateReason,
        scheduledEndTime(day.date, day.isHalfDay),
      ),
  ).length;

  const totalStorageEntries = useMemo(() => {
    const source =
      draftExplanationDays.length > 0 ? draftExplanationDays : selectedDays;
    return source.reduce(
      (sum, day) => sum + storageEntryCountForDay(day),
      0,
    );
  }, [draftExplanationDays, selectedDays]);

  const reviewSourceDays = useMemo(() => {
    if (draftExplanationDays.length > 0) {
      return draftExplanationDays;
    }
    return selectedDays.filter((day) => day.reasonType);
  }, [draftExplanationDays, selectedDays]);

  const reviewGroups = useMemo(() => {
    return groupBy(reviewSourceDays, (day) =>
      `${day.reasonType}||${day.forgotDirection ?? ''}||${day.location.trim()}`,
    );
  }, [reviewSourceDays]);

  useEffect(() => {
    if (dayEntries.length === 0) {
      setExpandedDays(new Set());
      return;
    }
    const needsAttention = new Set(
      dayEntries
        .map((day, index) => ({ day, index }))
        .filter(({ day }) => dayNeedsAttention(day))
        .map(({ index }) => index),
    );
    setExpandedDays(needsAttention);
  }, [dayEntries.length, fetchState]);

  function updateDay(id: string, patch: Partial<DayEntry>): void {
    setDayEntries((prev) =>
      prev.map((day) => (day.id === id ? { ...day, ...patch } : day)),
    );
  }

  function applyDayFields(
    id: string,
    selection: FieldMovementSelection,
    values: FieldMovementFieldValues,
  ): void {
    updateDay(id, {
      reasonType: selection.reasonType,
      forgotDirection: selection.forgotDirection ?? null,
      location: values.location ?? '',
      timeOut: values.timeOut ?? '',
      returnTime: values.returnTime ?? '',
      clockInTime: values.clockInTime ?? '',
      clockOutTime: values.clockOutTime ?? '',
      reasonNote: values.reasonNote ?? '',
      filledViaBulk: false,
    });
  }

  function clearDayError(id: string, field: keyof DayErrors): void {
    setDayEntries((prev) =>
      prev.map((day) => {
        if (day.id !== id) {
          return day;
        }
        const nextErrors = { ...day.errors };
        delete nextErrors[field];
        return { ...day, errors: nextErrors };
      }),
    );
  }

  function handleSelectAll(checked: boolean): void {
    setDayEntries((prev) =>
      prev.map((day) =>
        day.alreadySubmitted
          ? day
          : { ...day, selected: checked, errors: {} },
      ),
    );
  }

  function handleApplyBulk(): void {
    if (!bulkSelection.reasonType || !canApplyBulk) {
      return;
    }

    const skipped: string[] = [];
    let applied = 0;
    const lateReason = needsLateReason ? bulkLateReason.trim() : '';

    setDayEntries((prev) =>
      prev.map((day) => {
        if (!day.selected || day.alreadySubmitted) {
          return day;
        }
        if (!canApplySelectionToDay(day, bulkSelection)) {
          skipped.push(formatLongDate(day.date));
          return day;
        }
        applied += 1;
        return {
          ...day,
          reasonType: bulkSelection.reasonType,
          forgotDirection: bulkSelection.forgotDirection ?? null,
          location: bulkValues.location ?? '',
          timeOut: bulkValues.timeOut ?? '',
          returnTime: bulkValues.returnTime ?? '',
          clockInTime: bulkValues.clockInTime ?? '',
          clockOutTime: bulkValues.clockOutTime ?? '',
          reasonNote: bulkValues.reasonNote ?? '',
          lateReason: needsLateReason ? lateReason : day.lateReason,
          filledViaBulk: true,
          errors: {},
        };
      }),
    );

    setExpandedDays((prev) => {
      const next = new Set(prev);
      dayEntries.forEach((day, index) => {
        if (
          day.selected &&
          !day.alreadySubmitted &&
          canApplySelectionToDay(day, bulkSelection)
        ) {
          next.delete(index);
        }
      });
      return next;
    });

    if (skipped.length > 0) {
      setBulkApplySkipped(skipped);
    }
    clearBulkFields();
    if (applied > 0) {
      messageApi.success(`Applied to ${applied} day(s).`);
    }
    if (skipped.length > 0) {
      messageApi.info(
        t(`${fmPrefix}.skippedExisting`, { count: skipped.length }),
      );
    }
  }

  function toggleDayExpanded(index: number): void {
    setExpandedDays((prev) => {
      const next = new Set(prev);
      if (next.has(index)) {
        next.delete(index);
      } else {
        next.add(index);
      }
      return next;
    });
  }

  async function handleCheckFlaggedDays(): Promise<void> {
    setStepOneError(null);
    setFetchError(null);
    if (month == null || year == null) {
      setStepOneError('Select a valid month and year.');
      setFetchState('idle');
      return;
    }
    if (onBehalf && !targetEmployeeId) {
      setStepOneError('Choose the employee first.');
      setFetchState('idle');
      return;
    }
    setFetchState('loading');
    clearBulkFields();
    try {
      let flags: FlaggedDaysResponse;
      let hasMonthRecord: boolean;
      if (onBehalf && targetEmployeeId) {
        const result = await getEmployeeFlaggedDays(targetEmployeeId, month, year);
        flags = result;
        hasMonthRecord = result.hasRecord;
      } else {
        const [own, yearAttendance] = await Promise.all([
          getMyFlaggedDays(month, year),
          getMyAttendance(year),
        ]);
        flags = own;
        hasMonthRecord = yearAttendance.records.some(
          (record) => record.month === month && record.year === year,
        );
      }
      if (!hasMonthRecord) {
        setDayEntries([]);
        persistLogLateReason('');
        setFetchState('not-approved');
        return;
      }
      if (flags.flaggedDays.length === 0) {
        setDayEntries([]);
        persistLogLateReason('');
        setFetchState('no-data');
        return;
      }
      const apiLate =
        flags.draftLateReason?.trim() ||
        flags.flaggedDays.find((day) => day.lateReason?.trim())?.lateReason?.trim() ||
        '';
      const preservedLate = apiLate || logLateReasonRef.current;
      if (preservedLate) {
        persistLogLateReason(preservedLate);
      }
      const entries = flags.flaggedDays.map((day) => {
        const isDraftRow =
          day.explanationStatus === 'DRAFT' ||
          (day.draftEntries != null && day.draftEntries.length > 0);
        return toDayEntry(
          preservedLate && isDraftRow && !day.lateReason?.trim()
            ? { ...day, lateReason: preservedLate }
            : day,
        );
      });
      const monthDraftLogId =
        flags.draftLogId ??
        flags.flaggedDays.find((day) => day.draftLogId)?.draftLogId ??
        null;
      setDraftLogId(monthDraftLogId);
      setStepOneError(null);
      setDayEntries(entries);
      const pendingCount = entries.filter((day) => !day.alreadySubmitted).length;
      setFetchState(pendingCount === 0 ? 'all-explained' : 'has-flags');
    } catch (error) {
      setFetchError(
        error instanceof ApiRequestError
          ? error.message
          : 'Failed to load flagged days.',
      );
      setFetchState('error');
    }
  }

  function validateStep1(): boolean {
    if (onBehalf && !targetEmployeeId) {
      setStepOneError('Choose the employee first.');
      return false;
    }
    if (
      month == null ||
      year == null ||
      month < 1 ||
      month > 12 ||
      year < 2020 ||
      year > new Date().getFullYear()
    ) {
      setStepOneError('Select a valid month and year.');
      return false;
    }
    if (fetchState === 'idle' || fetchState === 'loading') {
      setStepOneError('Check for flagged days before continuing.');
      return false;
    }
    if (fetchState === 'all-explained') {
      setStepOneError(
        orphanDraftIds.length > 0
          ? 'These days are locked by an unsubmitted draft. Cancel the draft below to explain them again.'
          : 'These days already have a pending or approved explanation. Open Approvals → My Requests to track it.',
      );
      return false;
    }
    if (fetchState !== 'has-flags' || selectableDays.length === 0) {
      setStepOneError('No flagged days available to explain for this period.');
      return false;
    }
    setStepOneError(null);
    return true;
  }

  function validateStep2(): boolean {
    if (selectableDays.length === 0) {
      messageApi.warning(
        'All flagged days for this month are already explained. Check Approvals → My Requests.',
      );
      return false;
    }
    const draftDays = dayEntries.filter(dayHasDraftExplanation);
    if (draftLogId && draftDays.length > 0) {
      return true;
    }
    if (selectedDays.length === 0) {
      messageApi.warning('Select at least one day to explain.');
      return false;
    }
    let valid = true;
    const needsExpand = new Set<number>();
    setDayEntries((prev) =>
      prev.map((day, index) => {
        if (!day.selected) {
          return { ...day, errors: {} };
        }
        const errors = validationErrorsForDay(day, {
          requireLateReason: needsLateReason,
          scheduledEndBefore: scheduledEndTime(day.date, day.isHalfDay),
        });
        if (Object.keys(errors).length > 0) {
          valid = false;
          needsExpand.add(index);
        }
        return { ...day, errors };
      }),
    );
    if (!valid) {
      setExpandedDays((prev) => {
        const next = new Set(prev);
        needsExpand.forEach((index) => next.add(index));
        return next;
      });
      messageApi.warning(
        `${unfilledSelectedCount || 'Some'} selected day(s) still need a reason. Use bulk actions to fill them quickly.`,
      );
    }
    return valid;
  }

  function buildDto(): CreateFieldMovementLogDto {
    const entries: CreateFieldMovementEntryDto[] = [];
    for (const day of selectedDays) {
      const payloads = toStorageEntries(daySelection(day), dayFieldValues(day));
      for (const payload of payloads) {
        entries.push({
          dailyLogId: day.id,
          reason: payload.reason,
          destination: payload.destination,
          departureTime: payload.departureTime,
          returnTime: payload.returnTime,
          notes: payload.notes,
        });
      }
    }
    const combinedLate = needsLateReason
      ? combineLateReasons(selectedDays) ||
        logLateReasonRef.current ||
        undefined
      : undefined;
    return {
      notes: overallNotes.trim() || undefined,
      lateReason: combinedLate,
      entries,
      ...(onBehalf && targetEmployeeId
        ? { onBehalfOfEmployeeId: targetEmployeeId, autoApproveTier: false }
        : {}),
    };
  }

  async function handleSubmit(): Promise<void> {
    if (!validateStep2()) {
      return;
    }
    const draftDays = dayEntries.filter(dayHasDraftExplanation);
    if (draftLogId && draftDays.length > 0) {
      setSubmitting(true);
      try {
        await submitMutation.mutateAsync({
          id: draftLogId,
          lateReason: needsLateReason
            ? combineLateReasons(draftDays) ||
              logLateReasonRef.current ||
              undefined
            : undefined,
        });
        messageApi.success('Field movement log submitted.');
        router.push('/approvals?tab=my-requests');
      } catch (error) {
        notifyApiError(error, 'Failed to submit field movement log', messageApi);
      } finally {
        setSubmitting(false);
      }
      return;
    }
    if (
      needsLateReason &&
      selectedDays.some((day) => day.lateReason.trim().length < 3)
    ) {
      messageApi.warning(
        'Late entry reason is required on each selected day when entering dates before the current month.',
      );
      return;
    }
    setSubmitting(true);
    let createdId: string | null = null;
    try {
      const created = await createMutation.mutateAsync(buildDto());
      createdId = created.id;
      await submitMutation.mutateAsync({
        id: created.id,
        lateReason: needsLateReason
          ? combineLateReasons(selectedDays)
          : undefined,
      });
      messageApi.success('Field movement log submitted.');
      router.push('/approvals?tab=my-requests');
    } catch (error) {
      if (createdId) {
        try {
          await cancelMutation.mutateAsync(createdId);
        } catch {
          // Keep original submit error; draft may still need manual cancel.
        }
      }
      notifyApiError(error, 'Failed to submit field movement log', messageApi);
    } finally {
      setSubmitting(false);
    }
  }

  async function handleCancelOrphanDrafts(): Promise<void> {
    if (orphanDraftIds.length === 0) {
      return;
    }
    try {
      for (const id of orphanDraftIds) {
        await cancelMutation.mutateAsync(id);
      }
      messageApi.success(
        orphanDraftIds.length === 1
          ? 'Draft cancelled. You can explain those days again.'
          : 'Drafts cancelled. You can explain those days again.',
      );
      await handleCheckFlaggedDays();
    } catch (error) {
      notifyApiError(error, 'Failed to cancel draft', messageApi);
    }
  }

  function resetToStep1(): void {
    setMonth(null);
    setYear(null);
    setFetchState('idle');
    setFetchError(null);
    setDayEntries([]);
    setDraftLogId(null);
    persistLogLateReason('');
    setOverallNotes('');
    setStepOneError(null);
    clearBulkFields();
    setExpandedDays(new Set());
  }

  const pageClassName =
    'fm-page erp-pro-list-page erp-users-page erp-employee-form-page erp-leave-form-page';

  const allFilled = selectedCount > 0 && filledCount === selectedCount;
  const progressPercent =
    selectedCount > 0 ? Math.round((filledCount / selectedCount) * 100) : 0;
  const flagCounts = selectableDays.reduce<Partial<Record<AttendanceDayFlag, number>>>(
    (counts, day) => ({ ...counts, [day.flag]: (counts[day.flag] ?? 0) + 1 }),
    {},
  );

  const orphanDraftActions =
    orphanDraftIds.length > 0 ? (
      <Button
        type="primary"
        danger
        loading={cancelMutation.isPending}
        onClick={() => {
          void handleCancelOrphanDrafts();
        }}
      >
        Cancel draft & unlock days
      </Button>
    ) : null;

  const steps = [
    {
      title: 'Choose month',
      validate: () => validateStep1(),
      content: (
        <section className="fm-card" aria-labelledby="fm-period-title">
          <div className="fm-card__header">
            <span className="fm-card__icon" aria-hidden>
              <CalendarSearch size={20} />
            </span>
            <div>
              <h2 id="fm-period-title" className="fm-card__title">
                {onBehalf
                  ? 'Which employee and month do you want to explain?'
                  : 'Which month do you want to explain?'}
              </h2>
              <p className="fm-card__subtitle">
                {onBehalf
                  ? 'Entering a paper form for someone else. We will find the days where their attendance was flagged; past months are fine.'
                  : 'We will find the days where your attendance was flagged, such as a missing clock-in or an early departure.'}
              </p>
            </div>
          </div>
          <div className="fm-card__body">
            {onBehalf ? (
              <div className="mb-4">
                <Field id="fm-employee" label="Employee" required>
                  {(a11y) => (
                    <Select
                      {...a11y}
                      size="large"
                      showSearch
                      allowClear
                      className="w-full"
                      placeholder="Search by name or employee ID"
                      loading={eligibleQuery.isLoading}
                      value={targetEmployeeId}
                      optionFilterProp="label"
                      options={(eligibleQuery.data ?? []).map((employee) => ({
                        value: employee.id,
                        // Full name incl. middle name, then the employee ID.
                        label: formatOnBehalfEmployeeName(employee),
                      }))}
                      onChange={(value: string | undefined) => {
                        setTargetEmployeeId(value);
                        setFetchState('idle');
                        setDayEntries([]);
                        setDraftLogId(null);
                        persistLogLateReason('');
                        setStepOneError(null);
                      }}
                    />
                  )}
                </Field>
              </div>
            ) : null}
            <div className="fm-grid-2">
              <Field id="fm-month" label="Month" required>
                {(a11y) => (
                  <Select
                    {...a11y}
                    size="large"
                    allowClear
                    placeholder="Select month"
                    value={month ?? undefined}
                    options={MONTH_OPTIONS}
                    onChange={(value: number | null) => {
                      setMonth(value ?? null);
                      setFetchState('idle');
                      setDayEntries([]);
                      setDraftLogId(null);
                      persistLogLateReason('');
                      setStepOneError(null);
                    }}
                  />
                )}
              </Field>
              <Field id="fm-year" label="Year" required>
                {(a11y) => (
                  <InputNumber
                    {...a11y}
                    size="large"
                    style={{ width: '100%' }}
                    value={year ?? undefined}
                    min={2020}
                    max={new Date().getFullYear()}
                    placeholder="Select year"
                    onChange={(value) => {
                      setYear(value == null ? null : value);
                      setFetchState('idle');
                      setDayEntries([]);
                      setDraftLogId(null);
                      persistLogLateReason('');
                      setStepOneError(null);
                    }}
                  />
                )}
              </Field>
            </div>
            <div className="mt-4">
              <Button
                type="primary"
                size="large"
                icon={<Search size={16} aria-hidden />}
                loading={fetchState === 'loading'}
                onClick={() => void handleCheckFlaggedDays()}
              >
                Check for flagged days
              </Button>
            </div>

            {stepOneError || fetchError ? (
              <p className="fm-inline-error" role="alert">
                <CircleAlert size={16} aria-hidden />
                {stepOneError ?? fetchError}
              </p>
            ) : null}

            <div aria-live="polite" className="mt-4 empty:mt-0">
              {fetchState === 'loading' ? (
                <p className="fm-sr-only">Checking {periodLabel}…</p>
              ) : null}
              {fetchState === 'not-approved' ? (
                <Notice
                  tone="warning"
                  title={`Attendance for ${periodLabel} has not been processed yet.`}
                >
                  Please wait for HR to upload and approve the attendance before
                  submitting.
                </Notice>
              ) : null}
              {fetchState === 'no-data' ? (
                <Notice
                  tone="success"
                  title={`No flagged days found for ${periodLabel}.`}
                >
                  Your attendance is complete. No explanation is needed.
                </Notice>
              ) : null}
              {fetchState === 'has-flags' ? (
                <Notice
                  tone="warning"
                  title={
                    onBehalf && targetName
                      ? `${targetName} has ${plural(selectableDays.length, 'day')} to explain for ${periodLabel}.`
                      : `You have ${plural(selectableDays.length, 'day')} to explain for ${periodLabel}.`
                  }
                >
                  <div className="fm-badge-row mt-2">
                    {(Object.keys(flagCounts) as AttendanceDayFlag[]).map(
                      (flag) => (
                        <span
                          key={flag}
                          className={`fm-badge fm-badge--${FLAG_TONES[flag]}`}
                        >
                          {FLAG_LABELS[flag]}: {flagCounts[flag]}
                        </span>
                      ),
                    )}
                  </div>
                  {dayEntries.length > selectableDays.length ? (
                    <p className="mt-2">
                      {plural(dayEntries.length - selectableDays.length, 'day')}{' '}
                      already {dayEntries.length - selectableDays.length === 1 ? 'has' : 'have'}{' '}
                      a pending explanation and{' '}
                      {dayEntries.length - selectableDays.length === 1 ? 'is' : 'are'}{' '}
                      locked.
                    </p>
                  ) : null}
                  <p className="mt-2">Select Next to explain them.</p>
                </Notice>
              ) : null}
              {fetchState === 'all-explained' ? (
                <Notice
                  tone="info"
                  title={
                    orphanDraftIds.length > 0
                      ? `An unsubmitted draft is locking ${periodLabel}`
                      : `All flagged days for ${periodLabel} already have an explanation in progress.`
                  }
                  actions={
                    <>
                      {orphanDraftActions}
                      {pendingApprovalMeta?.approvalRequestId ? (
                        <Button
                          type="primary"
                          onClick={() =>
                            router.push(
                              `/approvals/${pendingApprovalMeta.approvalRequestId}`,
                            )
                          }
                        >
                          Open request
                        </Button>
                      ) : null}
                      {orphanDraftIds.length === 0 ? (
                        <Button
                          onClick={() => router.push('/approvals?tab=my-requests')}
                        >
                          View in My Requests
                        </Button>
                      ) : null}
                    </>
                  }
                >
                  {orphanDraftIds.length > 0 ? (
                    <>
                      {pendingRequestNumbers.join(', ') || 'A draft'} was
                      created but never sent for approval, so it will not appear
                      under Approvals. Cancel the draft to unlock these days and
                      submit again.
                    </>
                  ) : (
                    <>
                      {pendingRequestNumbers.join(', ') || 'Your request'} is
                      awaiting approval
                      {pendingApprovalMeta?.pendingApproverName
                        ? ` from ${pendingApprovalMeta.pendingApproverName}`
                        : ''}
                      {pendingApprovalMeta?.pendingTierLabel
                        ? ` (${pendingApprovalMeta.pendingTierLabel})`
                        : ''}
                      . You cannot select these days again until that request is
                      rejected or cancelled.
                    </>
                  )}
                </Notice>
              ) : null}
            </div>
          </div>
        </section>
      ),
    },
    {
      title: 'Explain days',
      validate: () => validateStep2(),
      content: (
        <div className="fm-stack">
          {selectableDays.length === 0 ? (
            <Notice
              tone="info"
              title={`Nothing left to explain for ${periodLabel}.`}
              actions={
                orphanDraftActions ?? (
                  <Button
                    type="primary"
                    onClick={() => router.push('/approvals?tab=my-requests')}
                  >
                    View in My Requests
                  </Button>
                )
              }
            >
              {orphanDraftIds.length > 0
                ? `Every flagged day is locked by an unsubmitted draft (${pendingRequestNumbers.join(', ')}). Cancel it to unlock and submit again. Drafts do not appear in Approvals.`
                : `Every flagged day is already covered by a pending request${
                    pendingRequestNumbers.length > 0
                      ? ` (${pendingRequestNumbers.join(', ')})`
                      : ''
                  }. Track it under Approvals → My Requests.`}
            </Notice>
          ) : null}

          <DayCoverageNotice
            employeeId={effectiveEmployeeId}
            from={selectedCoverageSpan?.from ?? null}
            to={selectedCoverageSpan?.to ?? null}
            focus="FIELD_MOVEMENT"
          />

          {dayEntries.length > 0 ? (
            <ExplainDaysPanel
              dayEntries={dayEntries}
              setDayEntries={setDayEntries}
              month={month!}
              year={year!}
              periodLabel={periodLabel}
              needsLateReason={needsLateReason}
              draftLogId={draftLogId}
              onDraftLogIdChange={setDraftLogId}
              onLateReasonSaved={persistLogLateReason}
              onReload={handleCheckFlaggedDays}
              onBehalf={onBehalf}
              onBehalfOfEmployeeId={targetEmployeeId}
              overallNotes={overallNotes}
            />
          ) : null}

          {!canProceedToStep3 &&
          selectedCount > 0 &&
          dayEntries.filter(dayHasDraftExplanation).length === 0 ? (
            <Notice
              tone="warning"
              title={`${plural(unfilledSelectedCount, 'selected day')} still ${unfilledSelectedCount === 1 ? 'needs' : 'need'} details.`}
            >
              Save draft explanations in the table above, or use Next when at
              least one day is in draft.
            </Notice>
          ) : null}
        </div>
      ),
    },
    {
      title: 'Review & submit',
      content: (
        <section className="fm-card" aria-labelledby="fm-review-title">
          <div className="fm-card__header">
            <span className="fm-card__icon" aria-hidden>
              <ClipboardCheck size={20} />
            </span>
            <div>
              <h2 id="fm-review-title" className="fm-card__title">
                Review your explanation
              </h2>
              <p className="fm-card__subtitle">
                Check the details below, then select Submit for Approval.
              </p>
            </div>
          </div>
          <div className="fm-card__body">
            <dl className="fm-summary-stats">
              <div className="fm-stat">
                <dt>Period</dt>
                <dd>{periodLabel}</dd>
              </div>
              <div className="fm-stat">
                <dt>Days included</dt>
                <dd>{reviewSourceDays.length}</dd>
              </div>
              <div className="fm-stat">
                <dt>Entries to create</dt>
                <dd>
                  {t(`${fmPrefix}.entriesWillBeCreated`, {
                    count: totalStorageEntries,
                  })}
                </dd>
              </div>
            </dl>

            <h3 className="fm-field__label mb-2">Your explanations</h3>
            <ul className="fm-review-list">
              {Object.entries(reviewGroups).map(([key, days]) => {
                const [reasonKey, forgotDir, location] = key.split('||');
                const reasonType = reasonKey as FieldMovementReasonType;
                const Icon =
                  reasonType === 'FORGOT'
                    ? REASON_ICONS.FORGOT_CLOCK_IN
                    : reasonType === 'FIELD_VISIT'
                      ? REASON_ICONS.FIELD_VISIT
                      : REASON_ICONS.EARLY_LEAVE;
                const titleParts = [reasonTypeLabels[reasonType]];
                if (reasonType === 'FORGOT' && forgotDir) {
                  titleParts.push(forgotDirectionLabels[forgotDir as keyof typeof forgotDirectionLabels]);
                }
                if (location) {
                  titleParts.push(location);
                }
                return (
                  <li key={key} className="fm-review-item">
                    <span className="fm-card__icon" aria-hidden>
                      <Icon size={18} />
                    </span>
                    <div className="fm-review-item__body">
                      <p className="fm-review-item__title">
                        {titleParts.join(' - ')}
                      </p>
                      <p className="fm-review-item__dates">
                        {formatDateList(days.map((day) => day.date))}
                      </p>
                    </div>
                    <span className="fm-badge fm-badge--neutral">
                      {plural(days.length, 'day')}
                    </span>
                  </li>
                );
              })}
            </ul>

            {needsLateReason ? (
              <div className="mb-4">
                <h3 className="fm-field__label mb-2">
                  {t('pages.hr.siteAssignments.form.lateReason')}
                </h3>
                <p className="fm-review-item__dates m-0 whitespace-pre-wrap">
                  {combineLateReasons(reviewSourceDays) ||
                    logLateReason.trim() ||
                    '-'}
                </p>
              </div>
            ) : null}

            <Field
              id="fm-overall-notes"
              label="Anything else your supervisor should know?"
              optional
            >
              {(a11y) => (
                <Input.TextArea
                  {...a11y}
                  rows={3}
                  value={overallNotes}
                  onChange={(event) => setOverallNotes(event.target.value)}
                />
              )}
            </Field>

            <p className="fm-note">
              <Info size={16} aria-hidden className="mt-0.5 shrink-0" />
              After you submit, your supervisor reviews the request. You can
              follow its progress in Approvals → My Requests.
            </p>
          </div>
        </section>
      ),
    },
  ];

  return (
    <div className={pageClassName}>
      {/* Same banner as the other request forms. Cancel lives in the stepper footer. */}
      <HrFormPageShell
        title={t('pages.approvals.categories.FIELD_MOVEMENT_LOG.name')}
        description={t('pages.approvals.categories.FIELD_MOVEMENT_LOG.description')}
        cancelLabel={resolvedCancelLabel}
        cancelHref="/approvals/new"
        backLabel={t('hr.buttons.backToList')}
        onCancel={resolvedCancel}
        showCancelButton={false}
      >
        <div className="erp-stepper-form">
          <StepperForm
            onCancel={resolvedCancel}
            cancelLabel={resolvedCancelLabel}
            contentVariant="sections"
            steps={steps}
            onSubmit={handleSubmit}
            isSubmitting={submitting}
            submitLabel="Submit for Approval"
          />
        </div>
      </HrFormPageShell>
    </div>
  );
}
