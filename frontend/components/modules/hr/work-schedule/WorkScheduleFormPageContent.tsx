'use client';

import { useState } from 'react';
import { DatePicker, Spin } from 'antd';
import { type Dayjs } from 'dayjs';
import { useRouter } from 'next/navigation';
import HrFormPageShell from '@/components/modules/hr/shared/HrFormPageShell';
import WorkScheduleForm, {
  buildWorkSchedulePayload,
  type WorkScheduleFormValues,
} from '@/components/modules/hr/work-schedule/WorkScheduleForm';
import ConfirmDialog from '@/components/ui/ConfirmDialog/ConfirmDialog';
import ErpNotice from '@/components/ui/ErpNotice/ErpNotice';
import { useAppMessage } from '@/hooks/use-app-message';
import { useEpcTranslation } from '@/hooks/use-epc-translation';
import {
  useCreateWorkSchedule,
  useUpdateWorkSchedule,
  useWorkSchedule,
} from '@/lib/query/work-schedule';
import { getFriendlyApiErrorMessage } from '@/lib/utils/friendly-api-error';
import { notifyApiError } from '@/lib/utils/notify-api-error';

const LIST_PATH = '/hr/work-schedules';

/**
 * Create / edit work schedule - shell keeps list title/subtitle; page has hero banner.
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
  const backHref =
    isEdit && scheduleId ? `${LIST_PATH}/${scheduleId}` : LIST_PATH;

  const [pendingValues, setPendingValues] =
    useState<WorkScheduleFormValues | null>(null);
  const [recalcConfirmOpen, setRecalcConfirmOpen] = useState(false);
  const [recalcFrom, setRecalcFrom] = useState<Dayjs | null>(null);

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
      notifyApiError(error, t('hr.workSchedule.saveFailed'), messageApi, t);
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
      <div className="flex min-h-[240px] items-center justify-center">
        <Spin />
      </div>
    );
  }

  if (isEdit && scheduleQuery.isError) {
    return (
      <div className="flex flex-col gap-5">
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
    <HrFormPageShell
      title={
        isEdit
          ? t('pages.hr.workSchedules.edit')
          : t('pages.hr.workSchedules.new')
      }
      description={t('hr.workSchedule.formDescription')}
      cancelLabel={t('common.cancel')}
      cancelHref={backHref}
      backLabel={t('hr.workSchedule.backToList')}
    >
      <WorkScheduleForm
        schedule={scheduleQuery.data}
        isSubmitting={saving}
        submitLabel={t('common.save')}
        onSubmit={handleSubmit}
        cancelHref={backHref}
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
          void saveSchedule(pendingValues, true);
        }}
        onCancel={() => {
          if (pendingValues) {
            void saveSchedule(pendingValues, false);
          }
        }}
      >
        <div className="mt-3">
          <label className="mb-1.5 block text-[13px] text-slate-500">
            {t('hr.workSchedule.effectiveFrom')}
          </label>
          <DatePicker
            className="w-full"
            value={recalcFrom}
            onChange={(value) => setRecalcFrom(value)}
            disabled={updateMutation.isPending}
          />
          <p className="m-0 mt-1.5 text-xs text-slate-600">
            {t('hr.workSchedule.recalcAttendanceFromHint')}
          </p>
        </div>
      </ConfirmDialog>
    </HrFormPageShell>
  );
}
