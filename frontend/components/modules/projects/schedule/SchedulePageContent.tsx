// UI polish pass - styles only, no logic changes

'use client';

import { useMemo, useState } from 'react';
import { Alert, Collapse } from 'antd';
import { PageLoadingSkeleton } from '@/components/ui/FormLayout/FormLayout';
import { ApiRequestError } from '@/lib/api/errors';
import { useAllTasks, useScheduleSubtasks } from '@/lib/query/schedule';
import { computeScheduleMetrics } from '@/lib/utils/schedule-metrics';
import MilestonesPanel from '@/components/modules/projects/schedule/MilestonesPanel';
import ScheduleGantt from '@/components/modules/projects/schedule/ScheduleGantt';
import ScheduleCalendar from '@/components/modules/projects/schedule/ScheduleCalendar';
import ProjectModuleGate from '@/components/modules/projects/ProjectModuleGate';
import { usePermissionsLoading } from '@/hooks/use-pm-capabilities';

export default function SchedulePageContent({
  projectId,
}: {
  projectId: string;
}): React.ReactNode {
  const [criticalOnly, setCriticalOnly] = useState(false);
  const [milestonesOpen, setMilestonesOpen] = useState(false);

  const permLoading = usePermissionsLoading();
  const tasksQuery = useAllTasks(projectId, !permLoading);
  const { byTaskId: subtasksByTaskId } = useScheduleSubtasks(
    projectId,
    !permLoading,
  );

  const isLoading = permLoading || tasksQuery.isLoading;

  const apiUnavailable =
    tasksQuery.isError &&
    tasksQuery.error instanceof ApiRequestError &&
    (tasksQuery.error.status === 404 || tasksQuery.error.status === 0);

  const tasks = tasksQuery.data?.data ?? [];

  const metrics = useMemo(
    () => computeScheduleMetrics(tasks, subtasksByTaskId),
    [tasks, subtasksByTaskId],
  );

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
          description="The Gantt chart and calendar will populate when the project management backend module is available."
        />
      )}

      <ScheduleGantt
        tasks={tasks}
        metrics={metrics}
        criticalOnly={criticalOnly}
        onCriticalOnlyChange={setCriticalOnly}
      />

      <ScheduleCalendar tasks={tasks} />

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
    </ProjectModuleGate>
  );
}
