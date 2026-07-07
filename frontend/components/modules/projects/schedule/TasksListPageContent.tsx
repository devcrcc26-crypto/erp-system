'use client';

import { useState } from 'react';
import { Alert, Switch } from 'antd';
import { PageLoadingSkeleton } from '@/components/ui/FormLayout/FormLayout';
import { ApiRequestError } from '@/lib/api/errors';
import { useAllTasks, useTaskDependencies } from '@/lib/query/schedule';
import TasksPanel from '@/components/modules/projects/schedule/TasksPanel';
import ProjectModuleGate from '@/components/modules/projects/ProjectModuleGate';
import { usePermissionsLoading } from '@/hooks/use-pm-capabilities';

export default function TasksListPageContent({
  projectId,
}: {
  projectId: string;
}): React.ReactNode {
  const [criticalOnly, setCriticalOnly] = useState(false);

  const permLoading = usePermissionsLoading();
  const tasksQuery = useAllTasks(projectId, !permLoading);
  const dependenciesQuery = useTaskDependencies(projectId, !permLoading);

  const isLoading = permLoading || tasksQuery.isLoading || dependenciesQuery.isLoading;

  const apiUnavailable =
    tasksQuery.isError &&
    tasksQuery.error instanceof ApiRequestError &&
    (tasksQuery.error.status === 404 || tasksQuery.error.status === 0);

  const tasks = tasksQuery.data?.data ?? [];
  const dependencies = dependenciesQuery.data ?? [];

  if (isLoading) {
    return <PageLoadingSkeleton />;
  }

  return (
    <ProjectModuleGate projectId={projectId} module="schedule">
      <div className="flex min-h-0 flex-col gap-3">
        {apiUnavailable && (
          <Alert
            type="info"
            showIcon
            title="Schedule APIs are not connected yet."
            description="Tasks will populate when the project management backend module is available."
          />
        )}

        <div className="flex justify-end">
          <label className="flex shrink-0 items-center gap-2 text-xs text-slate-600">
            <Switch
              size="small"
              checked={criticalOnly}
              onChange={setCriticalOnly}
            />
            Critical only
          </label>
        </div>

        <TasksPanel
          projectId={projectId}
          tasks={tasks}
          dependencies={dependencies}
          dependenciesLoading={dependenciesQuery.isLoading}
          criticalOnly={criticalOnly}
        />
      </div>
    </ProjectModuleGate>
  );
}
