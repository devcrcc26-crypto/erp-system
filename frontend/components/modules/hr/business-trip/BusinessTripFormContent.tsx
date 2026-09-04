'use client';

import { Button } from 'antd';
import { useRouter } from 'next/navigation';
import BusinessTripForm from '@/components/modules/hr/business-trip/BusinessTripForm';
import type { BusinessTripDetail } from '@/lib/api/business-trip.types';
import { useEpcTranslation } from '@/hooks/use-epc-translation';
import { useSetHeaderExtra } from '@/hooks/use-set-header-extra';

/**
 * New business trip — same page chrome as Add Employee / Flight Application.
 */
export default function BusinessTripFormContent(): React.ReactNode {
  const { t } = useEpcTranslation();
  const router = useRouter();

  useSetHeaderExtra(null);

  function handleSuccess(created: BusinessTripDetail): void {
    if (created.approvalRequestId) {
      router.push(`/approvals/${created.approvalRequestId}`);
    } else {
      router.push(`/hr/business-trips/${created.id}`);
    }
  }

  return (
    <div className="erp-pro-list-page erp-users-page erp-employee-form-page erp-business-trip-form-page">
      <div className="erp-business-trip-form-actions flex shrink-0 flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-end">
        <Button
          onClick={() => router.push('/approvals/new')}
          className="shrink-0"
          style={{ borderRadius: 8 }}
        >
          {t('hr.buttons.cancel')}
        </Button>
      </div>
      <BusinessTripForm onSuccess={handleSuccess} />
    </div>
  );
}
