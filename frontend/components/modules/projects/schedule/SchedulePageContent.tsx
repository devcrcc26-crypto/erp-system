// UI polish pass - styles only, no logic changes

'use client';

import { useMemo, useState } from 'react';
import { Alert, Collapse } from 'antd';
import { PageLoadingSkeleton } from '@/components/ui/FormLayout/FormLayout';
import { ApiRequestError } from '@/lib/api/errors';
import { useAllTasks, useTaskDependencies } from '@/lib/query/schedule';
import { computeScheduleMetrics } from '@/lib/utils/schedule-metrics';
import ScheduleKpiBar from '@/components/modules/projects/schedule/ScheduleKpiBar';
import MilestonesPanel from '@/components/modules/projects/schedule/MilestonesPanel';
import TasksPanel from '@/components/modules/projects/schedule/TasksPanel';
import ScheduleGantt from '@/components/modules/projects/schedule/ScheduleGantt';
import { layout } from '@/lib/theme/layout';

export default function SchedulePageContent({
  projectId,
}: {
  projectId: string;
}): React.ReactNode {
  const [criticalOnly, setCriticalOnly] = useState(false);
  const [milestonesOpen, setMilestonesOpen] = useState(false);

  const tasksQuery = useAllTasks(projectId);
  const dependenciesQuery = useTaskDependencies(projectId);

  const isLoading = tasksQuery.isLoading || dependenciesQuery.isLoading;

  const apiUnavailable =
    tasksQuery.isError &&
    tasksQuery.error instanceof ApiRequestError &&
    (tasksQuery.error.status === 404 || tasksQuery.error.status === 0);

  const tasks = tasksQuery.data?.data ?? [];
  const dependencies = dependenciesQuery.data ?? [];

  const metrics = useMemo(() => computeScheduleMetrics(tasks), [tasks]);

  if (isLoading) {
    return <PageLoadingSkeleton />;
  }

  return (
    <div className={layout.pageStack}>
      {apiUnavailable && (
        <Alert
          type="info"
          showIcon
          title="Schedule APIs are not connected yet."
          description="Tasks and the Gantt chart will populate when the project management backend module is available."
        />
      )}

      <ScheduleKpiBar metrics={metrics} />

      <ScheduleGantt
        tasks={tasks}
        criticalOnly={criticalOnly}
        onCriticalOnlyChange={setCriticalOnly}
      />

      <TasksPanel
        projectId={projectId}
        tasks={tasks}
        dependencies={dependencies}
        dependenciesLoading={dependenciesQuery.isLoading}
        criticalOnly={criticalOnly}
      />

      <Collapse
        bordered={false}
        className="erp-schedule-collapse bg-transparent"
        activeKey={milestonesOpen ? ['milestones'] : []}
        onChange={(keys) =>
          setMilestonesOpen(
            Array.isArray(keys) ? keys.includes('milestones') : keys === 'milestones',
          )
        }
        items={[
          {
            key: 'milestones',
            label: 'Milestones',
            children: <MilestonesPanel projectId={projectId} />,
          },
        ]}
      />
    </div>
  );
}
