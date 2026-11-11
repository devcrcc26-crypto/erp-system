'use client';

import '@/components/modules/hr/shared/hr-travel-v2.css';

import { useRouter } from 'next/navigation';
import RequestEditGate from '@/components/modules/approvals/RequestEditGate';
import RequestEditPageShell, {
  requestEditBackHref,
} from '@/components/modules/approvals/RequestEditPageShell';
import ExitPermitForm from '@/components/modules/hr/exit-permit/ExitPermitForm';
import { useExitPermit } from '@/lib/query/exit-permit';

/**
 * Employee edit of their own DRAFT / RETURNED exit permit, reusing the create
 * form prefilled (details + items). Saves only; resubmit from the request page.
 */
export default function ExitPermitEditPageContent({
  permitId,
}: {
  permitId: string;
}): React.ReactNode {
  const router = useRouter();
  const query = useExitPermit(permitId);
  const record = query.data;
  const backHref = requestEditBackHref(
    record?.approvalRequestId,
    `/hr/equipment-and-materials-exit-permit/${permitId}`,
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
            className="erp-pro-list-page erp-users-page erp-hr-travel-v2 erp-employee-form-page erp-exit-permit-form-page flex flex-col gap-4"
          >
            <ExitPermitForm
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
