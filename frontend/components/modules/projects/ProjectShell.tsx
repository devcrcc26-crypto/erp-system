'use client';

import { useEffect, useState } from 'react';
import { Button, Drawer, Spin } from 'antd';
import { MenuOutlined } from '@ant-design/icons';
import StatusBadge from '@/components/ui/StatusBadge/StatusBadge';
import HeaderActions from '@/components/ui/PageHeader/HeaderActions';
import ProjectWorkspaceSidebar from '@/components/modules/projects/ProjectWorkspaceSidebar';
import PlaceholderPage from '@/components/PlaceholderPage';
import { ApiRequestError } from '@/lib/api/errors';
import {
  formatProjectBudget,
  formatProjectDate,
  formatProjectStatus,
  projectStatusVariant,
} from '@/lib/utils/project-display';
import { useProject, toProjectSummary } from '@/lib/query/projects';
import { useProjectContextStore } from '@/stores/project-context.store';
import { Network } from 'lucide-react';
import { layout } from '@/lib/theme/layout';

export default function ProjectShell({
  projectId,
  children,
}: {
  projectId: string;
  children: React.ReactNode;
}): React.ReactNode {
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const setActiveProject = useProjectContextStore((state) => state.setActiveProject);
  const clearProjectContext = useProjectContextStore(
    (state) => state.clearProjectContext,
  );

  const projectQuery = useProject(projectId);

  useEffect(() => {
    if (projectQuery.data) {
      setActiveProject(toProjectSummary(projectQuery.data));
    }
    return () => {
      clearProjectContext();
    };
  }, [projectQuery.data, setActiveProject, clearProjectContext]);

  if (projectQuery.isLoading) {
    return (
      <div className={layout.loadingCard}>
        <Spin />
      </div>
    );
  }

  if (projectQuery.isError || !projectQuery.data) {
    const status =
      projectQuery.error instanceof ApiRequestError
        ? projectQuery.error.status
        : 0;

    return (
      <PlaceholderPage
        icon={Network}
        title="Project not found"
        description={
          status === 404
            ? 'This project does not exist or the API is not available yet.'
            : 'Unable to load project details.'
        }
      />
    );
  }

  const project = projectQuery.data;

  return (
    <div className={layout.pageStack}>
      <section className={`${layout.cardSurface} ${layout.cardPadding}`}>
        <div className="flex flex-col gap-6">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-3">
                <h2 className="text-xl font-bold text-slate-900 md:text-2xl">
                  {project.name}
                </h2>
                <StatusBadge
                  label={formatProjectStatus(project.status)}
                  variant={projectStatusVariant(project.status)}
                />
              </div>
              <p className="mt-2 text-sm text-slate-500">{project.projectCode}</p>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <HeaderActions />
              <Button
                type="default"
                icon={<MenuOutlined />}
                className="md:!hidden"
                onClick={() => setMobileNavOpen(true)}
                aria-label="Open project navigation"
              >
                Menu
              </Button>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-x-8 gap-y-4 text-sm sm:grid-cols-4">
            <div>
              <p className="text-slate-500">Start</p>
              <p className="mt-0.5 font-medium text-slate-800">
                {formatProjectDate(project.startDate)}
              </p>
            </div>
            <div>
              <p className="text-slate-500">Planned finish</p>
              <p className="mt-0.5 font-medium text-slate-800">
                {formatProjectDate(project.plannedFinishDate)}
              </p>
            </div>
            <div>
              <p className="text-slate-500">Budget</p>
              <p className="mt-0.5 font-medium text-slate-800">
                {formatProjectBudget(project.budget, project.currency)}
              </p>
            </div>
            <div>
              <p className="text-slate-500">Location</p>
              <p className="mt-0.5 font-medium text-slate-800">
                {project.location ?? '—'}
              </p>
            </div>
          </div>
        </div>
      </section>

      <div className="flex flex-col gap-8 md:flex-row md:items-start">
        <aside
          className={`hidden w-full shrink-0 md:block md:w-64 ${layout.cardSurface} px-3 py-5`}
        >
          <ProjectWorkspaceSidebar projectId={projectId} />
        </aside>

        <Drawer
          title="Project navigation"
          placement="left"
          open={mobileNavOpen}
          onClose={() => setMobileNavOpen(false)}
          className="md:hidden"
          styles={{ body: { padding: '12px 8px' } }}
        >
          <ProjectWorkspaceSidebar
            projectId={projectId}
            onNavigate={() => setMobileNavOpen(false)}
          />
        </Drawer>

        <div className={`min-w-0 flex-1 ${layout.pageStack}`}>{children}</div>
      </div>
    </div>
  );
}
