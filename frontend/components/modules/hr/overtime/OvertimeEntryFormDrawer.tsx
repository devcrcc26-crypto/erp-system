'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Button, Drawer, Form, Typography } from 'antd';
import dayjs, { type Dayjs } from 'dayjs';
import OvertimeEntryForm, {
  type OvertimeEntryFormValues,
} from '@/components/modules/hr/overtime/OvertimeEntryForm';
import { useAppMessage } from '@/hooks/use-app-message';
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
  usePreviewOvertimeEntry,
  useSelectableOvertimeWindows,
  useUpdateOvertimeEntry,
} from '@/lib/query/overtime';
import { detailDrawerStyles } from '@/lib/theme/layout';
import { notifyApiError } from '@/lib/utils/notify-api-error';

const PREVIEW_DEBOUNCE_MS = 300;

/**
 * Drawer to add or edit an overtime sheet entry without shifting page layout.
 */
export default function OvertimeEntryFormDrawer({
  open,
  sheetId,
  sheetMonth,
  sheetYear,
  employeeId,
  editingEntry,
  sheetEntries,
  onClose,
}: {
  open: boolean;
  sheetId: string;
  sheetMonth: number;
  sheetYear: number;
  employeeId: string;
  editingEntry: OvertimeEntry | null;
  sheetEntries?: OvertimeEntry[];
  onClose: () => void;
}): React.ReactNode {
  const { t } = useEpcTranslation();
  const messageApi = useAppMessage();
  const [form] = Form.useForm<OvertimeEntryFormValues>();
  const addMutation = useAddOvertimeEntry(sheetId);
  const updateMutation = useUpdateOvertimeEntry(sheetId);
  const previewMutation = usePreviewOvertimeEntry();
  const windowsMutation = useSelectableOvertimeWindows();
  const saving = addMutation.isPending || updateMutation.isPending;
  const [preview, setPreview] = useState<PreviewOvertimeEntryResult | null>(
    null,
  );
  const [windows, setWindows] =
    useState<SelectableOvertimeWindowsResult | null>(null);

  const periodLabel = useMemo(() => {
    const monthName = t(`hr.months.${sheetMonth}`);
    return `${monthName} ${sheetYear}`;
  }, [sheetMonth, sheetYear, t]);

  const disabledDate = useCallback(
    (current: Dayjs | null): boolean => {
      if (!current) {
        return false;
      }
      return (
        current.isAfter(dayjs().endOf('day')) ||
        current.month() + 1 !== sheetMonth ||
        current.year() !== sheetYear
      );
    },
    [sheetMonth, sheetYear],
  );

  const watchedDate = Form.useWatch('date', form);
  const watchedStart = Form.useWatch('startTime', form);
  const watchedEnd = Form.useWatch('endTime', form);

  useEffect(() => {
    if (!open) {
      return;
    }
    if (editingEntry) {
      form.setFieldsValue({
        date: dayjs(editingEntry.date),
        startTime: editingEntry.startTime,
        endTime: editingEntry.endTime,
        taskDescription: editingEntry.taskDescription,
      });
    } else {
      form.resetFields();
      setPreview(null);
      setWindows(null);
    }
  }, [open, editingEntry, form, sheetMonth, sheetYear]);

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
          excludeEntryId: editingEntry?.id,
        })
        .then((result) => {
          setWindows(result);
          const start = form.getFieldValue('startTime') as string | undefined;
          const end = form.getFieldValue('endTime') as string | undefined;
          const toMin = (v: string): number =>
            v === '24:00' ? 1440 : Number(v.slice(0, 2)) * 60 + Number(v.slice(3));
          const startValid =
            !start ||
            result.windows.some((w) => {
              const s = toMin(start);
              return s >= toMin(w.start) && s < toMin(w.end);
            });
          const endValid =
            !end ||
            !start ||
            result.windows.some((w) => {
              const s = toMin(start);
              const e = toMin(end);
              return s >= toMin(w.start) && e <= toMin(w.end) && e > s;
            });
          if (start && !startValid) {
            form.setFieldsValue({ startTime: undefined, endTime: undefined });
          } else if (end && (!endValid || (start && toMin(end) <= toMin(start)))) {
            form.setFieldValue('endTime', undefined);
          }
        })
        .catch(() => {
          setWindows(null);
        });
    }, PREVIEW_DEBOUNCE_MS);

    return () => {
      window.clearTimeout(handle);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, employeeId, watchedDate, sheetId, editingEntry?.id]);

  useEffect(() => {
    if (!open || !employeeId || !watchedDate || !watchedStart || !watchedEnd) {
      return;
    }

    const handle = window.setTimeout(() => {
      void previewMutation
        .mutateAsync({
          employeeId,
          date: watchedDate.format('YYYY-MM-DD'),
          startTime: watchedStart,
          endTime: watchedEnd,
        })
        .then((result) => {
          setPreview(result);
        })
        .catch(() => {
          setPreview(null);
        });
    }, PREVIEW_DEBOUNCE_MS);

    return () => {
      window.clearTimeout(handle);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, employeeId, watchedDate, watchedStart, watchedEnd]);

  async function handleSubmit(values: OvertimeEntryFormValues): Promise<void> {
    const payload: UpsertOvertimeEntryPayload = {
      date: values.date.format('YYYY-MM-DD'),
      startTime: values.startTime,
      endTime: values.endTime,
      taskDescription: values.taskDescription.trim(),
    };

    try {
      if (editingEntry) {
        const result = (await updateMutation.mutateAsync({
          entryId: editingEntry.id,
          payload,
        })) as OvertimeSheetDetail;
        messageApi.success(
          result.restartedApproval
            ? t('hr.messages.overtimeEntryResubmitted')
            : t('hr.messages.overtimeEntryUpdated'),
        );
      } else {
        const result = (await addMutation.mutateAsync(
          payload,
        )) as OvertimeSheetDetail;
        messageApi.success(
          result.restartedApproval
            ? t('hr.messages.overtimeEntryResubmitted')
            : t('hr.messages.overtimeEntryAdded'),
        );
      }
      onClose();
    } catch (error: unknown) {
      notifyApiError(error, t('hr.messages.failedToSaveOvertimeEntry'), messageApi);
    }
  }

  function handleAddNextDay(nextDate: Dayjs): void {
    if (
      nextDate.month() + 1 !== sheetMonth ||
      nextDate.year() !== sheetYear ||
      nextDate.isAfter(dayjs().endOf('day'))
    ) {
      messageApi.warning(t('hr.messages.nextDayOutsideSheet'));
      return;
    }
    form.setFieldsValue({
      date: nextDate,
      startTime: '00:00',
      endTime: undefined,
    });
    setPreview(null);
  }

  const title = editingEntry
    ? t('hr.form.editEntry')
    : t('hr.buttons.addEntry');

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
            disabled={windows?.blockedReason === 'FULL_DAY_LEAVE'}
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
        excludeEntryId={editingEntry?.id}
        onFinish={handleSubmit}
        onAddNextDay={handleAddNextDay}
      />
    </Drawer>
  );
}
