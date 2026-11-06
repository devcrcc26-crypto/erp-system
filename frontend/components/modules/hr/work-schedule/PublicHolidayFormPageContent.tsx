'use client';

import './public-holidays-v2.css';

import { Spin } from 'antd';
import { useRouter } from 'next/navigation';
import HrFormPageShell from '@/components/modules/hr/shared/HrFormPageShell';
import PublicHolidayForm, {
  buildPublicHolidayPayload,
  type PublicHolidayFormValues,
} from '@/components/modules/hr/work-schedule/PublicHolidayForm';
import ErpNotice from '@/components/ui/ErpNotice/ErpNotice';
import { useAppMessage } from '@/hooks/use-app-message';
import { useEpcTranslation } from '@/hooks/use-epc-translation';
import {
  useCreatePublicHoliday,
  usePublicHoliday,
  useUpdatePublicHoliday,
} from '@/lib/query/work-schedule';
import { getFriendlyApiErrorMessage } from '@/lib/utils/friendly-api-error';
import { notifyApiError } from '@/lib/utils/notify-api-error';

const LIST_PATH = '/hr/public-holidays';

/**
 * Create / edit public holiday - v2 hero + soft form card.
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
  const backHref =
    isEdit && holidayId ? `${LIST_PATH}/${holidayId}` : LIST_PATH;

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
      <div className="erp-pro-list-page erp-users-page erp-employee-form-page erp-ph-form-page erp-public-holidays-v2">
        <div className="erp-ph-loading">
          <Spin />
        </div>
      </div>
    );
  }

  if (isEdit && holidayQuery.isError) {
    return (
      <div className="erp-pro-list-page erp-users-page erp-employee-form-page erp-ph-form-page erp-public-holidays-v2">
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
    <div className="erp-pro-list-page erp-users-page erp-employee-form-page erp-ph-form-page erp-public-holidays-v2 flex flex-col">
      <HrFormPageShell
        title={
          isEdit
            ? t('pages.hr.publicHolidays.edit')
            : t('pages.hr.publicHolidays.new')
        }
        description={t('hr.publicHoliday.formDescription')}
        cancelLabel={t('common.cancel')}
        cancelHref={backHref}
        backLabel={t('hr.buttons.backToList')}
        showCancelButton={false}
      >
        <PublicHolidayForm
          holiday={holidayQuery.data}
          isSubmitting={saving}
          submitLabel={t('common.save')}
          onSubmit={handleSubmit}
          onCancel={() => router.push(backHref)}
          cancelLabel={t('common.cancel')}
        />
      </HrFormPageShell>
    </div>
  );
}
