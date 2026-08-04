'use client';

import { useRouter } from 'next/navigation';
import FlightApplicationForm from '@/components/modules/hr/flight/FlightApplicationForm';
import type { FlightApplicationDetail } from '@/lib/api/flight.types';

/**
 * Page wrapper for the new flight application stepper form.
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

  return (
    <div className="flex h-full min-h-0 w-full flex-col">
      <FlightApplicationForm onSuccess={handleSuccess} />
    </div>
  );
}
