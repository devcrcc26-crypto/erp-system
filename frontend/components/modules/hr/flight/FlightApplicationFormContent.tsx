'use client';

import { Button } from 'antd';
import { useRouter } from 'next/navigation';
import FlightApplicationForm from '@/components/modules/hr/flight/FlightApplicationForm';
import type { FlightApplicationDetail } from '@/lib/api/flight.types';
import { useEpcTranslation } from '@/hooks/use-epc-translation';
import { useSetHeaderExtra } from '@/hooks/use-set-header-extra';

/**
 * New flight application — same page chrome as Add Employee / Expense Claim.
 */
export default function FlightApplicationFormContent(): React.ReactNode {
  const { t } = useEpcTranslation();
  const router = useRouter();

  useSetHeaderExtra(null);

  function handleSuccess(created: FlightApplicationDetail): void {
    if (created.approvalRequestId) {
      router.push(`/approvals/${created.approvalRequestId}`);
    } else {
      router.push(`/hr/flight-applications/${created.id}`);
    }
  }

  return (
    <div className="erp-pro-list-page erp-users-page erp-employee-form-page erp-flight-form-page">
      <div className="erp-flight-form-actions flex shrink-0 flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-end">
        <Button
          onClick={() => router.push('/approvals/new')}
          className="shrink-0"
          style={{ borderRadius: 8 }}
        >
          {t('hr.buttons.cancel')}
        </Button>
      </div>
      <FlightApplicationForm onSuccess={handleSuccess} />
    </div>
  );
}
