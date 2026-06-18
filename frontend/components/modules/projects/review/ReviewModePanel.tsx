'use client';

import { useEffect } from 'react';
import { Alert, Checkbox, message, Spin } from 'antd';
import BulkReviewActionBar from '@/components/modules/projects/review/BulkReviewActionBar';
import DependencySnapshotPanel from '@/components/modules/projects/review/DependencySnapshotPanel';
import ReviewApprovalBlockedAlert from '@/components/modules/projects/review/ReviewApprovalBlockedAlert';
import ReviewCommentPanel from '@/components/modules/projects/review/ReviewCommentPanel';
import DisciplineLeadConsole from '@/components/modules/projects/review/DisciplineLeadConsole';
import GovernanceReviewPanel from '@/components/modules/projects/review/GovernanceReviewPanel';
import { useDesignPackageReviewMode } from '@/lib/query/epc-workspace';
import {
  useDesignPackage,
} from '@/lib/query/design-packages';
import { useBatchReviewApprove, useBatchReviewReturn } from '@/lib/query/review-batch';
import { useReviewWorkspaceStore } from '@/stores/review-workspace.store';
import { useRoleLens } from '@/components/modules/projects/workspaces/RoleLensProvider';
import { canApproveReviewSession } from '@/lib/utils/comment-workflow';
import { notifyApiError } from '@/lib/utils/notify-api-error';

export default function ReviewModePanel({
  packageId,
  projectId,
  taskDisciplineId,
}: {
  packageId: string;
  projectId: string;
  taskDisciplineId: string;
}): React.ReactNode {
  const lens = useRoleLens();
  const reviewModeQuery = useDesignPackageReviewMode(packageId, Boolean(packageId));
  const packageQuery = useDesignPackage(
    projectId,
    taskDisciplineId,
    packageId,
    Boolean(projectId) && Boolean(taskDisciplineId),
  );

  const batchApprove = useBatchReviewApprove();
  const batchReturn = useBatchReviewReturn();

  const {
    selectedEdvIds,
    setActiveDesignPackage,
    setActiveReviewSession,
    toggleEdvSelection,
    selectAllEdvs,
    clearEdvSelection,
    isEdvSelected,
  } = useReviewWorkspaceStore();

  const reviewMode = reviewModeQuery.data;
  const snapshotIds = [...(reviewMode?.snapshotEdvIds ?? [])];
  const reviewSessionId = reviewMode?.reviewSessionId ?? null;
  const sessionComments = reviewMode?.comments ?? [];
  const commentStatuses = sessionComments.map((comment) => comment.status);
  const approvalAllowed = canApproveReviewSession(commentStatuses);

  useEffect(() => {
    setActiveDesignPackage(packageId);
    setActiveReviewSession(reviewSessionId);
  }, [packageId, reviewSessionId, setActiveDesignPackage, setActiveReviewSession]);

  function refetchAll(): void {
    void reviewModeQuery.refetch();
    void packageQuery.refetch();
  }

  async function handleBatchApprove(): Promise<void> {
    if (!reviewSessionId || selectedEdvIds.length === 0) {
      return;
    }
    try {
      await batchApprove.mutateAsync({
        designPackageId: packageId,
        reviewSessionId,
        engineeringDocumentVersionIds: selectedEdvIds,
      });
      message.success('Selected EDVs approved');
      clearEdvSelection();
      refetchAll();
    } catch (error) {
      notifyApiError(error);
    }
  }

  async function handleBatchReturn(): Promise<void> {
    if (!reviewSessionId || selectedEdvIds.length === 0) {
      return;
    }
    try {
      await batchReturn.mutateAsync({
        designPackageId: packageId,
        reviewSessionId,
        engineeringDocumentVersionIds: selectedEdvIds,
        commentTemplate: 'Returned in batch review',
      });
      message.success('Selected EDVs returned');
      clearEdvSelection();
      refetchAll();
    } catch (error) {
      notifyApiError(error);
    }
  }

  if (reviewModeQuery.isLoading) {
    return (
      <div className="flex justify-center py-16">
        <Spin size="large" />
      </div>
    );
  }

  if (!reviewSessionId) {
    return (
      <Alert
        type="info"
        showIcon
        title="No active review session"
        description="Submit the design package for review to open review mode."
      />
    );
  }

  return (
    <div className="flex min-h-[calc(100vh-8rem)] flex-col gap-4" data-testid="review-mode-panel">
      <ReviewApprovalBlockedAlert comments={sessionComments} />
      <BulkReviewActionBar
        selectedCount={selectedEdvIds.length}
        totalCount={snapshotIds.length}
        onSelectAll={() => selectAllEdvs(snapshotIds)}
        onClearSelection={clearEdvSelection}
        onApproveAll={() => void handleBatchApprove()}
        onReturnAll={() => void handleBatchReturn()}
        approveLoading={batchApprove.isPending}
        returnLoading={batchReturn.isPending}
        disabled={!lens.canApproveReview || !approvalAllowed}
      />

      <div className="grid flex-1 gap-4 lg:grid-cols-4">
        {/* LEFT 50% — document list / preview placeholder */}
        <div className="rounded-lg border border-slate-200 bg-white p-4 lg:col-span-2">
          <h3 className="mb-3 text-sm font-semibold text-slate-900">Documents</h3>
          <p className="mb-3 text-xs text-slate-500">
            PDF coordinate markup is planned for v2. Select EDVs for batch actions.
          </p>
          <ul className="divide-y divide-slate-100">
            {snapshotIds.map((edvId) => (
              <li key={edvId} className="py-2">
                <Checkbox
                  checked={isEdvSelected(edvId)}
                  disabled={!lens.canApproveReview}
                  onChange={() => toggleEdvSelection(edvId)}
                >
                  <span className="font-mono text-xs">{edvId}</span>
                </Checkbox>
              </li>
            ))}
          </ul>
        </div>

        {/* CENTER 25% — comments */}
        <div className="lg:col-span-1">
          <ReviewCommentPanel reviewMode={reviewMode} onCommentAdded={refetchAll} />
        </div>

        {/* RIGHT 25% — dependencies + governance */}
        <div className="space-y-4 lg:col-span-1">
          <DependencySnapshotPanel reviewMode={reviewMode} />
          <DisciplineLeadConsole
            projectId={projectId}
            taskDisciplineId={taskDisciplineId}
            packageId={packageId}
            reviewSessionId={reviewSessionId}
            currentTier={reviewMode?.currentTier ?? null}
            comments={sessionComments}
            onAction={refetchAll}
          />
          <GovernanceReviewPanel
            designPackage={packageQuery.data}
            reviewMode={reviewMode}
          />
        </div>
      </div>
    </div>
  );
}
