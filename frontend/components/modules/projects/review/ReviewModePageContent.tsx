'use client';

import Link from 'next/link';
import { Alert, Breadcrumb, Button } from 'antd';
import ReviewModePanel from '@/components/modules/projects/review/ReviewModePanel';
import { useDesignPackage } from '@/lib/query/design-packages';
import { layout } from '@/lib/theme/layout';

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

  const packageName = packageQuery.data?.name ?? 'Review mode';

  return (
    <div className={`${layout.pageStack} min-w-0 overflow-x-hidden`}>
      <Breadcrumb
        items={[
          { title: <Link href="/review-inbox">Review inbox</Link> },
          { title: packageName },
        ]}
      />

      <div className="min-w-0">
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <h1 className="text-xl font-semibold text-slate-900">{packageName}</h1>
            <p className="mt-1 text-sm text-slate-500">
              Review package documents, add comments, and run batch actions.
            </p>
          </div>
          {projectId ? (
            <Link
              href={`/projects/${projectId}/disciplines/${taskDisciplineId}/packages/${packageId}`}
            >
              <Button className="shrink-0">Back to package</Button>
            </Link>
          ) : null}
        </div>

        {!projectId || !taskDisciplineId ? (
          <Alert
            type="warning"
            showIcon
            className="mb-4"
            title="Missing project context"
            description="Open review mode from the Review Inbox to load project and discipline context."
          />
        ) : (
          <ReviewModePanel
            packageId={packageId}
            projectId={projectId}
            taskDisciplineId={taskDisciplineId}
          />
        )}
      </div>
    </div>
  );
}
