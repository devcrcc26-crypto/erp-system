'use client';

import '@/components/modules/hr/shared/hr-travel-v2.css';

import { useRouter } from 'next/navigation';
import RequestEditGate from '@/components/modules/approvals/RequestEditGate';
import RequestEditPageShell, {
  requestEditBackHref,
} from '@/components/modules/approvals/RequestEditPageShell';
import BusinessTripForm from '@/components/modules/hr/business-trip/BusinessTripForm';
import { DETAIL_PAGE_V2 } from '@/components/ui/list-page-v2';
import { useBusinessTrip } from '@/lib/query/business-trip';

/**
 * Employee edit of their own DRAFT / RETURNED business trip, reusing the
 * create form prefilled. Saves only; resubmit from the request page.
 */
export default function BusinessTripEditPageContent({
  tripId,
}: {
  tripId: string;
}): React.ReactNode {
  const router = useRouter();
  const query = useBusinessTrip(tripId);
  const record = query.data;
  const backHref = requestEditBackHref(
    record?.approvalRequestId,
    `/hr/business-trips/${tripId}`,
  );

  return (
    <RequestEditGate
      isLoading={query.isLoading}
      error={query.error}
      status={record?.status}
      ownerId={record?.submittedBy}
      backHref={backHref}
    >
      {() =>
        record ? (
          <RequestEditPageShell
            status={record.status}
            approvalRequestId={record.approvalRequestId}
            backHref={backHref}
            className={`erp-pro-list-page erp-users-page erp-hr-travel-v2 erp-employee-form-page erp-business-trip-form-page ${DETAIL_PAGE_V2}`}
          >
            <BusinessTripForm
              initialRecord={record}
              onSuccess={() => router.push(backHref)}
              onCancel={() => router.push(backHref)}
            />
          </RequestEditPageShell>
        ) : null
      }
    </RequestEditGate>
  );
}
