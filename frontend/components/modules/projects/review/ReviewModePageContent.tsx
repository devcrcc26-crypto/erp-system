// UI polish pass - styles only, no logic changes

'use client';

import Link from 'next/link';
import { Alert, Breadcrumb, Button } from 'antd';
import ReviewModePanel from '@/components/modules/projects/review/ReviewModePanel';
import ResourceRoleContextBadge from '@/components/modules/projects/workspaces/ResourceRoleContextBadge';
import { PageLoadingSkeleton } from '@/components/ui/FormLayout/FormLayout';
import { useDesignPackage } from '@/lib/query/design-packages';
import { useProjectDiscipline } from '@/lib/query/disciplines';
import {
  useCanViewReviewInbox,
  useEpcCapabilities,
  usePermissionsLoading,
} from '@/hooks/use-pm-capabilities';
import { useAuthStore } from '@/stores/auth.store';
import { useCurrentUser } from '@/lib/query/profile';
import { resolvePackageRoles } from '@/lib/utils/subtask-role-resolver';
import { formatActingAsLabel } from '@/lib/utils/subtask-role-display';
import { layout } from '@/lib/theme/layout';
import { tokens } from '@/lib/theme/tokens';

export default function ReviewModePageContent({
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
  const permLoading = usePermissionsLoading();
  const canViewReviewInbox = useCanViewReviewInbox();
  const epc = useEpcCapabilities();
  const currentUserId = useAuthStore((state) => state.user?.id);
  const { data: profile } = useCurrentUser();
  const canLoad =
    !permLoading &&
    canViewReviewInbox &&
    Boolean(projectId) &&
    Boolean(taskDisciplineId);
  const packageQuery = useDesignPackage(
    projectId,
    taskDisciplineId,
    packageId,
    canLoad,
  );
  const disciplineQuery = useProjectDiscipline(
    projectId,
    taskDisciplineId,
    canLoad,
  );

  const packageName = packageQuery.data?.name ?? 'Review mode';
  const pkg = packageQuery.data;
  const discipline = disciplineQuery.data;
  const roles =
    pkg && discipline && currentUserId
      ? resolvePackageRoles(pkg, discipline, currentUserId)
      : null;
  const companyAdminFallback =
    epc.navFullAccess ||
    profile?.roles.some((role) => role.name === 'Project Administrator')
      ? 'Project Admin'
      : null;
  const actingAsLabel = formatActingAsLabel(
    roles?.primaryRole ?? null,
    roles?.secondaryReviewRole ?? null,
    companyAdminFallback,
  );
  const actingAsReadOnly =
    (roles?.primaryRole ?? null) === null && companyAdminFallback !== null;

  if (permLoading) {
    return <PageLoadingSkeleton />;
  }

  if (!canViewReviewInbox) {
    return (
      <div className={`${layout.pageStack} min-w-0 overflow-x-hidden`}>
        <Alert
          type="warning"
          showIcon
          title="Review mode is for reviewers only"
          description="Designers should resolve assigned comments from My Comments or on the subtask page."
          action={
            projectId && taskDisciplineId ? (
              <Link
                href={`/projects/${projectId}/disciplines/${taskDisciplineId}/packages/${packageId}`}
              >
                <Button size="small">Back to subtask</Button>
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
              Review subtask documents, add comments, and run batch actions.
            </p>
            {actingAsLabel ? (
              <div className="mt-2">
                <ResourceRoleContextBadge
                  label={actingAsLabel}
                  readOnly={actingAsReadOnly}
                />
              </div>
            ) : null}
          </div>
          {projectId ? (
            <Link
              href={`/projects/${projectId}/disciplines/${taskDisciplineId}/packages/${packageId}`}
            >
              <Button className="shrink-0">Back to subtask</Button>
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
            expectedReviewSessionId={expectedReviewSessionId}
            readOnly={readOnly}
            actionTaken={actionTaken}
            actionTakenAt={actionTakenAt}
          />
        )}
      </div>
    </div>
  );
}
