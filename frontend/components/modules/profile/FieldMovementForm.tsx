'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  Button,
  Checkbox,
  Input,
  Modal,
  Progress,
  Select,
  Space,
  Steps,
  Switch,
  Tag,
  TimePicker,
  Typography,
} from 'antd';
import dayjs, { type Dayjs } from 'dayjs';
import { useAppMessage } from '@/hooks/use-app-message';
import type {
  AttendanceDayFlag,
  CreateFieldMovementEntryDto,
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

const REASON_OPTIONS: Record<
  AttendanceDayFlag,
  Array<{ value: FieldMovementReason; label: string }>
> = {
  MISSING_CLOCK_IN: [
    { value: 'FIELD_VISIT', label: 'I was on a field / site visit' },
    { value: 'FORGOT_TO_CLOCK', label: 'I forgot to clock (in / out / both)' },
    { value: 'FORGOT_CLOCK_IN', label: 'I forgot to clock in' },
  ],
  MISSING_CLOCK_OUT: [
    { value: 'FIELD_VISIT', label: 'I left for a field / site visit' },
    { value: 'EARLY_LEAVE', label: 'I left early' },
    { value: 'FORGOT_TO_CLOCK', label: 'I forgot to clock (in / out / both)' },
    { value: 'FORGOT_CLOCK_OUT', label: 'I forgot to clock out' },
  ],
  EARLY_LEAVE: [
    { value: 'FIELD_VISIT', label: 'I left for a field / site visit' },
    { value: 'EARLY_LEAVE', label: 'I confirm I left early' },
  ],
  NONE: [],
};

const FLAG_LABELS: Record<AttendanceDayFlag, string> = {
  MISSING_CLOCK_IN: 'Missing clock-in',
  MISSING_CLOCK_OUT: 'Missing clock-out',
  EARLY_LEAVE: 'Early departure detected',
  NONE: '',
};

const REASON_SUMMARY: Record<FieldMovementReason, string> = {
  FIELD_VISIT: 'Field visit',
  EARLY_LEAVE: 'Left early',
  FORGOT_TO_CLOCK: 'Forgot to clock',
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
    value: 'FORGOT_TO_CLOCK',
    label: '⏰ Forgot to clock (missing in / out days)',
  },
  {
    value: 'FORGOT_CLOCK_IN',
    label: '⏰ Forgot to clock in (only for missing clock-in days)',
  },
  {
    value: 'FORGOT_CLOCK_OUT',
    label: '⏰ Forgot to clock out (only for missing clock-out days)',
  },
  {
    value: 'EARLY_LEAVE',
    label: '🚪 Left early (only for early leave / missing clock-out days)',
  },
];

interface EntryDraft {
  reason?: FieldMovementReason;
  destination?: string;
  departureTime?: string;
  didReturn?: boolean;
  returnTime?: string;
  forgotDirection?: 'IN' | 'OUT' | 'BOTH';
  notes?: string;
  earlyLeaveReason?: string;
}

export interface FieldMovementFormProps {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
  employeeId: string;
  month: number;
  year: number;
  flaggedDays: FlaggedDay[];
}

function formatFlaggedDate(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    weekday: 'long',
  });
}

function parseTime(value: string | undefined): Dayjs | null {
  if (!value) {
    return null;
  }
  const parsed = dayjs(value, 'HH:mm', true);
  return parsed.isValid() ? parsed : null;
}

function getValidBulkReasons(days: FlaggedDay[]): FieldMovementReason[] {
  const flags = new Set(days.map((d) => d.flag));
  const reasons: FieldMovementReason[] = ['FIELD_VISIT'];
  if (!flags.has('MISSING_CLOCK_OUT') && !flags.has('EARLY_LEAVE')) {
    reasons.push('FORGOT_CLOCK_IN');
  }
  if (!flags.has('MISSING_CLOCK_IN') && !flags.has('EARLY_LEAVE')) {
    reasons.push('FORGOT_CLOCK_OUT');
  }
  if (!flags.has('MISSING_CLOCK_IN')) {
    reasons.push('EARLY_LEAVE');
  }
  return reasons;
}

function draftIsComplete(day: FlaggedDay, draft: EntryDraft | undefined): boolean {
  if (!draft?.reason) {
    return false;
  }
  if (draft.reason === 'FIELD_VISIT') {
    return (draft.destination?.trim().length ?? 0) >= 3;
  }
  if (draft.reason === 'EARLY_LEAVE') {
    return Boolean(draft.departureTime) && Boolean(draft.earlyLeaveReason?.trim());
  }
  return true;
}

/**
 * Multi-step modal for employees to explain flagged attendance days.
 */
export default function FieldMovementForm({
  open,
  onClose,
  onSuccess,
  employeeId,
  month,
  year,
  flaggedDays,
}: FieldMovementFormProps): React.ReactNode {
  void employeeId;
  const messageApi = useAppMessage();
  const createMutation = useCreateFieldMovementLog();
  const submitMutation = useSubmitFieldMovementLog();
  const cancelMutation = useCancelFieldMovementLog();

  const [step, setStep] = useState(0);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [entryDrafts, setEntryDrafts] = useState<Record<string, EntryDraft>>({});
  const [overallNotes, setOverallNotes] = useState('');
  const [submittedNumber, setSubmittedNumber] = useState<string | null>(null);
  const [bulkReason, setBulkReason] = useState<FieldMovementReason | null>(null);
  const [bulkDestination, setBulkDestination] = useState('');
  const [bulkDepartureTime, setBulkDepartureTime] = useState('');
  const [bulkDidReturn, setBulkDidReturn] = useState(false);
  const [bulkReturnTime, setBulkReturnTime] = useState('');
  const [bulkEarlyLeaveReason, setBulkEarlyLeaveReason] = useState('');
  const [bulkNotes, setBulkNotes] = useState('');

  useEffect(() => {
    if (open) {
      onSuccess();
    }
    // Refresh locked-day state whenever the modal opens (avoids stale drafts).
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only on open
  }, [open]);

  const selectableDays = useMemo(
    () => flaggedDays.filter((day) => !day.alreadySubmitted),
    [flaggedDays],
  );

  const orphanDraftIds = useMemo(() => {
    const ids = new Set<string>();
    for (const day of flaggedDays) {
      if (day.submittedLog?.status === 'DRAFT') {
        ids.add(day.submittedLog.id);
      }
    }
    return [...ids];
  }, [flaggedDays]);

  const selectedDays = useMemo(
    () =>
      flaggedDays.filter(
        (day) => selectedIds.includes(day.id) && !day.alreadySubmitted,
      ),
    [flaggedDays, selectedIds],
  );

  const filledCount = selectedDays.filter((day) =>
    draftIsComplete(day, entryDrafts[day.id]),
  ).length;

  const allSelected =
    selectableDays.length > 0 &&
    selectableDays.every((day) => selectedIds.includes(day.id));
  const someSelected =
    selectableDays.some((day) => selectedIds.includes(day.id)) && !allSelected;

  const bulkReasonOptions = useMemo(() => {
    const valid = new Set(getValidBulkReasons(selectedDays));
    return BULK_REASON_CATALOG.filter((option) => valid.has(option.value));
  }, [selectedDays]);

  const canApplyBulk = useMemo((): boolean => {
    if (!bulkReason || selectedDays.length === 0) {
      return false;
    }
    if (bulkReason === 'FIELD_VISIT') {
      if (bulkDestination.trim().length < 3) {
        return false;
      }
      if (bulkDidReturn && !parseTime(bulkReturnTime)) {
        return false;
      }
      const dep = parseTime(bulkDepartureTime);
      const ret = parseTime(bulkReturnTime);
      if (bulkDidReturn && dep && ret && !ret.isAfter(dep)) {
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
    return true;
  }, [
    bulkReason,
    selectedDays.length,
    bulkDestination,
    bulkDidReturn,
    bulkReturnTime,
    bulkDepartureTime,
    bulkEarlyLeaveReason,
  ]);

  const reviewGroups = useMemo(() => {
    return groupBy(
      selectedDays.filter((day) => entryDrafts[day.id]?.reason),
      (day) => {
        const draft = entryDrafts[day.id]!;
        return `${draft.reason}||${draft.destination?.trim() || ''}`;
      },
    );
  }, [selectedDays, entryDrafts]);

  function clearBulkFields(): void {
    setBulkReason(null);
    setBulkDestination('');
    setBulkDepartureTime('');
    setBulkDidReturn(false);
    setBulkReturnTime('');
    setBulkEarlyLeaveReason('');
    setBulkNotes('');
  }

  function resetForm(): void {
    setStep(0);
    setSelectedIds([]);
    setEntryDrafts({});
    setOverallNotes('');
    setSubmittedNumber(null);
    clearBulkFields();
  }

  function handleClose(): void {
    resetForm();
    onClose();
  }

  function updateDraft(dayId: string, patch: Partial<EntryDraft>): void {
    setEntryDrafts((prev) => ({
      ...prev,
      [dayId]: { ...prev[dayId], ...patch },
    }));
  }

  function handleSelectAll(checked: boolean): void {
    setSelectedIds(
      checked ? selectableDays.map((day) => day.id) : [],
    );
  }

  function handleApplyBulk(): void {
    if (!bulkReason || !canApplyBulk) {
      return;
    }

    const reason = bulkReason;
    setEntryDrafts((prev) => {
      const next = { ...prev };
      for (const day of selectedDays) {
        const validReasons = REASON_OPTIONS[day.flag].map((o) => o.value);
        if (
          !validReasons.includes(reason) ||
          !day.availableReasons.includes(reason)
        ) {
          continue;
        }
        next[day.id] = {
          reason,
          destination:
            reason === 'FIELD_VISIT' ? bulkDestination.trim() : undefined,
          departureTime:
            reason === 'FIELD_VISIT' || reason === 'EARLY_LEAVE'
              ? bulkDepartureTime || undefined
              : undefined,
          didReturn: reason === 'FIELD_VISIT' ? bulkDidReturn : false,
          returnTime:
            reason === 'FIELD_VISIT' && bulkDidReturn
              ? bulkReturnTime || undefined
              : undefined,
          earlyLeaveReason:
            reason === 'EARLY_LEAVE'
              ? bulkEarlyLeaveReason.trim()
              : undefined,
          notes:
            reason === 'EARLY_LEAVE'
              ? bulkEarlyLeaveReason.trim()
              : bulkNotes.trim() || undefined,
        };
      }
      return next;
    });

    clearBulkFields();
    messageApi.success(`Applied to ${selectedDays.length} day(s).`);
  }

  function validateStep2(): string | null {
    if (selectedDays.length === 0) {
      return 'Select at least one day to explain.';
    }
    for (const day of selectedDays) {
      const draft = entryDrafts[day.id];
      if (!draft?.reason) {
        return `Select a reason for ${formatFlaggedDate(day.date)}`;
      }
      if (
        draft.reason === 'FIELD_VISIT' &&
        (draft.destination?.trim().length ?? 0) < 3
      ) {
        return `Destination is required for ${formatFlaggedDate(day.date)}`;
      }
      if (draft.reason === 'EARLY_LEAVE' && !draft.departureTime) {
        return `Departure time is required for ${formatFlaggedDate(day.date)}`;
      }
      if (
        draft.reason === 'EARLY_LEAVE' &&
        !draft.earlyLeaveReason?.trim() &&
        !draft.notes?.trim()
      ) {
        return `Early departure reason is required for ${formatFlaggedDate(day.date)}`;
      }
      const allowed = day.availableReasons.includes(draft.reason);
      if (!allowed) {
        return `Invalid reason for ${formatFlaggedDate(day.date)}`;
      }
    }
    return null;
  }

  function buildEntries(): CreateFieldMovementEntryDto[] {
    return selectedDays.map((day) => {
      const draft = entryDrafts[day.id]!;
      const reason = draft.reason!;
      return {
        dailyLogId: day.id,
        reason,
        destination: draft.destination?.trim() || undefined,
        departureTime: draft.departureTime || undefined,
        returnTime:
          reason === 'FIELD_VISIT' && draft.didReturn
            ? draft.returnTime || undefined
            : draft.returnTime || undefined,
        forgotDirection:
          reason === 'FORGOT_TO_CLOCK'
            ? draft.forgotDirection ??
              (day.flag === 'MISSING_CLOCK_IN'
                ? 'IN'
                : day.flag === 'MISSING_CLOCK_OUT'
                  ? 'OUT'
                  : 'BOTH')
            : undefined,
        notes:
          reason === 'EARLY_LEAVE'
            ? draft.earlyLeaveReason?.trim() || draft.notes?.trim() || undefined
            : draft.notes?.trim() || undefined,
      };
    });
  }

  async function handleSubmit(): Promise<void> {
    const validationError = validateStep2();
    if (validationError) {
      messageApi.warning(validationError);
      setStep(1);
      return;
    }

    let createdId: string | null = null;
    try {
      const created = await createMutation.mutateAsync({
        entries: buildEntries(),
        notes: overallNotes.trim() || undefined,
      });
      createdId = created.id;
      const submitted = await submitMutation.mutateAsync(created.id);
      setSubmittedNumber(submitted.requestNumber);
      setStep(3);
      onSuccess();
    } catch (error) {
      if (createdId) {
        try {
          await cancelMutation.mutateAsync(createdId);
        } catch {
          // Keep original submit error; draft may still need manual cancel.
        }
      }
      notifyApiError(error, 'Failed to submit field movement log', messageApi);
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
      onSuccess();
    } catch (error) {
      // Stale UI may still list a draft that was already cancelled elsewhere.
      onSuccess();
      notifyApiError(error, 'Failed to cancel draft', messageApi);
    }
  }

  const busy =
    createMutation.isPending ||
    submitMutation.isPending ||
    cancelMutation.isPending;
  const monthName = new Date(year, month - 1, 1).toLocaleString('en', {
    month: 'long',
  });

  return (
    <Modal
      open={open}
      onCancel={handleClose}
      title={`Field Movement / Early Departure — ${monthName} ${year}`}
      width={760}
      destroyOnHidden
      footer={
        step === 3 ? (
          <Space>
            <Button onClick={handleClose}>Close</Button>
            <Button
              type="primary"
              onClick={() => {
                resetForm();
              }}
            >
              Submit another month
            </Button>
          </Space>
        ) : (
          <Space>
            <Button onClick={handleClose}>Cancel</Button>
            {step > 0 ? (
              <Button onClick={() => setStep((prev) => prev - 1)}>Back</Button>
            ) : null}
            {step < 2 ? (
              <Button
                type="primary"
                disabled={step === 0 && selectedDays.length === 0}
                onClick={() => {
                  if (step === 0 && selectedDays.length === 0) {
                    messageApi.warning('Select at least one day to explain.');
                    return;
                  }
                  if (step === 1) {
                    const error = validateStep2();
                    if (error) {
                      messageApi.warning(error);
                      return;
                    }
                  }
                  setStep((prev) => prev + 1);
                }}
              >
                Next
              </Button>
            ) : (
              <Button
                type="primary"
                loading={busy}
                onClick={() => void handleSubmit()}
              >
                Submit for approval
              </Button>
            )}
          </Space>
        )
      }
    >
      <Steps
        size="small"
        current={step}
        className="mb-4"
        items={[
          { title: 'Select days' },
          { title: 'Details' },
          { title: 'Review' },
          { title: 'Done' },
        ]}
      />

      {step === 0 ? (
        <div className="flex flex-col gap-3">
          <Typography.Paragraph type="secondary" className="!mb-0">
            Select the flagged days you want to explain.
          </Typography.Paragraph>

          {orphanDraftIds.length > 0 ? (
            <div className="rounded-lg border border-[#f59e0b] bg-[#fffbeb] px-3 py-2 text-sm text-[#92400e]">
              <p className="m-0 mb-2">
                An unsubmitted draft is locking some days, so it will not appear
                under Approvals. Cancel it to unlock and submit again.
              </p>
              <Button
                size="small"
                danger
                loading={cancelMutation.isPending}
                onClick={() => {
                  void handleCancelOrphanDrafts();
                }}
              >
                Cancel draft & unlock days
              </Button>
            </div>
          ) : null}

          {selectableDays.length > 0 ? (
            <Checkbox
              indeterminate={someSelected}
              checked={allSelected}
              onChange={(event) => handleSelectAll(event.target.checked)}
            >
              {allSelected
                ? 'Deselect All'
                : `Select All (${selectableDays.length} days)`}
            </Checkbox>
          ) : (
            <div className="rounded-lg border border-[#E5E7EB] bg-[#F8FAFC] px-3 py-2 text-sm text-[#64748b]">
              {orphanDraftIds.length > 0
                ? 'All flagged days are locked by an unsubmitted draft.'
                : 'All flagged days already have a pending explanation.'}
            </div>
          )}

          {flaggedDays.map((day) => (
            <label
              key={day.id}
              className="flex cursor-pointer items-start gap-3 rounded-lg border border-[#E5E7EB] px-3 py-2 hover:border-[#F47B20]"
              style={{ opacity: day.alreadySubmitted ? 0.6 : 1 }}
            >
              <Checkbox
                checked={selectedIds.includes(day.id)}
                disabled={day.alreadySubmitted}
                onChange={(event) => {
                  const checked = event.target.checked;
                  setSelectedIds((prev) =>
                    checked
                      ? [...prev, day.id]
                      : prev.filter((id) => id !== day.id),
                  );
                }}
              />
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium text-[#1A1A1A]">
                  {formatFlaggedDate(day.date)} — {FLAG_LABELS[day.flag]}
                </div>
                {day.alreadySubmitted && day.submittedLog ? (
                  <div
                    className={`mt-1 text-xs ${
                      day.submittedLog.status === 'DRAFT'
                        ? 'text-[#b45309]'
                        : 'text-[#1d9e75]'
                    }`}
                  >
                    {day.submittedLog.status === 'DRAFT'
                      ? `Unsubmitted draft ${day.submittedLog.requestNumber} — not in Approvals yet`
                      : `Already submitted: ${day.submittedLog.requestNumber}${
                          day.submittedLog.pendingApproverName
                            ? ` · waiting on ${day.submittedLog.pendingApproverName}`
                            : ''
                        } ✓`}
                  </div>
                ) : null}
              </div>
            </label>
          ))}
        </div>
      ) : null}

      {step === 1 ? (
        <div className="flex max-h-[480px] flex-col gap-4 overflow-y-auto pr-1">
          {selectedDays.length > 0 ? (
            <div className="rounded-lg border border-[#E5E7EB] bg-[#F8FAFC] p-3">
              <div className="mb-2 flex items-center justify-between gap-2">
                <span className="text-sm font-semibold text-[#1A1A1A]">
                  Bulk Actions
                </span>
                <span className="text-xs text-[#64748b]">
                  {filledCount} of {selectedDays.length} filled
                  {filledCount === selectedDays.length && selectedDays.length > 0
                    ? ' ✅'
                    : ''}
                </span>
              </div>
              <Progress
                percent={
                  selectedDays.length > 0
                    ? Math.round((filledCount / selectedDays.length) * 100)
                    : 0
                }
                strokeColor="#1d9e75"
                size="small"
                showInfo={false}
                className="!mb-3"
              />

              <div className="flex flex-col gap-3">
                <Select
                  placeholder="Apply reason to selected days"
                  className="w-full"
                  value={bulkReason ?? undefined}
                  allowClear
                  options={bulkReasonOptions}
                  onChange={(reason: FieldMovementReason | null) => {
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
                    <Input
                      placeholder="Destination (required)"
                      value={bulkDestination}
                      onChange={(event) =>
                        setBulkDestination(event.target.value)
                      }
                    />
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                      <div>
                        <div className="mb-1 text-xs font-medium text-[#6B7280]">
                          Departure time (optional)
                        </div>
                        <TimePicker
                          className="w-full"
                          format="HH:mm"
                          value={parseTime(bulkDepartureTime)}
                          onChange={(value) =>
                            setBulkDepartureTime(
                              value ? value.format('HH:mm') : '',
                            )
                          }
                        />
                      </div>
                      <div>
                        <div className="mb-1 text-xs font-medium text-[#6B7280]">
                          Returned to office?
                        </div>
                        <Switch
                          checked={bulkDidReturn}
                          onChange={(checked) => {
                            setBulkDidReturn(checked);
                            if (!checked) {
                              setBulkReturnTime('');
                            }
                          }}
                        />
                      </div>
                    </div>
                    {bulkDidReturn ? (
                      <div>
                        <div className="mb-1 text-xs font-medium text-[#6B7280]">
                          Return time
                        </div>
                        <TimePicker
                          className="w-full"
                          format="HH:mm"
                          value={parseTime(bulkReturnTime)}
                          onChange={(value) =>
                            setBulkReturnTime(
                              value ? value.format('HH:mm') : '',
                            )
                          }
                        />
                      </div>
                    ) : null}
                    <Input.TextArea
                      rows={2}
                      placeholder="Notes (optional)"
                      value={bulkNotes}
                      onChange={(event) => setBulkNotes(event.target.value)}
                    />
                  </>
                ) : null}

                {bulkReason === 'EARLY_LEAVE' ? (
                  <>
                    <div>
                      <div className="mb-1 text-xs font-medium text-[#6B7280]">
                        Departure time
                      </div>
                      <TimePicker
                        className="w-full"
                        format="HH:mm"
                        value={parseTime(bulkDepartureTime)}
                        onChange={(value) =>
                          setBulkDepartureTime(
                            value ? value.format('HH:mm') : '',
                          )
                        }
                      />
                    </div>
                    <Input.TextArea
                      rows={3}
                      placeholder="Reason for early departure (required)"
                      value={bulkEarlyLeaveReason}
                      onChange={(event) =>
                        setBulkEarlyLeaveReason(event.target.value)
                      }
                    />
                  </>
                ) : null}

                {bulkReason === 'FORGOT_CLOCK_IN' ||
                bulkReason === 'FORGOT_CLOCK_OUT' ? (
                  <Input.TextArea
                    rows={2}
                    placeholder="Notes (optional)"
                    value={bulkNotes}
                    onChange={(event) => setBulkNotes(event.target.value)}
                  />
                ) : null}

                <div>
                  <Button
                    type="primary"
                    disabled={!canApplyBulk}
                    onClick={handleApplyBulk}
                  >
                    Apply to {selectedDays.length} day(s)
                  </Button>
                </div>
              </div>
            </div>
          ) : null}

          {selectedDays.map((day) => {
            const draft = entryDrafts[day.id] ?? {};
            const reasonOptions =
              day.availableReasons.length > 0
                ? REASON_OPTIONS[day.flag].filter((option) =>
                    day.availableReasons.includes(option.value),
                  )
                : REASON_OPTIONS[day.flag];
            const complete = draftIsComplete(day, draft);

            return (
              <div
                key={day.id}
                className="rounded-lg border border-[#E5E7EB] p-3"
              >
                <div className="mb-3 flex flex-wrap items-center gap-2">
                  <span className="text-sm font-semibold text-[#1A1A1A]">
                    {formatFlaggedDate(day.date)}
                  </span>
                  <Tag>{FLAG_LABELS[day.flag]}</Tag>
                  {complete ? (
                    <Tag color="green">✓ Filled</Tag>
                  ) : (
                    <Tag color="orange">Needs details</Tag>
                  )}
                </div>
                <div className="flex flex-col gap-3">
                  <div>
                    <div className="mb-1 text-xs font-medium text-[#6B7280]">
                      Reason
                    </div>
                    <Select
                      className="w-full"
                      placeholder="Select reason"
                      value={draft.reason}
                      options={reasonOptions}
                      onChange={(value: FieldMovementReason) =>
                        updateDraft(day.id, {
                          reason: value,
                          destination:
                            value === 'FIELD_VISIT'
                              ? draft.destination
                              : undefined,
                          departureTime:
                            value === 'FIELD_VISIT' || value === 'EARLY_LEAVE'
                              ? draft.departureTime
                              : undefined,
                          didReturn:
                            value === 'FIELD_VISIT' ? draft.didReturn : false,
                          returnTime:
                            value === 'FIELD_VISIT'
                              ? draft.returnTime
                              : undefined,
                          earlyLeaveReason:
                            value === 'EARLY_LEAVE'
                              ? draft.earlyLeaveReason
                              : undefined,
                        })
                      }
                    />
                  </div>

                  {draft.reason === 'FIELD_VISIT' ? (
                    <>
                      <div>
                        <div className="mb-1 text-xs font-medium text-[#6B7280]">
                          Destination
                        </div>
                        <Input
                          value={draft.destination}
                          placeholder="e.g. Dire Dawa site"
                          onChange={(event) =>
                            updateDraft(day.id, {
                              destination: event.target.value,
                            })
                          }
                        />
                      </div>
                      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                        <div>
                          <div className="mb-1 text-xs font-medium text-[#6B7280]">
                            Departure time (optional)
                          </div>
                          <TimePicker
                            className="w-full"
                            format="HH:mm"
                            value={parseTime(draft.departureTime)}
                            onChange={(value) =>
                              updateDraft(day.id, {
                                departureTime: value
                                  ? value.format('HH:mm')
                                  : undefined,
                              })
                            }
                          />
                        </div>
                        <div>
                          <div className="mb-1 text-xs font-medium text-[#6B7280]">
                            Returned to office?
                          </div>
                          <Switch
                            checked={Boolean(draft.didReturn)}
                            onChange={(checked) =>
                              updateDraft(day.id, {
                                didReturn: checked,
                                returnTime: checked
                                  ? draft.returnTime
                                  : undefined,
                              })
                            }
                          />
                        </div>
                      </div>
                      {draft.didReturn ? (
                        <div>
                          <div className="mb-1 text-xs font-medium text-[#6B7280]">
                            Return time
                          </div>
                          <TimePicker
                            className="w-full"
                            format="HH:mm"
                            value={parseTime(draft.returnTime)}
                            onChange={(value) =>
                              updateDraft(day.id, {
                                returnTime: value
                                  ? value.format('HH:mm')
                                  : undefined,
                              })
                            }
                          />
                        </div>
                      ) : null}
                    </>
                  ) : null}

                  {draft.reason === 'EARLY_LEAVE' ? (
                    <>
                      <div>
                        <div className="mb-1 text-xs font-medium text-[#6B7280]">
                          Departure time
                        </div>
                        <TimePicker
                          className="w-full"
                          format="HH:mm"
                          value={parseTime(draft.departureTime)}
                          onChange={(value) =>
                            updateDraft(day.id, {
                              departureTime: value
                                ? value.format('HH:mm')
                                : undefined,
                            })
                          }
                        />
                      </div>
                      <div>
                        <div className="mb-1 text-xs font-medium text-[#6B7280]">
                          Reason for early departure
                        </div>
                        <Input.TextArea
                          rows={2}
                          value={draft.earlyLeaveReason ?? draft.notes}
                          onChange={(event) =>
                            updateDraft(day.id, {
                              earlyLeaveReason: event.target.value,
                              notes: event.target.value,
                            })
                          }
                        />
                      </div>
                    </>
                  ) : null}

                  {draft.reason && draft.reason !== 'EARLY_LEAVE' ? (
                    <div>
                      <div className="mb-1 text-xs font-medium text-[#6B7280]">
                        Notes (optional)
                      </div>
                      <Input.TextArea
                        rows={2}
                        value={draft.notes}
                        onChange={(event) =>
                          updateDraft(day.id, { notes: event.target.value })
                        }
                      />
                    </div>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>
      ) : null}

      {step === 2 ? (
        <div className="flex flex-col gap-3">
          <Typography.Paragraph type="secondary" className="!mb-1">
            Review your explanations before submitting ({selectedDays.length}{' '}
            day(s)).
          </Typography.Paragraph>
          <div className="flex flex-col gap-2">
            {Object.entries(reviewGroups).map(([key, days]) => {
              const [reasonKey, destination] = key.split('||');
              const reason = reasonKey as FieldMovementReason;
              return (
                <div
                  key={key}
                  className="rounded-lg border border-[#E5E7EB] px-3 py-2"
                >
                  <div className="mb-1 flex flex-wrap items-center gap-2">
                    <span className="text-sm font-semibold text-[#1A1A1A]">
                      {REASON_SUMMARY[reason] ?? reason}
                      {destination ? ` — ${destination}` : ''}
                    </span>
                    <Tag>{days.length} day(s)</Tag>
                  </div>
                  <p className="m-0 text-xs text-[#64748b]">
                    {formatDateList(days.map((day) => day.date))}
                  </p>
                </div>
              );
            })}
          </div>
          <div>
            <div className="mb-1 text-xs font-medium text-[#6B7280]">
              Overall notes (optional)
            </div>
            <Input.TextArea
              rows={3}
              value={overallNotes}
              onChange={(event) => setOverallNotes(event.target.value)}
              placeholder="Any general comment for this submission"
            />
          </div>
        </div>
      ) : null}

      {step === 3 ? (
        <div className="flex flex-col items-start gap-2 py-2">
          <Typography.Title level={4} className="!mb-1 !text-[#1d9e75]">
            ✓ Field Movement Log {submittedNumber} submitted
          </Typography.Title>
          <Typography.Paragraph className="!mb-0 text-[#6B7280]">
            Your explanation has been sent for approval. You can track the
            status in Approvals → My Requests.
          </Typography.Paragraph>
        </div>
      ) : null}
    </Modal>
  );
}
