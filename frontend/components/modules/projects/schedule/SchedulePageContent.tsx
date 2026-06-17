'use client';

import { useMemo, useState } from 'react';
import { Alert, Spin, Tabs } from 'antd';
import { ApiRequestError } from '@/lib/api/errors';
import {
  useAllTasks,
  useMilestones,
  useTaskDependencies,
} from '@/lib/query/schedule';
import { computeScheduleMetrics } from '@/lib/utils/schedule-metrics';
import ScheduleKpiBar from '@/components/modules/projects/schedule/ScheduleKpiBar';
import MilestonesPanel from '@/components/modules/projects/schedule/MilestonesPanel';
import TasksPanel from '@/components/modules/projects/schedule/TasksPanel';
import ScheduleGantt from '@/components/modules/projects/schedule/ScheduleGantt';
import ScheduleCalendar from '@/components/modules/projects/schedule/ScheduleCalendar';
import { layout } from '@/lib/theme/layout';

export default function SchedulePageContent({
  projectId,
}: {
  projectId: string;
}): React.ReactNode {
  const [criticalOnly, setCriticalOnly] = useState(false);
  const [activeTab, setActiveTab] = useState('gantt');

  const tasksQuery = useAllTasks(projectId);
  const milestonesQuery = useMilestones(
    projectId,
    { page: 1, limit: 50 },
    activeTab === 'milestones',
  );
  const dependenciesQuery = useTaskDependencies(projectId, activeTab === 'gantt');

  const isLoading =
    tasksQuery.isLoading ||
    (activeTab === 'gantt' && dependenciesQuery.isLoading) ||
    (activeTab === 'milestones' && milestonesQuery.isLoading);

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
      <div className={layout.loadingCard}>
        <Spin />
      </div>
    );
  }

  return (
    <div className={layout.pageStack}>
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
        destroyOnHidden
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
                tasks={tasks}
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
