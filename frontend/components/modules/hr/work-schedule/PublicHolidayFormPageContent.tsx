'use client';

import './public-holidays-v2.css';

import { Button, Spin } from 'antd';
import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';
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
 * Create / edit public holiday — v2 hero + soft form card.
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
      <section className="erp-ph-form-hero">
        <div className="min-w-0">
          <Link href={backHref} className="erp-ph-back">
            <ArrowLeft size={14} strokeWidth={2} aria-hidden />
            {t('hr.buttons.backToList')}
          </Link>
          <h1 className="erp-ph-form-hero-title">
            {isEdit
              ? t('pages.hr.publicHolidays.edit')
              : t('pages.hr.publicHolidays.new')}
          </h1>
          <p className="erp-ph-form-hero-desc">
            {t('pages.hr.publicHolidays.detailsStepDescription')}
          </p>
        </div>
        <div>
          <Button onClick={() => router.push(backHref)}>
            {t('common.cancel')}
          </Button>
        </div>
      </section>
      <PublicHolidayForm
        holiday={holidayQuery.data}
        isSubmitting={saving}
        submitLabel={t('common.save')}
        onSubmit={handleSubmit}
      />
    </div>
  );
}
