'use client';

import '@/components/modules/hr/shared/hr-travel-v2.css';

import { useRouter } from 'next/navigation';
import FlightApplicationForm from '@/components/modules/hr/flight/FlightApplicationForm';
import HrFormPageShell from '@/components/modules/hr/shared/HrFormPageShell';
import type { FlightApplicationDetail } from '@/lib/api/flight.types';
import { useEpcTranslation } from '@/hooks/use-epc-translation';

/**
 * New flight application - shared HR form banner + stepper form.
 */
export default function FlightApplicationFormContent(): React.ReactNode {
  const { t } = useEpcTranslation();
  const router = useRouter();

  function handleSuccess(created: FlightApplicationDetail): void {
    if (created.approvalRequestId) {
      router.push(`/approvals/${created.approvalRequestId}`);
    } else {
      router.push(`/hr/flight-applications/${created.id}`);
    }
  }

  return (
    <div className="erp-pro-list-page erp-users-page erp-hr-travel-v2 erp-employee-form-page erp-flight-form-page">
      <HrFormPageShell
        title={t('pages.hr.flight.new')}
        description={t('pages.hr.flight.formDescription')}
        cancelLabel={t('hr.buttons.cancel')}
        cancelHref="/approvals/new"
        backLabel={t('hr.buttons.backToList')}
      >
        <FlightApplicationForm onSuccess={handleSuccess} />
      </HrFormPageShell>
    </div>
  );
}
