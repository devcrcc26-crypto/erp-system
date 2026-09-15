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
  PreviewOvertimeEntryResult,
  UpsertOvertimeEntryPayload,
} from '@/lib/api/overtime.types';
import {
  useAddOvertimeEntry,
  usePreviewOvertimeEntry,
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
  onClose,
}: {
  open: boolean;
  sheetId: string;
  sheetMonth: number;
  sheetYear: number;
  employeeId: string;
  editingEntry: OvertimeEntry | null;
  onClose: () => void;
}): React.ReactNode {
  const { t } = useEpcTranslation();
  const messageApi = useAppMessage();
  const [form] = Form.useForm<OvertimeEntryFormValues>();
  const addMutation = useAddOvertimeEntry(sheetId);
  const updateMutation = useUpdateOvertimeEntry(sheetId);
  const previewMutation = usePreviewOvertimeEntry();
  const saving = addMutation.isPending || updateMutation.isPending;
  const [preview, setPreview] = useState<PreviewOvertimeEntryResult | null>(
    null,
  );

  const periodLabel = useMemo(() => {
    const monthName = t(`hr.months.${sheetMonth}`);
    return `${monthName} ${sheetYear}`;
  }, [sheetMonth, sheetYear, t]);

  const disabledDate = useCallback(
    (current: Dayjs | null): boolean => {
      if (!current) {
        return false;
      }
      return current.month() + 1 !== sheetMonth || current.year() !== sheetYear;
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
        startTime: dayjs(editingEntry.startTime, 'HH:mm'),
        endTime: dayjs(editingEntry.endTime, 'HH:mm'),
        taskDescription: editingEntry.taskDescription,
      });
    } else {
      form.resetFields();
      form.setFieldsValue({
        date: dayjs(
          `${sheetYear}-${String(sheetMonth).padStart(2, '0')}-01`,
        ),
      });
      setPreview(null);
    }
  }, [open, editingEntry, form, sheetMonth, sheetYear]);

  useEffect(() => {
    if (!open || !employeeId || !watchedDate || !watchedStart || !watchedEnd) {
      return;
    }

    const handle = window.setTimeout(() => {
      void previewMutation
        .mutateAsync({
          employeeId,
          date: watchedDate.format('YYYY-MM-DD'),
          startTime: watchedStart.format('HH:mm'),
          endTime: watchedEnd.format('HH:mm'),
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
    // previewMutation identity is unstable; depend on the watched fields only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, employeeId, watchedDate, watchedStart, watchedEnd]);

  async function handleSubmit(values: OvertimeEntryFormValues): Promise<void> {
    const payload: UpsertOvertimeEntryPayload = {
      date: values.date.format('YYYY-MM-DD'),
      startTime: values.startTime.format('HH:mm'),
      endTime: values.endTime.format('HH:mm'),
      taskDescription: values.taskDescription.trim(),
    };

    try {
      if (editingEntry) {
        await updateMutation.mutateAsync({
          entryId: editingEntry.id,
          payload,
        });
        messageApi.success(t('hr.messages.overtimeEntryUpdated'));
      } else {
        await addMutation.mutateAsync(payload);
        messageApi.success(t('hr.messages.overtimeEntryAdded'));
      }
      onClose();
    } catch (error: unknown) {
      notifyApiError(error, t('hr.messages.failedToSaveOvertimeEntry'), messageApi);
    }
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
        onFinish={handleSubmit}
      />
    </Drawer>
  );
}
