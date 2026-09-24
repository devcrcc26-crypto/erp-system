'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  Button,
  Checkbox,
  Form,
  Input,
  InputNumber,
  Progress,
  Select,
  Switch,
  Tag,
  TimePicker,
} from 'antd';
import dayjs, { type Dayjs } from 'dayjs';
import { useRouter } from 'next/navigation';
import FormLayout from '@/components/ui/FormLayout/FormLayout';
import StepperForm from '@/components/ui/StepperForm/StepperForm';
import { useAppMessage } from '@/hooks/use-app-message';
import { useSetHeaderExtra } from '@/hooks/use-set-header-extra';
import { ApiRequestError } from '@/lib/api/errors';
import { getMyAttendance, getMyFlaggedDays } from '@/lib/api/attendance.api';
import type {
  AttendanceDayFlag,
  CreateFieldMovementLogDto,
  FieldMovementReason,
  FlaggedDay,
} from '@/lib/api/attendance.types';
import {
  useCreateFieldMovementLog,
  useSubmitFieldMovementLog,
} from '@/lib/query/attendance';
import {
  formatDateList,
  groupBy,
} from '@/lib/utils/date-format.util';
import { notifyApiError } from '@/lib/utils/notify-api-error';
import { tokens } from '@/lib/theme/tokens';

const MONTH_OPTIONS = Array.from({ length: 12 }, (_, i) => ({
  value: i + 1,
  label: new Date(2026, i, 1).toLocaleString('en', { month: 'long' }),
}));

const REASON_OPTIONS: Record<
  AttendanceDayFlag,
  Array<{ value: FieldMovementReason; label: string }>
> = {
  MISSING_CLOCK_IN: [
    { value: 'FIELD_VISIT', label: '🏗️ I was on a field / site visit' },
    { value: 'FORGOT_CLOCK_IN', label: '⏰ I forgot to clock in' },
  ],
  MISSING_CLOCK_OUT: [
    { value: 'FIELD_VISIT', label: '🏗️ I left for a field / site visit' },
    { value: 'EARLY_LEAVE', label: '🚪 I left early' },
    { value: 'FORGOT_CLOCK_OUT', label: '⏰ I forgot to clock out' },
  ],
  EARLY_LEAVE: [
    { value: 'FIELD_VISIT', label: '🏗️ I left for a field / site visit' },
    { value: 'EARLY_LEAVE', label: '🚪 I confirm I left early' },
  ],
  NONE: [],
};

const FLAG_LABELS: Record<AttendanceDayFlag, string> = {
  MISSING_CLOCK_IN: 'Missing clock-in',
  MISSING_CLOCK_OUT: 'Missing clock-out',
  EARLY_LEAVE: 'Early departure detected',
  NONE: '',
};

const FLAG_COLORS: Record<AttendanceDayFlag, string> = {
  MISSING_CLOCK_IN: 'red',
  MISSING_CLOCK_OUT: 'gold',
  EARLY_LEAVE: 'orange',
  NONE: 'default',
};

const REASON_LABELS: Record<FieldMovementReason, string> = {
  FIELD_VISIT: 'Field visit',
  EARLY_LEAVE: 'Left early',
  FORGOT_CLOCK_IN: 'Forgot to clock in',
  FORGOT_CLOCK_OUT: 'Forgot to clock out',
};

const BULK_REASON_CATALOG: Array<{
  value: FieldMovementReason;
  label: string;
}> = [
  {
    value: 'FIELD_VISIT',
    label: '🏗️ Field visit (applies to all flag types)',
  },
  {
    value: 'FORGOT_CLOCK_IN',
    label: '⏰ Forgot to clock in (only for missing clock-in days)',
  },
  {
    value: 'FORGOT_CLOCK_OUT',
    label: '⏰ Forgot to clock out (only for missing clock-out days)',
  },
];

type FetchState =
  | 'idle'
  | 'loading'
  | 'no-data'
  | 'not-approved'
  | 'has-flags'
  | 'error';

type DayErrors = Partial<
  Record<
    | 'selectedReason'
    | 'destination'
    | 'departureTime'
    | 'returnTime'
    | 'earlyLeaveReason',
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
  submittedLog: { requestNumber: string; status: string } | null;
  selected: boolean;
  selectedReason: FieldMovementReason | null;
  destination: string;
  departureTime: string;
  didReturn: boolean;
  returnTime: string;
  notes: string;
  earlyLeaveReason: string;
  errors: DayErrors;
  filledViaBulk: boolean;
};

function previousMonthDefault(): { month: number; year: number } {
  const now = new Date();
  const month = now.getMonth() + 1;
  const year = now.getFullYear();
  if (month <= 1) {
    return { month: 12, year: year - 1 };
  }
  return { month: month - 1, year };
}

function monthName(month: number): string {
  return MONTH_OPTIONS.find((o) => o.value === month)?.label ?? String(month);
}

function formatFlaggedDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
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

function toDayEntry(day: FlaggedDay): DayEntry {
  return {
    id: day.id,
    date: day.date,
    flag: day.flag,
    isHalfDay: day.isHalfDay,
    availableReasons: day.availableReasons,
    alreadySubmitted: day.alreadySubmitted,
    submittedLog: day.submittedLog
      ? {
          requestNumber: day.submittedLog.requestNumber,
          status: day.submittedLog.status,
        }
      : null,
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

function getValidBulkReasons(
  selectedDays: DayEntry[],
): FieldMovementReason[] {
  const flags = new Set(selectedDays.map((d) => d.flag));
  const reasons: FieldMovementReason[] = ['FIELD_VISIT'];

  if (!flags.has('MISSING_CLOCK_OUT') && !flags.has('EARLY_LEAVE')) {
    reasons.push('FORGOT_CLOCK_IN');
  }
  if (!flags.has('MISSING_CLOCK_IN') && !flags.has('EARLY_LEAVE')) {
    reasons.push('FORGOT_CLOCK_OUT');
  }
  return reasons;
}

function dayNeedsAttention(day: DayEntry): boolean {
  if (!day.selected || day.alreadySubmitted) {
    return false;
  }
  if (!day.selectedReason) {
    return true;
  }
  if (day.selectedReason === 'FIELD_VISIT' && !day.destination.trim()) {
    return true;
  }
  if (
    day.selectedReason === 'EARLY_LEAVE' &&
    (!day.departureTime || !day.earlyLeaveReason.trim())
  ) {
    return true;
  }
  return false;
}

/**
 * Full-page New Request form for Field Movement / Early Departure Log.
 */
export default function FieldMovementForm(): React.ReactNode {
  const router = useRouter();
  const messageApi = useAppMessage();
  const createMutation = useCreateFieldMovementLog();
  const submitMutation = useSubmitFieldMovementLog();
  const defaults = previousMonthDefault();

  const [month, setMonth] = useState(defaults.month);
  const [year, setYear] = useState(defaults.year);
  const [fetchState, setFetchState] = useState<FetchState>('idle');
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [dayEntries, setDayEntries] = useState<DayEntry[]>([]);
  const [overallNotes, setOverallNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submittedLog, setSubmittedLog] = useState<{
    id: string;
    requestNumber: string;
  } | null>(null);
  const [stepOneError, setStepOneError] = useState<string | null>(null);
  const [bulkReason, setBulkReason] = useState<FieldMovementReason | null>(
    null,
  );
  const [bulkDestination, setBulkDestination] = useState('');
  const [expandedDays, setExpandedDays] = useState<Set<number>>(new Set());

  useSetHeaderExtra(null);

  const selectableDays = useMemo(
    () => dayEntries.filter((day) => !day.alreadySubmitted),
    [dayEntries],
  );
  const selectedDays = useMemo(
    () => dayEntries.filter((day) => day.selected),
    [dayEntries],
  );
  const selectedCount = selectedDays.length;
  const filledCount = selectedDays.filter(
    (day) =>
      day.selectedReason != null &&
      (day.selectedReason !== 'FIELD_VISIT' || day.destination.trim().length > 0),
  ).length;
  const allSelected =
    selectableDays.length > 0 &&
    selectableDays.every((day) => day.selected);
  const someSelected =
    selectableDays.some((day) => day.selected) && !allSelected;
  const anySelected = selectedCount > 0;
  const periodLabel = `${monthName(month)} ${year}`;

  const bulkReasonOptions = useMemo(() => {
    const valid = new Set(getValidBulkReasons(selectedDays));
    return BULK_REASON_CATALOG.filter((option) => valid.has(option.value));
  }, [selectedDays]);

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
    (day) => day.selected && !day.selectedReason,
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
    if (!bulkReason) {
      return;
    }
    if (bulkReason === 'FIELD_VISIT' && bulkDestination.trim().length < 3) {
      messageApi.warning('Enter a destination of at least 3 characters.');
      return;
    }

    const reason = bulkReason;
    const destination =
      reason === 'FIELD_VISIT' ? bulkDestination.trim() : '';

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
        if (!day.availableReasons.includes(reason)) {
          return day;
        }
        return {
          ...day,
          selectedReason: reason,
          destination: reason === 'FIELD_VISIT' ? destination : day.destination,
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

    setBulkReason(null);
    setBulkDestination('');
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
    setFetchState('loading');
    setBulkReason(null);
    setBulkDestination('');
    try {
      const [flags, yearAttendance] = await Promise.all([
        getMyFlaggedDays(month, year),
        getMyAttendance(year),
      ]);
      const hasMonthRecord = yearAttendance.records.some(
        (record) => record.month === month && record.year === year,
      );
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
      setDayEntries(flags.flaggedDays.map(toDayEntry));
      setFetchState('has-flags');
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
    if (month < 1 || month > 12 || year < 2020 || year > new Date().getFullYear()) {
      setStepOneError('Select a valid month and year.');
      return false;
    }
    if (fetchState === 'idle' || fetchState === 'loading') {
      setStepOneError('Check for flagged days before continuing.');
      return false;
    }
    if (fetchState !== 'has-flags' || dayEntries.length === 0) {
      setStepOneError('No flagged days available to explain for this period.');
      return false;
    }
    setStepOneError(null);
    return true;
  }

  function validateStep2(): boolean {
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
          } else if (
            day.departureTime &&
            !parseTime(day.departureTime)
          ) {
            errors.departureTime = 'Use HH:mm format';
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
    return {
      notes: overallNotes.trim() || undefined,
      entries: selectedDays.map((day) => {
        const reason = day.selectedReason!;
        return {
          dailyLogId: day.id,
          reason,
          destination:
            reason === 'FIELD_VISIT' ? day.destination.trim() : undefined,
          departureTime: ['FIELD_VISIT', 'EARLY_LEAVE'].includes(reason)
            ? day.departureTime || undefined
            : undefined,
          returnTime:
            reason === 'FIELD_VISIT' && day.didReturn
              ? day.returnTime
              : undefined,
          notes:
            reason === 'EARLY_LEAVE'
              ? day.earlyLeaveReason.trim() || undefined
              : day.notes.trim() || undefined,
        };
      }),
    };
  }

  async function handleSubmit(): Promise<void> {
    if (!validateStep2()) {
      return;
    }
    setSubmitting(true);
    try {
      const created = await createMutation.mutateAsync(buildDto());
      const submitted = await submitMutation.mutateAsync(created.id);
      setSubmittedLog({
        id: submitted.id,
        requestNumber: submitted.requestNumber,
      });
      messageApi.success('Field movement log submitted.');
    } catch (error) {
      notifyApiError(error, 'Failed to submit field movement log', messageApi);
    } finally {
      setSubmitting(false);
    }
  }

  function resetToStep1(): void {
    const next = previousMonthDefault();
    setMonth(next.month);
    setYear(next.year);
    setFetchState('idle');
    setFetchError(null);
    setDayEntries([]);
    setOverallNotes('');
    setSubmittedLog(null);
    setStepOneError(null);
    setBulkReason(null);
    setBulkDestination('');
    setExpandedDays(new Set());
  }

  if (submittedLog) {
    return (
      <div className="erp-pro-list-page erp-users-page erp-employee-form-page erp-leave-form-page">
        <div className="flex shrink-0 justify-end">
          <Button onClick={() => router.push('/approvals/new')}>Cancel</Button>
        </div>
        <FormLayout
          variant="pro"
          title="Field Movement Log Submitted"
          description={`${submittedLog.requestNumber} has been submitted for approval.`}
        >
          <div className="erp-notice erp-notice--success mb-4">
            <div className="erp-notice-body">
              <p className="erp-notice-title m-0">
                {submittedLog.requestNumber} has been submitted for approval.
              </p>
              <p className="erp-notice-description m-0 mt-1">
                Your supervisor will review your explanation. You can track the
                status in Approvals → My Requests.
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              type="primary"
              onClick={() => router.push('/approvals?tab=my-requests')}
            >
              View in My Requests
            </Button>
            <Button onClick={resetToStep1}>Submit for Another Month</Button>
          </div>
        </FormLayout>
      </div>
    );
  }

  const steps = [
    {
      title: 'Select Period',
      validate: () => validateStep1(),
      content: (
        <FormLayout
          variant="pro"
          dense
          title="Select Period"
          description="Choose the attendance month to explain flagged days."
        >
          <div className="erp-advanced-form">
            <div className="erp-form-grid-2 mb-4">
              <Form.Item label="Month" required className="mb-0">
                <Select
                  value={month}
                  options={MONTH_OPTIONS}
                  onChange={(value: number) => {
                    setMonth(value);
                    setFetchState('idle');
                    setDayEntries([]);
                    setStepOneError(null);
                  }}
                  aria-label="Month"
                />
              </Form.Item>
              <Form.Item label="Year" required className="mb-0">
                <InputNumber
                  className="w-full"
                  value={year}
                  min={2020}
                  max={new Date().getFullYear()}
                  onChange={(value) => {
                    if (value == null) {
                      return;
                    }
                    setYear(value);
                    setFetchState('idle');
                    setDayEntries([]);
                    setStepOneError(null);
                  }}
                  aria-label="Year"
                />
              </Form.Item>
            </div>
            <Button
              loading={fetchState === 'loading'}
              onClick={() => void handleCheckFlaggedDays()}
            >
              Check for Flagged Days
            </Button>
            {stepOneError ? (
              <p className="mt-2 mb-0 text-sm text-[#D32F2F]">{stepOneError}</p>
            ) : null}
            {fetchError ? (
              <p className="mt-2 mb-0 text-sm text-[#D32F2F]">{fetchError}</p>
            ) : null}
            {fetchState === 'not-approved' ? (
              <div className="erp-notice erp-notice--warning mt-4">
                <div className="erp-notice-body">
                  <p className="erp-notice-title m-0">
                    Attendance for {periodLabel} has not been processed yet.
                  </p>
                  <p className="erp-notice-description m-0 mt-1">
                    Please wait for HR to upload and approve the attendance
                    before submitting.
                  </p>
                </div>
              </div>
            ) : null}
            {fetchState === 'no-data' ? (
              <div className="erp-notice erp-notice--success mt-4">
                <div className="erp-notice-body">
                  <p className="erp-notice-title m-0">
                    No flagged days found for {periodLabel}.
                  </p>
                  <p className="erp-notice-description m-0 mt-1">
                    Your attendance is complete — no explanation needed.
                  </p>
                </div>
              </div>
            ) : null}
            {fetchState === 'has-flags' ? (
              <div className="erp-notice erp-notice--warning mt-4">
                <div className="erp-notice-body">
                  <p className="erp-notice-title m-0">
                    You have {dayEntries.length} day(s) requiring explanation
                    for {periodLabel}.
                  </p>
                </div>
              </div>
            ) : null}
          </div>
        </FormLayout>
      ),
    },
    {
      title: 'Explain Flagged Days',
      validate: () => validateStep2(),
      content: (
        <div className="flex flex-col gap-4">
          {dayEntries.length > 3 ? (
            <>
              <div style={{ marginBottom: 4 }}>
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    marginBottom: 4,
                  }}
                >
                  <span style={{ fontSize: 12, color: '#64748b' }}>
                    {filledCount} of {selectedCount} selected days explained
                  </span>
                  <span
                    style={{
                      fontSize: 12,
                      color:
                        filledCount === selectedCount && selectedCount > 0
                          ? '#1d9e75'
                          : '#94a3b8',
                    }}
                  >
                    {filledCount === selectedCount && selectedCount > 0
                      ? '✅ All filled'
                      : `${Math.max(0, selectedCount - filledCount)} remaining`}
                  </span>
                </div>
                <Progress
                  percent={
                    selectedCount > 0
                      ? Math.round((filledCount / selectedCount) * 100)
                      : 0
                  }
                  strokeColor="#1d9e75"
                  size="small"
                  showInfo={false}
                />
              </div>

              <div className="erp-employee-section" style={{ marginBottom: 8 }}>
                <div className="erp-employee-section-header">
                  <span className="erp-employee-section-title">
                    Bulk Actions
                  </span>
                </div>
                <div className="erp-employee-section-body">
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 12,
                      flexWrap: 'wrap',
                    }}
                  >
                    <Checkbox
                      indeterminate={someSelected}
                      checked={allSelected}
                      onChange={(event) =>
                        handleSelectAll(event.target.checked)
                      }
                    >
                      {allSelected
                        ? 'Deselect All'
                        : `Select All (${selectableDays.length} days)`}
                    </Checkbox>

                    {anySelected ? (
                      <>
                        <Select
                          placeholder="Apply reason to selected days"
                          style={{ width: 280 }}
                          onChange={(reason: FieldMovementReason | null) =>
                            setBulkReason(reason)
                          }
                          value={bulkReason ?? undefined}
                          allowClear
                          options={bulkReasonOptions}
                        />

                        {bulkReason === 'FIELD_VISIT' ? (
                          <Input
                            placeholder="Destination (applies to all selected)"
                            style={{ width: 300 }}
                            value={bulkDestination}
                            onChange={(event) =>
                              setBulkDestination(event.target.value)
                            }
                          />
                        ) : null}

                        <Button
                          type="default"
                          disabled={
                            !bulkReason ||
                            (bulkReason === 'FIELD_VISIT' &&
                              bulkDestination.trim().length < 3)
                          }
                          onClick={handleApplyBulk}
                        >
                          Apply to {selectedCount} day(s)
                        </Button>
                      </>
                    ) : null}
                  </div>
                </div>
              </div>
            </>
          ) : null}

          {dayEntries.map((day, index) => {
            const reasonOptions = REASON_OPTIONS[day.flag].filter((option) =>
              day.availableReasons.includes(option.value),
            );
            const isExpanded = expandedDays.has(index);
            const showBody = isExpanded && day.selected;

            return (
              <div
                key={day.id}
                className="erp-employee-section"
                style={{
                  marginBottom: 8,
                  opacity: day.selected ? 1 : 0.55,
                }}
              >
                <div
                  className="erp-employee-section-header"
                  style={{ cursor: 'pointer' }}
                  onClick={() => toggleDayExpanded(index)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault();
                      toggleDayExpanded(index);
                    }
                  }}
                  role="button"
                  tabIndex={0}
                >
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 12,
                      flex: 1,
                      minWidth: 0,
                      flexWrap: 'wrap',
                    }}
                  >
                    <Checkbox
                      checked={day.selected}
                      disabled={day.alreadySubmitted}
                      onClick={(event) => event.stopPropagation()}
                      onChange={(event) => {
                        updateDay(day.id, {
                          selected: event.target.checked,
                          errors: {},
                        });
                      }}
                    />
                    <span style={{ fontWeight: 500 }}>
                      {formatFlaggedDate(day.date)}
                    </span>
                    <Tag color={FLAG_COLORS[day.flag]}>
                      {FLAG_LABELS[day.flag]}
                    </Tag>
                    {day.alreadySubmitted && day.submittedLog ? (
                      <Tag color="green">
                        {day.submittedLog.requestNumber} ✅ Already explained
                      </Tag>
                    ) : null}
                    {day.selectedReason && !isExpanded ? (
                      <span style={{ color: '#64748b', fontSize: 12 }}>
                        {REASON_LABELS[day.selectedReason]}
                        {day.destination ? ` — ${day.destination}` : ''}{' '}
                        <Tag color="green" style={{ fontSize: 11 }}>
                          ✓ Filled
                        </Tag>
                      </span>
                    ) : null}
                  </div>
                  <span style={{ color: '#94a3b8', fontSize: 12 }}>
                    {isExpanded ? '▲ Collapse' : '▼ Edit'}
                  </span>
                </div>

                {showBody ? (
                  <div className="erp-employee-section-body erp-advanced-form">
                    <Form.Item
                      label="Reason"
                      required
                      validateStatus={
                        day.errors.selectedReason ? 'error' : undefined
                      }
                      help={day.errors.selectedReason}
                      className="mb-3"
                    >
                      <Select
                        disabled={!day.selected}
                        placeholder="Select reason"
                        value={day.selectedReason ?? undefined}
                        options={reasonOptions}
                        onChange={(value: FieldMovementReason) => {
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
                    </Form.Item>

                    {day.selectedReason === 'FIELD_VISIT' ? (
                      <>
                        <Form.Item
                          label="Destination"
                          required
                          validateStatus={
                            day.errors.destination ? 'error' : undefined
                          }
                          help={day.errors.destination}
                          className="mb-3"
                        >
                          <Input
                            disabled={!day.selected}
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
                        </Form.Item>
                        <Form.Item
                          label="Departure Time (optional)"
                          validateStatus={
                            day.errors.departureTime ? 'error' : undefined
                          }
                          help={day.errors.departureTime}
                          className="mb-3"
                        >
                          <TimePicker
                            disabled={!day.selected}
                            format="HH:mm"
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
                        </Form.Item>
                        <Form.Item
                          label="Did you return to the office?"
                          className="mb-3"
                        >
                          <Switch
                            disabled={!day.selected}
                            checked={day.didReturn}
                            onChange={(checked) =>
                              updateDay(day.id, {
                                didReturn: checked,
                                returnTime: checked ? day.returnTime : '',
                                filledViaBulk: false,
                              })
                            }
                          />
                        </Form.Item>
                        {day.didReturn ? (
                          <Form.Item
                            label="Return Time"
                            required
                            validateStatus={
                              day.errors.returnTime ? 'error' : undefined
                            }
                            help={day.errors.returnTime}
                            className="mb-3"
                          >
                            <TimePicker
                              disabled={!day.selected}
                              format="HH:mm"
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
                          </Form.Item>
                        ) : null}
                      </>
                    ) : null}

                    {day.selectedReason === 'EARLY_LEAVE' ? (
                      <>
                        <Form.Item
                          label="Departure Time"
                          required
                          validateStatus={
                            day.errors.departureTime ? 'error' : undefined
                          }
                          help={day.errors.departureTime}
                          className="mb-3"
                        >
                          <TimePicker
                            disabled={!day.selected}
                            format="HH:mm"
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
                        </Form.Item>
                        <Form.Item
                          label="Reason for early departure"
                          required
                          validateStatus={
                            day.errors.earlyLeaveReason ? 'error' : undefined
                          }
                          help={day.errors.earlyLeaveReason}
                          className="mb-3"
                        >
                          <Input.TextArea
                            disabled={!day.selected}
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
                        </Form.Item>
                      </>
                    ) : null}

                    {day.selectedReason === 'FORGOT_CLOCK_IN' ||
                    day.selectedReason === 'FORGOT_CLOCK_OUT' ? (
                      <p
                        className="mb-3 text-sm"
                        style={{ color: tokens.colorTextSecondary }}
                      >
                        Your attendance will be marked as present for this day.
                      </p>
                    ) : null}

                    {day.selectedReason &&
                    day.selectedReason !== 'EARLY_LEAVE' ? (
                      <Form.Item label="Notes" className="mb-0">
                        <Input.TextArea
                          disabled={!day.selected}
                          rows={2}
                          value={day.notes}
                          onChange={(event) =>
                            updateDay(day.id, {
                              notes: event.target.value,
                              filledViaBulk: false,
                            })
                          }
                        />
                      </Form.Item>
                    ) : null}
                  </div>
                ) : null}
              </div>
            );
          })}

          {!canProceedToStep3 && selectedCount > 0 ? (
            <div className="erp-notice erp-notice--warning" style={{ marginTop: 4 }}>
              <div className="erp-notice-body">
                <p className="erp-notice-description m-0">
                  {unfilledSelectedCount > 0
                    ? `${unfilledSelectedCount} selected day(s) still need a reason. Use bulk actions above to fill them quickly.`
                    : 'Complete destination or early-leave details for all selected days before continuing.'}
                </p>
              </div>
            </div>
          ) : null}
        </div>
      ),
    },
    {
      title: 'Review & Submit',
      content: (
        <FormLayout
          variant="pro"
          dense
          title="Field Movement / Early Departure Log"
          description={`Period: ${periodLabel}`}
        >
          <p
            className="mb-4 text-sm"
            style={{ color: tokens.colorTextSecondary }}
          >
            Days: {selectedDays.length} day(s)
          </p>
          <div className="flex flex-col gap-3">
            {Object.entries(reviewGroups).map(([key, days]) => {
              const [reasonKey, destination] = key.split('||');
              const reason = reasonKey as FieldMovementReason;
              return (
                <div
                  key={key}
                  className="erp-employee-section"
                  style={{ marginBottom: 4 }}
                >
                  <div className="erp-employee-section-header">
                    <span className="erp-employee-section-title">
                      {REASON_LABELS[reason] ?? reason}
                      {destination ? ` — ${destination}` : ''}
                    </span>
                    <Tag>{days.length} day(s)</Tag>
                  </div>
                  <div className="erp-employee-section-body">
                    <p
                      style={{
                        margin: 0,
                        fontSize: 13,
                        color: '#64748b',
                      }}
                    >
                      {formatDateList(days.map((day) => day.date))}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
          <Form.Item label="Overall Notes (optional)" className="mt-4 mb-0">
            <Input.TextArea
              rows={3}
              value={overallNotes}
              onChange={(event) => setOverallNotes(event.target.value)}
            />
          </Form.Item>
        </FormLayout>
      ),
    },
  ];

  return (
    <div className="erp-pro-list-page erp-users-page erp-employee-form-page erp-leave-form-page">
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
