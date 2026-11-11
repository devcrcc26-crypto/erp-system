'use client';

import '@/components/modules/hr/shared/hr-travel-v2.css';

import { useRouter } from 'next/navigation';
import RequestEditGate from '@/components/modules/approvals/RequestEditGate';
import RequestEditPageShell, {
  requestEditBackHref,
} from '@/components/modules/approvals/RequestEditPageShell';
import MaterialRequisitionForm from '@/components/modules/hr/material-requisition/MaterialRequisitionForm';
import { useMaterialRequisition } from '@/lib/query/material-requisition';

/**
 * Employee edit of their own DRAFT / RETURNED material requisition, reusing
 * the create form prefilled (details + items). Saves only; resubmit from
 * the request page.
 */
export default function MaterialRequisitionEditPageContent({
  requisitionId,
}: {
  requisitionId: string;
}): React.ReactNode {
  const router = useRouter();
  const query = useMaterialRequisition(requisitionId);
  const record = query.data;
  const backHref = requestEditBackHref(
    record?.approvalRequestId,
    `/hr/material-requisition/${requisitionId}`,
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
            className="erp-pro-list-page erp-users-page erp-hr-travel-v2 erp-employee-form-page erp-material-requisition-form-page"
          >
            <MaterialRequisitionForm
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
