// UI polish pass - styles only, no logic changes

'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import {
  Alert,
  Breadcrumb,
  Button,
  Form,
  Input,
  Modal,
  Space,
  Tooltip,
} from 'antd';
import FormLayout, { PageLoadingSkeleton } from '@/components/ui/FormLayout/FormLayout';
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
import SubtaskRolesModal from '@/components/modules/projects/design-packages/SubtaskRolesModal';
import VersionHistoryTimeline from '@/components/modules/projects/engineering/VersionHistoryTimeline';
import { useProjectDiscipline } from '@/lib/query/disciplines';
import {
  useApproveReviewSession,
  useBatchApprovePackageEdvs,
  useCloseDesignPackage,
  useDesignPackage,
  useDesignPackageDependencies,
  useDesignPackages,
  useLockPackageEdvs,
  useReturnPackageForRework,
  useSubmitPackageForReview,
} from '@/lib/query/design-packages';
import { useEngineeringDocuments, useBatchLockEngineeringDocuments } from '@/lib/query/engineering-documents';
import { useRoleLens } from '@/components/modules/projects/workspaces/RoleLensProvider';
import { usePermissionsLoading } from '@/hooks/use-pm-capabilities';
import { useDesignPackageReviewMode } from '@/lib/query/epc-workspace';
import { canApproveReviewSession } from '@/lib/utils/comment-workflow';
import { getPackageLockGuidance, getPackageSubmitEligibility } from '@/lib/utils/package-workflow';
import {
  canBatchApprovePackageEdvs,
  getSessionApproveLabel,
  isFinalReviewTier,
} from '@/lib/utils/review-governance';
import { notifyApiError } from '@/lib/utils/notify-api-error';
import { useAppMessage } from '@/hooks/use-app-message';
import { useAuthStore } from '@/stores/auth.store';
import ProjectModuleGate from '@/components/modules/projects/ProjectModuleGate';
import { layout } from '@/lib/theme/layout';

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
  const permLoading = usePermissionsLoading();
  const messageApi = useAppMessage();
  const currentUserId = useAuthStore((state) => state.user?.id);
  const [returnOpen, setReturnOpen] = useState(false);
  const [closePackageOpen, setClosePackageOpen] = useState(false);
  const [rolesModalOpen, setRolesModalOpen] = useState(false);
  const [addDependencyOpen, setAddDependencyOpen] = useState(false);
  const [returnForm] = Form.useForm<{ reason: string }>();

  const canViewPackage =
    !permLoading && (lens.canViewEngineering || lens.canViewReviewInbox);

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
  const lockEdvs = useLockPackageEdvs();
  const approveSession = useApproveReviewSession();
  const returnPackage = useReturnPackageForRework();
  const batchLock = useBatchLockEngineeringDocuments();
  const batchApproveEdvs = useBatchApprovePackageEdvs();
  const closeDesignPackage = useCloseDesignPackage(projectId, taskDisciplineId);

  const pkg = packageQuery.data;
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
  const reviewMode = reviewModeQuery.data;
  const reviewSessionId = reviewMode?.reviewSessionId;
  const sessionComments = reviewMode?.comments ?? [];
  const lastReturnedComments = reviewMode?.lastReturnedSessionComments ?? [];
  const commentsToCheck = reviewSessionId ? sessionComments : lastReturnedComments;
  const approvalAllowed = canApproveReviewSession(
    sessionComments.map((comment) => comment.status),
  );
  const hasUnacknowledgedComments = commentsToCheck.some(
    (comment) => comment.status === 'OPEN' || comment.status === 'IN_PROGRESS',
  );

  if (permLoading || packageQuery.isLoading || disciplineQuery.isLoading) {
    return <PageLoadingSkeleton />;
  }

  if (!lens.canViewEngineering && !lens.canViewReviewInbox) {
    return null;
  }

  if (!pkg || !disciplineQuery.data) {
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
    lens.canApproveReview &&
    Boolean(reviewSessionId) &&
    canBatchApprovePackageEdvs(
      reviewMode?.currentTier,
      lockGuidance.inReviewEdvIds.length,
    );
  const discipline = disciplineQuery.data;
  const isDisciplineLeader =
    Boolean(currentUserId) &&
    discipline?.disciplineLeadUserId === currentUserId;
  const canClosePackage =
    isDisciplineLeader &&
    pkg.projectedStatus === 'LOCKED' &&
    pkg.packageStatus !== 'CLOSED';

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
      messageApi.success('Package EDVs approved');
      void packageQuery.refetch();
      void documentsQuery.refetch();
      void reviewModeQuery.refetch();
    } catch (error) {
      notifyApiError(error, 'Failed to approve package EDVs', messageApi);
    }
  }

  async function handleSubmitForReview(): Promise<void> {
    try {
      await submitForReview.mutateAsync({
        projectId,
        taskDisciplineId,
        packageId,
      });
      messageApi.success('Package submitted for review');
      void packageQuery.refetch();
      void reviewModeQuery.refetch();
    } catch (error) {
      notifyApiError(error, 'Request failed', messageApi);
    }
  }

  async function handleLockEdvs(): Promise<void> {
    try {
      await lockEdvs.mutateAsync({
        projectId,
        taskDisciplineId,
        packageId,
      });
      messageApi.success('Package EDVs locked');
      void packageQuery.refetch();
    } catch (error) {
      notifyApiError(error, 'Request failed', messageApi);
    }
  }

  async function handleApproveSession(): Promise<void> {
    if (!reviewSessionId) {
      return;
    }
    try {
      await approveSession.mutateAsync({
        projectId,
        taskDisciplineId,
        packageId,
        reviewSessionId,
      });
      messageApi.success('Review session approved');
      void packageQuery.refetch();
      void reviewModeQuery.refetch();
    } catch (error) {
      notifyApiError(error, 'Request failed', messageApi);
    }
  }

  async function handleBatchLockPackage(): Promise<void> {
    try {
      await batchLock.mutateAsync({
        projectId,
        body: { designPackageIds: [packageId] },
      });
      messageApi.success('Batch lock requested');
      void packageQuery.refetch();
    } catch (error) {
      notifyApiError(error, 'Request failed', messageApi);
    }
  }

  return (
    <ProjectModuleGate projectId={projectId} module="design_packages">
    <div className={layout.pageStack}>
      <Breadcrumb
        items={[
          { title: <Link href={`/projects/${projectId}/disciplines`}>Disciplines</Link> },
          {
            title: (
              <Link href={`/projects/${projectId}/disciplines/${taskDisciplineId}`}>
                {disciplineQuery.data.disciplineName}
              </Link>
            ),
          },
          { title: pkg.name },
        ]}
      />

      <FormLayout
        title={pkg.name}
        description="Subtask items, dependencies, and workflow actions."
        extra={
          <Space wrap>
            {isDisciplineLeader && (
              <Button onClick={() => setRolesModalOpen(true)}>Edit roles</Button>
            )}
            {reviewSessionId && lens.canAccessReviewMode && (
              <Link href={`/design-packages/${packageId}/review?projectId=${projectId}&disciplineId=${taskDisciplineId}`}>
                <Button type="primary">Open review mode</Button>
              </Link>
            )}
            {lens.canSubmitDesignPackage && submitEligibility.submittable && (
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
                  disabled={hasUnacknowledgedComments}
                  onClick={() => void handleSubmitForReview()}
                >
                  Submit for review
                </Button>
              </Tooltip>
            )}
            {lens.canApproveReview && reviewSessionId && (
              <Button
                type="primary"
                disabled={!approvalAllowed}
                loading={approveSession.isPending}
                onClick={() => void handleApproveSession()}
              >
                {getSessionApproveLabel(reviewMode?.currentTier)}
              </Button>
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
            {lens.canEditEngineering && (
              <Button
                loading={lockEdvs.isPending}
                disabled={!lockGuidance.eligible}
                onClick={() => void handleLockEdvs()}
              >
                Lock EDVs
              </Button>
            )}
            {lens.canApproveReview && (
              <Button
                loading={batchLock.isPending}
                disabled={!lockGuidance.eligible}
                onClick={() => void handleBatchLockPackage()}
              >
                Batch lock
              </Button>
            )}
            {lens.canApproveReview && reviewSessionId && (
              <Button danger onClick={() => setReturnOpen(true)}>
                Return for rework
              </Button>
            )}
            {canClosePackage && (
              <Button onClick={() => setClosePackageOpen(true)}>
                Close Package
              </Button>
            )}
          </Space>
        }
      >
        <ProjectionLagHelper pending={pkg.projectionPending} />

        {reviewSessionId && !isFinalReviewTier(reviewMode?.currentTier) && (
          <div className="mb-4">
            <Alert
              type="info"
              showIcon
              title="Advance governance tier"
              description="Use Approve & escalate to send this package to the next reviewer. Do not use Approve all EDVs until the department chief tier."
            />
          </div>
        )}

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

        {lens.canEditEngineering && !lockGuidance.eligible && lockGuidance.reason && (
          <div className="mb-4">
            <Alert
              type="info"
              showIcon
              title="Lock not available"
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
            <p className="text-xs text-slate-500">Package status</p>
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
              {pkg.submittedAt ? new Date(pkg.submittedAt).toLocaleDateString() : '-'}
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

      <FormLayout title="Package items">
        <DesignPackageItemsTable
          projectId={projectId}
          taskDisciplineId={taskDisciplineId}
          packageId={packageId}
          items={pkg.items ?? []}
          documents={documentsQuery.data?.data ?? []}
          canEdit={lens.canEditEngineering}
          onChanged={() => void packageQuery.refetch()}
        />
      </FormLayout>

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
          lens.canEditEngineering ? (
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
          canEdit={lens.canEditEngineering}
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
        description="This confirms all documents are locked and all linked RFIs, issues, and change requests are resolved. This cannot be undone."
        confirmLabel="Close Package"
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

      <Modal
        title="Return package for rework"
        open={returnOpen}
        onCancel={() => setReturnOpen(false)}
        onOk={() => returnForm.submit()}
        okText="Return for rework"
        confirmLoading={returnPackage.isPending}
      >
        <Form
          form={returnForm}
          layout="vertical"
          onFinish={async (values: { reason: string }) => {
            if (!reviewSessionId) {
              return;
            }
            try {
              await returnPackage.mutateAsync({
                projectId,
                taskDisciplineId,
                packageId,
                body: {
                  reviewSessionId,
                  reason: values.reason.trim(),
                },
              });
              messageApi.success('Package returned for rework');
              setReturnOpen(false);
              void packageQuery.refetch();
              void reviewModeQuery.refetch();
            } catch (error) {
              notifyApiError(error, 'Failed to return package for rework', messageApi);
            }
          }}
        >
          <Form.Item
            name="reason"
            label="Reason"
            rules={[{ required: true, message: 'Reason is required' }]}
          >
            <Input.TextArea rows={3} />
          </Form.Item>
        </Form>
      </Modal>

      <SubtaskRolesModal
        open={rolesModalOpen}
        projectId={projectId}
        taskDisciplineId={taskDisciplineId}
        subtask={pkg}
        onClose={() => setRolesModalOpen(false)}
        onSaved={() => {
          void packageQuery.refetch();
        }}
      />
    </div>
    </ProjectModuleGate>
  );
}
