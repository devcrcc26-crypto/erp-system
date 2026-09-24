'use client';

import { useMemo, useState } from 'react';
import {
  Button,
  Checkbox,
  Input,
  Modal,
  Select,
  Space,
  Steps,
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
  useCreateFieldMovementLog,
  useSubmitFieldMovementLog,
} from '@/lib/query/attendance';
import { notifyApiError } from '@/lib/utils/notify-api-error';

const REASON_OPTIONS: Record<
  AttendanceDayFlag,
  Array<{ value: FieldMovementReason; label: string }>
> = {
  MISSING_CLOCK_IN: [
    { value: 'FIELD_VISIT', label: 'I was on a field / site visit' },
    { value: 'FORGOT_CLOCK_IN', label: 'I forgot to clock in' },
  ],
  MISSING_CLOCK_OUT: [
    { value: 'FIELD_VISIT', label: 'I left for a field / site visit' },
    { value: 'EARLY_LEAVE', label: 'I left early' },
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
  FORGOT_CLOCK_IN: 'Forgot to clock in',
  FORGOT_CLOCK_OUT: 'Forgot to clock out',
};

interface EntryDraft {
  reason?: FieldMovementReason;
  destination?: string;
  departureTime?: string;
  returnTime?: string;
  notes?: string;
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

  const [step, setStep] = useState(0);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [entryDrafts, setEntryDrafts] = useState<Record<string, EntryDraft>>({});
  const [overallNotes, setOverallNotes] = useState('');
  const [submittedNumber, setSubmittedNumber] = useState<string | null>(null);

  const selectedDays = useMemo(
    () => flaggedDays.filter((day) => selectedIds.includes(day.id)),
    [flaggedDays, selectedIds],
  );

  function resetForm(): void {
    setStep(0);
    setSelectedIds([]);
    setEntryDrafts({});
    setOverallNotes('');
    setSubmittedNumber(null);
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

  function validateStep2(): string | null {
    for (const day of selectedDays) {
      const draft = entryDrafts[day.id];
      if (!draft?.reason) {
        return `Select a reason for ${formatFlaggedDate(day.date)}`;
      }
      if (draft.reason === 'FIELD_VISIT' && !draft.destination?.trim()) {
        return `Destination is required for ${formatFlaggedDate(day.date)}`;
      }
      if (draft.reason === 'EARLY_LEAVE' && !draft.departureTime) {
        return `Departure time is required for ${formatFlaggedDate(day.date)}`;
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
      return {
        dailyLogId: day.id,
        reason: draft.reason!,
        destination: draft.destination?.trim() || undefined,
        departureTime: draft.departureTime || undefined,
        returnTime: draft.returnTime || undefined,
        notes: draft.notes?.trim() || undefined,
      };
    });
  }

  function summarizeEntry(day: FlaggedDay): string {
    const draft = entryDrafts[day.id];
    if (!draft?.reason) {
      return formatFlaggedDate(day.date);
    }
    const parts = [
      formatFlaggedDate(day.date).split(',')[0] ?? formatFlaggedDate(day.date),
      REASON_SUMMARY[draft.reason],
    ];
    if (draft.reason === 'FIELD_VISIT' && draft.destination) {
      parts.push(`to ${draft.destination}`);
    }
    if (draft.departureTime) {
      parts.push(`departed ${draft.departureTime}`);
    }
    if (draft.returnTime) {
      parts.push(`returned ${draft.returnTime}`);
    } else if (draft.reason === 'FIELD_VISIT' && draft.departureTime) {
      parts.push('did not return to office');
    }
    return parts.join(' — ');
  }

  async function handleSubmit(): Promise<void> {
    const validationError = validateStep2();
    if (validationError) {
      messageApi.warning(validationError);
      setStep(1);
      return;
    }

    try {
      const created = await createMutation.mutateAsync({
        entries: buildEntries(),
        notes: overallNotes.trim() || undefined,
      });
      const submitted = await submitMutation.mutateAsync(created.id);
      setSubmittedNumber(submitted.requestNumber);
      setStep(3);
      onSuccess();
    } catch (error) {
      notifyApiError(error, 'Failed to submit field movement log', messageApi);
    }
  }

  const busy = createMutation.isPending || submitMutation.isPending;
  const monthName = new Date(year, month - 1, 1).toLocaleString('en', {
    month: 'long',
  });

  return (
    <Modal
      open={open}
      onCancel={handleClose}
      title={`Field Movement / Early Departure — ${monthName} ${year}`}
      width={720}
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
                disabled={step === 0 && selectedIds.length === 0}
                onClick={() => {
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
              <Button type="primary" loading={busy} onClick={() => void handleSubmit()}>
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
        <div className="flex flex-col gap-2">
          <Typography.Paragraph type="secondary" className="!mb-2">
            Select the flagged days you want to explain.
          </Typography.Paragraph>
          {flaggedDays.map((day) => (
            <label
              key={day.id}
              className="flex cursor-pointer items-start gap-3 rounded-lg border border-[#E5E7EB] px-3 py-2 hover:border-[#F47B20]"
            >
              <Checkbox
                checked={selectedIds.includes(day.id)}
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
                  <div className="mt-1 text-xs text-[#1d9e75]">
                    Already submitted: {day.submittedLog.requestNumber} ✓
                  </div>
                ) : null}
              </div>
            </label>
          ))}
        </div>
      ) : null}

      {step === 1 ? (
        <div className="flex max-h-[420px] flex-col gap-4 overflow-y-auto pr-1">
          {selectedDays.map((day) => {
            const draft = entryDrafts[day.id] ?? {};
            const reasonOptions =
              day.availableReasons.length > 0
                ? REASON_OPTIONS[day.flag].filter((option) =>
                    day.availableReasons.includes(option.value),
                  )
                : REASON_OPTIONS[day.flag];

            return (
              <div
                key={day.id}
                className="rounded-lg border border-[#E5E7EB] p-3"
              >
                <div className="mb-3 text-sm font-semibold text-[#1A1A1A]">
                  {formatFlaggedDate(day.date)} — {FLAG_LABELS[day.flag]}
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
                          returnTime:
                            value === 'FIELD_VISIT'
                              ? draft.returnTime
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
                            Return time (optional)
                          </div>
                          <TimePicker
                            className="w-full"
                            format="HH:mm"
                            placeholder="Did you return?"
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
                      </div>
                    </>
                  ) : null}

                  {draft.reason === 'EARLY_LEAVE' ? (
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
                  ) : null}

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
                </div>
              </div>
            );
          })}
        </div>
      ) : null}

      {step === 2 ? (
        <div className="flex flex-col gap-3">
          <Typography.Paragraph type="secondary" className="!mb-1">
            Review your explanations before submitting.
          </Typography.Paragraph>
          <ul className="m-0 list-disc space-y-2 pl-5 text-sm text-[#1A1A1A]">
            {selectedDays.map((day) => (
              <li key={day.id}>{summarizeEntry(day)}</li>
            ))}
          </ul>
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
