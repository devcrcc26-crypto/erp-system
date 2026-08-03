'use client';

import { useRouter } from 'next/navigation';
import FlightApplicationForm from '@/components/modules/hr/flight/FlightApplicationForm';
import type { FlightApplicationDetail } from '@/lib/api/flight.types';

/**
 * Page wrapper for the new flight application form.
 * On success navigates to the approval request or the application detail.
 */
export default function FlightApplicationFormContent(): React.ReactNode {
  const router = useRouter();

  function handleSuccess(created: FlightApplicationDetail): void {
    if (created.approvalRequestId) {
      router.push(`/approvals/${created.approvalRequestId}`);
    } else {
      router.push(`/hr/flight-applications/${created.id}`);
    }
  }

  return <FlightApplicationForm onSuccess={handleSuccess} />;
}
