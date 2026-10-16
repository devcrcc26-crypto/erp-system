'use client';

import { useMemo, useState } from 'react';
import { Button, Checkbox, Input, Modal, Progress, Space, Steps, Tag, Typography } from 'antd';
import { useAppMessage } from '@/hooks/use-app-message';
import { useEpcTranslation } from '@/hooks/use-epc-translation';
import type { CreateFieldMovementEntryDto, FlaggedDay } from '@/lib/api/attendance.types';
import {
  useCancelFieldMovementLog,
  useCreateFieldMovementLog,
  useSubmitFieldMovementLog,
} from '@/lib/query/attendance';
import { formatDateList, groupBy } from '@/lib/utils/date-format.util';
import { notifyApiError } from '@/lib/utils/notify-api-error';
import FieldMovementEntryFields from '@/components/modules/attendance/FieldMovementEntryFields';
import {
  canApplySelectionToDay,
  emptyFieldValues,
  getValidBulkForgotDirections,
  getValidBulkReasons,
  toDayEntry,
  validationErrorsForDay,
  availableForgotDirectionsForDay,
  availableReasonTypesForDay,
  type DayEntry,
} from '@/components/modules/attendance/field-movement-form-model';
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

const FLAG_LABELS: Record<FlaggedDay['flag'], string> = {
  MISSING_CLOCK_IN: 'Missing clock-in',
  MISSING_CLOCK_OUT: 'Missing clock-out',
  EARLY_LEAVE: 'Early departure detected',
  ON_LEAVE_BUT_SCANNED: 'On leave but scanned',
  SCAN_AFTER_SEPARATION: 'Scanned after leaving date',
  NONE: '',
};

type EntryDraft = {
  selection: FieldMovementSelection;
  values: FieldMovementFieldValues;
};

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

function dayEntryFromFlagged(day: FlaggedDay, draft: EntryDraft | undefined): DayEntry {
  const base = toDayEntry(day);
  return {
    ...base,
    selected: true,
    reasonType: draft?.selection.reasonType ?? null,
    forgotDirection: draft?.selection.forgotDirection ?? null,
    location: draft?.values.location ?? '',
    timeOut: draft?.values.timeOut ?? '',
    returnTime: draft?.values.returnTime ?? '',
    clockInTime: draft?.values.clockInTime ?? '',
    clockOutTime: draft?.values.clockOutTime ?? '',
    reasonNote: draft?.values.reasonNote ?? '',
  };
}

function draftIsComplete(day: FlaggedDay, draft: EntryDraft | undefined): boolean {
  const entry = dayEntryFromFlagged(day, draft);
  return Object.keys(validationErrorsForDay(entry)).length === 0;
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
  const { t } = useEpcTranslation();
  const createMutation = useCreateFieldMovementLog();
  const submitMutation = useSubmitFieldMovementLog();
  const cancelMutation = useCancelFieldMovementLog();

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

  const [step, setStep] = useState(0);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [entryDrafts, setEntryDrafts] = useState<Record<string, EntryDraft>>({});
  const [overallNotes, setOverallNotes] = useState('');
  const [submittedNumber, setSubmittedNumber] = useState<string | null>(null);
  const [bulkSelection, setBulkSelection] = useState<FieldMovementSelection>({
    reasonType: null,
    forgotDirection: null,
  });
  const [bulkValues, setBulkValues] = useState<FieldMovementFieldValues>(
    emptyFieldValues(),
  );

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

  const selectedDayEntries = useMemo(
    () => selectedDays.map((day) => toDayEntry({ ...day, alreadySubmitted: false })),
    [selectedDays],
  );

  const filledCount = selectedDays.filter((day) =>
    draftIsComplete(day, entryDrafts[day.id]),
  ).length;

  const allSelected =
    selectableDays.length > 0 &&
    selectableDays.every((day) => selectedIds.includes(day.id));
  const someSelected =
    selectableDays.some((day) => selectedIds.includes(day.id)) && !allSelected;

  const bulkAvailableReasonTypes = useMemo(
    () => getValidBulkReasons(selectedDayEntries),
    [selectedDayEntries],
  );

  const bulkAvailableForgotDirections = useMemo(
    () => getValidBulkForgotDirections(selectedDayEntries),
    [selectedDayEntries],
  );

  const canApplyBulk = useMemo((): boolean => {
    if (!bulkSelection.reasonType || selectedDays.length === 0) {
      return false;
    }
    return (
      validateFieldMovementValues(bulkSelection, bulkValues, {
        requireDate: false,
      }).length === 0
    );
  }, [bulkSelection, bulkValues, selectedDays.length]);

  const reviewGroups = useMemo(() => {
    return groupBy(
      selectedDays.filter((day) => entryDrafts[day.id]?.selection.reasonType),
      (day) => {
        const draft = entryDrafts[day.id]!;
        return `${draft.selection.reasonType}||${draft.selection.forgotDirection ?? ''}||${draft.values.location?.trim() || ''}`;
      },
    );
  }, [selectedDays, entryDrafts]);

  function clearBulkFields(): void {
    setBulkSelection({ reasonType: null, forgotDirection: null });
    setBulkValues(emptyFieldValues());
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
      [dayId]: {
        selection: patch.selection ??
          prev[dayId]?.selection ?? { reasonType: null, forgotDirection: null },
        values: patch.values ?? prev[dayId]?.values ?? emptyFieldValues(),
      },
    }));
  }

  function handleSelectAll(checked: boolean): void {
    setSelectedIds(checked ? selectableDays.map((day) => day.id) : []);
  }

  function handleApplyBulk(): void {
    if (!bulkSelection.reasonType || !canApplyBulk) {
      return;
    }

    setEntryDrafts((prev) => {
      const next = { ...prev };
      for (const day of selectedDays) {
        const entry = toDayEntry(day);
        if (!canApplySelectionToDay(entry, bulkSelection)) {
          continue;
        }
        next[day.id] = {
          selection: { ...bulkSelection },
          values: { ...bulkValues },
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
      const errors = validationErrorsForDay(dayEntryFromFlagged(day, draft));
      const first = Object.values(errors)[0];
      if (first) {
        return `${first} (${formatFlaggedDate(day.date)})`;
      }
    }
    return null;
  }

  function buildEntries(): CreateFieldMovementEntryDto[] {
    const entries: CreateFieldMovementEntryDto[] = [];
    for (const day of selectedDays) {
      const draft = entryDrafts[day.id]!;
      const payloads = toStorageEntries(draft.selection, draft.values);
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
    return entries;
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

  const totalStorageEntries = selectedDays.reduce((sum, day) => {
    const draft = entryDrafts[day.id];
    if (!draft?.selection.reasonType) {
      return sum;
    }
    return sum + countStorageEntries(draft.selection);
  }, 0);

  return (
    <Modal
      open={open}
      onCancel={handleClose}
      title={`Field Movement / Early Departure - ${monthName} ${year}`}
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
              className={`flex cursor-pointer items-start gap-3 rounded-lg border px-3 py-2 ${
                day.alreadySubmitted
                  ? 'border-[#E5E7EB] bg-[#F8FAFC] opacity-70'
                  : 'border-[#E5E7EB] bg-white'
              }`}
            >
              <Checkbox
                checked={selectedIds.includes(day.id)}
                disabled={day.alreadySubmitted}
                onChange={(event) => {
                  if (event.target.checked) {
                    setSelectedIds((prev) => [...prev, day.id]);
                  } else {
                    setSelectedIds((prev) => prev.filter((id) => id !== day.id));
                  }
                }}
              />
              <div className="flex-1">
                <div className="text-sm font-semibold text-[#1A1A1A]">
                  {formatFlaggedDate(day.date)}
                </div>
                <Tag className="!mt-1">{FLAG_LABELS[day.flag]}</Tag>
                {day.submittedLog ? (
                  <div
                    className={`mt-1 text-xs ${
                      day.submittedLog.status === 'DRAFT'
                        ? 'text-[#b45309]'
                        : 'text-[#1d9e75]'
                    }`}
                  >
                    {day.submittedLog.status === 'DRAFT'
                      ? `Unsubmitted draft ${day.submittedLog.requestNumber} - not in Approvals yet`
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
            <div className="rounded-lg border border-[#E5E7EB] bg-[#F8FAFC] p-3 fm-stack">
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

              <FieldMovementEntryFields
                idPrefix="profile-fm-bulk"
                hideDate
                availableReasonTypes={bulkAvailableReasonTypes}
                availableForgotDirections={bulkAvailableForgotDirections}
                selection={bulkSelection}
                values={bulkValues}
                labels={fieldLabels}
                reasonTypeLabels={reasonTypeLabels}
                forgotDirectionLabels={forgotDirectionLabels}
                optionalSuffix={optionalSuffix}
                reasonTypeLegend={t(`${fmPrefix}.reasonTypeLegend`)}
                forgotDirectionLegend={t(`${fmPrefix}.forgotDirectionLegend`)}
                onSelectionChange={setBulkSelection}
                onValuesChange={setBulkValues}
              />

              <Button type="primary" disabled={!canApplyBulk} onClick={handleApplyBulk}>
                Apply to {selectedDays.length} day(s)
              </Button>
            </div>
          ) : null}

          {selectedDays.map((day) => {
            const draft = entryDrafts[day.id] ?? {
              selection: { reasonType: null, forgotDirection: null },
              values: emptyFieldValues(),
            };
            const entry = toDayEntry(day);
            const complete = draftIsComplete(day, draft);

            return (
              <div
                key={day.id}
                className="rounded-lg border border-[#E5E7EB] p-3 fm-stack"
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
                <FieldMovementEntryFields
                  idPrefix={`profile-fm-day-${day.id}`}
                  hideDate
                  availableReasonTypes={availableReasonTypesForDay(entry)}
                  availableForgotDirections={availableForgotDirectionsForDay(entry)}
                  selection={draft.selection}
                  values={draft.values}
                  labels={fieldLabels}
                  reasonTypeLabels={reasonTypeLabels}
                  forgotDirectionLabels={forgotDirectionLabels}
                  optionalSuffix={optionalSuffix}
                  reasonTypeLegend={t(`${fmPrefix}.reasonTypeLegendDay`)}
                  forgotDirectionLegend={t(`${fmPrefix}.forgotDirectionLegend`)}
                  onSelectionChange={(selection) =>
                    updateDraft(day.id, {
                      selection,
                      values: clearHiddenFieldValues(selection, draft.values),
                    })
                  }
                  onValuesChange={(values) => updateDraft(day.id, { values })}
                />
              </div>
            );
          })}
        </div>
      ) : null}

      {step === 2 ? (
        <div className="flex flex-col gap-3">
          <Typography.Paragraph type="secondary" className="!mb-1">
            {t(`${fmPrefix}.entriesWillBeCreated`, { count: totalStorageEntries })}
          </Typography.Paragraph>
          <div className="flex flex-col gap-2">
            {Object.entries(reviewGroups).map(([key, days]) => {
              const [reasonKey, forgotDir, location] = key.split('||');
              const reasonType = reasonKey as FieldMovementReasonType;
              const titleParts = [reasonTypeLabels[reasonType]];
              if (reasonType === 'FORGOT' && forgotDir) {
                titleParts.push(
                  forgotDirectionLabels[forgotDir as keyof typeof forgotDirectionLabels],
                );
              }
              if (location) {
                titleParts.push(location);
              }
              return (
                <div
                  key={key}
                  className="rounded-lg border border-[#E5E7EB] px-3 py-2"
                >
                  <div className="mb-1 flex flex-wrap items-center gap-2">
                    <span className="text-sm font-semibold text-[#1A1A1A]">
                      {titleParts.join(' - ')}
                    </span>
                    <Tag>{days.length} day(s)</Tag>
                  </div>
                  <p className="m-0 text-xs text-[#64748b]">
                    {formatDateList(days.map((d) => d.date))}
                  </p>
                </div>
              );
            })}
          </div>
          <div>
            <div className="mb-1 text-xs font-medium text-[#6B7280]">
              Overall notes {optionalSuffix}
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
