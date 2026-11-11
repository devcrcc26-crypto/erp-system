'use client';

import { useState } from 'react';
import { Alert, Button, Switch } from 'antd';
import { FileExcelOutlined } from '@ant-design/icons';
import { PageLoadingSkeleton } from '@/components/ui/FormLayout/FormLayout';
import { ApiRequestError } from '@/lib/api/errors';
import { useAppMessage } from '@/hooks/use-app-message';
import { useAllTasks, useTaskDependencies } from '@/lib/query/schedule';
import { downloadTaskListSummaryExcel } from '@/lib/query/project-exports';
import TasksPanel from '@/components/modules/projects/schedule/TasksPanel';
import ProjectModuleGate from '@/components/modules/projects/ProjectModuleGate';
import { usePermissionsLoading } from '@/hooks/use-pm-capabilities';

export default function TasksListPageContent({
  projectId,
}: {
  projectId: string;
}): React.ReactNode {
  const [criticalOnly, setCriticalOnly] = useState(false);
  const [exportingSummary, setExportingSummary] = useState(false);
  const messageApi = useAppMessage();

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

  async function handleExportTaskListSummary(): Promise<void> {
    setExportingSummary(true);
    try {
      await downloadTaskListSummaryExcel(projectId);
      messageApi.success('Task list summary export downloaded.');
    } catch {
      messageApi.error('Unable to export task list summary. Please try again.');
    } finally {
      setExportingSummary(false);
    }
  }

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

        <div className="flex flex-wrap items-center justify-end gap-3">
          <Button
            size="small"
            icon={<FileExcelOutlined />}
            loading={exportingSummary}
            onClick={() => void handleExportTaskListSummary()}
          >
            Export task list (summary)
          </Button>
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
