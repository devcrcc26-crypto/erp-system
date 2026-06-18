'use client';

import Link from 'next/link';
import { Alert, Breadcrumb, Descriptions, Spin } from 'antd';
import FormLayout from '@/components/ui/FormLayout/FormLayout';
import ProjectedStatusBadge from '@/components/ui/EdvStatusBadge/ProjectedStatusBadge';
import DesignPackagePanel from '@/components/modules/projects/design-packages/DesignPackagePanel';
import EngineeringDocumentPanel from '@/components/modules/projects/engineering/EngineeringDocumentPanel';
import ProjectionLagHelper from '@/components/modules/projects/workspaces/ProjectionLagHelper';
import { useProjectDiscipline } from '@/lib/query/disciplines';
import { formatDisciplineDateTime } from '@/components/modules/projects/disciplines/discipline-form.util';

export default function DisciplineDetailPageContent({
  projectId,
  taskDisciplineId,
}: {
  projectId: string;
  taskDisciplineId: string;
}): React.ReactNode {
  const disciplineQuery = useProjectDiscipline(projectId, taskDisciplineId);

  if (disciplineQuery.isLoading) {
    return (
      <div className="flex justify-center py-16">
        <Spin />
      </div>
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
    <div className="space-y-6">
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
        <ProjectionLagHelper />

        <Descriptions bordered size="small" column={{ xs: 1, sm: 2, md: 3 }} className="mb-6">
          <Descriptions.Item label="Projected status">
            {discipline.projectedStatus ? (
              <ProjectedStatusBadge status={discipline.projectedStatus} />
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
