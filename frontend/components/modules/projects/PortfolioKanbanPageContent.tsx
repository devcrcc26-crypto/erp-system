// UI polish pass - styles only, no logic changes

'use client';

import { useMemo, useState, type ChangeEvent } from 'react';
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  closestCorners,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import { Alert, Input } from 'antd';
import { SearchOutlined } from '@ant-design/icons';
import { ListChecks } from 'lucide-react';
import PlaceholderPage from '@/components/PlaceholderPage';
import ConfirmDialog from '@/components/ui/ConfirmDialog/ConfirmDialog';
import FormLayout, { PageLoadingSkeleton } from '@/components/ui/FormLayout/FormLayout';
import { layout } from '@/lib/theme/layout';
import { ApiRequestError } from '@/lib/api/errors';
import type { Project, ProjectStatus } from '@/lib/api/project-management.types';
import { PROJECT_STATUS_WORKFLOW } from '@/lib/api/workflow';
import { useAllProjects, useUpdateProject } from '@/lib/query/projects';
import { useAuthHydrated } from '@/hooks/useAuthHydrated';
import { useAuthStore } from '@/stores/auth.store';
import { formatProjectStatus } from '@/lib/utils/project-display';
import { useAppMessage } from '@/hooks/use-app-message';
import { notifyApiError } from '@/lib/utils/notify-api-error';
import { groupProjectsByStatus } from '@/lib/utils/portfolio-kanban';
import KanbanColumn from '@/components/modules/projects/KanbanColumn';
import {
  ProjectKanbanCardPreview,
} from '@/components/modules/projects/ProjectKanbanCard';

interface PendingStatusMove {
  project: Project;
  nextStatus: ProjectStatus;
}

export default function PortfolioKanbanPageContent(): React.ReactNode {
  const [search, setSearch] = useState('');
  const [activeProject, setActiveProject] = useState<Project | null>(null);
  const [pendingMove, setPendingMove] = useState<PendingStatusMove | null>(
    null,
  );

  const authHydrated = useAuthHydrated();
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated());
  const updateProject = useUpdateProject();
  const messageApi = useAppMessage();
  const canFetchProjects = authHydrated && isAuthenticated;

  const projectsQuery = useAllProjects(
    {
      search: search.trim() || undefined,
      sortBy: 'projectCode',
      sortOrder: 'asc',
    },
    canFetchProjects,
  );

  const projects = projectsQuery.data?.data ?? [];

  const groupedProjects = useMemo(
    () => groupProjectsByStatus(projects),
    [projects],
  );

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 8 },
    }),
  );

  function handleDragStart(event: DragStartEvent): void {
    const project = event.active.data.current?.project as Project | undefined;
    setActiveProject(project ?? null);
  }

  function handleDragEnd(event: DragEndEvent): void {
    setActiveProject(null);

    const project = event.active.data.current?.project as Project | undefined;
    const overId = event.over?.id;

    if (!project || !overId || typeof overId !== 'string') {
      return;
    }

    const nextStatus = overId as ProjectStatus;
    if (project.status === nextStatus) {
      return;
    }

    const isValidStatus = PROJECT_STATUS_WORKFLOW.some(
      (step) => step.key === nextStatus,
    );
    if (!isValidStatus) {
      return;
    }

    setPendingMove({ project, nextStatus });
  }

  async function handleConfirmStatusMove(): Promise<void> {
    if (!pendingMove) {
      return;
    }

    try {
      await updateProject.mutateAsync({
        projectId: pendingMove.project.id,
        body: { status: pendingMove.nextStatus },
      });
      messageApi.success('Status updated');
      setPendingMove(null);
      void projectsQuery.refetch();
    } catch (error) {
      notifyApiError(error, 'Failed to update project status', messageApi);
    }
  }

  if (!authHydrated) {
    return <PageLoadingSkeleton />;
  }

  if (!isAuthenticated) {
    return (
      <PlaceholderPage
        icon={ListChecks}
        title="Kanban Board"
        description="Sign in to view the portfolio board."
      />
    );
  }

  if (projectsQuery.isLoading) {
    return <PageLoadingSkeleton />;
  }

  if (projectsQuery.isError) {
    const status =
      projectsQuery.error instanceof ApiRequestError
        ? projectsQuery.error.status
        : 0;

    if (status === 403 || status === 401) {
      return (
        <PlaceholderPage
          icon={ListChecks}
          title="Kanban Board"
          description="You do not have permission to view the portfolio board."
        />
      );
    }

    if (status === 404) {
      return (
        <PlaceholderPage
          icon={ListChecks}
          title="Kanban Board"
          description="Project APIs are not available yet. The board will populate once the backend module is connected."
        />
      );
    }

    return (
      <PlaceholderPage
        icon={ListChecks}
        title="Kanban Board"
        description="Unable to load projects for the portfolio board."
      />
    );
  }

  return (
    <>
      <FormLayout
        title="Portfolio progress"
        description="Track project status across your portfolio. Drag cards between columns to update project stage."
        extra={
          <Input
            allowClear
            prefix={<SearchOutlined className="text-slate-400" />}
            placeholder="Search projects"
            className={layout.filterControlXl}
            value={search}
            onChange={(event: ChangeEvent<HTMLInputElement>) =>
              setSearch(event.target.value)
            }
          />
        }
      >
        {projects.length === 0 ? (
          <Alert
            type="info"
            showIcon
            title="No projects on the board"
            description="Create a project from the Projects page to see it here."
          />
        ) : (
          <DndContext
            sensors={sensors}
            collisionDetection={closestCorners}
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
          >
            <div className="overflow-x-auto pb-2">
              <div className="flex min-w-max gap-6">
                {PROJECT_STATUS_WORKFLOW.map((step) => {
                  const status = step.key as ProjectStatus;
                  return (
                    <KanbanColumn
                      key={status}
                      status={status}
                      projects={groupedProjects[status]}
                      dragEnabled
                    />
                  );
                })}
              </div>
            </div>

            <DragOverlay>
              {activeProject ? (
                <ProjectKanbanCardPreview
                  project={activeProject}
                  responsiblePersonName={
                    activeProject.responsiblePersonName ?? undefined
                  }
                />
              ) : null}
            </DragOverlay>
          </DndContext>
        )}
      </FormLayout>

      <ConfirmDialog
        open={Boolean(pendingMove)}
        title="Update project status"
        description={
          pendingMove
            ? `Move ${pendingMove.project.projectCode} from ${formatProjectStatus(pendingMove.project.status)} to ${formatProjectStatus(pendingMove.nextStatus)}?`
            : undefined
        }
        confirmLabel="Update status"
        confirmLoading={updateProject.isPending}
        onConfirm={() => void handleConfirmStatusMove()}
        onCancel={() => setPendingMove(null)}
      />
    </>
  );
}
