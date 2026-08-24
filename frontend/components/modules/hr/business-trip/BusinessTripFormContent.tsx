'use client';

import { useRouter } from 'next/navigation';
import BusinessTripForm from '@/components/modules/hr/business-trip/BusinessTripForm';
import HrFormPageShell from '@/components/modules/hr/shared/HrFormPageShell';
import type { BusinessTripDetail } from '@/lib/api/business-trip.types';
import { useEpcTranslation } from '@/hooks/use-epc-translation';

/**
 * Page wrapper for the new business trip stepper form.
 * On success navigates to the approval request or the trip detail.
 */
export default function BusinessTripFormContent(): React.ReactNode {
  const { t } = useEpcTranslation();
  const router = useRouter();

  function handleSuccess(created: BusinessTripDetail): void {
    if (created.approvalRequestId) {
      router.push(`/approvals/${created.approvalRequestId}`);
    } else {
      router.push(`/hr/business-trips/${created.id}`);
    }
  }

  return (
    <HrFormPageShell
      title={t('hr.buttons.newBusinessTrip')}
      description={t('pages.hr.businessTrip.listDescription')}
      cancelLabel={t('hr.buttons.cancel')}
      cancelHref="/approvals/new"
    >
      <div className="flex h-full min-h-0 w-full flex-col">
        <BusinessTripForm onSuccess={handleSuccess} />
      </div>
    </HrFormPageShell>
  );
}
