'use client';

import { useState } from 'react';
import { Button, DatePicker, Spin } from 'antd';
import { type Dayjs } from 'dayjs';
import { useRouter } from 'next/navigation';
import WorkScheduleForm, {
  buildWorkSchedulePayload,
  type WorkScheduleFormValues,
} from '@/components/modules/hr/work-schedule/WorkScheduleForm';
import ConfirmDialog from '@/components/ui/ConfirmDialog/ConfirmDialog';
import ErpNotice from '@/components/ui/ErpNotice/ErpNotice';
import { useAppMessage } from '@/hooks/use-app-message';
import { useEpcTranslation } from '@/hooks/use-epc-translation';
import { useSetHeaderExtra } from '@/hooks/use-set-header-extra';
import {
  useCreateWorkSchedule,
  useUpdateWorkSchedule,
  useWorkSchedule,
} from '@/lib/query/work-schedule';
import { getFriendlyApiErrorMessage } from '@/lib/utils/friendly-api-error';
import { notifyApiError } from '@/lib/utils/notify-api-error';

const LIST_PATH = '/hr/work-schedules';

/**
 * Create / edit work schedule — cancel + form.
 * On edit, asks whether to recalculate attendance from a chosen date.
 */
export default function WorkScheduleFormPageContent({
  scheduleId,
}: {
  scheduleId?: string;
}): React.ReactNode {
  const { t } = useEpcTranslation();
  const router = useRouter();
  const messageApi = useAppMessage();
  const isEdit = Boolean(scheduleId);
  const scheduleQuery = useWorkSchedule(scheduleId ?? '', isEdit);
  const createMutation = useCreateWorkSchedule();
  const updateMutation = useUpdateWorkSchedule(scheduleId ?? '');
  const saving = createMutation.isPending || updateMutation.isPending;

  const [pendingValues, setPendingValues] =
    useState<WorkScheduleFormValues | null>(null);
  const [recalcConfirmOpen, setRecalcConfirmOpen] = useState(false);
  const [recalcFrom, setRecalcFrom] = useState<Dayjs | null>(null);

  useSetHeaderExtra(null);

  async function saveSchedule(
    values: WorkScheduleFormValues,
    recalculateAttendance: boolean,
  ): Promise<void> {
    const payload = buildWorkSchedulePayload(values);
    try {
      if (isEdit && scheduleId) {
        const result = await updateMutation.mutateAsync({
          ...payload,
          recalculateAttendance,
          recalculateFrom: recalculateAttendance
            ? recalcFrom?.format('YYYY-MM-DD')
            : undefined,
        });
        messageApi.success(t('hr.workSchedule.updated'));
        if (recalculateAttendance && result.attendanceRecalc) {
          const recalc = result.attendanceRecalc as {
            employeesUpdated: number;
            updatedRecords: number;
            updatedDays: number;
            skippedLockedMonths: number;
          };
          messageApi.info(
            t('hr.workSchedule.attendanceRecalcBulkResult', {
              employees: recalc.employeesUpdated,
              records: recalc.updatedRecords,
              days: recalc.updatedDays,
              skipped: recalc.skippedLockedMonths,
            }),
          );
        }
        setRecalcConfirmOpen(false);
        setPendingValues(null);
        router.push(`${LIST_PATH}/${scheduleId}`);
      } else {
        const created = await createMutation.mutateAsync(payload);
        messageApi.success(t('hr.workSchedule.created'));
        router.push(`${LIST_PATH}/${created.id}`);
      }
    } catch (error: unknown) {
      notifyApiError(error, t('hr.workSchedule.saveFailed'), messageApi);
    }
  }

  async function handleSubmit(values: WorkScheduleFormValues): Promise<void> {
    if (isEdit) {
      setPendingValues(values);
      setRecalcFrom(null);
      setRecalcConfirmOpen(true);
      return;
    }
    await saveSchedule(values, false);
  }

  if (isEdit && scheduleQuery.isLoading && !scheduleQuery.data) {
    return (
      <div className="erp-pro-list-page erp-users-page erp-employee-form-page flex justify-center p-12">
        <Spin />
      </div>
    );
  }

  if (isEdit && scheduleQuery.isError) {
    return (
      <div className="erp-pro-list-page erp-users-page erp-employee-form-page">
        <ErpNotice
          tone="error"
          title={getFriendlyApiErrorMessage(
            scheduleQuery.error,
            t('hr.workSchedule.loadError'),
            t,
          )}
        />
      </div>
    );
  }

  return (
    <div className="erp-pro-list-page erp-users-page erp-employee-form-page flex flex-col gap-4">
      <div className="flex shrink-0 items-center justify-end">
        <Button
          onClick={() =>
            router.push(
              isEdit && scheduleId ? `${LIST_PATH}/${scheduleId}` : LIST_PATH,
            )
          }
          className="shrink-0"
        >
          {t('common.cancel')}
        </Button>
      </div>
      <WorkScheduleForm
        schedule={scheduleQuery.data}
        isSubmitting={saving}
        submitLabel={t('common.save')}
        onSubmit={handleSubmit}
      />

      <ConfirmDialog
        open={recalcConfirmOpen}
        title={t('hr.workSchedule.recalcAttendanceTitle')}
        description={t('hr.workSchedule.recalcAttendanceEditDescription')}
        confirmLabel={t('hr.workSchedule.recalcAttendanceYes')}
        cancelLabel={t('hr.workSchedule.recalcAttendanceSaveOnly')}
        confirmLoading={updateMutation.isPending}
        onConfirm={() => {
          if (!pendingValues) {
            return;
          }
          if (!recalcFrom) {
            messageApi.warning(t('hr.workSchedule.effectiveFromRequired'));
            return;
          }
          void saveSchedule(pendingValues, true);
        }}
        onCancel={() => {
          if (pendingValues) {
            void saveSchedule(pendingValues, false);
          }
        }}
      >
        <div style={{ marginTop: 12 }}>
          <label
            style={{
              display: 'block',
              marginBottom: 6,
              fontSize: 13,
              color: 'var(--color-text-secondary)',
            }}
          >
            {t('hr.workSchedule.effectiveFrom')}
          </label>
          <DatePicker
            className="w-full"
            value={recalcFrom}
            onChange={(value) => setRecalcFrom(value)}
            disabled={updateMutation.isPending}
          />
        </div>
      </ConfirmDialog>
    </div>
  );
}
