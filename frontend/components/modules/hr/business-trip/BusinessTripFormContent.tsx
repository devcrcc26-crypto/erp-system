'use client';

import '@/components/modules/hr/shared/hr-travel-v2.css';

import { useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { DETAIL_PAGE_V2 } from '@/components/ui/list-page-v2';
import BusinessTripForm from '@/components/modules/hr/business-trip/BusinessTripForm';
import HrFormPageShell from '@/components/modules/hr/shared/HrFormPageShell';
import type { BusinessTripDetail } from '@/lib/api/business-trip.types';
import { useEpcTranslation } from '@/hooks/use-epc-translation';
import { navigateAfterRequestSubmit } from '@/lib/navigation/after-request-submit';
import { businessTripKeys } from '@/lib/query/business-trip';

/**
 * New business trip - shared HR form banner + stepper form.
 */
export default function BusinessTripFormContent(): React.ReactNode {
  const { t } = useEpcTranslation();
  const router = useRouter();
  const queryClient = useQueryClient();

  async function handleSuccess(created: BusinessTripDetail): Promise<void> {
    queryClient.setQueryData(businessTripKeys.detail(created.id), created);
    await navigateAfterRequestSubmit({
      queryClient,
      router,
      invalidateKeys: [businessTripKeys.all, businessTripKeys.detail(created.id)],
    });
  }

  return (
    <div className={`erp-pro-list-page erp-users-page erp-hr-travel-v2 erp-employee-form-page erp-business-trip-form-page ${DETAIL_PAGE_V2}`}>
      <HrFormPageShell
        title={t('pages.hr.businessTrip.new')}
        description={t('pages.hr.businessTrip.formDescription')}
        cancelLabel={t('hr.buttons.cancel')}
        cancelHref="/approvals/new"
        backLabel={t('hr.buttons.backToList')}
        showCancelButton={false}
      >
        <BusinessTripForm
          onSuccess={(created) => void handleSuccess(created)}
          onCancel={() => router.push('/approvals/new')}
          cancelLabel={t('hr.buttons.cancel')}
        />
      </HrFormPageShell>
    </div>
  );
}
