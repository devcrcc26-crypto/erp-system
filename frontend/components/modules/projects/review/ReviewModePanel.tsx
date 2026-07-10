'use client';

import { useEffect, useMemo } from 'react';
import { Alert, Checkbox, Spin } from 'antd';
import BulkReviewActionBar from '@/components/modules/projects/review/BulkReviewActionBar';
import DependencySnapshotPanel from '@/components/modules/projects/review/DependencySnapshotPanel';
import ReviewApprovalBlockedAlert from '@/components/modules/projects/review/ReviewApprovalBlockedAlert';
import ReviewCommentPanel from '@/components/modules/projects/review/ReviewCommentPanel';
import ReviewSessionAttachmentsSection from '@/components/modules/projects/review/ReviewSessionAttachmentsSection';
import DisciplineLeadConsole from '@/components/modules/projects/review/DisciplineLeadConsole';
import GovernanceReviewPanel from '@/components/modules/projects/review/GovernanceReviewPanel';
import RequiredTiersStepIndicator from '@/components/modules/projects/review/RequiredTiersStepIndicator';
import FormLayout from '@/components/ui/FormLayout/FormLayout';
import EdvStatusBadge from '@/components/ui/EdvStatusBadge/EdvStatusBadge';
import EdvFileActions from '@/components/modules/projects/engineering/EdvFileActions';
import { useDesignPackageReviewMode } from '@/lib/query/epc-workspace';
import {
  useDesignPackage,
  useDesignPackageDependencies,
  useDesignPackages,
  useReviewContextSnapshot,
} from '@/lib/query/design-packages';
import { useEngineeringDocuments } from '@/lib/query/engineering-documents';
import { useBatchReviewApprove } from '@/lib/query/review-batch';
import { useReviewWorkspaceStore } from '@/stores/review-workspace.store';
import { useRoleLens } from '@/components/modules/projects/workspaces/RoleLensProvider';
import { canApproveReviewSession } from '@/lib/utils/comment-workflow';
import {
  canBatchApprovePackageEdvs,
  isFinalReviewTier,
} from '@/lib/utils/review-governance';
import { notifyApiError } from '@/lib/utils/notify-api-error';
import { useAppMessage } from '@/hooks/use-app-message';
import { resolveEdvDisplayLabel } from '@/lib/utils/edv-display';
import type { EngineeringDocument } from '@/lib/api/epc.types';

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
  const messageApi = useAppMessage();
  const reviewModeQuery = useDesignPackageReviewMode(packageId, Boolean(packageId));
  const packageQuery = useDesignPackage(
    projectId,
    taskDisciplineId,
    packageId,
    Boolean(projectId) && Boolean(taskDisciplineId),
  );
  const documentsQuery = useEngineeringDocuments(
    projectId,
    taskDisciplineId,
    { page: 1, limit: 100 },
    Boolean(projectId) && Boolean(taskDisciplineId),
  );

  const dependenciesQuery = useDesignPackageDependencies(
    projectId,
    taskDisciplineId,
    packageId,
    Boolean(projectId) && Boolean(taskDisciplineId),
  );
  const allPackagesQuery = useDesignPackages(
    projectId,
    taskDisciplineId,
    Boolean(projectId) && Boolean(taskDisciplineId),
  );

  const batchApprove = useBatchReviewApprove();

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
  const reviewSessionId = reviewMode?.reviewSessionId ?? null;
  const contextSnapshotQuery = useReviewContextSnapshot(
    projectId,
    taskDisciplineId,
    packageId,
    reviewSessionId,
    Boolean(reviewSessionId),
  );
  const snapshotEdvIds = useMemo(() => {
    const fromSnapshot = contextSnapshotQuery.data?.edvs.map((edv) => edv.id);
    if (fromSnapshot && fromSnapshot.length > 0) {
      return fromSnapshot;
    }
    return reviewMode?.snapshotEdvIds ?? [];
  }, [contextSnapshotQuery.data, reviewMode?.snapshotEdvIds]);
  const snapshotContentHash =
    contextSnapshotQuery.data?.contentHash ?? reviewMode?.contentHash ?? null;
  const packageEdvIds = useMemo(() => {
    const fromPackage = (packageQuery.data?.items ?? []).map(
      (item) => item.engineeringDocumentVersionId,
    );
    const fromReviewMode = reviewMode?.packageEdvIds ?? [];
    return [...new Set([...fromPackage, ...fromReviewMode])];
  }, [packageQuery.data?.items, reviewMode?.packageEdvIds]);

  const edvMap = useMemo(() => {
    const map = new Map<
      string,
      {
        doc: EngineeringDocument;
        revisionLabel: string;
        status: string;
        documentVersionId: string;
        createdAt: string;
      }
    >();
    for (const doc of documentsQuery.data?.data ?? []) {
      for (const version of doc.versions ?? []) {
        map.set(version.id, {
          doc,
          revisionLabel: version.revisionLabel,
          status: version.status,
          documentVersionId: version.documentVersionId,
          createdAt: version.createdAt,
        });
      }
    }
    return map;
  }, [documentsQuery.data?.data]);

  const packageDocumentRows = useMemo(() => {
    type EdvInfo = {
      doc: EngineeringDocument;
      revisionLabel: string;
      status: string;
      documentVersionId: string;
      createdAt: string;
    };
    type PackageDocumentRow = {
      key: string;
      packageEdvId: string;
      displayEdvId: string;
      hasNewerRevision: boolean;
      info?: EdvInfo;
    };

    const seenDocumentIds = new Set<string>();
    return packageEdvIds.flatMap((packageEdvId): PackageDocumentRow[] => {
      const pinned = edvMap.get(packageEdvId);
      if (!pinned) {
        return [
          {
            key: packageEdvId,
            packageEdvId,
            displayEdvId: packageEdvId,
            hasNewerRevision: false,
            info: undefined,
          },
        ];
      }

      if (seenDocumentIds.has(pinned.doc.id)) {
        return [];
      }
      seenDocumentIds.add(pinned.doc.id);

      const latestVersion = (pinned.doc.versions ?? []).reduce(
        (best, version) => {
          if (!best) {
            return version;
          }
          return new Date(version.createdAt) > new Date(best.createdAt)
            ? version
            : best;
        },
        pinned.doc.versions?.[0],
      );

      const displayEdvId = latestVersion?.id ?? packageEdvId;
      const displayInfo = edvMap.get(displayEdvId) ?? pinned;

      return [
        {
          key: `${pinned.doc.id}-${displayEdvId}`,
          packageEdvId,
          displayEdvId,
          hasNewerRevision: displayEdvId !== packageEdvId,
          info: displayInfo,
        },
      ];
    });
  }, [packageEdvIds, edvMap]);

  const selectableEdvIds = useMemo(
    () => packageDocumentRows.map((row) => row.packageEdvId),
    [packageDocumentRows],
  );

  const snapshotEdvs = contextSnapshotQuery.data?.edvs ?? [];

  const edvCommentOptions = useMemo(
    () =>
      packageEdvIds.map((edvId) => ({
        value: edvId,
        label: resolveEdvDisplayLabel(
          edvId,
          documentsQuery.data?.data ?? [],
          snapshotEdvs,
        ),
      })),
    [packageEdvIds, documentsQuery.data?.data, snapshotEdvs],
  );

  const sessionComments = reviewMode?.comments ?? [];
  const commentStatuses = sessionComments.map((comment) => comment.status);
  const approvalAllowed = canApproveReviewSession(commentStatuses);
  const inReviewEdvCount = packageDocumentRows.filter(
    (row) => row.info?.status === 'IN_REVIEW',
  ).length;
  const canBatchApproveEdvs = canBatchApprovePackageEdvs(
    reviewMode?.currentTier,
    packageQuery.data?.requiredTiers,
    inReviewEdvCount,
  );

  useEffect(() => {
    setActiveDesignPackage(packageId);
    setActiveReviewSession(reviewSessionId);
  }, [packageId, reviewSessionId, setActiveDesignPackage, setActiveReviewSession]);

  function refetchAll(): void {
    void reviewModeQuery.refetch();
    void contextSnapshotQuery.refetch();
    void packageQuery.refetch();
    void documentsQuery.refetch();
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
      messageApi.success('Selected EDVs approved');
      clearEdvSelection();
      refetchAll();
    } catch (error) {
      notifyApiError(error, 'Request failed', messageApi);
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
        description="Submit the subtask for review to open review mode."
      />
    );
  }

  return (
    <div className="flex flex-col space-y-4 overflow-x-hidden" data-testid="review-mode-panel">
      <ReviewApprovalBlockedAlert comments={sessionComments} />
      {!isFinalReviewTier(reviewMode?.currentTier, packageQuery.data?.requiredTiers) && (
        <Alert
          type="info"
          showIcon
          title="Governance review in progress"
          description="Use Approve & escalate in the governance console to advance to the next tier. EDV approval happens at the department chief tier."
        />
      )}
      <GovernanceReviewPanel
        designPackage={packageQuery.data}
        reviewMode={reviewMode}
      />
      <FormLayout title="Required review tiers">
        <RequiredTiersStepIndicator
          requiredTiers={packageQuery.data?.requiredTiers ?? []}
          currentTier={reviewMode?.currentTier}
          sessionStatus={reviewMode?.sessionStatus}
        />
      </FormLayout>
      <BulkReviewActionBar
        selectedCount={selectedEdvIds.length}
        totalCount={selectableEdvIds.length}
        onSelectAll={() => selectAllEdvs(selectableEdvIds)}
        onClearSelection={clearEdvSelection}
        onApproveAll={() => void handleBatchApprove()}
        approveLoading={batchApprove.isPending}
        disabled={!lens.canApproveReview || !approvalAllowed}
        showApproveAll={canBatchApproveEdvs}
      />

      <section className="min-w-0 rounded-lg border border-slate-200 bg-white p-4">
        <h3 className="mb-1 text-sm font-semibold text-slate-900">Documents</h3>
        <p className="mb-4 text-xs text-slate-500">
          Select package items for batch approve or return. Use the icons to
          view or download each file.
        </p>
        {packageDocumentRows.length === 0 ? (
          <Alert
            type="info"
            showIcon
            title="No documents in package"
            description="The subtask has no engineering document versions linked yet."
          />
        ) : (
          <ul className="divide-y divide-slate-100">
            {packageDocumentRows.map((row) => {
              const info = row.info;
              return (
                <li
                  key={row.key}
                  className="flex flex-col gap-2 py-3 first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="flex min-w-0 flex-1 items-start gap-3">
                    <Checkbox
                      className="mt-0.5 shrink-0"
                      checked={isEdvSelected(row.packageEdvId)}
                      disabled={!lens.canApproveReview}
                      onChange={() => toggleEdvSelection(row.packageEdvId)}
                    />
                    <div className="min-w-0 flex-1">
                      <p className="break-words text-sm font-medium text-slate-900">
                        {info
                          ? info.doc.title?.trim() ||
                            info.doc.documentNumber?.trim() ||
                            'Engineering document'
                          : resolveEdvDisplayLabel(
                              row.displayEdvId,
                              documentsQuery.data?.data ?? [],
                              snapshotEdvs,
                            )}
                      </p>
                      <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                        {info?.revisionLabel && (
                          <span>Rev {info.revisionLabel}</span>
                        )}
                        {row.hasNewerRevision && (
                          <span className="font-medium text-emerald-700">
                            New revision uploaded
                          </span>
                        )}
                        {info?.doc.documentNumber && (
                          <span>{info.doc.documentNumber}</span>
                        )}
                        {info?.status && (
                          <EdvStatusBadge status={info.status} />
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="shrink-0 pl-8 sm:pl-0">
                    <EdvFileActions
                      compact
                      documentVersionId={info?.documentVersionId}
                      fileName={info?.doc.title}
                    />
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <DisciplineLeadConsole
        projectId={projectId}
        taskDisciplineId={taskDisciplineId}
        packageId={packageId}
        reviewSessionId={reviewSessionId}
        currentTier={reviewMode?.currentTier ?? null}
        requiredTiers={packageQuery.data?.requiredTiers ?? []}
        instituteChiefUserId={packageQuery.data?.instituteChiefUserId ?? null}
        instituteChiefName={packageQuery.data?.instituteChiefName ?? null}
        comments={sessionComments}
        onAction={refetchAll}
      />
      <ReviewSessionAttachmentsSection
        projectId={projectId}
        taskDisciplineId={taskDisciplineId}
        packageId={packageId}
        reviewSessionId={reviewSessionId}
        currentTier={reviewMode?.currentTier ?? null}
        requiredTiers={packageQuery.data?.requiredTiers ?? []}
      />
      <DependencySnapshotPanel
        dependencies={dependenciesQuery.data ?? []}
        packages={allPackagesQuery.data ?? []}
        documents={documentsQuery.data?.data ?? []}
        snapshotEdvIds={snapshotEdvIds}
        contentHash={snapshotContentHash}
      />
      <ReviewCommentPanel
        reviewMode={reviewMode}
        edvOptions={edvCommentOptions}
        snapshotEdvLabels={snapshotEdvs}
        projectId={projectId}
        taskDisciplineId={taskDisciplineId}
        onCommentAdded={refetchAll}
      />
    </div>
  );
}
