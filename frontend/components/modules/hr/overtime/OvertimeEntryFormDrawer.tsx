'use client';

import { useCallback, useEffect, useMemo } from 'react';
import { Button, Drawer, Form, Typography } from 'antd';
import dayjs, { type Dayjs } from 'dayjs';
import OvertimeEntryForm, {
  type OvertimeEntryFormValues,
} from '@/components/modules/hr/overtime/OvertimeEntryForm';
import { useAppMessage } from '@/hooks/use-app-message';
import { useEpcTranslation } from '@/hooks/use-epc-translation';
import type { OvertimeEntry, UpsertOvertimeEntryPayload } from '@/lib/api/overtime.types';
import {
  useAddOvertimeEntry,
  useUpdateOvertimeEntry,
} from '@/lib/query/overtime';
import { detailDrawerStyles } from '@/lib/theme/layout';
import {
  calculateOvertimeHours,
  parseOvertimeDateOnly,
} from '@/lib/utils/overtime-hours.util';
import { notifyApiError } from '@/lib/utils/notify-api-error';

/**
 * Drawer to add or edit an overtime sheet entry without shifting page layout.
 */
export default function OvertimeEntryFormDrawer({
  open,
  sheetId,
  sheetMonth,
  sheetYear,
  editingEntry,
  onClose,
}: {
  open: boolean;
  sheetId: string;
  sheetMonth: number;
  sheetYear: number;
  editingEntry: OvertimeEntry | null;
  onClose: () => void;
}): React.ReactNode {
  const { t } = useEpcTranslation();
  const messageApi = useAppMessage();
  const [form] = Form.useForm<OvertimeEntryFormValues>();
  const addMutation = useAddOvertimeEntry(sheetId);
  const updateMutation = useUpdateOvertimeEntry(sheetId);
  const saving = addMutation.isPending || updateMutation.isPending;

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
  const watchedHoliday = Form.useWatch('isHoliday', form);

  const liveHours = useMemo(() => {
    if (!watchedDate || !watchedStart || !watchedEnd) {
      return null;
    }
    const date = parseOvertimeDateOnly(watchedDate.format('YYYY-MM-DD'));
    if (!date) {
      return null;
    }
    return calculateOvertimeHours(
      date,
      watchedStart.format('HH:mm'),
      watchedEnd.format('HH:mm'),
      Boolean(watchedHoliday),
    );
  }, [watchedDate, watchedStart, watchedEnd, watchedHoliday]);

  useEffect(() => {
    if (!open) {
      return;
    }
    if (editingEntry) {
      form.setFieldsValue({
        date: dayjs(editingEntry.date),
        startTime: dayjs(editingEntry.startTime, 'HH:mm'),
        endTime: dayjs(editingEntry.endTime, 'HH:mm'),
        isHoliday: editingEntry.isHoliday,
        taskDescription: editingEntry.taskDescription,
      });
    } else {
      form.resetFields();
      form.setFieldsValue({
        isHoliday: false,
        date: dayjs(
          `${sheetYear}-${String(sheetMonth).padStart(2, '0')}-01`,
        ),
      });
    }
  }, [open, editingEntry, form, sheetMonth, sheetYear]);

  async function handleSubmit(values: OvertimeEntryFormValues): Promise<void> {
    const payload: UpsertOvertimeEntryPayload = {
      date: values.date.format('YYYY-MM-DD'),
      startTime: values.startTime.format('HH:mm'),
      endTime: values.endTime.format('HH:mm'),
      isHoliday: Boolean(values.isHoliday),
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
        liveHours={liveHours}
        periodLabel={periodLabel}
        onFinish={handleSubmit}
      />
    </Drawer>
  );
}
