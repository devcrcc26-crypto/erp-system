'use client';

import Link from 'next/link';
import { Alert } from 'antd';
import FormLayout from '@/components/ui/FormLayout/FormLayout';
import ReviewModePanel from '@/components/modules/projects/review/ReviewModePanel';
import { useDesignPackage } from '@/lib/query/design-packages';

export default function ReviewModePageContent({
  packageId,
  projectId,
  taskDisciplineId,
}: {
  packageId: string;
  projectId: string;
  taskDisciplineId: string;
}): React.ReactNode {
  const packageQuery = useDesignPackage(
    projectId,
    taskDisciplineId,
    packageId,
    Boolean(projectId) && Boolean(taskDisciplineId),
  );

  return (
    <div>
      <FormLayout
        title={packageQuery.data?.name ?? 'Review Mode'}
        description="Three-column review workspace — documents, comments, dependencies."
        extra={
          projectId ? (
            <Link
              href={`/projects/${projectId}/disciplines/${taskDisciplineId}/packages/${packageId}`}
            >
              Back to package
            </Link>
          ) : undefined
        }
      >
        {!projectId || !taskDisciplineId ? (
          <Alert
            type="warning"
            showIcon
            className="mb-4"
            title="Missing project context"
            description="Open review mode from the Review Inbox to load project and discipline context."
          />
        ) : null}

        {projectId && taskDisciplineId ? (
          <ReviewModePanel
            packageId={packageId}
            projectId={projectId}
            taskDisciplineId={taskDisciplineId}
          />
        ) : null}
      </FormLayout>
    </div>
  );
}
