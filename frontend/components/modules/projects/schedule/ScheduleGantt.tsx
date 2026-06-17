'use client';

import { useMemo } from 'react';
import { Empty, Switch, Table, Tooltip } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import FormLayout from '@/components/ui/FormLayout/FormLayout';
import StatusBadge from '@/components/ui/StatusBadge/StatusBadge';
import type { Task, TaskDependency } from '@/lib/api/project-management.types';
import {
  buildGanttTimeline,
  GANTT_DAY_WIDTH_PX,
  GANTT_HEADER_HEIGHT_PX,
  GANTT_ROW_HEIGHT_PX,
  GANTT_TASK_COLUMN_PX,
  getGanttBarLayoutPx,
  getGanttDateRange,
} from '@/lib/utils/schedule-metrics';
import { formatProjectDate } from '@/lib/utils/project-display';
import {
  formatTaskStatus,
  taskStatusVariant,
} from '@/lib/utils/pm-status-display';
import { tokens } from '@/lib/theme/tokens';
import { layout } from '@/lib/theme/layout';

function formatMonthDay(date: Date): string {
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function taskBarColors(task: Task): {
  track: string;
  fill: string;
  border: string;
  text: string;
} {
  if (task.isCritical) {
    return {
      track: '#fee2e2',
      fill: '#dc2626',
      border: '#b91c1c',
      text: '#ffffff',
    };
  }

  if (task.status === 'COMPLETED') {
    return {
      track: '#dcfce7',
      fill: '#16a34a',
      border: '#15803d',
      text: '#ffffff',
    };
  }

  if (task.status === 'DELAYED') {
    return {
      track: '#fef3c7',
      fill: '#d97706',
      border: '#b45309',
      text: '#ffffff',
    };
  }

  return {
    track: tokens.colorPrimaryLight,
    fill: tokens.colorPrimary,
    border: tokens.colorPrimaryHover,
    text: '#ffffff',
  };
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
    () => (criticalOnly ? tasks.filter((task) => task.isCritical) : tasks),
    [tasks, criticalOnly],
  );

  const dateRange = useMemo(
    () => getGanttDateRange(visibleTasks),
    [visibleTasks],
  );

  const timeline = useMemo(
    () => (dateRange ? buildGanttTimeline(dateRange) : null),
    [dateRange],
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

  return (
    <div className={layout.pageStack}>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-sm font-medium text-slate-800">Programme timeline</p>
          <p className="text-sm text-slate-500">
            {dateRange
              ? `${formatMonthDay(dateRange.start)} – ${formatMonthDay(dateRange.end)}`
              : 'Add task start and finish dates to render the Gantt chart.'}
          </p>
        </div>
        <label className="flex items-center gap-2 text-sm text-slate-600">
          <Switch
            size="small"
            checked={criticalOnly}
            onChange={onCriticalOnlyChange}
          />
          Critical path only
        </label>
      </div>

      <div className="flex flex-wrap gap-4 text-xs text-slate-600">
        <span className="flex items-center gap-2">
          <span
            className="inline-block h-3 w-8 rounded"
            style={{ backgroundColor: tokens.colorPrimary }}
          />
          In progress
        </span>
        <span className="flex items-center gap-2">
          <span className="inline-block h-3 w-8 rounded bg-red-600" />
          Critical
        </span>
        <span className="flex items-center gap-2">
          <span className="inline-block h-3 w-8 rounded bg-green-600" />
          Completed
        </span>
        <span className="flex items-center gap-2">
          <span className="inline-block h-0.5 w-8 bg-orange-500" />
          Today
        </span>
      </div>

      {!dateRange || !timeline || visibleTasks.length === 0 ? (
        <Empty description="No schedulable tasks to display on the Gantt chart." />
      ) : (
        <div
          className={`${layout.cardSurface} overflow-hidden`}
        >
          <div className="overflow-x-auto">
            <div
              style={{
                minWidth: GANTT_TASK_COLUMN_PX + timeline.totalWidthPx,
              }}
            >
              <div
                className="grid border-b border-slate-200 bg-slate-50"
                style={{
                  gridTemplateColumns: `${GANTT_TASK_COLUMN_PX}px ${timeline.totalWidthPx}px`,
                  height: GANTT_HEADER_HEIGHT_PX,
                }}
              >
                <div className="sticky left-0 z-30 flex items-end border-r border-slate-200 bg-slate-50 px-4 pb-3 text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Task
                </div>
                <div className="relative">
                  <div className="flex h-9 border-b border-slate-200">
                    {timeline.months.map((month) => (
                      <div
                        key={month.key}
                        className="flex shrink-0 items-center border-r border-slate-200 px-3 text-xs font-semibold text-slate-700"
                        style={{ width: month.dayCount * GANTT_DAY_WIDTH_PX }}
                      >
                        {month.label}
                      </div>
                    ))}
                  </div>
                  <div className="flex h-9">
                    {timeline.weeks.map((week) => (
                      <div
                        key={week.key}
                        className="flex shrink-0 items-center border-r border-slate-100 px-2 text-[11px] text-slate-500"
                        style={{ width: week.dayCount * GANTT_DAY_WIDTH_PX }}
                      >
                        {week.label}
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {visibleTasks.map((task) => {
                const bar = getGanttBarLayoutPx(task, dateRange);
                const colors = taskBarColors(task);
                const showBarLabel = bar ? bar.widthPx >= 72 : false;

                return (
                  <div
                    key={task.id}
                    className="grid border-b border-slate-100 last:border-b-0"
                    style={{
                      gridTemplateColumns: `${GANTT_TASK_COLUMN_PX}px ${timeline.totalWidthPx}px`,
                      height: GANTT_ROW_HEIGHT_PX,
                    }}
                  >
                    <div className="sticky left-0 z-20 flex flex-col justify-center border-r border-slate-200 bg-white px-4 py-2">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold text-slate-900">
                            {task.taskIdCode}
                          </p>
                          <p className="truncate text-xs text-slate-500">
                            {task.name}
                          </p>
                        </div>
                        <StatusBadge
                          label={formatTaskStatus(task.status)}
                          variant={taskStatusVariant(task.status)}
                        />
                      </div>
                      <p className="mt-1 text-[11px] text-slate-400">
                        {formatProjectDate(task.startDate)} →{' '}
                        {formatProjectDate(task.finishDate)}
                      </p>
                    </div>

                    <div className="relative bg-[linear-gradient(to_right,#f8fafc_1px,transparent_1px)] bg-[length:32px_100%]">
                      {timeline.weeks.map((week) => (
                        <div
                          key={`${task.id}-${week.key}`}
                          className="pointer-events-none absolute top-0 bottom-0 border-l border-slate-100"
                          style={{ left: week.startDay * GANTT_DAY_WIDTH_PX }}
                        />
                      ))}

                      {timeline.todayDayIndex !== null && (
                        <div
                          className="pointer-events-none absolute top-1 bottom-1 z-10 w-0.5 rounded-full bg-orange-500"
                          style={{
                            left:
                              timeline.todayDayIndex * GANTT_DAY_WIDTH_PX +
                              GANTT_DAY_WIDTH_PX / 2,
                          }}
                        />
                      )}

                      <div className="relative flex h-full items-center px-1">
                        {bar && (
                          <Tooltip
                            title={
                              <div className="space-y-1 text-xs">
                                <p className="font-medium">{task.name}</p>
                                <p>
                                  {formatProjectDate(task.startDate)} →{' '}
                                  {formatProjectDate(task.finishDate)}
                                </p>
                                <p>Progress: {task.progressPct}%</p>
                                {task.isCritical && <p>Critical path task</p>}
                              </div>
                            }
                          >
                            <div
                              className="absolute top-1/2 h-7 -translate-y-1/2 overflow-hidden rounded-md shadow-sm"
                              style={{
                                left: bar.leftPx,
                                width: bar.widthPx,
                                backgroundColor: colors.track,
                                border: `1px solid ${colors.border}`,
                              }}
                            >
                              <div
                                className="h-full transition-all"
                                style={{
                                  width: `${task.progressPct}%`,
                                  backgroundColor: colors.fill,
                                }}
                              />
                              {showBarLabel && (
                                <span
                                  className="absolute inset-0 flex items-center px-2 text-[11px] font-medium"
                                  style={{ color: colors.text }}
                                >
                                  {task.taskIdCode} · {task.progressPct}%
                                </span>
                              )}
                            </div>
                          </Tooltip>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
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
