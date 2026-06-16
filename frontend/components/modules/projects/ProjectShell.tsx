'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Breadcrumb, Spin, Tabs } from 'antd';
import StatusBadge from '@/components/ui/StatusBadge/StatusBadge';
import { ApiRequestError } from '@/lib/api/errors';
import {
  formatProjectBudget,
  formatProjectDate,
  formatProjectStatus,
  projectStatusVariant,
} from '@/lib/utils/project-display';
import { useProject } from '@/lib/query/projects';
import { toProjectSummary } from '@/lib/query/projects';
import { useProjectContextStore } from '@/stores/project-context.store';
import { useEffect } from 'react';
import PlaceholderPage from '@/components/PlaceholderPage';
import { Network } from 'lucide-react';

const PROJECT_TABS = [
  { key: 'dashboard', label: 'Dashboard', href: (id: string) => `/projects/${id}` },
  { key: 'team', label: 'Team', href: (id: string) => `/projects/${id}/team` },
  {
    key: 'documents',
    label: 'Documents',
    href: (id: string) => `/projects/${id}/documents`,
  },
  {
    key: 'schedule',
    label: 'Schedule',
    href: (id: string) => `/projects/${id}/schedule`,
  },
  { key: 'rfis', label: 'RFIs', href: (id: string) => `/projects/${id}/rfis` },
  {
    key: 'submittals',
    label: 'Submittals',
    href: (id: string) => `/projects/${id}/submittals`,
  },
  {
    key: 'drawings',
    label: 'Drawings',
    href: (id: string) => `/projects/${id}/drawings`,
  },
  {
    key: 'daily-logs',
    label: 'Daily Logs',
    href: (id: string) => `/projects/${id}/daily-logs`,
  },
  {
    key: 'meetings',
    label: 'Meetings',
    href: (id: string) => `/projects/${id}/meetings`,
  },
  {
    key: 'correspondence',
    label: 'Correspondence',
    href: (id: string) => `/projects/${id}/correspondence`,
  },
  { key: 'risks', label: 'Risks', href: (id: string) => `/projects/${id}/risks` },
  { key: 'issues', label: 'Issues', href: (id: string) => `/projects/${id}/issues` },
  {
    key: 'punch-list',
    label: 'Punch List',
    href: (id: string) => `/projects/${id}/punch-list`,
  },
  {
    key: 'closeout',
    label: 'Closeout',
    href: (id: string) => `/projects/${id}/closeout`,
  },
] as const;

function resolveActiveTab(pathname: string, projectId: string): string {
  const base = `/projects/${projectId}`;
  if (pathname === base) {
    return 'dashboard';
  }
  const match = PROJECT_TABS.find((tab) => {
    if (tab.key === 'dashboard') {
      return false;
    }
    return pathname.startsWith(`${base}/${tab.key}`);
  });
  return match?.key ?? 'dashboard';
}

export default function ProjectShell({
  projectId,
  children,
}: {
  projectId: string;
  children: React.ReactNode;
}): React.ReactNode {
  const pathname = usePathname();
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
      <div className="flex justify-center rounded-md bg-white p-12 shadow-sm">
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
  const activeTab = resolveActiveTab(pathname, projectId);

  return (
    <div className="space-y-4">
      <Breadcrumb
        items={[
          { title: <Link href="/projects">Projects</Link> },
          { title: project.projectCode },
        ]}
      />

      <div className="rounded-md border border-slate-200 bg-white p-4 shadow-sm md:p-6">
        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-xl font-bold text-slate-900">{project.name}</h2>
              <StatusBadge
                label={formatProjectStatus(project.status)}
                variant={projectStatusVariant(project.status)}
              />
            </div>
            <p className="mt-1 text-sm text-slate-500">{project.projectCode}</p>
          </div>
          <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm md:text-right">
            <div>
              <p className="text-slate-500">Start</p>
              <p className="font-medium text-slate-800">
                {formatProjectDate(project.startDate)}
              </p>
            </div>
            <div>
              <p className="text-slate-500">Planned finish</p>
              <p className="font-medium text-slate-800">
                {formatProjectDate(project.plannedFinishDate)}
              </p>
            </div>
            <div>
              <p className="text-slate-500">Budget</p>
              <p className="font-medium text-slate-800">
                {formatProjectBudget(project.budget, project.currency)}
              </p>
            </div>
            <div>
              <p className="text-slate-500">Location</p>
              <p className="font-medium text-slate-800">
                {project.location ?? '—'}
              </p>
            </div>
          </div>
        </div>

        <Tabs
          className="!mt-4"
          activeKey={activeTab}
          items={PROJECT_TABS.map((tab) => ({
            key: tab.key,
            label: <Link href={tab.href(projectId)}>{tab.label}</Link>,
          }))}
        />
      </div>

      {children}
    </div>
  );
}
