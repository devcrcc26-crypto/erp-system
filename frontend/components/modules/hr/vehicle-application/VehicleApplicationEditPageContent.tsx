'use client';

import '@/components/modules/hr/shared/hr-travel-v2.css';

import { useRouter } from 'next/navigation';
import RequestEditGate from '@/components/modules/approvals/RequestEditGate';
import RequestEditPageShell, {
  requestEditBackHref,
} from '@/components/modules/approvals/RequestEditPageShell';
import VehicleApplicationForm from '@/components/modules/hr/vehicle-application/VehicleApplicationForm';
import { useVehicleApplication } from '@/lib/query/vehicle-application';

/**
 * Employee edit of their own DRAFT / RETURNED vehicle application, reusing
 * the create form prefilled. Saves only; resubmit from the request page.
 */
export default function VehicleApplicationEditPageContent({
  applicationId,
}: {
  applicationId: string;
}): React.ReactNode {
  const router = useRouter();
  const query = useVehicleApplication(applicationId);
  const record = query.data;
  const backHref = requestEditBackHref(
    record?.approvalRequestId,
    `/hr/vehicle-applications/${applicationId}`,
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
            className="erp-pro-list-page erp-users-page erp-hr-travel-v2 erp-employee-form-page erp-vehicle-application-form-page flex flex-col gap-4"
          >
            <VehicleApplicationForm
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
