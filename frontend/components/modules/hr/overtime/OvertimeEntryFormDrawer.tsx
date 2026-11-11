'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Button, Drawer, Form, Typography } from 'antd';
import dayjs, { type Dayjs } from 'dayjs';
import OvertimeEntryForm, {
  preferredOvertimeStart,
  type OvertimeEntryFormValues,
} from '@/components/modules/hr/overtime/OvertimeEntryForm';
import {
  completeOvertimePeriods,
  overtimePeriodsOverlap,
  parseHhMmToMinutes,
} from '@/components/modules/hr/overtime/overtime-time-periods';
import { useAppMessage } from '@/hooks/use-app-message';
import { useCanViewHr } from '@/hooks/use-auth-capabilities';
import { useEpcTranslation } from '@/hooks/use-epc-translation';
import type {
  OvertimeEntry,
  OvertimeSheetDetail,
  PreviewOvertimeEntryResult,
  SelectableOvertimeWindowsResult,
  UpsertOvertimeEntryPayload,
} from '@/lib/api/overtime.types';
import {
  useAddOvertimeEntry,
  useDeleteOvertimeEntry,
  usePreviewOvertimeEntry,
  useSelectableOvertimeWindows,
  useUpdateOvertimeEntry,
} from '@/lib/query/overtime';
import { detailDrawerStyles } from '@/lib/theme/layout';
import { notifyApiError } from '@/lib/utils/notify-api-error';

const PREVIEW_DEBOUNCE_MS = 300;

function emptyPeriod(
  startTime?: string,
  taskDescription?: string,
): OvertimeEntryFormValues['periods'][number] {
  return { startTime, endTime: undefined, taskDescription };
}

function sortEntriesByStart(entries: OvertimeEntry[]): OvertimeEntry[] {
  return [...entries].sort(
    (a, b) =>
      parseHhMmToMinutes(a.startTime) - parseHhMmToMinutes(b.startTime) ||
      a.id.localeCompare(b.id),
  );
}

function sumPreviews(
  rows: PreviewOvertimeEntryResult[],
): PreviewOvertimeEntryResult | null {
  if (rows.length === 0) {
    return null;
  }
  const first = rows[0]!;
  return {
    ...first,
    isWeekend: rows.some((r) => r.isWeekend),
    isHalfDay: rows.some((r) => r.isHalfDay),
    regularHours: rows.reduce((s, r) => s + Number(r.regularHours), 0),
    nightHours: rows.reduce((s, r) => s + Number(r.nightHours), 0),
    weekendHours: rows.reduce((s, r) => s + Number(r.weekendHours), 0),
    holidayHours: rows.reduce((s, r) => s + Number(r.holidayHours), 0),
    totalHours: rows.reduce((s, r) => s + Number(r.totalHours), 0),
    siteWithinScheduleHours: rows.reduce(
      (s, r) => s + Number(r.siteWithinScheduleHours ?? 0),
      0,
    ),
    attendanceWarning:
      rows.map((r) => r.attendanceWarning).find(Boolean) ?? null,
    scheduleNote: first.scheduleNote,
    siteName: first.siteName,
    holidayName: first.holidayName,
  };
}

/**
 * Drawer to add or edit an overtime sheet entry without shifting page layout.
 * Edit mode loads every same-day period and saves them as one day group.
 */
export default function OvertimeEntryFormDrawer({
  open,
  sheetId,
  sheetMonth,
  sheetYear,
  employeeId,
  editingEntries,
  sheetEntries,
  onClose,
}: {
  open: boolean;
  sheetId: string;
  sheetMonth: number;
  sheetYear: number;
  employeeId: string;
  editingEntries: OvertimeEntry[];
  sheetEntries?: OvertimeEntry[];
  onClose: () => void;
}): React.ReactNode {
  const { t } = useEpcTranslation();
  const messageApi = useAppMessage();
  const canViewHr = useCanViewHr();
  const [form] = Form.useForm<OvertimeEntryFormValues>();
  const addMutation = useAddOvertimeEntry(sheetId);
  const updateMutation = useUpdateOvertimeEntry(sheetId);
  const deleteMutation = useDeleteOvertimeEntry(sheetId);
  const previewMutation = usePreviewOvertimeEntry();
  const windowsMutation = useSelectableOvertimeWindows();
  const saving =
    addMutation.isPending ||
    updateMutation.isPending ||
    deleteMutation.isPending;
  const [preview, setPreview] = useState<PreviewOvertimeEntryResult | null>(
    null,
  );
  const [windows, setWindows] =
    useState<SelectableOvertimeWindowsResult | null>(null);

  const isEditing = editingEntries.length > 0;
  const editingEntryIds = useMemo(
    () => editingEntries.map((entry) => entry.id),
    [editingEntries],
  );
  const editingEntryIdsKey = editingEntryIds.join(',');

  const periodLabel = useMemo(() => {
    const monthName = t(`hr.months.${sheetMonth}`);
    return `${monthName} ${sheetYear}`;
  }, [sheetMonth, sheetYear, t]);

  const disabledDate = useCallback(
    (current: Dayjs | null): boolean => {
      if (!current) {
        return false;
      }
      const outsideSheetMonth =
        current.month() + 1 !== sheetMonth || current.year() !== sheetYear;
      if (outsideSheetMonth) {
        return true;
      }
      // Employees: today and past only. HR may enter future dates in the sheet month.
      if (canViewHr) {
        return false;
      }
      return current.isAfter(dayjs().endOf('day'));
    },
    [canViewHr, sheetMonth, sheetYear],
  );

  const watchedDate = Form.useWatch('date', form);
  const watchedPeriods = Form.useWatch('periods', form);

  useEffect(() => {
    if (!open) {
      return;
    }
    if (isEditing) {
      const sorted = sortEntriesByStart(editingEntries);
      form.setFieldsValue({
        date: dayjs(sorted[0]!.date),
        periods: sorted.map((entry) => ({
          startTime: entry.startTime,
          endTime: entry.endTime,
          taskDescription: entry.taskDescription,
        })),
      });
    } else {
      form.resetFields();
      form.setFieldsValue({
        periods: [emptyPeriod()],
      });
      setPreview(null);
      setWindows(null);
    }
  }, [open, isEditing, editingEntryIdsKey, form, sheetMonth, sheetYear]);

  useEffect(() => {
    if (!open || !employeeId || !watchedDate) {
      return;
    }

    const handle = window.setTimeout(() => {
      void windowsMutation
        .mutateAsync({
          employeeId,
          date: watchedDate.format('YYYY-MM-DD'),
          sheetId,
          excludeEntryIds: isEditing ? editingEntryIds : undefined,
        })
        .then((result) => {
          setWindows(result);
          const periods =
            (form.getFieldValue('periods') as
              | OvertimeEntryFormValues['periods']
              | undefined) ?? [];
          const preferred = preferredOvertimeStart(result.windows);

          if (!isEditing && periods.length === 1 && !periods[0]?.startTime) {
            form.setFieldsValue({
              periods: [
                emptyPeriod(preferred, periods[0]?.taskDescription),
              ],
            });
            return;
          }

          const toMin = (v: string): number =>
            v === '24:00'
              ? 1440
              : Number(v.slice(0, 2)) * 60 + Number(v.slice(3));
          const endMin = (start: string, end: string): number => {
            if (end === '24:00') {
              return 1440;
            }
            if (end === '00:00' && toMin(start) > 0) {
              return 1440;
            }
            return toMin(end);
          };

          const nextPeriods = periods.map((row) => {
            if (!row.startTime) {
              return row;
            }
            const startValid = result.windows.some((w) => {
              const s = toMin(row.startTime!);
              return s >= toMin(w.start) && s < toMin(w.end);
            });
            if (!startValid) {
              return emptyPeriod(preferred, row.taskDescription);
            }
            if (!row.endTime) {
              return row;
            }
            const endValid = result.windows.some((w) => {
              const s = toMin(row.startTime!);
              const e = endMin(row.startTime!, row.endTime!);
              return s >= toMin(w.start) && e <= toMin(w.end) && e > s;
            });
            if (!endValid) {
              return {
                startTime: row.startTime,
                endTime: undefined,
                taskDescription: row.taskDescription,
              };
            }
            return row;
          });
          form.setFieldValue('periods', nextPeriods);
        })
        .catch(() => {
          setWindows(null);
        });
    }, PREVIEW_DEBOUNCE_MS);

    return () => {
      window.clearTimeout(handle);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, employeeId, watchedDate, sheetId, editingEntryIdsKey, isEditing]);

  useEffect(() => {
    if (!open || !employeeId || !watchedDate || !watchedPeriods?.length) {
      return;
    }
    const complete = completeOvertimePeriods(watchedPeriods);
    if (complete.length === 0 || overtimePeriodsOverlap(watchedPeriods)) {
      setPreview(null);
      return;
    }

    const handle = window.setTimeout(() => {
      void Promise.all(
        complete.map((period) =>
          previewMutation.mutateAsync({
            employeeId,
            date: watchedDate.format('YYYY-MM-DD'),
            startTime: period.startTime,
            endTime: period.endTime,
          }),
        ),
      )
        .then((rows) => {
          setPreview(sumPreviews(rows));
        })
        .catch(() => {
          setPreview(null);
        });
    }, PREVIEW_DEBOUNCE_MS);

    return () => {
      window.clearTimeout(handle);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, employeeId, watchedDate, watchedPeriods]);

  async function handleSubmit(values: OvertimeEntryFormValues): Promise<void> {
    const periods = completeOvertimePeriods(values.periods);
    if (periods.length === 0) {
      messageApi.error(t('hr.validation.overtimePeriodRequired'));
      return;
    }
    if (overtimePeriodsOverlap(values.periods)) {
      messageApi.error(t('hr.validation.overtimePeriodsOverlap'));
      return;
    }
    if (periods.some((period) => !period.taskDescription)) {
      messageApi.error(t('hr.validation.taskDescriptionRequired'));
      return;
    }

    const date = values.date.format('YYYY-MM-DD');

    try {
      let restarted = false;

      if (isEditing) {
        const existing = sortEntriesByStart(editingEntries);

        // Single existing entry: update in place (keeps attachments), then add extras.
        if (existing.length === 1) {
          const first = periods[0]!;
          const result = (await updateMutation.mutateAsync({
            entryId: existing[0]!.id,
            payload: {
              date,
              startTime: first.startTime,
              endTime: first.endTime,
              taskDescription: first.taskDescription,
            },
          })) as OvertimeSheetDetail;
          if (result.restartedApproval) {
            restarted = true;
          }
          for (let i = 1; i < periods.length; i += 1) {
            const period = periods[i]!;
            const added = (await addMutation.mutateAsync({
              date,
              startTime: period.startTime,
              endTime: period.endTime,
              taskDescription: period.taskDescription,
            })) as OvertimeSheetDetail;
            if (added.restartedApproval) {
              restarted = true;
            }
          }
          messageApi.success(
            restarted
              ? t('hr.messages.overtimeEntryResubmitted')
              : t('hr.messages.overtimeEntryUpdated'),
          );
          onClose();
          return;
        }

        // Multi-period day: replace the whole day to avoid mid-update overlaps.
        for (const entry of existing) {
          const result = (await deleteMutation.mutateAsync(
            entry.id,
          )) as OvertimeSheetDetail;
          if (result.restartedApproval) {
            restarted = true;
          }
        }
        for (const period of periods) {
          const result = (await addMutation.mutateAsync({
            date,
            startTime: period.startTime,
            endTime: period.endTime,
            taskDescription: period.taskDescription,
          })) as OvertimeSheetDetail;
          if (result.restartedApproval) {
            restarted = true;
          }
        }

        messageApi.success(
          restarted
            ? t('hr.messages.overtimeEntryResubmitted')
            : t('hr.messages.overtimeEntryUpdated'),
        );
        onClose();
        return;
      }

      for (const period of periods) {
        const result = (await addMutation.mutateAsync({
          date,
          startTime: period.startTime,
          endTime: period.endTime,
          taskDescription: period.taskDescription,
        })) as OvertimeSheetDetail;
        if (result.restartedApproval) {
          restarted = true;
        }
      }
      messageApi.success(
        restarted
          ? t('hr.messages.overtimeEntryResubmitted')
          : periods.length > 1
            ? t('hr.messages.overtimePeriodsAdded', { count: periods.length })
            : t('hr.messages.overtimeEntryAdded'),
      );
      onClose();
    } catch (error: unknown) {
      notifyApiError(
        error,
        t('hr.messages.failedToSaveOvertimeEntry'),
        messageApi,
      );
    }
  }

  const title = isEditing
    ? t('hr.form.editEntry')
    : t('hr.buttons.addEntry');
  const leaveBlocked = windows?.blockedReason === 'FULL_DAY_LEAVE';

  return (
    <Drawer
      open={open}
      title={
        <div className="min-w-0 py-1">
          <div className="text-[15px] font-semibold leading-snug text-[var(--color-text-primary)]">
            {title}
          </div>
          <div className="mt-0.5 text-[12px] font-normal text-[var(--color-text-secondary)]">
            {periodLabel}
          </div>
        </div>
      }
      size={520}
      className="erp-responsive-drawer erp-overtime-entry-drawer"
      styles={detailDrawerStyles}
      onClose={onClose}
      destroyOnHidden
      footer={
        <div className="flex justify-end gap-2">
          <Button onClick={onClose} disabled={saving}>
            {t('hr.buttons.cancel')}
          </Button>
          <Button
            type="primary"
            loading={saving}
            onClick={() => form.submit()}
            disabled={leaveBlocked}
          >
            {t('hr.buttons.save')}
          </Button>
        </div>
      }
    >
      <Typography.Paragraph
        type="secondary"
        style={{ marginTop: 0, marginBottom: 16, fontSize: 13 }}
      >
        {t('hr.labels.overtimeEntryHint', { period: periodLabel })}
      </Typography.Paragraph>

      <OvertimeEntryForm
        form={form}
        disabledDate={disabledDate}
        preview={preview}
        previewLoading={previewMutation.isPending}
        periodLabel={periodLabel}
        windows={windows}
        windowsLoading={windowsMutation.isPending}
        employeeId={employeeId}
        sheetEntries={sheetEntries}
        excludeEntryIds={isEditing ? editingEntryIds : undefined}
        allowMultiplePeriods
        onFinish={(values) => void handleSubmit(values)}
      />
    </Drawer>
  );
}
