'use client';

import '@/components/modules/hr/shared/hr-travel-v2.css';

import { useRouter } from 'next/navigation';
import RequestEditGate from '@/components/modules/approvals/RequestEditGate';
import RequestEditPageShell, {
  requestEditBackHref,
} from '@/components/modules/approvals/RequestEditPageShell';
import PerDiemRequestForm from '@/components/modules/hr/per-diem/PerDiemRequestForm';
import { DETAIL_PAGE_V2 } from '@/components/ui/list-page-v2';
import { usePerDiemRequest } from '@/lib/query/per-diem';

/**
 * Employee edit of their own DRAFT / RETURNED per diem request, reusing the
 * create form prefilled. Saves only; resubmit from the request page.
 */
export default function PerDiemRequestEditPageContent({
  requestId,
}: {
  requestId: string;
}): React.ReactNode {
  const router = useRouter();
  const query = usePerDiemRequest(requestId);
  const record = query.data;
  const backHref = requestEditBackHref(
    record?.approvalRequestId,
    `/hr/per-diem/${requestId}`,
  );

  return (
    <RequestEditGate
      isLoading={query.isLoading}
      error={query.error}
      status={record?.status}
      ownerId={record?.employeeId}
      backHref={backHref}
    >
      {() =>
        record ? (
          <RequestEditPageShell
            status={record.status}
            approvalRequestId={record.approvalRequestId}
            backHref={backHref}
            className={`erp-pro-list-page erp-users-page erp-hr-travel-v2 erp-employee-form-page erp-per-diem-form-page ${DETAIL_PAGE_V2}`}
          >
            <PerDiemRequestForm
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
