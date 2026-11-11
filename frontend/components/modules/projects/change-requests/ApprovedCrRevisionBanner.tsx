'use client';

import { useState } from 'react';
import { Alert, Button } from 'antd';
import { useChangeRequests } from '@/lib/query/change-requests';
import ChangeRequestDrawer from '@/components/modules/projects/change-requests/ChangeRequestDrawer';

/**
 * Amber banner when an approved CR requires designer revision on a subtask.
 */
export default function ApprovedCrRevisionBanner({
  projectId,
  designPackageId,
  packageStatus,
  onViewChangeRequest,
  embedDrawer = false,
}: {
  projectId: string;
  designPackageId: string;
  packageStatus?: string | null;
  /** When set, parent owns the detail drawer (e.g. subtask detail page). */
  onViewChangeRequest?: (changeRequestId: string) => void;
  /** When true, opens ChangeRequestDrawer locally (e.g. My Work). */
  embedDrawer?: boolean;
}): React.ReactNode {
  const [drawerCrId, setDrawerCrId] = useState<string | null>(null);
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

  const changeRequestId = cr.id;

  function handleViewClick(event: React.MouseEvent<HTMLElement>): void {
    event.preventDefault();
    event.stopPropagation();
    if (onViewChangeRequest) {
      onViewChangeRequest(changeRequestId);
      return;
    }
    if (embedDrawer) {
      setDrawerCrId(changeRequestId);
    }
  }

  const showViewButton = Boolean(onViewChangeRequest || embedDrawer);

  return (
    <>
      <Alert
        type="warning"
        showIcon
        className="!mb-3"
        title={`Revision required - Change Request ${cr.changeNumber} was approved. Upload revised versions of the affected documents to continue.`}
        action={
          showViewButton ? (
            <Button
              size="small"
              type="default"
              htmlType="button"
              onClick={handleViewClick}
            >
              View Change Request
            </Button>
          ) : undefined
        }
      />

      {embedDrawer && !onViewChangeRequest ? (
        <ChangeRequestDrawer
          projectId={projectId}
          changeRequestId={drawerCrId}
          onClose={() => setDrawerCrId(null)}
          onUpdated={() => undefined}
        />
      ) : null}
    </>
  );
}
