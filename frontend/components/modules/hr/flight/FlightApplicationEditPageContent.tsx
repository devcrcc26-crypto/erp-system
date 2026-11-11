'use client';

import '@/components/modules/hr/shared/hr-travel-v2.css';

import { useRouter } from 'next/navigation';
import RequestEditGate from '@/components/modules/approvals/RequestEditGate';
import RequestEditPageShell, {
  requestEditBackHref,
} from '@/components/modules/approvals/RequestEditPageShell';
import FlightApplicationForm from '@/components/modules/hr/flight/FlightApplicationForm';
import { DETAIL_PAGE_V2 } from '@/components/ui/list-page-v2';
import { useFlightApplication } from '@/lib/query/flight';

/**
 * Employee edit of their own DRAFT / RETURNED flight application, reusing the
 * create form prefilled. Saves only; resubmit from the request page.
 */
export default function FlightApplicationEditPageContent({
  applicationId,
}: {
  applicationId: string;
}): React.ReactNode {
  const router = useRouter();
  const query = useFlightApplication(applicationId);
  const record = query.data;
  const backHref = requestEditBackHref(
    record?.approvalRequestId,
    `/hr/flight-applications/${applicationId}`,
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
            className={`erp-pro-list-page erp-users-page erp-hr-travel-v2 erp-employee-form-page erp-flight-form-page ${DETAIL_PAGE_V2}`}
          >
            <FlightApplicationForm
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
