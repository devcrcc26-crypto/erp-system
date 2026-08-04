'use client';

import { useRouter } from 'next/navigation';
import BusinessTripForm from '@/components/modules/hr/business-trip/BusinessTripForm';
import type { BusinessTripDetail } from '@/lib/api/business-trip.types';

/**
 * Page wrapper for the new business trip form.
 * On success navigates to the approval request or the trip detail.
 */
export default function BusinessTripFormContent(): React.ReactNode {
  const router = useRouter();

  function handleSuccess(created: BusinessTripDetail): void {
    if (created.approvalRequestId) {
      router.push(`/approvals/${created.approvalRequestId}`);
    } else {
      router.push(`/hr/business-trips/${created.id}`);
    }
  }

  return <BusinessTripForm onSuccess={handleSuccess} />;
}
