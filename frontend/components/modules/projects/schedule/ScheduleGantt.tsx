'use client';

import { useMemo } from 'react';
import { Empty, Switch, Table, Tag } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import FormLayout from '@/components/ui/FormLayout/FormLayout';
import type { Task, TaskDependency } from '@/lib/api/project-management.types';
import {
  getGanttBarLayout,
  getGanttDateRange,
} from '@/lib/utils/schedule-metrics';
import { formatProjectDate } from '@/lib/utils/project-display';
import { tokens } from '@/lib/theme/tokens';

function formatMonthDay(date: Date): string {
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export default function ScheduleGantt({
  tasks,
  dependencies,
  criticalOnly,
  onCriticalOnlyChange,
}: {
  tasks: Task[];
  dependencies: TaskDependency[];
  criticalOnly: boolean;
  onCriticalOnlyChange: (value: boolean) => void;
}): React.ReactNode {
  const visibleTasks = useMemo(
    () =>
      criticalOnly ? tasks.filter((task) => task.isCritical) : tasks,
    [tasks, criticalOnly],
  );

  const dateRange = useMemo(
    () => getGanttDateRange(visibleTasks),
    [visibleTasks],
  );

  const taskNameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const task of tasks) {
      map.set(task.id, `${task.taskIdCode} — ${task.name}`);
    }
    return map;
  }, [tasks]);

  const dependencyColumns: ColumnsType<TaskDependency> = [
    {
      title: 'Predecessor',
      dataIndex: 'predecessorTaskId',
      key: 'predecessor',
      render: (id: string) => taskNameById.get(id) ?? id,
    },
    {
      title: 'Successor',
      dataIndex: 'successorTaskId',
      key: 'successor',
      render: (id: string) => taskNameById.get(id) ?? id,
    },
    {
      title: 'Type',
      dataIndex: 'dependencyType',
      key: 'dependencyType',
      width: 80,
    },
    {
      title: 'Lag (days)',
      dataIndex: 'lagDays',
      key: 'lagDays',
      width: 100,
    },
  ];

  const headerTicks = useMemo(() => {
    if (!dateRange) {
      return [];
    }
    const ticks: Date[] = [];
    const cursor = new Date(dateRange.start);
    while (cursor <= dateRange.end) {
      ticks.push(new Date(cursor));
      cursor.setDate(cursor.getDate() + 7);
    }
    return ticks;
  }, [dateRange]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-slate-500">
          {dateRange
            ? `${formatMonthDay(dateRange.start)} – ${formatMonthDay(dateRange.end)}`
            : 'Add task dates to render the timeline'}
        </p>
        <label className="flex items-center gap-2 text-sm text-slate-600">
          <Switch
            size="small"
            checked={criticalOnly}
            onChange={onCriticalOnlyChange}
          />
          Critical path only
        </label>
      </div>

      {!dateRange || visibleTasks.length === 0 ? (
        <Empty description="No schedulable tasks to display on the Gantt chart." />
      ) : (
        <div className="overflow-x-auto rounded-md border border-slate-200 bg-white">
          <div className="min-w-[720px]">
            <div className="grid grid-cols-[220px_1fr] border-b border-slate-200 bg-slate-50 text-xs font-medium text-slate-500">
              <div className="px-3 py-2">Task</div>
              <div className="relative px-3 py-2">
                <div className="flex justify-between">
                  {headerTicks.map((tick) => (
                    <span key={tick.toISOString()}>{formatMonthDay(tick)}</span>
                  ))}
                </div>
              </div>
            </div>

            {visibleTasks.map((task) => {
              const bar = getGanttBarLayout(task, dateRange);
              return (
                <div
                  key={task.id}
                  className="grid grid-cols-[220px_1fr] border-b border-slate-100 last:border-b-0"
                >
                  <div className="px-3 py-3">
                    <p className="truncate text-sm font-medium text-slate-900">
                      {task.taskIdCode}
                    </p>
                    <p className="truncate text-xs text-slate-500">{task.name}</p>
                    <div className="mt-1 flex flex-wrap gap-1">
                      {task.isCritical && <Tag color="red">Critical</Tag>}
                      <Tag>{task.progressPct}%</Tag>
                    </div>
                  </div>
                  <div className="relative px-3 py-3">
                    <div className="relative h-8 rounded bg-slate-100">
                      {bar && (
                        <div
                          className="absolute top-1 h-6 overflow-hidden rounded"
                          style={{
                            left: `${bar.leftPct}%`,
                            width: `${bar.widthPct}%`,
                            backgroundColor: task.isCritical
                              ? '#fecaca'
                              : tokens.colorPrimaryLight,
                            border: `1px solid ${task.isCritical ? '#ef4444' : tokens.colorPrimary}`,
                          }}
                          title={`${formatProjectDate(task.startDate)} → ${formatProjectDate(task.finishDate)}`}
                        >
                          <div
                            className="h-full"
                            style={{
                              width: `${task.progressPct}%`,
                              backgroundColor: task.isCritical
                                ? '#ef4444'
                                : tokens.colorPrimary,
                            }}
                          />
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <FormLayout
        title="Task dependencies"
        description="Predecessor links (FS / SS / FF / SF) with lag days."
      >
        <Table<TaskDependency>
          size="small"
          rowKey="id"
          pagination={false}
          columns={dependencyColumns}
          dataSource={dependencies}
          locale={{ emptyText: 'No dependencies defined' }}
        />
      </FormLayout>
    </div>
  );
}
