// UI polish pass - styles only, no logic changes

'use client';

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
import { useUser } from '@/lib/query/users';
import { PROJECTION_POLL_MS } from '@/lib/query/epc-query-utils';
import { layout } from '@/lib/theme/layout';
import { parseRevisionTriggerParams } from '@/lib/utils/revision-trigger-url';
import { useRoleLens } from '@/components/modules/projects/workspaces/RoleLensProvider';
import ResourceRoleContextBadge from '@/components/modules/projects/workspaces/ResourceRoleContextBadge';
import { useAppMessage } from '@/hooks/use-app-message';
import { useEpcCapabilities } from '@/hooks/use-pm-capabilities';
import { useAuthStore } from '@/stores/auth.store';
import { useCurrentUser } from '@/lib/query/profile';
import { notifyApiError } from '@/lib/utils/notify-api-error';
import { formatActingAsLabel } from '@/lib/utils/subtask-role-display';
import { formatDisciplineLabel } from '@/lib/utils/discipline-display';
import { canAccessDisciplineWorkspace, canManageSubtaskAsDisciplineLeader } from '@/lib/utils/subtask-permissions';
import { formatUserDiscipline, formatUserName } from '@/lib/utils/user-display';
import type { SubtaskRole } from '@/lib/api/epc.types';

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
  const epc = useEpcCapabilities();
  const currentUserId = useAuthStore((state) => state.user?.id);
  const { data: profile } = useCurrentUser();
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

  const leaderUserId = disciplineQuery.data?.disciplineLeadUserId ?? '';
  const leaderQuery = useUser(leaderUserId, Boolean(leaderUserId));
  const hasElevatedAccess =
    useAuthStore((state) => state.capabilities.isSystemAdministrator) ||
    epc.navFullAccess;

  useEffect(() => {
    if (
      disciplineQuery.isError &&
      disciplineQuery.error instanceof ApiRequestError &&
      disciplineQuery.error.status === 403 &&
      !lens.disciplineScopeBypass
    ) {
      messageApi.warning('You do not have access to this discipline');
      router.replace(epc.navFullAccess ? `/projects/${projectId}/disciplines` : '/my-work');
    }
  }, [
    disciplineQuery.error,
    disciplineQuery.isError,
    epc.navFullAccess,
    lens.disciplineScopeBypass,
    messageApi,
    projectId,
    router,
  ]);

  useEffect(() => {
    const discipline = disciplineQuery.data;
    if (!discipline || disciplineQuery.isLoading) {
      return;
    }
    if (
      !canAccessDisciplineWorkspace(
        discipline,
        currentUserId,
        hasElevatedAccess,
      )
    ) {
      messageApi.warning('You do not have access to this discipline workspace');
      router.replace(hasElevatedAccess ? `/projects/${projectId}/disciplines` : '/my-work');
    }
  }, [
    currentUserId,
    disciplineQuery.data,
    disciplineQuery.isLoading,
    hasElevatedAccess,
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

  if (
    !canAccessDisciplineWorkspace(
      discipline,
      currentUserId,
      hasElevatedAccess,
    )
  ) {
    return <PageLoadingSkeleton />;
  }

  const isDisciplineLeader = canManageSubtaskAsDisciplineLeader(
    discipline,
    currentUserId,
    hasElevatedAccess,
  );
  const disciplineLabel = formatDisciplineLabel(discipline.disciplineIndex);
  const canCloseDiscipline =
    isDisciplineLeader && allPackagesClosed && !discipline.isClosed;

  const disciplinePrimaryRole: SubtaskRole | null = (() => {
    if (!currentUserId) {
      return null;
    }
    if (discipline.designerUserId === currentUserId) {
      return 'DESIGNER';
    }
    if (discipline.supportingDesignerUserId === currentUserId) {
      return 'SUPPORTING_DESIGNER';
    }
    if (discipline.reviewerUserId === currentUserId) {
      return 'REVIEWER';
    }
    if (discipline.disciplineLeadUserId === currentUserId) {
      return 'DISCIPLINE_LEAD';
    }
    if (discipline.chiefUserId === currentUserId) {
      return 'DEPT_CHIEF';
    }
    if (discipline.instituteChiefUserId === currentUserId) {
      return 'INSTITUTE_CHIEF';
    }
    if (discipline.ownerUserId === currentUserId) {
      return 'DISCIPLINE_OWNER';
    }
    return null;
  })();
  const companyAdminFallback =
    epc.navFullAccess ||
    profile?.roles.some((role) => role.name === 'Project Administrator')
      ? 'Project Admin'
      : null;
  const actingAsLabel = formatActingAsLabel(
    disciplinePrimaryRole,
    null,
    companyAdminFallback,
  );
  const actingAsReadOnly =
    disciplinePrimaryRole === null && companyAdminFallback !== null;

  return (
    <div className={layout.pageStack}>
      <Breadcrumb
        items={[{ title: disciplineLabel }]}
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
        title={disciplineLabel}
        description={
          <div className="flex flex-col gap-1">
            <span>{discipline.disciplineName}</span>
            <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:gap-3">
              <span>{`Schedule task: ${discipline.taskName}`}</span>
              {actingAsLabel ? (
                <ResourceRoleContextBadge
                  label={actingAsLabel}
                  readOnly={actingAsReadOnly}
                />
              ) : null}
            </div>
          </div>
        }
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
          <Descriptions.Item label="Discipline number">
            {disciplineLabel}
          </Descriptions.Item>
          <Descriptions.Item label="Discipline name">
            {discipline.disciplineName}
          </Descriptions.Item>
          <Descriptions.Item label="Leader">
            {leaderUserId
              ? leaderQuery.data
                ? `${formatUserName(leaderQuery.data)} (${formatUserDiscipline(leaderQuery.data)})`
                : '…'
              : '-'}
          </Descriptions.Item>
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
        description="This confirms all subtasks are closed and the discipline workflow is complete. This cannot be undone."
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
