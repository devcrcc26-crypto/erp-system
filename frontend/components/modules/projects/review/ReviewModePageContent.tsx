// UI polish pass - styles only, no logic changes

'use client';

import Link from 'next/link';
import { Alert, Breadcrumb, Button } from 'antd';
import ReviewModePanel from '@/components/modules/projects/review/ReviewModePanel';
import { useDesignPackage } from '@/lib/query/design-packages';
import { useCanViewReviewInbox, useCapabilitiesReady } from '@/hooks/use-pm-capabilities';
import { layout } from '@/lib/theme/layout';
import { tokens } from '@/lib/theme/tokens';

export default function ReviewModePageContent({
  packageId,
  projectId,
  taskDisciplineId,
}: {
  packageId: string;
  projectId: string;
  taskDisciplineId: string;
}): React.ReactNode {
  const canViewReviewInbox = useCanViewReviewInbox();
  const capabilitiesReady = useCapabilitiesReady();
  const packageQuery = useDesignPackage(
    projectId,
    taskDisciplineId,
    packageId,
    Boolean(projectId) && Boolean(taskDisciplineId),
  );

  const packageName = packageQuery.data?.name ?? 'Review mode';

  if (!capabilitiesReady) {
    return null;
  }

  if (!canViewReviewInbox) {
    return (
      <div className={`${layout.pageStack} min-w-0 overflow-x-hidden`}>
        <Alert
          type="warning"
          showIcon
          title="Review mode is for reviewers only"
          description="Designers should resolve assigned comments from My Comments or on the design package page."
          action={
            projectId && taskDisciplineId ? (
              <Link
                href={`/projects/${projectId}/disciplines/${taskDisciplineId}/packages/${packageId}`}
              >
                <Button size="small">Back to package</Button>
              </Link>
            ) : (
              <Link href={`/projects/${projectId}/my-comments`}>
                <Button size="small">My Comments</Button>
              </Link>
            )
          }
        />
      </div>
    );
  }

  return (
    <div className={`${layout.pageStack} min-w-0 overflow-x-hidden`}>
      <Breadcrumb
        items={[
          { title: <Link href={`/projects/${projectId}/review-inbox`}>Review inbox</Link> },
          { title: packageName },
        ]}
      />

      <div className="min-w-0">
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <h1
              className="text-[18px] font-medium"
              style={{ color: tokens.colorTextPrimary }}
            >
              {packageName}
            </h1>
            <p
              className="mt-1 text-[12px]"
              style={{ color: tokens.colorTextSecondary }}
            >
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
