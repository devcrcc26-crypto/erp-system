'use client';

import { useMemo, useState } from 'react';
import {
  Button,
  Checkbox,
  Form,
  Input,
  InputNumber,
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

const REASON_SUMMARY: Record<FieldMovementReason, string> = {
  FIELD_VISIT: 'Field visit',
  EARLY_LEAVE: 'Left early',
  FORGOT_CLOCK_IN: 'Forgot to clock in',
  FORGOT_CLOCK_OUT: 'Forgot to clock out',
};

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
  };
}

function ReviewItem({
  label,
  value,
}: {
  label: string;
  value: string;
}): React.ReactNode {
  return (
    <div className="min-w-0">
      <p
        className="mb-0.5 text-xs font-medium uppercase tracking-wide"
        style={{ color: tokens.colorTextTertiary }}
      >
        {label}
      </p>
      <p
        className="m-0 whitespace-pre-wrap text-sm"
        style={{ color: tokens.colorTextPrimary }}
      >
        {value}
      </p>
    </div>
  );
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

  useSetHeaderExtra(null);

  const selectedDays = useMemo(
    () => dayEntries.filter((day) => day.selected),
    [dayEntries],
  );
  const periodLabel = `${monthName(month)} ${year}`;

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

  async function handleCheckFlaggedDays(): Promise<void> {
    setStepOneError(null);
    setFetchError(null);
    setFetchState('loading');
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
    setDayEntries((prev) =>
      prev.map((day) => {
        if (!day.selected) {
          return { ...day, errors: {} };
        }
        const errors: DayErrors = {};
        if (!day.selectedReason) {
          errors.selectedReason = 'Reason is required';
          valid = false;
        }
        if (day.selectedReason === 'FIELD_VISIT') {
          if (!day.destination.trim()) {
            errors.destination = 'Destination is required';
            valid = false;
          }
          if (!day.departureTime || !parseTime(day.departureTime)) {
            errors.departureTime = day.departureTime
              ? 'Use HH:mm format'
              : 'Departure time is required';
            valid = false;
          }
          if (day.didReturn) {
            const dep = parseTime(day.departureTime);
            const ret = parseTime(day.returnTime);
            if (!day.returnTime) {
              errors.returnTime = 'Return time is required';
              valid = false;
            } else if (dep && ret && !ret.isAfter(dep)) {
              errors.returnTime = 'Return time must be after departure time';
              valid = false;
            }
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
          } else if (endTime && !dep.isBefore(endTime)) {
            errors.departureTime = `Departure must be before scheduled end (${end})`;
            valid = false;
          }
          if (!day.earlyLeaveReason.trim()) {
            errors.earlyLeaveReason = 'Reason for early departure is required';
            valid = false;
          }
        }
        return { ...day, errors };
      }),
    );
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
            ? day.departureTime
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
          {dayEntries.map((day) => {
            const reasonOptions = REASON_OPTIONS[day.flag].filter((option) =>
              day.availableReasons.includes(option.value),
            );
            return (
              <div
                key={day.id}
                className="erp-employee-section"
                style={{ opacity: day.selected ? 1 : 0.55 }}
              >
                <div className="erp-employee-section-header">
                  <div className="flex min-w-0 flex-1 items-start gap-3">
                    <Checkbox
                      checked={day.selected}
                      onChange={(event) =>
                        updateDay(day.id, {
                          selected: event.target.checked,
                          errors: {},
                        })
                      }
                    />
                    <div className="min-w-0">
                      <h3 className="erp-employee-section-title m-0">
                        {formatFlaggedDate(day.date)}
                      </h3>
                      <div className="mt-1 flex flex-wrap items-center gap-2">
                        <Tag color={FLAG_COLORS[day.flag]}>
                          Flag: {FLAG_LABELS[day.flag]}
                        </Tag>
                        {day.alreadySubmitted && day.submittedLog ? (
                          <Tag color="green">
                            {day.submittedLog.requestNumber} ✅ Already
                            explained
                          </Tag>
                        ) : null}
                      </div>
                    </div>
                  </div>
                </div>
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
                            });
                            clearDayError(day.id, 'destination');
                          }}
                        />
                      </Form.Item>
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
                          updateDay(day.id, { notes: event.target.value })
                        }
                      />
                    </Form.Item>
                  ) : null}
                </div>
              </div>
            );
          })}
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
          <div className="flex flex-col gap-4">
            {selectedDays.map((day) => (
              <div
                key={day.id}
                className="rounded-lg border border-[#e8ebef] p-3"
              >
                <p className="m-0 mb-2 font-medium">
                  {formatFlaggedDate(day.date)}
                </p>
                <div className="grid gap-2 sm:grid-cols-2">
                  <ReviewItem
                    label="Reason"
                    value={
                      day.selectedReason
                        ? REASON_SUMMARY[day.selectedReason]
                        : '—'
                    }
                  />
                  {day.selectedReason === 'FIELD_VISIT' ? (
                    <>
                      <ReviewItem
                        label="Destination"
                        value={day.destination || '—'}
                      />
                      <ReviewItem
                        label="Departed"
                        value={
                          day.departureTime
                            ? `${day.departureTime}${
                                day.didReturn && day.returnTime
                                  ? ` · Returned ${day.returnTime}`
                                  : ' · Did not return to office'
                              }`
                            : '—'
                        }
                      />
                    </>
                  ) : null}
                  {day.selectedReason === 'EARLY_LEAVE' ? (
                    <>
                      <ReviewItem
                        label="Departure"
                        value={day.departureTime || '—'}
                      />
                      <ReviewItem
                        label="Reason"
                        value={day.earlyLeaveReason || '—'}
                      />
                    </>
                  ) : null}
                  <ReviewItem label="Notes" value={day.notes || '—'} />
                </div>
              </div>
            ))}
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
