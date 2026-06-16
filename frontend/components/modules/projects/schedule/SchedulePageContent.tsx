'use client';

import { useMemo, useState } from 'react';
import { Alert, Spin, Tabs } from 'antd';
import { ApiRequestError } from '@/lib/api/errors';
import {
  useMilestones,
  useTaskDependencies,
  useTasks,
} from '@/lib/query/schedule';
import { computeScheduleMetrics } from '@/lib/utils/schedule-metrics';
import ScheduleKpiBar from '@/components/modules/projects/schedule/ScheduleKpiBar';
import MilestonesPanel from '@/components/modules/projects/schedule/MilestonesPanel';
import TasksPanel from '@/components/modules/projects/schedule/TasksPanel';
import ScheduleGantt from '@/components/modules/projects/schedule/ScheduleGantt';
import ScheduleCalendar from '@/components/modules/projects/schedule/ScheduleCalendar';

export default function SchedulePageContent({
  projectId,
}: {
  projectId: string;
}): React.ReactNode {
  const [criticalOnly, setCriticalOnly] = useState(false);
  const [activeTab, setActiveTab] = useState('gantt');

  const tasksQuery = useTasks(projectId, { page: 1, limit: 200 });
  const milestonesQuery = useMilestones(projectId);
  const dependenciesQuery = useTaskDependencies(projectId);

  const isLoading =
    tasksQuery.isLoading ||
    milestonesQuery.isLoading ||
    dependenciesQuery.isLoading;

  const apiUnavailable =
    (tasksQuery.isError &&
      tasksQuery.error instanceof ApiRequestError &&
      (tasksQuery.error.status === 404 || tasksQuery.error.status === 0)) ||
    (milestonesQuery.isError &&
      milestonesQuery.error instanceof ApiRequestError &&
      milestonesQuery.error.status === 404);

  const tasks = tasksQuery.data?.data ?? [];
  const dependencies = dependenciesQuery.data ?? [];

  const metrics = useMemo(() => computeScheduleMetrics(tasks), [tasks]);

  if (isLoading) {
    return (
      <div className="flex justify-center rounded-md bg-white p-12 shadow-sm">
        <Spin />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {apiUnavailable && (
        <Alert
          type="info"
          showIcon
          title="Schedule APIs are not connected yet."
          description="Milestones, tasks, Gantt, and dependencies will populate when the project management backend module is available."
        />
      )}

      <ScheduleKpiBar metrics={metrics} />

      <Tabs
        activeKey={activeTab}
        onChange={setActiveTab}
        items={[
          {
            key: 'gantt',
            label: 'Gantt',
            children: (
              <ScheduleGantt
                tasks={tasks}
                dependencies={dependencies}
                criticalOnly={criticalOnly}
                onCriticalOnlyChange={setCriticalOnly}
              />
            ),
          },
          {
            key: 'tasks',
            label: 'Tasks',
            children: (
              <TasksPanel
                projectId={projectId}
                criticalOnly={criticalOnly}
                onCriticalOnlyChange={setCriticalOnly}
              />
            ),
          },
          {
            key: 'milestones',
            label: 'Milestones',
            children: <MilestonesPanel projectId={projectId} />,
          },
          {
            key: 'calendar',
            label: 'Calendar',
            children: <ScheduleCalendar tasks={tasks} />,
          },
        ]}
      />
    </div>
  );
}
