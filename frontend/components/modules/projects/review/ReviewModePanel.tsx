'use client';

import { useEffect, useMemo, useState } from 'react';
import { Alert, Button, Spin } from 'antd';
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
import { useProjectDiscipline } from '@/lib/query/disciplines';
import { useEngineeringDocuments } from '@/lib/query/engineering-documents';
import { usePackageRoleLens } from '@/lib/hooks/use-package-role-lens';
import { useAuthStore } from '@/stores/auth.store';
import { useRoleLens } from '@/components/modules/projects/workspaces/RoleLensProvider';
import {
  canUserActAtCurrentReviewTier,
  isFinalReviewTier,
  isGovernanceReviewTier,
} from '@/lib/utils/review-governance';
import { resolveEdvDisplayLabel } from '@/lib/utils/edv-display';
import { tokens } from '@/lib/theme/tokens';
import { formatProjectDate } from '@/lib/utils/project-display';
import type { EngineeringDocument, ReviewTier } from '@/lib/api/epc.types';

export default function ReviewModePanel({
  packageId,
  projectId,
  taskDisciplineId,
  expectedReviewSessionId = null,
  readOnly = false,
  actionTaken = null,
  actionTakenAt = null,
}: {
  packageId: string;
  projectId: string;
  taskDisciplineId: string;
  expectedReviewSessionId?: string | null;
  readOnly?: boolean;
  actionTaken?: 'APPROVED' | 'RETURNED' | null;
  actionTakenAt?: string | null;
}): React.ReactNode {
  const lens = useRoleLens();
  const currentUserId = useAuthStore((state) => state.user?.id);
  const reviewModeQuery = useDesignPackageReviewMode(
    packageId,
    Boolean(packageId),
    expectedReviewSessionId,
  );
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
  const disciplineQuery = useProjectDiscipline(projectId, taskDisciplineId);

  const [approvedDocIds, setApprovedDocIds] = useState<Set<string>>(() => new Set());

  const reviewMode = reviewModeQuery.data;
  const reviewSessionId = reviewMode?.reviewSessionId ?? null;
  const packageLens = usePackageRoleLens(
    packageQuery.data,
    disciplineQuery.data,
    (reviewMode?.currentTier as ReviewTier | null | undefined) ?? null,
  );
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
    // Prefer review-mode IDs (already resolved to isCurrent drafts after rework).
    const fromReviewMode = reviewMode?.packageEdvIds ?? [];
    if (fromReviewMode.length > 0) {
      return [...fromReviewMode];
    }
    return (packageQuery.data?.items ?? []).map(
      (item) => item.engineeringDocumentVersionId,
    );
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

      // Prefer the package/review-mode EDV when it is already the newest;
      // otherwise surface the newest uploaded revision for download/display.
      const displayEdvId =
        latestVersion &&
        new Date(latestVersion.createdAt) > new Date(pinned.createdAt)
          ? latestVersion.id
          : packageEdvId;
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

  const snapshotEdvs = contextSnapshotQuery.data?.edvs ?? [];

  const edvCommentOptions = useMemo(
    () =>
      packageDocumentRows.map((row) => {
        const resolvedEdvId = row.displayEdvId ?? row.packageEdvId;
        return {
          value: resolvedEdvId,
          label: resolveEdvDisplayLabel(
            resolvedEdvId,
            documentsQuery.data?.data ?? [],
            snapshotEdvs,
          ),
        };
      }),
    [packageDocumentRows, documentsQuery.data?.data, snapshotEdvs],
  );

  const sessionComments = reviewMode?.comments ?? [];
  const totalDocs = packageDocumentRows.length;
  const allDocumentsApproved = approvedDocIds.size === totalDocs && totalDocs > 0;
  const canShowPerDocumentApprove =
    !readOnly &&
    reviewMode?.sessionStatus === 'ACTIVE' &&
    isGovernanceReviewTier(reviewMode?.currentTier) &&
    canUserActAtCurrentReviewTier(
      packageLens,
      disciplineQuery.data,
      currentUserId,
      reviewMode?.currentTier,
      packageQuery.data?.instituteChiefUserId ?? null,
      packageQuery.data?.instituteChiefName,
      lens.canApproveReview,
    );

  useEffect(() => {
    setApprovedDocIds(new Set());
  }, [reviewSessionId]);

  function refetchAll(): void {
    void reviewModeQuery.refetch();
    void contextSnapshotQuery.refetch();
    void packageQuery.refetch();
    void documentsQuery.refetch();
  }

  function approveDocument(packageEdvId: string): void {
    setApprovedDocIds((previous) => {
      const next = new Set(previous);
      next.add(packageEdvId);
      return next;
    });
  }

  function approveAllDocuments(): void {
    setApprovedDocIds(
      new Set(packageDocumentRows.map((row) => row.packageEdvId)),
    );
  }

  if (reviewModeQuery.isLoading || (reviewModeQuery.isFetching && !reviewMode)) {
    return (
      <div className="flex justify-center py-16">
        <Spin size="large" />
      </div>
    );
  }

  if (reviewModeQuery.isError) {
    return (
      <Alert
        type="error"
        showIcon
        title="Could not load review session"
        description="The review session could not be loaded. Try again."
        action={
          <Button size="small" onClick={() => void reviewModeQuery.refetch()}>
            Retry
          </Button>
        }
      />
    );
  }

  if (!reviewSessionId) {
    if (expectedReviewSessionId) {
      return (
        <Alert
          type="warning"
          showIcon
          title="Review session not found"
          description="This subtask was opened from your review inbox, but its active session could not be loaded."
          action={
            <Button size="small" onClick={() => void reviewModeQuery.refetch()}>
              Retry
            </Button>
          }
        />
      );
    }

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
      {readOnly && (
        <Alert
          type="info"
          showIcon
          message="Viewing completed review - actions disabled"
          description={
            <>
              {actionTaken
                ? `You ${actionTaken === 'APPROVED' ? 'approved' : 'returned'} this subtask${
                    actionTakenAt ? ` on ${formatProjectDate(actionTakenAt)}` : ''
                  }. `
                : ''}
              You can still add comments.
            </>
          }
        />
      )}
      <ReviewApprovalBlockedAlert comments={sessionComments} />
      {!isFinalReviewTier(reviewMode?.currentTier, packageQuery.data?.requiredTiers) && (
        <Alert
          type="info"
          showIcon
          title="Governance review in progress"
          description="After the Institute Chief approves, the Department Chief locks all documents. The Discipline Leader then closes the subtask."
        />
      )}
      <GovernanceReviewPanel
        designPackage={packageQuery.data}
        reviewMode={reviewMode}
      />
      {reviewMode?.sessionStatus && (
        <FormLayout title="Required review tiers">
          <RequiredTiersStepIndicator
            requiredTiers={packageQuery.data?.requiredTiers ?? []}
            currentTier={reviewMode?.currentTier}
            sessionStatus={reviewMode?.sessionStatus}
          />
        </FormLayout>
      )}

      <section className="min-w-0 rounded-lg border border-slate-200 bg-white p-4">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="mb-1 text-sm font-semibold text-slate-900">Documents</h3>
            <p className="text-xs text-slate-500">
              Review each document and approve before escalating. Use the icons to
              view or download each file.
            </p>
          </div>
          {!readOnly && (
            <Button
              size="small"
              type="default"
              className="shrink-0"
              onClick={approveAllDocuments}
              disabled={!canShowPerDocumentApprove || allDocumentsApproved}
            >
              Approve all
            </Button>
          )}
        </div>
        {packageDocumentRows.length === 0 ? (
          <Alert
            type="info"
            showIcon
            title="No documents in subtask"
            description="The subtask has no engineering document versions linked yet."
          />
        ) : (
          <ul className="divide-y divide-slate-100">
            {packageDocumentRows.map((row) => {
              const info = row.info;
              const isDocumentApproved = approvedDocIds.has(row.packageEdvId);
              return (
                <li
                  key={row.key}
                  className="flex flex-col gap-2 py-3 first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between"
                >
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
                  <div className="flex shrink-0 items-center gap-2">
                    {canShowPerDocumentApprove ? (
                      isDocumentApproved ? (
                        <Button type="primary" size="small" disabled>
                          Approved ✓
                        </Button>
                      ) : (
                        <Button
                          type="default"
                          size="small"
                          onClick={() => approveDocument(row.packageEdvId)}
                        >
                          Approve
                        </Button>
                      )
                    ) : null}
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
        {totalDocs > 0 ? (
          <p
            className="mt-3 text-sm"
            style={{
              color: allDocumentsApproved
                ? tokens.colorPrimary
                : tokens.colorTextSecondary,
            }}
          >
            {approvedDocIds.size} of {totalDocs} documents approved
          </p>
        ) : null}
      </section>

      <DisciplineLeadConsole
        projectId={projectId}
        taskDisciplineId={taskDisciplineId}
        packageId={packageId}
        reviewSessionId={reviewSessionId}
        sessionStatus={reviewMode?.sessionStatus ?? null}
        currentTier={reviewMode?.currentTier ?? null}
        requiredTiers={packageQuery.data?.requiredTiers ?? []}
        instituteChiefUserId={packageQuery.data?.instituteChiefUserId ?? null}
        instituteChiefName={packageQuery.data?.instituteChiefName ?? null}
        comments={sessionComments}
        allDocumentsApproved={allDocumentsApproved}
        availableDocuments={edvCommentOptions}
        onAction={refetchAll}
        readOnly={readOnly}
      />
      <ReviewSessionAttachmentsSection
        projectId={projectId}
        taskDisciplineId={taskDisciplineId}
        packageId={packageId}
        reviewSessionId={reviewSessionId}
        currentTier={reviewMode?.currentTier ?? null}
        requiredTiers={packageQuery.data?.requiredTiers ?? []}
        readOnly={readOnly}
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
