// UI polish pass - styles only, no logic changes

'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { Alert, Breadcrumb, Button, Descriptions } from 'antd';
import FormLayout, { PageLoadingSkeleton } from '@/components/ui/FormLayout/FormLayout';
import ProjectedStatusBadge from '@/components/ui/EdvStatusBadge/ProjectedStatusBadge';
import DisciplineClosureBadge from '@/components/ui/DisciplineClosureBadge/DisciplineClosureBadge';
import ConfirmDialog from '@/components/ui/ConfirmDialog/ConfirmDialog';
import DesignPackagePanel from '@/components/modules/projects/design-packages/DesignPackagePanel';
import EngineeringDocumentPanel from '@/components/modules/projects/engineering/EngineeringDocumentPanel';
import ProjectionLagHelper from '@/components/modules/projects/workspaces/ProjectionLagHelper';
import { ApiRequestError } from '@/lib/api/errors';
import { useDesignPackages, useCloseTaskDiscipline } from '@/lib/query/design-packages';
import { useProjectDiscipline } from '@/lib/query/disciplines';
import { PROJECTION_POLL_MS } from '@/lib/query/epc-query-utils';
import { formatDisciplineDateTime } from '@/components/modules/projects/disciplines/discipline-form.util';
import { layout } from '@/lib/theme/layout';
import { parseRevisionTriggerParams } from '@/lib/utils/revision-trigger-url';
import { useRoleLens } from '@/components/modules/projects/workspaces/RoleLensProvider';
import { useAppMessage } from '@/hooks/use-app-message';
import { useAuthStore } from '@/stores/auth.store';
import { notifyApiError } from '@/lib/utils/notify-api-error';

export default function DisciplineDetailPageContent({
  projectId,
  taskDisciplineId,
}: {
  projectId: string;
  taskDisciplineId: string;
}): React.ReactNode {
  const router = useRouter();
  const searchParams = useSearchParams();
  const revisionTriggerContext = parseRevisionTriggerParams(searchParams);
  const messageApi = useAppMessage();
  const lens = useRoleLens();
  const currentUserId = useAuthStore((state) => state.user?.id);
  const [closeDisciplineOpen, setCloseDisciplineOpen] = useState(false);
  const packagesQuery = useDesignPackages(projectId, taskDisciplineId);
  const closeDiscipline = useCloseTaskDiscipline(projectId);
  const projectionPending =
    packagesQuery.data?.some((pkg) => pkg.projectionPending) ?? false;

  const allPackagesClosed = useMemo(() => {
    const packages = packagesQuery.data ?? [];
    return packages.length > 0 && packages.every((pkg) => pkg.packageStatus === 'CLOSED');
  }, [packagesQuery.data]);

  const disciplineQuery = useProjectDiscipline(projectId, taskDisciplineId, true, {
    refetchInterval: projectionPending ? PROJECTION_POLL_MS : false,
  });

  useEffect(() => {
    if (
      disciplineQuery.isError &&
      disciplineQuery.error instanceof ApiRequestError &&
      disciplineQuery.error.status === 403 &&
      !lens.disciplineScopeBypass
    ) {
      messageApi.warning('You do not have access to this discipline');
      router.replace(`/projects/${projectId}/disciplines`);
    }
  }, [
    disciplineQuery.error,
    disciplineQuery.isError,
    lens.disciplineScopeBypass,
    messageApi,
    projectId,
    router,
  ]);

  if (disciplineQuery.isLoading) {
    return <PageLoadingSkeleton />;
  }

  if (disciplineQuery.isError) {
    const isForbidden =
      disciplineQuery.error instanceof ApiRequestError &&
      disciplineQuery.error.status === 403;
    const isRateLimited =
      disciplineQuery.error instanceof ApiRequestError &&
      disciplineQuery.error.status === 429;

    if (isForbidden && !lens.disciplineScopeBypass) {
      return <PageLoadingSkeleton />;
    }

    return (
      <Alert
        type="error"
        showIcon
        title={isRateLimited ? 'Too many requests' : 'Failed to load discipline'}
        description={
          isRateLimited
            ? 'The server is busy. Wait a moment and try again.'
            : 'This discipline could not be loaded. It may have been removed.'
        }
        action={
          <Button size="small" onClick={() => void disciplineQuery.refetch()}>
            Retry
          </Button>
        }
      />
    );
  }

  const discipline = disciplineQuery.data;

  if (!discipline) {
    return (
      <Alert
        type="error"
        showIcon
        title="Discipline not found"
        description="This discipline may have been removed or is not linked to this project."
      />
    );
  }

  const isDisciplineLeader =
    Boolean(currentUserId) &&
    discipline.disciplineLeadUserId === currentUserId;
  const canCloseDiscipline =
    isDisciplineLeader && allPackagesClosed && !discipline.isClosed;

  return (
    <div className={layout.pageStack}>
      <Breadcrumb
        items={[
          { title: <Link href={`/projects/${projectId}/disciplines`}>Disciplines</Link> },
          { title: discipline.disciplineName },
        ]}
      />

      {revisionTriggerContext?.triggerSource === 'RFI' && (
        <Alert
          type="info"
          showIcon
          title="RFI revision workflow"
          description="Open the affected engineering document below, then use Trigger revision on the document detail page. The RFI will be pre-selected as the trigger source."
        />
      )}

      <FormLayout
        title={discipline.disciplineName}
        description={`Schedule task: ${discipline.taskName}`}
        extra={
          canCloseDiscipline ? (
            <Button onClick={() => setCloseDisciplineOpen(true)}>
              Close Discipline
            </Button>
          ) : undefined
        }
      >
        <ProjectionLagHelper pending={projectionPending} />

        <Descriptions bordered size="small" column={{ xs: 1, sm: 2, md: 3 }} className="mb-6">
          <Descriptions.Item label="Closure">
            <DisciplineClosureBadge isClosed={discipline.isClosed} />
          </Descriptions.Item>
          <Descriptions.Item label="Projected status">
            {discipline.projectedStatus ? (
              <ProjectedStatusBadge
                status={discipline.projectedStatus}
                pending={projectionPending}
              />
            ) : (
              '-'
            )}
          </Descriptions.Item>
          <Descriptions.Item label="Designer">
            {discipline.designerName ?? '-'}
          </Descriptions.Item>
          <Descriptions.Item label="Reviewer">
            {discipline.reviewerName ?? '-'}
          </Descriptions.Item>
          <Descriptions.Item label="Discipline owner">
            {discipline.disciplineOwnerName ?? '-'}
          </Descriptions.Item>
          <Descriptions.Item label="Institute chief">
            {discipline.instituteChief?.name ?? '-'}
          </Descriptions.Item>
          <Descriptions.Item label="Supporting designer">
            {discipline.supportingDesigner?.name ?? '-'}
          </Descriptions.Item>
          <Descriptions.Item label="Dept review">
            {formatDisciplineDateTime(discipline.deptReviewTime)}
          </Descriptions.Item>
        </Descriptions>
      </FormLayout>

      <DesignPackagePanel
        projectId={projectId}
        taskDisciplineId={taskDisciplineId}
      />

      <EngineeringDocumentPanel
        projectId={projectId}
        taskDisciplineId={taskDisciplineId}
      />

      <ConfirmDialog
        open={closeDisciplineOpen}
        title="Close Discipline?"
        description="This confirms all design packages are closed and the discipline workflow is complete. This cannot be undone."
        confirmLabel="Close Discipline"
        confirmLoading={closeDiscipline.isPending}
        onConfirm={() => {
          void closeDiscipline
            .mutateAsync({
              taskId: discipline.taskId,
              disciplineId: discipline.id,
            })
            .then(() => {
              messageApi.success('Discipline closed');
              setCloseDisciplineOpen(false);
              void disciplineQuery.refetch();
              void packagesQuery.refetch();
            })
            .catch((error: unknown) => {
              notifyApiError(error, 'Failed to close discipline', messageApi);
            });
        }}
        onCancel={() => setCloseDisciplineOpen(false)}
      />
    </div>
  );
}
