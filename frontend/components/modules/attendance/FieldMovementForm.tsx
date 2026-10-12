'use client';

import { useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  Button,
  Checkbox,
  Input,
  InputNumber,
  Select,
  Switch,
  TimePicker,
} from 'antd';
import dayjs, { type Dayjs } from 'dayjs';
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
  FieldMovementReason,
  FlaggedDay,
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
  DateTile,
  FLAG_LABELS,
  FLAG_TONES,
  FlagBadge,
  REASON_ICONS,
  REASON_LABELS,
  formatLongDate,
} from './field-movement-display';

const MONTH_OPTIONS = Array.from({ length: 12 }, (_, i) => ({
  value: i + 1,
  label: new Date(2026, i, 1).toLocaleString('en', { month: 'long' }),
}));

/** UI-only "Both" expands to FORGOT_CLOCK_IN + FORGOT_CLOCK_OUT entries. */
type UiReason = FieldMovementReason | 'FORGOT_BOTH';

type ReasonOption = {
  value: UiReason;
  label: string;
  hint?: string;
};

const REASON_OPTIONS: Record<AttendanceDayFlag, ReasonOption[]> = {
  MISSING_CLOCK_IN: [
    { value: 'FIELD_VISIT', label: 'I was on a field / site visit' },
    { value: 'FORGOT_CLOCK_IN', label: 'I forgot to clock in' },
    { value: 'FORGOT_BOTH', label: 'I forgot both clock-in and clock-out' },
  ],
  MISSING_CLOCK_OUT: [
    { value: 'FIELD_VISIT', label: 'I left for a field / site visit' },
    { value: 'EARLY_LEAVE', label: 'I left early' },
    { value: 'FORGOT_CLOCK_OUT', label: 'I forgot to clock out' },
    { value: 'FORGOT_BOTH', label: 'I forgot both clock-in and clock-out' },
  ],
  EARLY_LEAVE: [
    { value: 'FIELD_VISIT', label: 'I left for a field / site visit' },
    { value: 'EARLY_LEAVE', label: 'I confirm I left early' },
  ],
  NONE: [],
};

const REASON_HINTS: Record<UiReason, string> = {
  FIELD_VISIT: 'You were working away from the office. Tell us where.',
  EARLY_LEAVE: 'You left before your scheduled end time. Tell us when and why.',
  FORGOT_CLOCK_IN: 'You were at work but the clock-in was not recorded.',
  FORGOT_CLOCK_OUT:
    'You were at work but the clock-out was not recorded. Enter the time you left.',
  FORGOT_BOTH:
    'Neither scan was recorded. Enter the time you arrived and the time you left.',
};

const BULK_REASON_CATALOG: ReasonOption[] = [
  {
    value: 'FIELD_VISIT',
    label: 'Field visit',
    hint: 'Works for every type of flagged day.',
  },
  {
    value: 'FORGOT_CLOCK_IN',
    label: 'Forgot to clock in',
    hint: 'Only for days with a missing clock-in.',
  },
  {
    value: 'FORGOT_CLOCK_OUT',
    label: 'Forgot to clock out',
    hint: 'Only for days with a missing clock-out.',
  },
  {
    value: 'FORGOT_BOTH',
    label: 'Forgot both scans',
    hint: 'Only for days with neither a clock-in nor a clock-out.',
  },
  {
    value: 'EARLY_LEAVE',
    label: 'Left early',
    hint: 'Only for early departure or missing clock-out days.',
  },
];

const UI_REASON_LABELS: Record<UiReason, string> = {
  ...REASON_LABELS,
  FORGOT_BOTH: 'Forgot both scans',
};

type FetchState =
  | 'idle'
  | 'loading'
  | 'no-data'
  | 'not-approved'
  | 'has-flags'
  | 'all-explained'
  | 'error';

type DayErrors = Partial<
  Record<
    | 'selectedReason'
    | 'destination'
    | 'departureTime'
    | 'returnTime'
    | 'clockInTime'
    | 'earlyLeaveReason'
    | 'notes',
    string
  >
>;

type DayEntry = {
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
  /** Locked because another request covers the day. */
  coverMessage: string | null;
  /** Neither a clock-in nor a clock-out recorded — only then "forgot both" applies. */
  bothScansMissing: boolean;
  /** Stated clock-in time (forgot both). */
  clockInTime: string;
  selected: boolean;
  selectedReason: UiReason | null;
  destination: string;
  departureTime: string;
  didReturn: boolean;
  returnTime: string;
  notes: string;
  earlyLeaveReason: string;
  errors: DayErrors;
  filledViaBulk: boolean;
};

function monthName(month: number | null): string {
  if (month == null) {
    return '—';
  }
  return MONTH_OPTIONS.find((o) => o.value === month)?.label ?? String(month);
}

function parseTime(value: string | undefined): Dayjs | null {
  if (!value) {
    return null;
  }
  const parsed = dayjs(value, 'HH:mm', true);
  return parsed.isValid() ? parsed : null;
}

function scheduledEndTime(dateStr: string, isHalfDay: boolean): string {
  if (isHalfDay) {
    return '12:30';
  }
  return new Date(dateStr).getDay() === 6 ? '12:30' : '17:30';
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
    clockInTime: '',
    selected: !day.alreadySubmitted,
    selectedReason: null,
    destination: '',
    departureTime: '',
    didReturn: false,
    returnTime: '',
    notes: '',
    earlyLeaveReason: '',
    errors: {},
    filledViaBulk: false,
  };
}

export function getValidBulkReasons(selectedDays: DayEntry[]): UiReason[] {
  const flags = new Set(selectedDays.map((d) => d.flag));
  const reasons: UiReason[] = ['FIELD_VISIT'];

  if (!flags.has('MISSING_CLOCK_OUT') && !flags.has('EARLY_LEAVE')) {
    reasons.push('FORGOT_CLOCK_IN');
  }
  if (!flags.has('MISSING_CLOCK_IN') && !flags.has('EARLY_LEAVE')) {
    reasons.push('FORGOT_CLOCK_OUT');
  }
  if (
    !flags.has('EARLY_LEAVE') &&
    selectedDays.some((day) => day.bothScansMissing)
  ) {
    reasons.push('FORGOT_BOTH');
  }
  if (!flags.has('MISSING_CLOCK_IN')) {
    reasons.push('EARLY_LEAVE');
  }
  return reasons;
}

function dayIsFullyExplained(day: DayEntry): boolean {
  if (!day.selected || !day.selectedReason) {
    return false;
  }
  if (day.selectedReason === 'FIELD_VISIT') {
    return (
      day.destination.trim().length >= 3 &&
      Boolean(day.departureTime) &&
      day.notes.trim().length >= 3
    );
  }
  if (day.selectedReason === 'EARLY_LEAVE') {
    return Boolean(day.departureTime) && day.earlyLeaveReason.trim().length > 0;
  }
  if (day.selectedReason === 'FORGOT_BOTH') {
    return (
      Boolean(day.clockInTime) &&
      Boolean(day.departureTime) &&
      day.clockInTime < day.departureTime &&
      day.notes.trim().length >= 3
    );
  }
  if (day.selectedReason === 'FORGOT_CLOCK_OUT') {
    return Boolean(day.departureTime) && day.notes.trim().length >= 3;
  }
  return true;
}

function dayNeedsAttention(day: DayEntry): boolean {
  if (!day.selected || day.alreadySubmitted) {
    return false;
  }
  return !dayIsFullyExplained(day);
}

function blockingLogLabel(log: NonNullable<DayEntry['submittedLog']>): string {
  if (log.status === 'DRAFT') {
    return `${log.requestNumber} — unsubmitted draft (not in Approvals yet)`;
  }
  if (log.pendingApproverName) {
    return `${log.requestNumber} — waiting on ${log.pendingApproverName}`;
  }
  return `${log.requestNumber} — ${log.status}`;
}

function plural(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? '' : 's'}`;
}

function daySummary(day: DayEntry): string {
  if (!day.selectedReason) {
    return '';
  }
  const parts = [UI_REASON_LABELS[day.selectedReason]];
  if (day.destination) {
    parts.push(day.destination);
  }
  if (day.selectedReason === 'FORGOT_BOTH' && day.clockInTime) {
    parts.push(`in ${day.clockInTime}`);
  }
  if (day.departureTime) {
    parts.push(`left ${day.departureTime}`);
  }
  if (day.didReturn && day.returnTime) {
    parts.push(`back ${day.returnTime}`);
  }
  if (day.earlyLeaveReason) {
    parts.push(day.earlyLeaveReason);
  }
  return parts.join(' · ');
}

type DayState = 'locked' | 'excluded' | 'error' | 'ready' | 'pending';

function dayState(day: DayEntry): DayState {
  if (day.alreadySubmitted) {
    return 'locked';
  }
  if (!day.selected) {
    return 'excluded';
  }
  if (Object.keys(day.errors).length > 0) {
    return 'error';
  }
  return dayIsFullyExplained(day) ? 'ready' : 'pending';
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
  hint,
  error,
  children,
}: {
  id: string;
  label: string;
  optional?: boolean;
  required?: boolean;
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
        {optional ? <span className="fm-field__optional">(optional)</span> : null}
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

/**
 * Reason picker as a group of native radio cards (label + icon + hint).
 */
function ReasonChoices({
  name,
  legend,
  options,
  value,
  error,
  onChange,
}: {
  name: string;
  legend: string;
  options: ReasonOption[];
  value: UiReason | null;
  error?: string;
  onChange: (value: UiReason) => void;
}): React.ReactNode {
  const errorId = error ? `${name}-error` : undefined;
  return (
    <fieldset
      className={`fm-choices${error ? ' fm-choices--error' : ''}`}
      aria-describedby={errorId}
    >
      <legend className="fm-choices__legend">{legend}</legend>
      <div className="fm-choices__list">
        {options.map((option) => {
          const Icon =
            option.value === 'FORGOT_BOTH'
              ? REASON_ICONS.FORGOT_CLOCK_IN
              : REASON_ICONS[option.value];
          return (
            <label key={option.value} className="fm-choice">
              <input
                type="radio"
                className="fm-choice__input"
                name={name}
                value={option.value}
                checked={value === option.value}
                onChange={() => onChange(option.value)}
              />
              <Icon size={18} className="fm-choice__icon" aria-hidden />
              <span className="fm-choice__text">
                <span className="fm-choice__label">{option.label}</span>
                <span className="fm-choice__hint">
                  {option.hint ?? REASON_HINTS[option.value]}
                </span>
              </span>
            </label>
          );
        })}
      </div>
      {error ? (
        <p id={errorId} className="fm-field__error">
          <CircleAlert size={14} aria-hidden />
          {error}
        </p>
      ) : null}
    </fieldset>
  );
}

function DayStatusBadge({ day }: { day: DayEntry }): React.ReactNode {
  const state = dayState(day);
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
}: {
  /** "Add on behalf": pick the employee, then explain their flagged days. */
  onBehalf?: boolean;
} = {}): React.ReactNode {
  const router = useRouter();
  const messageApi = useAppMessage();
  const { t } = useEpcTranslation();
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
  const [lateReason, setLateReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submittedLog, setSubmittedLog] = useState<{
    id: string;
    requestNumber: string;
  } | null>(null);
  const [stepOneError, setStepOneError] = useState<string | null>(null);
  const [bulkReason, setBulkReason] = useState<UiReason | null>(null);
  const [bulkDestination, setBulkDestination] = useState('');
  const [bulkDepartureTime, setBulkDepartureTime] = useState('');
  const [bulkDidReturn, setBulkDidReturn] = useState(false);
  const [bulkReturnTime, setBulkReturnTime] = useState('');
  const [bulkClockInTime, setBulkClockInTime] = useState('');
  const [bulkEarlyLeaveReason, setBulkEarlyLeaveReason] = useState('');
  const [bulkNotes, setBulkNotes] = useState('');
  const [expandedDays, setExpandedDays] = useState<Set<number>>(new Set());

  useSetHeaderExtra(null);

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
  const filledCount = selectedDays.filter((day) => dayIsFullyExplained(day))
    .length;
  const now = dayjs();
  const isBeforeCurrentMonth =
    month != null &&
    year != null &&
    (year < now.year() ||
      (year === now.year() && month < now.month() + 1));
  const needsLateReason =
    earliestQuery.data?.requiresLateReasonWhenBeforeCurrentMonth === true &&
    isBeforeCurrentMonth;
  const allSelected =
    selectableDays.length > 0 &&
    selectableDays.every((day) => day.selected);
  const someSelected =
    selectableDays.some((day) => day.selected) && !allSelected;
  const anySelected = selectedCount > 0;
  const periodLabel =
    month != null && year != null ? `${monthName(month)} ${year}` : '—';
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

  const bulkReasonOptions = useMemo(() => {
    const valid = new Set(getValidBulkReasons(selectedDays));
    return BULK_REASON_CATALOG.filter((option) => valid.has(option.value));
  }, [selectedDays]);

  const bulkNotesRequired =
    bulkReason === 'FIELD_VISIT' ||
    bulkReason === 'FORGOT_CLOCK_OUT' ||
    bulkReason === 'FORGOT_BOTH';

  const canApplyBulk = useMemo((): boolean => {
    if (!bulkReason || selectedCount === 0) {
      return false;
    }
    if (bulkReason === 'FIELD_VISIT') {
      if (bulkDestination.trim().length < 3) {
        return false;
      }
      if (!parseTime(bulkDepartureTime)) {
        return false;
      }
      if (bulkNotes.trim().length < 3) {
        return false;
      }
      if (bulkDidReturn && !parseTime(bulkReturnTime)) {
        return false;
      }
      if (
        bulkDidReturn &&
        parseTime(bulkDepartureTime) &&
        parseTime(bulkReturnTime) &&
        !parseTime(bulkReturnTime)!.isAfter(parseTime(bulkDepartureTime)!)
      ) {
        return false;
      }
      return true;
    }
    if (bulkReason === 'EARLY_LEAVE') {
      return (
        Boolean(parseTime(bulkDepartureTime)) &&
        bulkEarlyLeaveReason.trim().length > 0
      );
    }
    if (bulkReason === 'FORGOT_BOTH') {
      return (
        Boolean(parseTime(bulkClockInTime)) &&
        Boolean(parseTime(bulkDepartureTime)) &&
        bulkClockInTime < bulkDepartureTime &&
        bulkNotes.trim().length >= 3
      );
    }
    if (bulkReason === 'FORGOT_CLOCK_OUT') {
      return (
        Boolean(parseTime(bulkDepartureTime)) && bulkNotes.trim().length >= 3
      );
    }
    return true;
  }, [
    bulkReason,
    selectedCount,
    bulkDestination,
    bulkDidReturn,
    bulkReturnTime,
    bulkClockInTime,
    bulkDepartureTime,
    bulkEarlyLeaveReason,
    bulkNotes,
  ]);

  const bulkApplyBlockedHint = useMemo((): string | null => {
    if (!bulkReason || selectedCount === 0 || canApplyBulk) {
      return null;
    }
    if (bulkReason === 'FIELD_VISIT') {
      if (bulkDestination.trim().length < 3) {
        return 'Enter a destination (at least 3 characters) to enable Apply.';
      }
      if (!parseTime(bulkDepartureTime)) {
        return 'Enter a departure time to enable Apply.';
      }
      if (bulkNotes.trim().length < 3) {
        return 'Enter notes (at least 3 characters) to enable Apply.';
      }
      if (bulkDidReturn && !parseTime(bulkReturnTime)) {
        return 'Enter a return time, or turn off “Returned same day”.';
      }
      return 'Return time must be after departure time.';
    }
    if (bulkReason === 'EARLY_LEAVE') {
      if (!parseTime(bulkDepartureTime)) {
        return 'Enter a departure time to enable Apply.';
      }
      return 'Enter why they left early to enable Apply.';
    }
    if (bulkReason === 'FORGOT_BOTH') {
      if (!parseTime(bulkClockInTime) || !parseTime(bulkDepartureTime)) {
        return 'Enter stated clock-in and clock-out times to enable Apply.';
      }
      if (!(bulkClockInTime < bulkDepartureTime)) {
        return 'Clock-in must be before clock-out.';
      }
      return 'Enter notes (at least 3 characters) to enable Apply.';
    }
    if (bulkReason === 'FORGOT_CLOCK_OUT') {
      if (!parseTime(bulkDepartureTime)) {
        return 'Enter a stated clock-out time to enable Apply.';
      }
      return 'Enter notes (at least 3 characters) to enable Apply.';
    }
    return 'Complete the required fields to enable Apply.';
  }, [
    bulkReason,
    selectedCount,
    canApplyBulk,
    bulkDestination,
    bulkDepartureTime,
    bulkNotes,
    bulkDidReturn,
    bulkReturnTime,
    bulkEarlyLeaveReason,
    bulkClockInTime,
  ]);

  function clearBulkFields(): void {
    setBulkReason(null);
    setBulkDestination('');
    setBulkDepartureTime('');
    setBulkDidReturn(false);
    setBulkReturnTime('');
    setBulkClockInTime('');
    setBulkEarlyLeaveReason('');
    setBulkNotes('');
  }

  const canProceedToStep3 =
    selectedCount > 0 &&
    dayEntries.every((day) => {
      if (!day.selected) {
        return true;
      }
      if (!day.selectedReason) {
        return false;
      }
      if (
        day.selectedReason === 'FIELD_VISIT' &&
        day.destination.trim().length < 3
      ) {
        return false;
      }
      if (day.selectedReason === 'EARLY_LEAVE') {
        if (!day.departureTime || !day.earlyLeaveReason.trim()) {
          return false;
        }
      }
      return true;
    });

  const unfilledSelectedCount = dayEntries.filter(
    (day) => day.selected && !dayIsFullyExplained(day),
  ).length;

  const reviewGroups = useMemo(() => {
    return groupBy(
      selectedDays.filter((day) => day.selectedReason),
      (day) => `${day.selectedReason}||${day.destination.trim()}`,
    );
  }, [selectedDays]);

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
    if (!bulkReason || !canApplyBulk) {
      return;
    }

    const reason = bulkReason;
    const destination =
      reason === 'FIELD_VISIT' ? bulkDestination.trim() : '';
    const departureTime =
      reason === 'FIELD_VISIT' ||
      reason === 'EARLY_LEAVE' ||
      reason === 'FORGOT_CLOCK_OUT' ||
      reason === 'FORGOT_BOTH'
        ? bulkDepartureTime
        : '';
    const didReturn = reason === 'FIELD_VISIT' ? bulkDidReturn : false;
    const returnTime =
      reason === 'FIELD_VISIT' && bulkDidReturn ? bulkReturnTime : '';
    const earlyLeaveReason =
      reason === 'EARLY_LEAVE' ? bulkEarlyLeaveReason.trim() : '';
    const notes =
      reason === 'EARLY_LEAVE' ? '' : bulkNotes.trim();

    setDayEntries((prev) =>
      prev.map((day) => {
        if (!day.selected || day.alreadySubmitted) {
          return day;
        }
        const validReasons = REASON_OPTIONS[day.flag].map(
          (option) => option.value,
        );
        if (!validReasons.includes(reason)) {
          return day;
        }
        const apiReasonsOk =
          reason === 'FORGOT_BOTH'
            ? day.bothScansMissing
            : day.availableReasons.includes(reason);
        if (!apiReasonsOk) {
          return day;
        }
        return {
          ...day,
          selectedReason: reason,
          destination: reason === 'FIELD_VISIT' ? destination : '',
          clockInTime: reason === 'FORGOT_BOTH' ? bulkClockInTime : '',
          departureTime,
          didReturn,
          returnTime,
          earlyLeaveReason,
          notes: reason === 'EARLY_LEAVE' ? '' : notes,
          filledViaBulk: true,
          errors: {},
        };
      }),
    );

    setExpandedDays((prev) => {
      const next = new Set(prev);
      dayEntries.forEach((day, index) => {
        if (!day.selected || day.alreadySubmitted) {
          return;
        }
        const validReasons = REASON_OPTIONS[day.flag].map(
          (option) => option.value,
        );
        if (validReasons.includes(reason)) {
          next.delete(index);
        }
      });
      return next;
    });

    clearBulkFields();
    messageApi.success(`Applied to ${selectedCount} day(s).`);
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
      let flags: { flaggedDays: FlaggedDay[] };
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
        setFetchState('not-approved');
        return;
      }
      if (flags.flaggedDays.length === 0) {
        setDayEntries([]);
        setFetchState('no-data');
        return;
      }
      const entries = flags.flaggedDays.map(toDayEntry);
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
    if (selectedDays.length === 0) {
      messageApi.warning('Select at least one day to explain.');
      return false;
    }
    if (needsLateReason && lateReason.trim().length < 3) {
      messageApi.warning(
        'Late entry reason is required when entering dates before the current month.',
      );
      return false;
    }
    let valid = true;
    const needsExpand = new Set<number>();
    setDayEntries((prev) =>
      prev.map((day, index) => {
        if (!day.selected) {
          return { ...day, errors: {} };
        }
        const errors: DayErrors = {};
        if (!day.selectedReason) {
          errors.selectedReason = 'Reason is required';
          valid = false;
          needsExpand.add(index);
        }
        if (day.selectedReason === 'FIELD_VISIT') {
          if (!day.destination.trim()) {
            errors.destination = 'Destination is required';
            valid = false;
            needsExpand.add(index);
          } else if (day.destination.trim().length < 3) {
            errors.destination = 'Destination must be at least 3 characters';
            valid = false;
            needsExpand.add(index);
          }
          if (!day.departureTime || !parseTime(day.departureTime)) {
            errors.departureTime = day.departureTime
              ? 'Use HH:mm format'
              : 'Time out is required';
            valid = false;
            needsExpand.add(index);
          }
          if (day.notes.trim().length < 3) {
            errors.notes = 'A reason / note is required';
            valid = false;
            needsExpand.add(index);
          }
          if (day.didReturn) {
            const dep = parseTime(day.departureTime);
            const ret = parseTime(day.returnTime);
            if (!day.returnTime) {
              errors.returnTime = 'Return time is required';
              valid = false;
              needsExpand.add(index);
            } else if (dep && ret && !ret.isAfter(dep)) {
              errors.returnTime = 'Return time must be after departure time';
              valid = false;
              needsExpand.add(index);
            }
          }
        }
        if (day.selectedReason === 'FORGOT_BOTH') {
          if (!day.clockInTime || !parseTime(day.clockInTime)) {
            errors.clockInTime = day.clockInTime
              ? 'Use HH:mm format'
              : 'Stated clock-in time is required';
            valid = false;
            needsExpand.add(index);
          } else if (day.departureTime && day.clockInTime >= day.departureTime) {
            errors.clockInTime = 'Clock-in must be before clock-out';
            valid = false;
            needsExpand.add(index);
          }
        }
        if (
          day.selectedReason === 'FORGOT_CLOCK_OUT' ||
          day.selectedReason === 'FORGOT_BOTH'
        ) {
          if (!day.departureTime || !parseTime(day.departureTime)) {
            errors.departureTime = day.departureTime
              ? 'Use HH:mm format'
              : 'Stated clock-out time is required';
            valid = false;
            needsExpand.add(index);
          }
          if (day.notes.trim().length < 3) {
            errors.notes = 'A reason / note is required';
            valid = false;
            needsExpand.add(index);
          }
        }
        if (day.selectedReason === 'EARLY_LEAVE') {
          const end = scheduledEndTime(day.date, day.isHalfDay);
          const dep = parseTime(day.departureTime);
          const endTime = parseTime(end);
          if (!day.departureTime || !dep) {
            errors.departureTime = day.departureTime
              ? 'Use HH:mm format'
              : 'Departure time is required';
            valid = false;
            needsExpand.add(index);
          } else if (endTime && !dep.isBefore(endTime)) {
            errors.departureTime = `Departure must be before scheduled end (${end})`;
            valid = false;
            needsExpand.add(index);
          }
          if (!day.earlyLeaveReason.trim()) {
            errors.earlyLeaveReason = 'Reason for early departure is required';
            valid = false;
            needsExpand.add(index);
          }
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
      const reason = day.selectedReason!;
      const notes =
        reason === 'EARLY_LEAVE'
          ? day.earlyLeaveReason.trim() || undefined
          : day.notes.trim() || undefined;
      if (reason === 'FORGOT_BOTH') {
        entries.push({
          dailyLogId: day.id,
          reason: 'FORGOT_CLOCK_IN',
          // Stated clock-in time for a forgot-in entry.
          returnTime: day.clockInTime || undefined,
          notes,
        });
        entries.push({
          dailyLogId: day.id,
          reason: 'FORGOT_CLOCK_OUT',
          departureTime: day.departureTime || undefined,
          notes,
        });
        continue;
      }
      entries.push({
        dailyLogId: day.id,
        reason,
        destination:
          reason === 'FIELD_VISIT' ? day.destination.trim() : undefined,
        departureTime:
          reason === 'FIELD_VISIT' ||
          reason === 'EARLY_LEAVE' ||
          reason === 'FORGOT_CLOCK_OUT'
            ? day.departureTime || undefined
            : undefined,
        returnTime:
          reason === 'FIELD_VISIT' && day.didReturn
            ? day.returnTime
            : undefined,
        notes,
      });
    }
    return {
      notes: overallNotes.trim() || undefined,
      lateReason: needsLateReason ? lateReason.trim() || undefined : undefined,
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
    if (needsLateReason && lateReason.trim().length < 3) {
      messageApi.warning(
        'Late entry reason is required when entering dates before the current month.',
      );
      return;
    }
    setSubmitting(true);
    let createdId: string | null = null;
    try {
      const created = await createMutation.mutateAsync(buildDto());
      createdId = created.id;
      const submitted = await submitMutation.mutateAsync({
        id: created.id,
        lateReason: needsLateReason ? lateReason.trim() : undefined,
      });
      setSubmittedLog({
        id: submitted.id,
        requestNumber: submitted.requestNumber,
      });
      messageApi.success('Field movement log submitted.');
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
    setOverallNotes('');
    setLateReason('');
    setSubmittedLog(null);
    setStepOneError(null);
    clearBulkFields();
    setExpandedDays(new Set());
  }

  const pageClassName =
    'fm-page erp-pro-list-page erp-users-page erp-employee-form-page erp-leave-form-page';

  if (submittedLog) {
    return (
      <div className={pageClassName}>
        <section
          className="fm-card fm-success"
          aria-labelledby="fm-success-title"
          role="status"
        >
          <span className="fm-success__icon" aria-hidden>
            <CircleCheck size={32} />
          </span>
          <h2 id="fm-success-title" className="fm-success__title">
            Explanation sent for approval
          </h2>
          <p className="fm-success__text">
            {onBehalf && targetName ? (
              <>
                <strong>{submittedLog.requestNumber}</strong> has been submitted
                on behalf of <strong>{targetName}</strong>. It goes through their
                normal approval chain; you can track it in Approvals → My
                Requests.
              </>
            ) : (
              <>
                <strong>{submittedLog.requestNumber}</strong> has been submitted.
                Your supervisor will review it, and you can track its status in
                Approvals → My Requests.
              </>
            )}
          </p>
          <div className="fm-success__actions">
            <Button
              type="primary"
              size="large"
              onClick={() => router.push('/approvals?tab=my-requests')}
            >
              View in My Requests
            </Button>
            <Button size="large" onClick={resetToStep1}>
              Explain another month
            </Button>
          </div>
        </section>
      </div>
    );
  }

  const bulkRequiresReturn = bulkReason === 'FIELD_VISIT' && bulkDidReturn;
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

          {selectableDays.length > 0 ? (
            <>
              <section className="fm-card" aria-labelledby="fm-progress-title">
                <div className="fm-progress">
                  <div className="fm-progress__row">
                    <h2 id="fm-progress-title" className="fm-progress__count m-0">
                      {selectedCount > 0
                        ? `${filledCount} of ${plural(selectedCount, 'selected day')} ready`
                        : 'No days selected'}
                    </h2>
                    <span
                      className={`fm-progress__status${allFilled ? ' fm-progress__status--done' : ''}`}
                      aria-live="polite"
                    >
                      {allFilled ? (
                        <>
                          <CircleCheck size={16} aria-hidden />
                          All set. Select Next to review.
                        </>
                      ) : selectedCount > 0 ? (
                        `${plural(selectedCount - filledCount, 'day')} still ${selectedCount - filledCount === 1 ? 'needs' : 'need'} details`
                      ) : (
                        'Tick at least one day to continue'
                      )}
                    </span>
                  </div>
                  <div
                    className="fm-progress__track"
                    role="progressbar"
                    aria-labelledby="fm-progress-title"
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-valuenow={progressPercent}
                  >
                    <div
                      className="fm-progress__fill"
                      style={{ width: `${progressPercent}%` }}
                    />
                  </div>
                  <ol className="fm-steps-hint">
                    <li>Untick any day you do not want to include.</li>
                    <li>
                      If several days have the same reason, fill them at once
                      below. Otherwise open each day and add its details.
                    </li>
                  </ol>
                </div>
              </section>

              <section className="fm-card" aria-labelledby="fm-bulk-title">
                <div className="fm-card__header">
                  <span className="fm-card__icon" aria-hidden>
                    <Layers size={20} />
                  </span>
                  <div>
                    <h2 id="fm-bulk-title" className="fm-card__title">
                      Fill several days at once
                    </h2>
                    <p className="fm-card__subtitle">
                      Choose one reason and apply it to every ticked day. You
                      can still change individual days afterwards.
                    </p>
                  </div>
                </div>
                <div className="fm-card__body">
                  <div className="fm-bulk__toolbar">
                    <Checkbox
                      indeterminate={someSelected}
                      checked={allSelected}
                      onChange={(event) => handleSelectAll(event.target.checked)}
                    >
                      Select all ({plural(selectableDays.length, 'day')})
                    </Checkbox>
                    <span className="fm-bulk__selection">
                      {selectedCount} of {selectableDays.length} selected
                    </span>
                  </div>

                  {anySelected ? (
                    <div className="fm-stack">
                      <ReasonChoices
                        name="fm-bulk-reason"
                        legend={`Reason for the ${plural(selectedCount, 'selected day')}`}
                        options={bulkReasonOptions}
                        value={bulkReason}
                        onChange={(reason) => {
                          setBulkReason(reason);
                          setBulkDestination('');
                          setBulkDepartureTime('');
                          setBulkDidReturn(false);
                          setBulkReturnTime('');
                          setBulkEarlyLeaveReason('');
                          setBulkNotes('');
                        }}
                      />

                      {bulkReason === 'FIELD_VISIT' ? (
                        <>
                          <Field
                            id="fm-bulk-destination"
                            label="Destination"
                            required
                            hint="At least 3 characters. Applies to every selected day."
                          >
                            {(a11y) => (
                              <Input
                                {...a11y}
                                size="large"
                                placeholder='e.g. "Addis Ring Road construction site"'
                                value={bulkDestination}
                                onChange={(event) =>
                                  setBulkDestination(event.target.value)
                                }
                              />
                            )}
                          </Field>
                          <div className="fm-grid-2">
                            <Field
                              id="fm-bulk-departure"
                              label="Departure time"
                              required
                            >
                              {(a11y) => (
                                <TimePicker
                                  {...a11y}
                                  size="large"
                                  format="HH:mm"
                                  needConfirm={false}
                                  className="w-full"
                                  value={parseTime(bulkDepartureTime)}
                                  onChange={(value) =>
                                    setBulkDepartureTime(
                                      value ? value.format('HH:mm') : '',
                                    )
                                  }
                                />
                              )}
                            </Field>
                            {bulkRequiresReturn ? (
                              <Field
                                id="fm-bulk-return"
                                label="Return time"
                                required
                                hint="Must be after the departure time."
                              >
                                {(a11y) => (
                                  <TimePicker
                                    {...a11y}
                                    size="large"
                                    format="HH:mm"
                                    needConfirm={false}
                                    className="w-full"
                                    value={parseTime(bulkReturnTime)}
                                    onChange={(value) =>
                                      setBulkReturnTime(
                                        value ? value.format('HH:mm') : '',
                                      )
                                    }
                                  />
                                )}
                              </Field>
                            ) : null}
                          </div>
                          <div className="fm-switch-row">
                            <Switch
                              id="fm-bulk-returned"
                              checked={bulkDidReturn}
                              onChange={(checked) => {
                                setBulkDidReturn(checked);
                                if (!checked) {
                                  setBulkReturnTime('');
                                }
                              }}
                            />
                            <label htmlFor="fm-bulk-returned" className="fm-field__label">
                              I returned to the office the same day
                            </label>
                          </div>
                        </>
                      ) : null}

                      {bulkReason === 'FORGOT_BOTH' ? (
                        <Field
                          id="fm-bulk-forgot-in"
                          label="Stated clock-in time"
                          required
                          hint="Applies to every selected day with both scans missing."
                        >
                          {(a11y) => (
                            <TimePicker
                              {...a11y}
                              size="large"
                              format="HH:mm"
                              needConfirm={false}
                              className="w-full sm:max-w-xs"
                              value={parseTime(bulkClockInTime)}
                              onChange={(value) =>
                                setBulkClockInTime(
                                  value ? value.format('HH:mm') : '',
                                )
                              }
                            />
                          )}
                        </Field>
                      ) : null}

                      {bulkReason === 'FORGOT_CLOCK_OUT' ||
                      bulkReason === 'FORGOT_BOTH' ? (
                        <Field
                          id="fm-bulk-forgot-out"
                          label="Stated clock-out time"
                          required
                          hint="Applies to every selected day. Early-departure rules use this time."
                        >
                          {(a11y) => (
                            <TimePicker
                              {...a11y}
                              size="large"
                              format="HH:mm"
                              needConfirm={false}
                              className="w-full sm:max-w-xs"
                              value={parseTime(bulkDepartureTime)}
                              onChange={(value) =>
                                setBulkDepartureTime(
                                  value ? value.format('HH:mm') : '',
                                )
                              }
                            />
                          )}
                        </Field>
                      ) : null}

                      {bulkReason === 'EARLY_LEAVE' ? (
                        <>
                          <Field
                            id="fm-bulk-early-departure"
                            label="Departure time"
                            required
                            hint="Must be before your scheduled end time (17:30, or 12:30 on Saturdays and half days)."
                          >
                            {(a11y) => (
                              <TimePicker
                                {...a11y}
                                size="large"
                                format="HH:mm"
                                needConfirm={false}
                                className="w-full sm:max-w-xs"
                                value={parseTime(bulkDepartureTime)}
                                onChange={(value) =>
                                  setBulkDepartureTime(
                                    value ? value.format('HH:mm') : '',
                                  )
                                }
                              />
                            )}
                          </Field>
                          <Field
                            id="fm-bulk-early-reason"
                            label="Why did you leave early?"
                            required
                          >
                            {(a11y) => (
                              <Input.TextArea
                                {...a11y}
                                rows={3}
                                value={bulkEarlyLeaveReason}
                                onChange={(event) =>
                                  setBulkEarlyLeaveReason(event.target.value)
                                }
                              />
                            )}
                          </Field>
                        </>
                      ) : null}

                      {bulkReason && bulkReason !== 'EARLY_LEAVE' ? (
                        <Field
                          id="fm-bulk-notes"
                          label="Notes"
                          required={bulkNotesRequired}
                          optional={!bulkNotesRequired}
                          hint="Applies to every selected day. Late entry reason (below) is separate."
                        >
                          {(a11y) => (
                            <Input.TextArea
                              {...a11y}
                              rows={2}
                              value={bulkNotes}
                              onChange={(event) => setBulkNotes(event.target.value)}
                            />
                          )}
                        </Field>
                      ) : null}

                      {needsLateReason ? (
                        <Field
                          id="fm-bulk-late-reason"
                          label={t('pages.hr.siteAssignments.form.lateReason')}
                          required
                          hint="Required because this log covers dates before the current month."
                        >
                          {(a11y) => (
                            <Input.TextArea
                              {...a11y}
                              rows={3}
                              maxLength={2000}
                              value={lateReason}
                              onChange={(event) =>
                                setLateReason(event.target.value)
                              }
                              placeholder={t(
                                'pages.hr.siteAssignments.form.lateReasonPlaceholder',
                              )}
                            />
                          )}
                        </Field>
                      ) : null}

                      <div className="fm-bulk__actions">
                        <Button
                          type="primary"
                          size="large"
                          disabled={!canApplyBulk}
                          onClick={handleApplyBulk}
                        >
                          Apply to {plural(selectedCount, 'day')}
                        </Button>
                        {bulkReason ? (
                          <Button size="large" onClick={clearBulkFields}>
                            Clear
                          </Button>
                        ) : (
                          <span className="fm-bulk__selection">
                            Choose a reason to continue.
                          </span>
                        )}
                      </div>
                      {bulkApplyBlockedHint ? (
                        <p className="fm-field__hint" role="status">
                          {bulkApplyBlockedHint}
                        </p>
                      ) : null}
                    </div>
                  ) : (
                    <p className="fm-field__hint">
                      Tick one or more days to apply a reason to all of them.
                    </p>
                  )}
                </div>
              </section>
            </>
          ) : null}

          {dayEntries.length > 0 ? (
            <section aria-labelledby="fm-days-title" className="fm-stack">
              <h2 id="fm-days-title" className="fm-card__title m-0">
                Flagged days in {periodLabel}
              </h2>
              <ul className="fm-day-list">
                {dayEntries.map((day, index) => {
                  const reasonOptions = REASON_OPTIONS[day.flag].filter(
                    (option) =>
                      option.value === 'FORGOT_BOTH'
                        ? day.bothScansMissing
                        : day.availableReasons.includes(option.value),
                  );
                  const state = dayState(day);
                  const showBody = expandedDays.has(index) && day.selected;
                  const longDate = formatLongDate(day.date);
                  const summary = daySummary(day);
                  const bodyId = `fm-day-body-${day.id}`;
                  const fieldId = (name: string): string =>
                    `fm-day-${day.id}-${name}`;

                  return (
                    <li key={day.id} className={`fm-day fm-day--${state}`}>
                      <div className="fm-day__header">
                        <Checkbox
                          className="fm-day__check"
                          checked={day.selected}
                          disabled={day.alreadySubmitted}
                          onChange={(event) => {
                            updateDay(day.id, {
                              selected: event.target.checked,
                              errors: {},
                            });
                          }}
                        >
                          <span className="fm-sr-only">Include {longDate}</span>
                        </Checkbox>
                        <DateTile date={day.date} />
                        <div className="fm-day__main">
                          <h3 className="fm-day__title">{longDate}</h3>
                          <div className="fm-badge-row">
                            <FlagBadge flag={day.flag} />
                            <DayStatusBadge day={day} />
                          </div>
                          {summary && !showBody ? (
                            <p className="fm-day__summary">{summary}</p>
                          ) : null}
                        </div>
                        {day.selected ? (
                          <Button
                            className="fm-day__toggle"
                            aria-expanded={showBody}
                            aria-controls={bodyId}
                            onClick={() => toggleDayExpanded(index)}
                          >
                            {showBody
                              ? 'Hide details'
                              : state === 'ready'
                                ? 'Edit details'
                                : 'Add details'}
                            <span className="fm-sr-only"> for {longDate}</span>
                            <ChevronDown
                              size={16}
                              className="fm-day__chevron"
                              aria-hidden
                            />
                          </Button>
                        ) : null}
                      </div>

                      <div id={bodyId} className="fm-day__body" hidden={!showBody}>
                        <ReasonChoices
                          name={fieldId('reason')}
                          legend="What happened on this day?"
                          options={reasonOptions}
                          value={day.selectedReason}
                          error={day.errors.selectedReason}
                          onChange={(value) => {
                            updateDay(day.id, {
                              selectedReason: value,
                              destination: '',
                              departureTime: '',
                              didReturn: false,
                              returnTime: '',
                              earlyLeaveReason: '',
                              filledViaBulk: false,
                              errors: {},
                            });
                          }}
                        />

                        {day.selectedReason === 'FIELD_VISIT' ? (
                          <>
                            <Field
                              id={fieldId('destination')}
                              label="Destination"
                              required
                              error={day.errors.destination}
                            >
                              {(a11y) => (
                                <Input
                                  {...a11y}
                                  size="large"
                                  placeholder='e.g. "Addis Ring Road construction site"'
                                  value={day.destination}
                                  onChange={(event) => {
                                    updateDay(day.id, {
                                      destination: event.target.value,
                                      filledViaBulk: false,
                                    });
                                    clearDayError(day.id, 'destination');
                                  }}
                                />
                              )}
                            </Field>
                            <div className="fm-grid-2">
                              <Field
                                id={fieldId('departure')}
                                label="Time out"
                                required
                                error={day.errors.departureTime}
                              >
                                {(a11y) => (
                                  <TimePicker
                                    {...a11y}
                                    size="large"
                                    format="HH:mm"
                                    needConfirm={false}
                                    className="w-full"
                                    value={parseTime(day.departureTime)}
                                    onChange={(value) => {
                                      updateDay(day.id, {
                                        departureTime: value
                                          ? value.format('HH:mm')
                                          : '',
                                        filledViaBulk: false,
                                      });
                                      clearDayError(day.id, 'departureTime');
                                    }}
                                  />
                                )}
                              </Field>
                              {day.didReturn ? (
                                <Field
                                  id={fieldId('return')}
                                  label="Return time"
                                  required
                                  error={day.errors.returnTime}
                                >
                                  {(a11y) => (
                                    <TimePicker
                                      {...a11y}
                                      size="large"
                                      format="HH:mm"
                                      needConfirm={false}
                                      className="w-full"
                                      value={parseTime(day.returnTime)}
                                      onChange={(value) => {
                                        updateDay(day.id, {
                                          returnTime: value
                                            ? value.format('HH:mm')
                                            : '',
                                          filledViaBulk: false,
                                        });
                                        clearDayError(day.id, 'returnTime');
                                      }}
                                    />
                                  )}
                                </Field>
                              ) : null}
                            </div>
                            <div className="fm-switch-row">
                              <Switch
                                id={fieldId('returned')}
                                checked={day.didReturn}
                                onChange={(checked) =>
                                  updateDay(day.id, {
                                    didReturn: checked,
                                    returnTime: checked ? day.returnTime : '',
                                    filledViaBulk: false,
                                  })
                                }
                              />
                              <label
                                htmlFor={fieldId('returned')}
                                className="fm-field__label"
                              >
                                I returned to the office the same day
                              </label>
                            </div>
                          </>
                        ) : null}

                        {day.selectedReason === 'EARLY_LEAVE' ? (
                          <>
                            <Field
                              id={fieldId('early-departure')}
                              label="Departure time"
                              required
                              hint={`Your scheduled end time was ${scheduledEndTime(day.date, day.isHalfDay)}.`}
                              error={day.errors.departureTime}
                            >
                              {(a11y) => (
                                <TimePicker
                                  {...a11y}
                                  size="large"
                                  format="HH:mm"
                                  needConfirm={false}
                                  className="w-full sm:max-w-xs"
                                  value={parseTime(day.departureTime)}
                                  onChange={(value) => {
                                    updateDay(day.id, {
                                      departureTime: value
                                        ? value.format('HH:mm')
                                        : '',
                                      filledViaBulk: false,
                                    });
                                    clearDayError(day.id, 'departureTime');
                                  }}
                                />
                              )}
                            </Field>
                            <Field
                              id={fieldId('early-reason')}
                              label="Why did you leave early?"
                              required
                              error={day.errors.earlyLeaveReason}
                            >
                              {(a11y) => (
                                <Input.TextArea
                                  {...a11y}
                                  rows={3}
                                  value={day.earlyLeaveReason}
                                  onChange={(event) => {
                                    updateDay(day.id, {
                                      earlyLeaveReason: event.target.value,
                                      filledViaBulk: false,
                                    });
                                    clearDayError(day.id, 'earlyLeaveReason');
                                  }}
                                />
                              )}
                            </Field>
                          </>
                        ) : null}

                        {day.selectedReason === 'FORGOT_BOTH' ? (
                          <Field
                            id={fieldId('forgot-in')}
                            label="Stated clock-in time"
                            required
                            hint="The time you arrived. Late-arrival rules apply to it."
                            error={day.errors.clockInTime}
                          >
                            {(a11y) => (
                              <TimePicker
                                {...a11y}
                                size="large"
                                format="HH:mm"
                                needConfirm={false}
                                className="w-full sm:max-w-xs"
                                value={parseTime(day.clockInTime)}
                                onChange={(value) => {
                                  updateDay(day.id, {
                                    clockInTime: value
                                      ? value.format('HH:mm')
                                      : '',
                                    filledViaBulk: false,
                                  });
                                  clearDayError(day.id, 'clockInTime');
                                }}
                              />
                            )}
                          </Field>
                        ) : null}

                        {day.selectedReason === 'FORGOT_CLOCK_OUT' ||
                        day.selectedReason === 'FORGOT_BOTH' ? (
                          <Field
                            id={fieldId('forgot-out')}
                            label="Stated clock-out time"
                            required
                            hint="Early-departure rules apply to this time unless an approved early leave or field visit also covers the day."
                            error={day.errors.departureTime}
                          >
                            {(a11y) => (
                              <TimePicker
                                {...a11y}
                                size="large"
                                format="HH:mm"
                                needConfirm={false}
                                className="w-full sm:max-w-xs"
                                value={parseTime(day.departureTime)}
                                onChange={(value) => {
                                  updateDay(day.id, {
                                    departureTime: value
                                      ? value.format('HH:mm')
                                      : '',
                                    filledViaBulk: false,
                                  });
                                  clearDayError(day.id, 'departureTime');
                                }}
                              />
                            )}
                          </Field>
                        ) : null}

                        {day.selectedReason === 'FORGOT_CLOCK_IN' ||
                        day.selectedReason === 'FORGOT_CLOCK_OUT' ||
                        day.selectedReason === 'FORGOT_BOTH' ? (
                          <p className="fm-note">
                            <Info size={16} aria-hidden className="mt-0.5 shrink-0" />
                            Forgot-to-clock fills the missing scan once approved.
                            Early departure is only waived by an approved early
                            leave or field visit.
                          </p>
                        ) : null}

                        {day.selectedReason &&
                        day.selectedReason !== 'EARLY_LEAVE' ? (
                          <Field
                            id={fieldId('notes')}
                            label="Reason / note"
                            required={
                              day.selectedReason === 'FIELD_VISIT' ||
                              day.selectedReason === 'FORGOT_CLOCK_OUT' ||
                              day.selectedReason === 'FORGOT_BOTH'
                            }
                            optional={
                              day.selectedReason !== 'FIELD_VISIT' &&
                              day.selectedReason !== 'FORGOT_CLOCK_OUT' &&
                              day.selectedReason !== 'FORGOT_BOTH'
                            }
                            error={day.errors.notes}
                          >
                            {(a11y) => (
                              <Input.TextArea
                                {...a11y}
                                rows={2}
                                value={day.notes}
                                onChange={(event) => {
                                  updateDay(day.id, {
                                    notes: event.target.value,
                                    filledViaBulk: false,
                                  });
                                  clearDayError(day.id, 'notes');
                                }}
                              />
                            )}
                          </Field>
                        ) : null}
                      </div>
                    </li>
                  );
                })}
              </ul>
            </section>
          ) : null}

          {!canProceedToStep3 && selectedCount > 0 ? (
            <Notice
              tone="warning"
              title={`${plural(unfilledSelectedCount, 'selected day')} still ${unfilledSelectedCount === 1 ? 'needs' : 'need'} details.`}
            >
              Open each day marked “Needs details”, or use “Fill several days at
              once” above.
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
                <dd>{selectedDays.length}</dd>
              </div>
              <div className="fm-stat">
                <dt>Reasons given</dt>
                <dd>{Object.keys(reviewGroups).length}</dd>
              </div>
            </dl>

            <h3 className="fm-field__label mb-2">Your explanations</h3>
            <ul className="fm-review-list">
              {Object.entries(reviewGroups).map(([key, days]) => {
                const [reasonKey, destination] = key.split('||');
                const reason = reasonKey as UiReason;
                const Icon =
                  reason === 'FORGOT_BOTH'
                    ? REASON_ICONS.FORGOT_CLOCK_IN
                    : (REASON_ICONS[reason] ?? Info);
                return (
                  <li key={key} className="fm-review-item">
                    <span className="fm-card__icon" aria-hidden>
                      <Icon size={18} />
                    </span>
                    <div className="fm-review-item__body">
                      <p className="fm-review-item__title">
                        {UI_REASON_LABELS[reason] ?? reason}
                        {destination ? ` — ${destination}` : ''}
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
              <Field
                id="fm-late-reason"
                label={t('pages.hr.siteAssignments.form.lateReason')}
              >
                {(a11y) => (
                  <Input.TextArea
                    {...a11y}
                    rows={3}
                    maxLength={2000}
                    value={lateReason}
                    onChange={(event) => setLateReason(event.target.value)}
                    placeholder={t(
                      'pages.hr.siteAssignments.form.lateReasonPlaceholder',
                    )}
                  />
                )}
              </Field>
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
      <div className="flex shrink-0 justify-end">
        <Button onClick={() => router.push('/approvals/new')}>Cancel</Button>
      </div>
      <div className="erp-stepper-form">
        <StepperForm
          contentVariant="sections"
          steps={steps}
          onSubmit={handleSubmit}
          isSubmitting={submitting}
          submitLabel="Submit for Approval"
        />
      </div>
    </div>
  );
}
