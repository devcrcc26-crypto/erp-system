'use client';

import RequestEditGate from '@/components/modules/approvals/RequestEditGate';
import WorkFromHomeRequestFormContent from '@/components/modules/hr/attendance/WorkFromHomeRequestFormContent';
import { useApprovalRequest } from '@/lib/query/approvals';

/**
 * Employee edit of their own RETURNED work-from-home request (the approval
 * request is the record). Saves only; resubmit from the request page.
 */
export default function WorkFromHomeEditPageContent({
  approvalRequestId,
}: {
  approvalRequestId: string;
}): React.ReactNode {
  const query = useApprovalRequest(approvalRequestId);
  const request = query.data;

  return (
    <RequestEditGate
      isLoading={query.isLoading}
      error={query.error}
      // Approval-only requests are never DRAFT; only RETURNED is editable.
      status={request?.status}
      ownerId={request?.requestedBy}
      backHref={`/approvals/${approvalRequestId}`}
    >
      {() => <WorkFromHomeRequestFormContent editRequest={request} />}
    </RequestEditGate>
  );
}
