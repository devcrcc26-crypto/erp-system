'use client';

import { Alert, Button } from 'antd';
import { useChangeRequests } from '@/lib/query/change-requests';

/**
 * Amber banner when an approved CR requires designer revision on a subtask.
 */
export default function ApprovedCrRevisionBanner({
  projectId,
  designPackageId,
  packageStatus,
  onViewChangeRequest,
}: {
  projectId: string;
  designPackageId: string;
  packageStatus?: string | null;
  onViewChangeRequest?: (changeRequestId: string) => void;
}): React.ReactNode {
  const closed =
    packageStatus === 'CLOSED' || packageStatus === 'COMPLETED';
  const query = useChangeRequests(
    projectId,
    {
      page: 1,
      limit: 1,
      status: 'APPROVED',
      linkedDesignPackageId: designPackageId,
      sortBy: 'updatedAt',
      sortOrder: 'desc',
    },
    Boolean(projectId) && Boolean(designPackageId) && !closed,
  );

  const cr = query.data?.data?.[0];
  if (!cr || closed) {
    return null;
  }

  return (
    <Alert
      type="warning"
      showIcon
      className="!mb-3"
      message={`Revision required — Change Request ${cr.changeNumber} was approved. Upload revised versions of the affected documents to continue.`}
      action={
        onViewChangeRequest ? (
          <Button size="small" onClick={() => onViewChangeRequest(cr.id)}>
            View Change Request
          </Button>
        ) : undefined
      }
    />
  );
}
