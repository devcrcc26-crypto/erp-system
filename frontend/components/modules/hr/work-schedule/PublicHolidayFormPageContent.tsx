'use client';

import { Button, Spin } from 'antd';
import { useRouter } from 'next/navigation';
import PublicHolidayForm, {
  buildPublicHolidayPayload,
  type PublicHolidayFormValues,
} from '@/components/modules/hr/work-schedule/PublicHolidayForm';
import ErpNotice from '@/components/ui/ErpNotice/ErpNotice';
import { useAppMessage } from '@/hooks/use-app-message';
import { useEpcTranslation } from '@/hooks/use-epc-translation';
import { useSetHeaderExtra } from '@/hooks/use-set-header-extra';
import {
  useCreatePublicHoliday,
  usePublicHoliday,
  useUpdatePublicHoliday,
} from '@/lib/query/work-schedule';
import { getFriendlyApiErrorMessage } from '@/lib/utils/friendly-api-error';
import { notifyApiError } from '@/lib/utils/notify-api-error';

const LIST_PATH = '/hr/public-holidays';

/**
 * Create / edit public holiday — cancel + form.
 */
export default function PublicHolidayFormPageContent({
  holidayId,
}: {
  holidayId?: string;
}): React.ReactNode {
  const { t } = useEpcTranslation();
  const router = useRouter();
  const messageApi = useAppMessage();
  const isEdit = Boolean(holidayId);
  const holidayQuery = usePublicHoliday(holidayId ?? '', isEdit);
  const createMutation = useCreatePublicHoliday();
  const updateMutation = useUpdatePublicHoliday();
  const saving = createMutation.isPending || updateMutation.isPending;

  useSetHeaderExtra(null);

  async function handleSubmit(values: PublicHolidayFormValues): Promise<void> {
    const payload = buildPublicHolidayPayload(values);
    try {
      if (isEdit && holidayId) {
        await updateMutation.mutateAsync({ id: holidayId, payload });
        messageApi.success(t('hr.publicHoliday.updated'));
        router.push(`${LIST_PATH}/${holidayId}`);
      } else {
        const created = await createMutation.mutateAsync(payload);
        messageApi.success(t('hr.publicHoliday.created'));
        router.push(`${LIST_PATH}/${created.id}`);
      }
    } catch (error: unknown) {
      notifyApiError(error, t('hr.publicHoliday.saveFailed'), messageApi);
    }
  }

  if (isEdit && holidayQuery.isLoading && !holidayQuery.data) {
    return (
      <div className="erp-pro-list-page erp-users-page erp-employee-form-page flex justify-center p-12">
        <Spin />
      </div>
    );
  }

  if (isEdit && holidayQuery.isError) {
    return (
      <div className="erp-pro-list-page erp-users-page erp-employee-form-page">
        <ErpNotice
          tone="error"
          title={getFriendlyApiErrorMessage(
            holidayQuery.error,
            t('hr.publicHoliday.loadError'),
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
              isEdit && holidayId ? `${LIST_PATH}/${holidayId}` : LIST_PATH,
            )
          }
          className="shrink-0"
        >
          {t('common.cancel')}
        </Button>
      </div>
      <PublicHolidayForm
        holiday={holidayQuery.data}
        isSubmitting={saving}
        submitLabel={t('common.save')}
        onSubmit={handleSubmit}
      />
    </div>
  );
}
