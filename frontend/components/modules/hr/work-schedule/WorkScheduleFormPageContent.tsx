'use client';

import { useState } from 'react';
import { Button, DatePicker, Spin } from 'antd';
import { type Dayjs } from 'dayjs';
import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';
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
 * Create / edit work schedule — shell keeps list title/subtitle; page has hero banner.
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
    <div className="flex flex-col gap-4">
      <section className="flex flex-wrap items-start justify-between gap-3 rounded-2xl bg-white px-5 py-4 shadow-[0_1px_2px_rgba(16,24,40,0.04),0_4px_16px_rgba(16,24,40,0.06)]">
        <div className="min-w-0">
          <Link
            href={backHref}
            className="mb-2 inline-flex items-center gap-1.5 text-[13px] font-medium text-slate-500 no-underline transition-colors hover:text-emerald-700"
          >
            <ArrowLeft size={14} strokeWidth={2} aria-hidden />
            {t('hr.workSchedule.backToList')}
          </Link>
          <h1 className="m-0 text-xl font-semibold tracking-tight text-slate-900">
            {isEdit
              ? t('pages.hr.workSchedules.edit')
              : t('pages.hr.workSchedules.new')}
          </h1>
          <p className="mt-1 mb-0 max-w-3xl text-[13px] leading-snug text-slate-500">
            {t('hr.workSchedule.formDescription')}
          </p>
        </div>
        <div className="shrink-0">
          <Button onClick={() => router.push(backHref)}>
            {t('common.cancel')}
          </Button>
        </div>
      </section>

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
        </div>
      </ConfirmDialog>
    </div>
  );
}
