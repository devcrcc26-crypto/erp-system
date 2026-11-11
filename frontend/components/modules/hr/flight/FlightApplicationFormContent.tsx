'use client';

import '@/components/modules/hr/shared/hr-travel-v2.css';

import { useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { DETAIL_PAGE_V2 } from '@/components/ui/list-page-v2';
import FlightApplicationForm from '@/components/modules/hr/flight/FlightApplicationForm';
import HrFormPageShell from '@/components/modules/hr/shared/HrFormPageShell';
import type { FlightApplicationDetail } from '@/lib/api/flight.types';
import { useEpcTranslation } from '@/hooks/use-epc-translation';
import { navigateAfterRequestSubmit } from '@/lib/navigation/after-request-submit';
import { flightKeys } from '@/lib/query/flight';

/**
 * New flight application - shared HR form banner + stepper form.
 */
export default function FlightApplicationFormContent(): React.ReactNode {
  const { t } = useEpcTranslation();
  const router = useRouter();
  const queryClient = useQueryClient();

  async function handleSuccess(created: FlightApplicationDetail): Promise<void> {
    queryClient.setQueryData(flightKeys.detail(created.id), created);
    await navigateAfterRequestSubmit({
      queryClient,
      router,
      invalidateKeys: [flightKeys.all, flightKeys.detail(created.id)],
    });
  }

  return (
    <div className={`erp-pro-list-page erp-users-page erp-hr-travel-v2 erp-employee-form-page erp-flight-form-page ${DETAIL_PAGE_V2}`}>
      <HrFormPageShell
        title={t('pages.hr.flight.new')}
        description={t('pages.hr.flight.formDescription')}
        cancelLabel={t('hr.buttons.cancel')}
        cancelHref="/approvals/new"
        backLabel={t('hr.buttons.backToList')}
        showCancelButton={false}
      >
        <FlightApplicationForm
          onSuccess={(created) => void handleSuccess(created)}
          onCancel={() => router.push('/approvals/new')}
          cancelLabel={t('hr.buttons.cancel')}
        />
      </HrFormPageShell>
    </div>
  );
}