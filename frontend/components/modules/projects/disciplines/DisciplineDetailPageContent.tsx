'use client';

import Link from 'next/link';
import { Alert, Breadcrumb, Button, Descriptions, Spin } from 'antd';
import FormLayout from '@/components/ui/FormLayout/FormLayout';
import ProjectedStatusBadge from '@/components/ui/EdvStatusBadge/ProjectedStatusBadge';
import DesignPackagePanel from '@/components/modules/projects/design-packages/DesignPackagePanel';
import EngineeringDocumentPanel from '@/components/modules/projects/engineering/EngineeringDocumentPanel';
import ProjectionLagHelper from '@/components/modules/projects/workspaces/ProjectionLagHelper';
import { ApiRequestError } from '@/lib/api/errors';
import { useDesignPackages } from '@/lib/query/design-packages';
import { useProjectDiscipline } from '@/lib/query/disciplines';
import { PROJECTION_POLL_MS } from '@/lib/query/epc-query-utils';
import { formatDisciplineDateTime } from '@/components/modules/projects/disciplines/discipline-form.util';
import { layout } from '@/lib/theme/layout';

export default function DisciplineDetailPageContent({
  projectId,
  taskDisciplineId,
}: {
  projectId: string;
  taskDisciplineId: string;
}): React.ReactNode {
  const packagesQuery = useDesignPackages(projectId, taskDisciplineId);
  const projectionPending =
    packagesQuery.data?.some((pkg) => pkg.projectionPending) ?? false;

  const disciplineQuery = useProjectDiscipline(projectId, taskDisciplineId, true, {
    refetchInterval: projectionPending ? PROJECTION_POLL_MS : false,
  });

  if (disciplineQuery.isLoading) {
    return (
      <div className="flex justify-center py-16">
        <Spin />
      </div>
    );
  }

  if (disciplineQuery.isError) {
    const isRateLimited =
      disciplineQuery.error instanceof ApiRequestError &&
      disciplineQuery.error.status === 429;

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

  return (
    <div className={layout.pageStack}>
      <Breadcrumb
        items={[
          { title: <Link href={`/projects/${projectId}/disciplines`}>Disciplines</Link> },
          { title: discipline.disciplineName },
        ]}
      />

      <FormLayout
        title={discipline.disciplineName}
        description={`Schedule task: ${discipline.taskName}`}
      >
        <ProjectionLagHelper pending={projectionPending} />

        <Descriptions bordered size="small" column={{ xs: 1, sm: 2, md: 3 }} className="mb-6">
          <Descriptions.Item label="Projected status">
            {discipline.projectedStatus ? (
              <ProjectedStatusBadge
                status={discipline.projectedStatus}
                pending={projectionPending}
              />
            ) : (
              '—'
            )}
          </Descriptions.Item>
          <Descriptions.Item label="Designer">
            {discipline.designerName ?? '—'}
          </Descriptions.Item>
          <Descriptions.Item label="Reviewer">
            {discipline.reviewerName ?? '—'}
          </Descriptions.Item>
          <Descriptions.Item label="Dept review">
            {formatDisciplineDateTime(discipline.deptReviewTime)}
          </Descriptions.Item>
          <Descriptions.Item label="Institute review">
            {formatDisciplineDateTime(discipline.instituteReviewTime)}
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
    </div>
  );
}
