'use client';

import { Button, Spin } from 'antd';
import { useRouter } from 'next/navigation';
import WorkScheduleForm, {
  buildWorkSchedulePayload,
  type WorkScheduleFormValues,
} from '@/components/modules/hr/work-schedule/WorkScheduleForm';
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

  useSetHeaderExtra(null);

  async function handleSubmit(values: WorkScheduleFormValues): Promise<void> {
    const payload = buildWorkSchedulePayload(values);
    try {
      if (isEdit && scheduleId) {
        await updateMutation.mutateAsync(payload);
        messageApi.success(t('hr.workSchedule.updated'));
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
    </div>
  );
}
