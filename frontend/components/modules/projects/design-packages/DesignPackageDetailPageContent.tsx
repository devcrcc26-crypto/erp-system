'use client';

import Link from 'next/link';
import { useState } from 'react';
import {
  Alert,
  Breadcrumb,
  Button,
  Form,
  Input,
  Modal,
  Space,
  Spin,
  message,
} from 'antd';
import FormLayout from '@/components/ui/FormLayout/FormLayout';
import ReviewApprovalBlockedAlert from '@/components/modules/projects/review/ReviewApprovalBlockedAlert';
import ProjectedStatusBadge from '@/components/ui/EdvStatusBadge/ProjectedStatusBadge';
import ProjectionLagHelper from '@/components/modules/projects/workspaces/ProjectionLagHelper';
import {
  DesignPackageDependenciesTable,
  DesignPackageItemsTable,
} from '@/components/modules/projects/design-packages/DesignPackagePanel';
import { useProjectDiscipline } from '@/lib/query/disciplines';
import {
  useApproveReviewSession,
  useDesignPackage,
  useDesignPackageDependencies,
  useDesignPackages,
  useLockPackageEdvs,
  useReturnPackageForRework,
  useSubmitPackageForReview,
} from '@/lib/query/design-packages';
import { useEngineeringDocuments, useBatchLockEngineeringDocuments } from '@/lib/query/engineering-documents';
import { useRoleLens } from '@/components/modules/projects/workspaces/RoleLensProvider';
import { useDesignPackageReviewMode } from '@/lib/query/epc-workspace';
import { canApproveReviewSession } from '@/lib/utils/comment-workflow';
import { getPackageLockEligibility } from '@/lib/utils/package-workflow';
import { notifyApiError } from '@/lib/utils/notify-api-error';

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
  const [returnOpen, setReturnOpen] = useState(false);
  const [returnForm] = Form.useForm<{ reason: string }>();

  const disciplineQuery = useProjectDiscipline(projectId, taskDisciplineId);
  const packageQuery = useDesignPackage(
    projectId,
    taskDisciplineId,
    packageId,
    lens.canViewEngineering,
  );
  const reviewModeQuery = useDesignPackageReviewMode(packageId, lens.canViewEngineering);
  const dependenciesQuery = useDesignPackageDependencies(
    projectId,
    taskDisciplineId,
    packageId,
    lens.canViewEngineering,
  );
  const allPackagesQuery = useDesignPackages(
    projectId,
    taskDisciplineId,
    lens.canViewEngineering,
  );
  const documentsQuery = useEngineeringDocuments(
    projectId,
    taskDisciplineId,
    { page: 1, limit: 100 },
    lens.canViewEngineering,
  );

  const submitForReview = useSubmitPackageForReview();
  const lockEdvs = useLockPackageEdvs();
  const approveSession = useApproveReviewSession();
  const returnPackage = useReturnPackageForRework();
  const batchLock = useBatchLockEngineeringDocuments();

  const pkg = packageQuery.data;
  const reviewMode = reviewModeQuery.data;
  const reviewSessionId = reviewMode?.reviewSessionId;
  const sessionComments = reviewMode?.comments ?? [];
  const approvalAllowed = canApproveReviewSession(
    sessionComments.map((comment) => comment.status),
  );

  if (packageQuery.isLoading || disciplineQuery.isLoading) {
    return (
      <div className="flex justify-center py-16">
        <Spin />
      </div>
    );
  }

  if (!pkg || !disciplineQuery.data) {
    return <Alert type="error" showIcon title="Design package not found" />;
  }

  const lockEligibility = getPackageLockEligibility(
    pkg.items,
    documentsQuery.data?.data ?? [],
  );

  async function handleSubmitForReview(): Promise<void> {
    try {
      await submitForReview.mutateAsync({
        projectId,
        taskDisciplineId,
        packageId,
      });
      message.success('Package submitted for review');
      void packageQuery.refetch();
      void reviewModeQuery.refetch();
    } catch (error) {
      notifyApiError(error);
    }
  }

  async function handleLockEdvs(): Promise<void> {
    try {
      await lockEdvs.mutateAsync({
        projectId,
        taskDisciplineId,
        packageId,
      });
      message.success('Package EDVs locked');
      void packageQuery.refetch();
    } catch (error) {
      notifyApiError(error);
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
      message.success('Review session approved');
      void packageQuery.refetch();
      void reviewModeQuery.refetch();
    } catch (error) {
      notifyApiError(error);
    }
  }

  async function handleBatchLockPackage(): Promise<void> {
    try {
      await batchLock.mutateAsync({
        projectId,
        body: { designPackageIds: [packageId] },
      });
      message.success('Batch lock requested');
      void packageQuery.refetch();
    } catch (error) {
      notifyApiError(error);
    }
  }

  return (
    <div className="space-y-6">
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
        description="Package items, dependencies, and workflow actions."
        extra={
          <Space wrap>
            {reviewSessionId && (
              <Link href={`/design-packages/${packageId}/review?projectId=${projectId}&disciplineId=${taskDisciplineId}`}>
                <Button type="primary">Open review mode</Button>
              </Link>
            )}
            {lens.canEditEngineering && (
              <Button
                loading={submitForReview.isPending}
                onClick={() => void handleSubmitForReview()}
              >
                Submit for review
              </Button>
            )}
            {lens.canApproveReview && reviewSessionId && (
              <Button
                type="primary"
                disabled={!approvalAllowed}
                loading={approveSession.isPending}
                onClick={() => void handleApproveSession()}
              >
                Approve session
              </Button>
            )}
            {lens.canEditEngineering && (
              <Button
                loading={lockEdvs.isPending}
                disabled={!lockEligibility.eligible}
                onClick={() => void handleLockEdvs()}
              >
                Lock EDVs
              </Button>
            )}
            {lens.canApproveReview && (
              <Button
                loading={batchLock.isPending}
                disabled={!lockEligibility.eligible}
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
          </Space>
        }
      >
        <ProjectionLagHelper pending={pkg.projectionPending} />

        {reviewSessionId && (
          <div className="mb-4">
            <ReviewApprovalBlockedAlert comments={sessionComments} />
          </div>
        )}

        {lens.canEditEngineering && !lockEligibility.eligible && lockEligibility.reason && (
          <div className="mb-4">
            <Alert type="info" showIcon title="Lock not available" description={lockEligibility.reason} />
          </div>
        )}

        <div className="mb-6 grid gap-4 rounded-lg border border-slate-200 bg-slate-50 p-4 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <p className="text-xs text-slate-500">Projected status</p>
            <ProjectedStatusBadge
              status={pkg.projectedStatus}
              pending={pkg.projectionPending}
            />
          </div>
          <div>
            <p className="text-xs text-slate-500">Review tier</p>
            <p className="text-sm font-medium">{reviewMode?.currentTier ?? '—'}</p>
          </div>
          <div>
            <p className="text-xs text-slate-500">Session</p>
            <p className="text-sm font-medium">{reviewMode?.sessionStatus ?? '—'}</p>
          </div>
          <div>
            <p className="text-xs text-slate-500">Submitted</p>
            <p className="text-sm font-medium">
              {pkg.submittedAt ? new Date(pkg.submittedAt).toLocaleDateString() : '—'}
            </p>
          </div>
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

      <FormLayout title="Dependencies">
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

      <Modal
        title="Return package for rework"
        open={returnOpen}
        onCancel={() => setReturnOpen(false)}
        onOk={() => returnForm.submit()}
        confirmLoading={returnPackage.isPending}
      >
        <Form
          form={returnForm}
          layout="vertical"
          onFinish={async (values: { reason: string }) => {
            if (!reviewSessionId) {
              return;
            }
            await returnPackage.mutateAsync({
              projectId,
              taskDisciplineId,
              packageId,
              body: {
                reviewSessionId,
                reason: values.reason.trim(),
              },
            });
            message.success('Package returned for rework');
            setReturnOpen(false);
            void packageQuery.refetch();
            void reviewModeQuery.refetch();
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
    </div>
  );
}
