// UI polish pass - styles only, no logic changes

'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import {
  Alert,
  Breadcrumb,
  Button,
  Space,
  Tooltip,
  Typography,
} from 'antd';
import FormLayout, { PageLoadingSkeleton } from '@/components/ui/FormLayout/FormLayout';
import StackedName from '@/components/ui/StackedName/StackedName';
import ReviewApprovalBlockedAlert from '@/components/modules/projects/review/ReviewApprovalBlockedAlert';
import ReturnedSessionBanner from '@/components/modules/projects/review/ReturnedSessionBanner';
import RequiredTiersStepIndicator from '@/components/modules/projects/review/RequiredTiersStepIndicator';
import ReviewSessionAttachmentsSection from '@/components/modules/projects/review/ReviewSessionAttachmentsSection';
import ProjectedStatusBadge from '@/components/ui/EdvStatusBadge/ProjectedStatusBadge';
import PackageStatusBadge from '@/components/ui/EdvStatusBadge/PackageStatusBadge';
import ConfirmDialog from '@/components/ui/ConfirmDialog/ConfirmDialog';
import ProjectionLagHelper from '@/components/modules/projects/workspaces/ProjectionLagHelper';
import {
  DesignPackageAddDependencyModal,
  DesignPackageDependenciesTable,
  DesignPackageItemsTable,
} from '@/components/modules/projects/design-packages/DesignPackagePanel';
import DesignPackageCommentsSection from '@/components/modules/projects/design-packages/DesignPackageCommentsSection';
import DesignPackageUploadModal from '@/components/modules/projects/design-packages/DesignPackageUploadModal';
import DesignPackageBuilder from '@/components/modules/projects/design-packages/DesignPackageBuilder';
import VersionHistoryTimeline from '@/components/modules/projects/engineering/VersionHistoryTimeline';
import { useProjectDiscipline } from '@/lib/query/disciplines';
import {
  useBatchApprovePackageEdvs,
  useCloseDesignPackage,
  useDesignPackage,
  useDesignPackageDependencies,
  useDesignPackages,
  useReopenDesignPackage,
  useSubmitPackageForReview,
} from '@/lib/query/design-packages';
import {
  useEngineeringDocuments,
  useTransitionEdvStatus,
} from '@/lib/query/engineering-documents';
import { useRoleLens } from '@/components/modules/projects/workspaces/RoleLensProvider';
import { usePermissionsLoading, useCanViewMyWork } from '@/hooks/use-pm-capabilities';
import { useDesignPackageReviewMode } from '@/lib/query/epc-workspace';
import {
  getPackageLockGuidance,
  getPackageSubmitEligibility,
  isPackageReadyToClose,
} from '@/lib/utils/package-workflow';
import {
  canBatchApprovePackageEdvs,
} from '@/lib/utils/review-governance';
import { notifyApiError } from '@/lib/utils/notify-api-error';
import { useAppMessage } from '@/hooks/use-app-message';
import { useAuthStore } from '@/stores/auth.store';
import { usePackageRoleLens } from '@/lib/hooks/use-package-role-lens';
import type { ReviewTier } from '@/lib/api/epc.types';
import { resolvePackageRoles } from '@/lib/utils/subtask-role-resolver';
import { formatActingAsLabel } from '@/lib/utils/subtask-role-display';
import { resolveDisciplineDisplayLabel } from '@/lib/utils/discipline-number';
import {
  canAccessDisciplineWorkspace,
  canManageSubtaskAsDisciplineLeader,
} from '@/lib/utils/subtask-permissions';
import { reviewModeHref } from '@/lib/utils/schedule-subtasks';
import ProjectModuleGate from '@/components/modules/projects/ProjectModuleGate';
import ResourceRoleContextBadge from '@/components/modules/projects/workspaces/ResourceRoleContextBadge';
import ApprovedCrRevisionBanner from '@/components/modules/projects/change-requests/ApprovedCrRevisionBanner';
import ChangeRequestDrawer from '@/components/modules/projects/change-requests/ChangeRequestDrawer';
import { useCurrentUser } from '@/lib/query/profile';
import { useEpcCapabilities } from '@/hooks/use-pm-capabilities';
import { layout } from '@/lib/theme/layout';
import { formatProjectDate } from '@/lib/utils/project-display';
import {
  formatTaskReviewLevelLabel,
  formatUrgencyLevelLabel,
} from '@/lib/constants/task-comment8';

export default function DesignPackageDetailPageContent({
  projectId,
  taskDisciplineId,
  packageId,
}: {
  projectId: string;
  taskDisciplineId: string;
  packageId: string;
}): React.ReactNode {
  const lens = useRoleLens();
  const epc = useEpcCapabilities();
  const permLoading = usePermissionsLoading();
  const canViewMyWork = useCanViewMyWork();
  const messageApi = useAppMessage();
  const currentUserId = useAuthStore((state) => state.user?.id);
  const isSystemAdministrator = useAuthStore(
    (state) => state.capabilities.isSystemAdministrator,
  );
  const hasElevatedAccess = isSystemAdministrator || epc.navFullAccess;
  const { data: profile } = useCurrentUser();
  const [closePackageOpen, setClosePackageOpen] = useState(false);
  const [reopenPackageOpen, setReopenPackageOpen] = useState(false);
  const [lockUnlockEdvId, setLockUnlockEdvId] = useState<string | null>(null);
  const [selectedCrId, setSelectedCrId] = useState<string | null>(null);
  const [editSubtaskOpen, setEditSubtaskOpen] = useState(false);
  const [addDependencyOpen, setAddDependencyOpen] = useState(false);
  const [uploadModalOpen, setUploadModalOpen] = useState(false);

  const canViewPackage =
    !permLoading &&
    (lens.canViewEngineering || lens.canViewReviewInbox || canViewMyWork);

  const disciplineQuery = useProjectDiscipline(
    projectId,
    taskDisciplineId,
    !permLoading && canViewPackage,
  );
  const packageQuery = useDesignPackage(
    projectId,
    taskDisciplineId,
    packageId,
    canViewPackage,
  );
  const reviewModeQuery = useDesignPackageReviewMode(packageId, canViewPackage);
  const dependenciesQuery = useDesignPackageDependencies(
    projectId,
    taskDisciplineId,
    packageId,
    canViewPackage,
  );
  const allPackagesQuery = useDesignPackages(
    projectId,
    taskDisciplineId,
    canViewPackage,
  );
  const documentsQuery = useEngineeringDocuments(
    projectId,
    taskDisciplineId,
    { page: 1, limit: 100 },
    canViewPackage,
  );

  const submitForReview = useSubmitPackageForReview();
  const batchApproveEdvs = useBatchApprovePackageEdvs();
  const closeDesignPackage = useCloseDesignPackage(projectId, taskDisciplineId);
  const reopenDesignPackage = useReopenDesignPackage(projectId, taskDisciplineId);
  const transitionEdv = useTransitionEdvStatus();

  const pkg = packageQuery.data;
  const discipline = disciplineQuery.data;
  const reviewMode = reviewModeQuery.data;
  const packageLens = usePackageRoleLens(
    pkg,
    discipline,
    (reviewMode?.currentTier as ReviewTier | null | undefined) ?? null,
  );
  const isAssignedDesigner = packageLens.canSubmitPackage;
  const packageDocuments = useMemo(() => {
    const documents = documentsQuery.data?.data ?? [];
    const versionToDoc = new Map<string, { id: string; title: string }>();
    for (const doc of documents) {
      for (const version of doc.versions ?? []) {
        versionToDoc.set(version.id, { id: doc.id, title: doc.title });
      }
    }
    const seen = new Map<string, { id: string; title: string }>();
    for (const item of pkg?.items ?? []) {
      const doc = versionToDoc.get(item.engineeringDocumentVersionId);
      if (doc && !seen.has(doc.id)) {
        seen.set(doc.id, doc);
      }
    }
    return [...seen.values()];
  }, [pkg?.items, documentsQuery.data]);
  const reviewSessionId = reviewMode?.reviewSessionId;
  const sessionComments = reviewMode?.comments ?? [];
  const lastReturnedComments = reviewMode?.lastReturnedSessionComments ?? [];
  const commentsToCheck = reviewSessionId ? sessionComments : lastReturnedComments;
  const hasUnacknowledgedComments = commentsToCheck.some(
    (comment) => comment.status === 'OPEN' || comment.status === 'IN_PROGRESS',
  );

  if (permLoading || packageQuery.isLoading || disciplineQuery.isLoading) {
    return <PageLoadingSkeleton />;
  }

  if (!lens.canViewEngineering && !lens.canViewReviewInbox && !canViewMyWork) {
    return (
      <Alert
        type="warning"
        showIcon
        title="You do not have access to this subtask."
      />
    );
  }

  if (!pkg || !discipline) {
    return <Alert type="error" showIcon title="Subtask not found" />;
  }

  const lockGuidance = getPackageLockGuidance(
    pkg.items,
    documentsQuery.data?.data ?? [],
    Boolean(reviewSessionId),
  );
  const submitEligibility = getPackageSubmitEligibility(
    pkg,
    pkg.items,
    documentsQuery.data?.data ?? [],
    Boolean(reviewSessionId),
  );
  const canApproveAllInReview =
    packageLens.canApproveAtTier &&
    Boolean(reviewSessionId) &&
    canBatchApprovePackageEdvs(
      reviewMode?.currentTier,
      pkg.requiredTiers,
      lockGuidance.inReviewEdvIds.length,
    );
  const isDisciplineLeader = canManageSubtaskAsDisciplineLeader(
    discipline,
    currentUserId,
    hasElevatedAccess,
  );
  const canLinkDisciplineWorkspace = canAccessDisciplineWorkspace(
    discipline,
    currentUserId,
    hasElevatedAccess,
  );
  const disciplineLabel = resolveDisciplineDisplayLabel(discipline);
  const canManageLockUnlockClose =
    isDisciplineLeader || packageLens.isPackageDisciplineLeader;
  const canLockUnlockEdvs =
    canManageLockUnlockClose && pkg.packageStatus !== 'CLOSED';
  const canClosePackage =
    canManageLockUnlockClose &&
    isPackageReadyToClose({
      packageStatus: pkg.packageStatus,
      projectedStatus: pkg.projectedStatus,
      sessionStatus: reviewMode?.sessionStatus,
      items: pkg.items,
      documents: documentsQuery.data?.data ?? [],
    });
  const canReopenPackage =
    canManageLockUnlockClose && pkg.packageStatus === 'CLOSED';

  const { primaryRole, secondaryReviewRole } = resolvePackageRoles(
    pkg,
    discipline,
    currentUserId ?? '',
  );
  const companyAdminFallback =
    epc.navFullAccess || profile?.roles.some((role) => role.name === 'Project Administrator')
      ? 'Project Admin'
      : null;
  const actingAsLabel = formatActingAsLabel(
    primaryRole,
    secondaryReviewRole,
    companyAdminFallback,
  );
  const actingAsReadOnly =
    primaryRole === null && companyAdminFallback !== null;

  async function handleApproveAllEdvs(): Promise<void> {
    if (!reviewSessionId || lockGuidance.inReviewEdvIds.length === 0) {
      return;
    }
    try {
      await batchApproveEdvs.mutateAsync({
        projectId,
        taskDisciplineId,
        packageId,
        body: {
          reviewSessionId,
          engineeringDocumentVersionIds: lockGuidance.inReviewEdvIds,
        },
      });
      messageApi.success('Subtask documents approved');
      void packageQuery.refetch();
      void documentsQuery.refetch();
      void reviewModeQuery.refetch();
    } catch (error) {
      notifyApiError(error, 'Failed to approve subtask documents', messageApi);
    }
  }

  async function handleSubmitForReview(): Promise<void> {
    try {
      await submitForReview.mutateAsync({
        projectId,
        taskDisciplineId,
        packageId,
      });
      messageApi.success('Subtask submitted for review');
      void packageQuery.refetch();
      void reviewModeQuery.refetch();
    } catch (error) {
      notifyApiError(error, 'Request failed', messageApi);
    }
  }

  async function handleLockEdv(item: {
    engineeringDocumentId: string;
    engineeringDocumentVersionId: string;
  }): Promise<void> {
    setLockUnlockEdvId(item.engineeringDocumentVersionId);
    try {
      await transitionEdv.mutateAsync({
        projectId,
        taskDisciplineId,
        engineeringDocumentId: item.engineeringDocumentId,
        versionId: item.engineeringDocumentVersionId,
        body: {
          targetStatus: 'LOCKED',
          reason: 'Discipline leader lock',
        },
      });
      messageApi.success('Document locked');
      void packageQuery.refetch();
      void documentsQuery.refetch();
    } catch (error) {
      notifyApiError(error, 'Failed to lock document', messageApi);
    } finally {
      setLockUnlockEdvId(null);
    }
  }

  async function handleUnlockEdv(item: {
    engineeringDocumentId: string;
    engineeringDocumentVersionId: string;
  }): Promise<void> {
    setLockUnlockEdvId(item.engineeringDocumentVersionId);
    try {
      await transitionEdv.mutateAsync({
        projectId,
        taskDisciplineId,
        engineeringDocumentId: item.engineeringDocumentId,
        versionId: item.engineeringDocumentVersionId,
        body: {
          targetStatus: 'APPROVED',
          reason: 'Discipline leader unlock after subtask reopen',
        },
      });
      messageApi.success('Document unlocked');
      void packageQuery.refetch();
      void documentsQuery.refetch();
    } catch (error) {
      notifyApiError(error, 'Failed to unlock document', messageApi);
    } finally {
      setLockUnlockEdvId(null);
    }
  }

  return (
    <ProjectModuleGate projectId={projectId} module="design_packages">
    <div className={layout.pageStack}>
      <Breadcrumb
        items={[
          {
            title: canLinkDisciplineWorkspace ? (
              <Link href={`/projects/${projectId}/disciplines/${taskDisciplineId}`}>
                {disciplineLabel}
              </Link>
            ) : (
              disciplineLabel
            ),
          },
          { title: pkg.subtaskId ?? pkg.name },
        ]}
      />

      <FormLayout
        description={
          <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:gap-3">
            <span>Subtask items, dependencies, and workflow actions.</span>
            {actingAsLabel ? (
              <ResourceRoleContextBadge
                label={actingAsLabel}
                readOnly={actingAsReadOnly}
              />
            ) : null}
          </div>
        }
        extra={
          <Space wrap>
            {isDisciplineLeader && (
              <Button onClick={() => setEditSubtaskOpen(true)}>Edit subtask</Button>
            )}
            {reviewSessionId && packageLens.canAddReviewComment && (
              <Link href={reviewModeHref(projectId, taskDisciplineId, packageId)}>
                <Button type="primary">Open review mode</Button>
              </Link>
            )}
            {isAssignedDesigner && (
              <Tooltip
                title={
                  hasUnacknowledgedComments
                    ? 'Acknowledge all comments before resubmitting'
                    : submitEligibility.reason ?? undefined
                }
              >
                <Button
                  type="primary"
                  loading={submitForReview.isPending}
                  disabled={hasUnacknowledgedComments || !submitEligibility.submittable}
                  onClick={() => void handleSubmitForReview()}
                >
                  Submit for review
                </Button>
              </Tooltip>
            )}
            {canApproveAllInReview && (
              <Button
                type="primary"
                loading={batchApproveEdvs.isPending}
                onClick={() => void handleApproveAllEdvs()}
              >
                Approve all EDVs
              </Button>
            )}
            {canClosePackage && (
              <Button onClick={() => setClosePackageOpen(true)}>
                Close subtask
              </Button>
            )}
            {canReopenPackage && (
              <Button onClick={() => setReopenPackageOpen(true)}>
                Reopen subtask
              </Button>
            )}
          </Space>
        }
      >
        <ApprovedCrRevisionBanner
          projectId={projectId}
          designPackageId={packageId}
          packageStatus={pkg.packageStatus}
          onViewChangeRequest={(id) => setSelectedCrId(id)}
        />

        <div className="mb-6 border-b border-slate-200 pb-6">
          <StackedName
            name={pkg.name}
            nameZh={pkg.nameZh}
            className="text-lg font-semibold text-slate-900"
          />

          <div className="mt-4">
            <p className="mb-1 text-xs text-slate-500">Subtask ID</p>
            {pkg.subtaskId ? (
              <Typography.Text copyable className="font-mono text-sm">
                {pkg.subtaskId}
              </Typography.Text>
            ) : (
              <p className="text-sm font-medium text-slate-900">-</p>
            )}
          </div>

          {pkg.mainWorkContent ? (
            <div className="mt-4">
              <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">
                Main work content
              </p>
              <p className="whitespace-pre-wrap text-sm text-slate-700">
                {pkg.mainWorkContent}
              </p>
            </div>
          ) : null}
        </div>

        <div className="mb-8 grid gap-6 rounded-lg border border-slate-200 bg-white p-6 sm:grid-cols-2 lg:grid-cols-3">
          <div>
            <p className="text-xs text-slate-500">Planned start</p>
            <p className="text-sm font-medium">
              {formatProjectDate(pkg.plannedStartDate)}
            </p>
          </div>
          <div>
            <p className="text-xs text-slate-500">Planned finish</p>
            <p className="text-sm font-medium">
              {formatProjectDate(pkg.plannedFinishDate)}
            </p>
          </div>
          <div>
            <p className="text-xs text-slate-500">Actual work days</p>
            <p className="text-sm font-medium">
              {pkg.actualWorkDays != null ? pkg.actualWorkDays : '-'}
            </p>
          </div>
          <div>
            <p className="text-xs text-slate-500">Urgency level</p>
            <p className="text-sm font-medium">
              {formatUrgencyLevelLabel(pkg.urgencyLevel)}
            </p>
          </div>
          <div>
            <p className="text-xs text-slate-500">Review level</p>
            <p className="text-sm font-medium">
              {formatTaskReviewLevelLabel(pkg.reviewLevel)}
            </p>
          </div>
          {(pkg.siteRepName || pkg.siteRepresentativeName) && (
            <div>
              <p className={layout.drawerMetaLabel}>Site Representative</p>
              <p className="text-sm font-medium">
                {pkg.siteRepType === 'INTERNAL'
                  ? (pkg.siteRepresentativeName ?? '-')
                  : (pkg.siteRepName ?? '-')}
              </p>
              {pkg.siteRepType !== 'INTERNAL' && pkg.siteRepCompany ? (
                <p className={layout.drawerMutedText}>{pkg.siteRepCompany}</p>
              ) : null}
              {pkg.siteRepType !== 'INTERNAL' && pkg.siteRepPhone ? (
                <p className={layout.drawerMutedText}>{pkg.siteRepPhone}</p>
              ) : null}
              {pkg.siteRepType !== 'INTERNAL' && pkg.siteRepEmail ? (
                <p className={layout.drawerMutedText}>{pkg.siteRepEmail}</p>
              ) : null}
            </div>
          )}
          {pkg.consultantName ? (
            <div>
              <p className={layout.drawerMetaLabel}>Client Consultant</p>
              <p className="text-sm font-medium">
                {pkg.consultantName}
                {pkg.consultantTitle ? ` - ${pkg.consultantTitle}` : ''}
              </p>
              {pkg.consultantCompany ? (
                <p className={layout.drawerMutedText}>{pkg.consultantCompany}</p>
              ) : null}
              {pkg.consultantPhone ? (
                <p className={layout.drawerMutedText}>{pkg.consultantPhone}</p>
              ) : null}
              {pkg.consultantEmail ? (
                <p className={layout.drawerMutedText}>{pkg.consultantEmail}</p>
              ) : null}
            </div>
          ) : null}
        </div>

        <ProjectionLagHelper pending={pkg.projectionPending} />

        {reviewSessionId && (
          <div className="mb-4">
            <ReviewApprovalBlockedAlert comments={sessionComments} />
          </div>
        )}

        {!reviewSessionId && reviewMode?.lastReturnedSession && (
          <div className="mb-4">
            <ReturnedSessionBanner session={reviewMode.lastReturnedSession} />
          </div>
        )}

        {canLockUnlockEdvs &&
          lockGuidance.statusSummary.approved === 0 &&
          lockGuidance.statusSummary.locked < lockGuidance.statusSummary.total &&
          lockGuidance.reason && (
          <div className="mb-4">
            <Alert
              type="info"
              showIcon
              title="Files not ready to lock"
              description={
                <div className="space-y-1">
                  <p>{lockGuidance.reason}</p>
                  {lockGuidance.nextStep && (
                    <p className="text-slate-600">{lockGuidance.nextStep}</p>
                  )}
                </div>
              }
            />
          </div>
        )}

        <div className="mb-8 grid gap-6 rounded-lg border border-slate-200 bg-slate-50 p-6 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <p className="text-xs text-slate-500">Projected status</p>
            <ProjectedStatusBadge
              status={pkg.projectedStatus}
              pending={pkg.projectionPending}
            />
          </div>
          <div>
            <p className="text-xs text-slate-500">Subtask status</p>
            <PackageStatusBadge status={pkg.packageStatus} />
          </div>
          <div>
            <p className="text-xs text-slate-500">Review tier</p>
            <p className="text-sm font-medium">{reviewMode?.currentTier ?? '-'}</p>
          </div>
          <div>
            <p className="text-xs text-slate-500">Session</p>
            <p className="text-sm font-medium">{reviewMode?.sessionStatus ?? '-'}</p>
          </div>
          <div>
            <p className="text-xs text-slate-500">Submitted</p>
            <p className="text-sm font-medium">
              {pkg.submittedAt ? formatProjectDate(pkg.submittedAt) : '-'}
            </p>
          </div>
        </div>

        <div className="mb-8">
          <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-500">
            Required review tiers
          </p>
          <RequiredTiersStepIndicator
            requiredTiers={pkg.requiredTiers ?? []}
            currentTier={reviewMode?.currentTier}
            sessionStatus={reviewMode?.sessionStatus}
          />
        </div>
      </FormLayout>

      <FormLayout
        title="Subtask items"
        extra={
          packageLens.canUploadToPackage ? (
            <Button
              type="primary"
              size="small"
              onClick={() => setUploadModalOpen(true)}
            >
              Upload document
            </Button>
          ) : undefined
        }
      >
        <DesignPackageItemsTable
          projectId={projectId}
          taskDisciplineId={taskDisciplineId}
          packageId={packageId}
          items={pkg.items ?? []}
          documents={documentsQuery.data?.data ?? []}
          canEdit={packageLens.canUploadToPackage}
          canLockUnlock={canLockUnlockEdvs}
          lockUnlockEdvId={lockUnlockEdvId}
          onLock={(item) => void handleLockEdv(item)}
          onUnlock={(item) => void handleUnlockEdv(item)}
          onChanged={() => void packageQuery.refetch()}
        />
      </FormLayout>

      <DesignPackageUploadModal
        open={uploadModalOpen}
        onClose={() => setUploadModalOpen(false)}
        projectId={projectId}
        taskDisciplineId={taskDisciplineId}
        packageId={packageId}
        onSuccess={() => {
          void packageQuery.refetch();
          void documentsQuery.refetch();
        }}
      />

      {packageDocuments.map((doc) => (
        <div key={doc.id}>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
            {doc.title}
          </p>
          <VersionHistoryTimeline engineeringDocumentId={doc.id} />
        </div>
      ))}

      <FormLayout
        title="Dependencies"
        extra={
          packageLens.canUploadToPackage ? (
            <Button size="small" onClick={() => setAddDependencyOpen(true)}>
              Add dependency
            </Button>
          ) : undefined
        }
      >
        <DesignPackageDependenciesTable
          projectId={projectId}
          taskDisciplineId={taskDisciplineId}
          packageId={packageId}
          dependencies={dependenciesQuery.data ?? []}
          packages={allPackagesQuery.data ?? []}
          canEdit={packageLens.canUploadToPackage}
          onChanged={() => void dependenciesQuery.refetch()}
        />
      </FormLayout>

      {reviewSessionId && (
        <>
          <ReviewSessionAttachmentsSection
            projectId={projectId}
            taskDisciplineId={taskDisciplineId}
            packageId={packageId}
            reviewSessionId={reviewSessionId}
            currentTier={reviewMode?.currentTier ?? null}
            requiredTiers={pkg.requiredTiers ?? []}
          />
          <DesignPackageCommentsSection
          projectId={projectId}
          taskDisciplineId={taskDisciplineId}
          packageId={packageId}
          packageName={pkg.name}
          reviewSessionId={reviewSessionId}
          comments={sessionComments}
          canActOnAssignedComments={packageLens.canAcknowledgeComments}
          canOpenReviewMode={packageLens.canAddReviewComment}
          onChanged={() => {
            void reviewModeQuery.refetch();
            void packageQuery.refetch();
          }}
        />
        </>
      )}

      <ConfirmDialog
        open={closePackageOpen}
        title="Close subtask?"
        description="This confirms all documents are locked and all linked RFIs, issues, and change requests are resolved. The discipline leader can reopen later to unlock documents."
        confirmLabel="Close subtask"
        confirmLoading={closeDesignPackage.isPending}
        onConfirm={() => {
          void closeDesignPackage
            .mutateAsync({ packageId })
            .then(() => {
              messageApi.success('Subtask closed');
              setClosePackageOpen(false);
              void packageQuery.refetch();
              void reviewModeQuery.refetch();
            })
            .catch((error: unknown) => {
              notifyApiError(error, 'Failed to close subtask', messageApi);
            });
        }}
        onCancel={() => setClosePackageOpen(false)}
      />

      <ConfirmDialog
        open={reopenPackageOpen}
        title="Reopen subtask?"
        description="Reopening lets the discipline leader unlock locked documents individually. Unlock documents only after reopening."
        confirmLabel="Reopen"
        confirmLoading={reopenDesignPackage.isPending}
        onConfirm={() => {
          void reopenDesignPackage
            .mutateAsync({ packageId })
            .then(() => {
              messageApi.success('Subtask reopened - unlock documents as needed');
              setReopenPackageOpen(false);
              void packageQuery.refetch();
              void documentsQuery.refetch();
            })
            .catch((error: unknown) => {
              notifyApiError(error, 'Failed to reopen subtask', messageApi);
            });
        }}
        onCancel={() => setReopenPackageOpen(false)}
      />

      <DesignPackageAddDependencyModal
        open={addDependencyOpen}
        projectId={projectId}
        taskDisciplineId={taskDisciplineId}
        packageId={packageId}
        packages={allPackagesQuery.data ?? []}
        existingDependencyPackageIds={(dependenciesQuery.data ?? []).map(
          (dependency) => dependency.dependsOnPackageId,
        )}
        onClose={() => setAddDependencyOpen(false)}
        onAdded={() => void dependenciesQuery.refetch()}
      />

      <DesignPackageBuilder
        open={editSubtaskOpen}
        projectId={projectId}
        taskDisciplineId={taskDisciplineId}
        editing={pkg}
        onClose={() => setEditSubtaskOpen(false)}
        onSaved={() => {
          void packageQuery.refetch();
        }}
      />

      <ChangeRequestDrawer
        projectId={projectId}
        changeRequestId={selectedCrId}
        onClose={() => setSelectedCrId(null)}
        onUpdated={() => undefined}
      />
    </div>
    </ProjectModuleGate>
  );
}
