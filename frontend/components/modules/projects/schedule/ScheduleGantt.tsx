'use client';

import { useMemo, useState } from 'react';
import { Button, Empty, Switch, Tooltip } from 'antd';
import { ZoomInOutlined, ZoomOutOutlined } from '@ant-design/icons';
import StatusBadge from '@/components/ui/StatusBadge/StatusBadge';
import type { Task } from '@/lib/api/project-management.types';
import {
  buildGanttTimeline,
  GANTT_BAR_HEIGHT_PX,
  GANTT_DAY_WIDTH_PX,
  GANTT_DEFAULT_ZOOM_INDEX,
  GANTT_HEADER_HEIGHT_PX,
  GANTT_ROW_HEIGHT_PX,
  GANTT_TASK_COLUMN_PX,
  GANTT_ZOOM_LEVELS,
  getGanttBarLayout,
  getGanttBarLayoutPx,
  getGanttDateRange,
  type GanttDateRange,
  type ScheduleMetrics,
  formatScheduleVariance,
} from '@/lib/utils/schedule-metrics';
import { formatProjectDate } from '@/lib/utils/project-display';
import { formatLocalizedName } from '@/lib/utils/bilingual-name';
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
    track: '#ffedd5',
    fill: tokens.colorPrimary,
    border: tokens.colorPrimaryHover,
    text: '#ffffff',
  };
}

/** Minimum fill width so zero-progress tasks remain visible on the timeline. */
function barFillPercent(task: Task): number {
  if (task.status === 'COMPLETED') {
    return 100;
  }
  return Math.max(task.progressPct, 12);
}

function todayPositionPercent(
  dateRange: GanttDateRange,
  todayDayIndex: number | null,
): number | null {
  if (todayDayIndex === null || dateRange.totalDays <= 0) {
    return null;
  }
  return ((todayDayIndex + 0.5) / dateRange.totalDays) * 100;
}

function TaskTimelineBar({
  task,
  left,
  width,
  showBarLabel,
}: {
  task: Task;
  left: string;
  width: string;
  showBarLabel: boolean;
}): React.ReactNode {
  const colors = taskBarColors(task);
  const fillPct = barFillPercent(task);

  return (
    <Tooltip
      title={
        <div className="space-y-1 text-xs">
          <p className="font-medium">{formatLocalizedName(task)}</p>
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
        className="absolute top-1/2 -translate-y-1/2 overflow-hidden rounded-md shadow-md"
        style={{
          left,
          width,
          height: GANTT_BAR_HEIGHT_PX,
          backgroundColor: colors.track,
          border: `2px solid ${colors.border}`,
        }}
      >
        <div
          className="h-full rounded-sm"
          style={{
            width: `${fillPct}%`,
            backgroundColor: colors.fill,
            opacity:
              task.progressPct === 0 && task.status !== 'COMPLETED' ? 0.55 : 1,
          }}
        />
        {showBarLabel && (
          <span
            className="absolute inset-0 flex items-center px-2 text-[11px] font-semibold drop-shadow-sm"
            style={{
              color: colors.text,
              textShadow: '0 1px 2px rgba(0,0,0,0.35)',
            }}
          >
            {task.taskIdCode} · {task.progressPct}%
          </span>
        )}
      </div>
    </Tooltip>
  );
}

export default function ScheduleGantt({
  tasks,
  metrics,
  criticalOnly,
  onCriticalOnlyChange,
}: {
  tasks: Task[];
  metrics: ScheduleMetrics;
  criticalOnly: boolean;
  onCriticalOnlyChange: (value: boolean) => void;
}): React.ReactNode {
  const [zoomIndex, setZoomIndex] = useState(GANTT_DEFAULT_ZOOM_INDEX);
  const zoom = GANTT_ZOOM_LEVELS[zoomIndex];
  const dayWidthPx = GANTT_DAY_WIDTH_PX * zoom;
  const canZoomOut = zoomIndex > 0;
  const canZoomIn = zoomIndex < GANTT_ZOOM_LEVELS.length - 1;

  const visibleTasks = useMemo(
    () => (criticalOnly ? tasks.filter((task) => task.isCritical) : tasks),
    [tasks, criticalOnly],
  );

  const dateRange = useMemo(
    () => getGanttDateRange(visibleTasks),
    [visibleTasks],
  );

  const timeline = useMemo(
    () => (dateRange ? buildGanttTimeline(dateRange, dayWidthPx) : null),
    [dateRange, dayWidthPx],
  );

  return (
    <div className={`${layout.cardSurface} flex flex-col gap-2 p-3 sm:p-4`}>
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b border-slate-200 pb-2">
        <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
          <p className="text-sm font-semibold text-slate-800">Programme timeline</p>
          {dateRange && (
            <span className="text-xs text-slate-500">
              {formatMonthDay(dateRange.start)} – {formatMonthDay(dateRange.end)}
            </span>
          )}
          <span className="hidden h-3 w-px bg-slate-200 sm:inline-block" aria-hidden />
          <span className="text-xs text-slate-600">
            Actual{' '}
            <strong className="font-semibold text-slate-800">
              {metrics.actualProgressPct !== null
                ? `${metrics.actualProgressPct}%`
                : '-'}
            </strong>
          </span>
          <span className="text-xs text-slate-600">
            Variance{' '}
            <strong className="font-semibold text-slate-800">
              {formatScheduleVariance(metrics.scheduleVariancePct)}
            </strong>
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="hidden items-center gap-3 text-[11px] text-slate-500 md:flex">
            <span className="flex items-center gap-1">
              <span
                className="inline-block h-2 w-4 rounded-sm"
                style={{ backgroundColor: tokens.colorPrimary }}
              />
              Active
            </span>
            <span className="flex items-center gap-1">
              <span className="inline-block h-2 w-4 rounded-sm bg-red-600" />
              Critical
            </span>
            <span className="flex items-center gap-1">
              <span className="inline-block h-2 w-4 rounded-sm bg-green-600" />
              Done
            </span>
          </div>
          <label className="hidden shrink-0 items-center gap-2 text-xs text-slate-600 lg:flex">
            <Button
              size="small"
              icon={<ZoomOutOutlined />}
              disabled={!canZoomOut}
              onClick={() => setZoomIndex((index) => Math.max(0, index - 1))}
              aria-label="Zoom out"
            />
            <span className="w-10 text-center tabular-nums">
              {Math.round(zoom * 100)}%
            </span>
            <Button
              size="small"
              icon={<ZoomInOutlined />}
              disabled={!canZoomIn}
              onClick={() =>
                setZoomIndex((index) =>
                  Math.min(GANTT_ZOOM_LEVELS.length - 1, index + 1),
                )
              }
              aria-label="Zoom in"
            />
          </label>
          <label className="flex shrink-0 items-center gap-2 text-xs text-slate-600">
            <Switch
              size="small"
              checked={criticalOnly}
              onChange={onCriticalOnlyChange}
            />
            Critical only
          </label>
        </div>
      </div>

      <div>
        {!dateRange || !timeline || visibleTasks.length === 0 ? (
          <Empty
            className="py-8"
            description="No schedulable tasks to display on the Gantt chart."
          />
        ) : (
        <>
          {/* Mobile: stacked cards with full-width timeline bars (no horizontal scroll). */}
          <div className="lg:hidden">
            <div className="border-b border-slate-200 bg-slate-50 px-3 py-2">
              <div className="flex justify-between text-[11px] font-medium text-slate-500">
                <span>{formatMonthDay(dateRange.start)}</span>
                <span>{formatMonthDay(dateRange.end)}</span>
              </div>
            </div>
            <div className="divide-y divide-slate-200">
              {visibleTasks.map((task) => {
                const bar = getGanttBarLayout(task, dateRange);
                const todayPct = todayPositionPercent(
                  dateRange,
                  timeline.todayDayIndex,
                );

                return (
                  <div key={task.id} className="px-3 py-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-slate-900">
                          {task.taskIdCode}
                        </p>
                        <p className="text-xs text-slate-500">{formatLocalizedName(task)}</p>
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
                    <div className="relative mt-3 h-9 w-full rounded-md bg-slate-100">
                      {todayPct !== null && (
                        <div
                          className="pointer-events-none absolute top-0 bottom-0 z-10 w-1 rounded-full bg-orange-500 shadow-[0_0_0_2px_rgba(249,115,22,0.25)]"
                          style={{ left: `calc(${todayPct}% - 2px)` }}
                        />
                      )}
                      {bar && (
                        <TaskTimelineBar
                          task={task}
                          left={`${bar.leftPct}%`}
                          width={`${bar.widthPct}%`}
                          showBarLabel={bar.widthPct >= 18}
                        />
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Desktop: fixed day-width timeline - scrolls horizontally, zoomable. */}
          <div className="hidden lg:block">
            <div className="overflow-x-auto rounded-md border border-slate-200">
              <div
                className="grid border-b border-slate-300 bg-slate-100"
                style={{
                  gridTemplateColumns: `${GANTT_TASK_COLUMN_PX}px ${timeline.totalWidthPx}px`,
                  height: GANTT_HEADER_HEIGHT_PX,
                  width: GANTT_TASK_COLUMN_PX + timeline.totalWidthPx,
                }}
              >
                <div className="sticky left-0 z-20 flex items-end border-r border-slate-300 bg-slate-100 px-4 pb-3 text-xs font-semibold uppercase tracking-wide text-slate-600">
                  Task
                </div>
                <div className="relative">
                  <div className="flex h-10 border-b border-slate-200 bg-white">
                    {timeline.months.map((month) => (
                      <div
                        key={month.key}
                        className="flex items-center overflow-hidden border-r border-slate-200 px-2 text-xs font-semibold text-slate-800 last:border-r-0"
                        style={{ width: month.dayCount * dayWidthPx }}
                        title={month.label}
                      >
                        <span className="truncate">{month.label}</span>
                      </div>
                    ))}
                  </div>
                  <div className="flex h-10 bg-slate-50">
                    {timeline.weeks.map((week) => (
                      <div
                        key={week.key}
                        className="flex items-center overflow-hidden border-r border-slate-200 px-1 text-[11px] font-medium text-slate-600 last:border-r-0"
                        style={{ width: week.dayCount * dayWidthPx }}
                        title={week.label}
                      >
                        <span className="truncate">{week.label}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {visibleTasks.map((task) => {
                const bar = getGanttBarLayoutPx(task, dateRange, dayWidthPx);
                const showBarLabel = bar
                  ? bar.widthPx >= dayWidthPx * 2.5
                  : false;

                return (
                  <div
                    key={task.id}
                    className="grid border-b border-slate-200 last:border-b-0 hover:bg-slate-50/80"
                    style={{
                      gridTemplateColumns: `${GANTT_TASK_COLUMN_PX}px ${timeline.totalWidthPx}px`,
                      height: GANTT_ROW_HEIGHT_PX,
                      width: GANTT_TASK_COLUMN_PX + timeline.totalWidthPx,
                    }}
                  >
                    <div className="sticky left-0 z-10 flex flex-col justify-center border-r border-slate-300 bg-white px-4 py-2">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold text-slate-900">
                            {task.taskIdCode}
                          </p>
                          <p className="truncate text-xs text-slate-500">
                            {formatLocalizedName(task)}
                          </p>
                        </div>
                        <StatusBadge
                          label={formatTaskStatus(task.status)}
                          variant={taskStatusVariant(task.status)}
                        />
                      </div>
                      <p className="mt-1 truncate text-[11px] text-slate-400">
                        {formatProjectDate(task.startDate)} →{' '}
                        {formatProjectDate(task.finishDate)}
                      </p>
                    </div>

                    <div className="relative bg-white">
                      {timeline.weeks.map((week) => (
                        <div
                          key={`${task.id}-${week.key}`}
                          className="pointer-events-none absolute top-0 bottom-0 border-l border-slate-100"
                          style={{ left: week.startDay * dayWidthPx }}
                        />
                      ))}

                      {timeline.todayDayIndex !== null && (
                        <div
                          className="pointer-events-none absolute top-0 bottom-0 z-10 w-0.5 rounded-full bg-orange-500"
                          style={{
                            left: (timeline.todayDayIndex + 0.5) * dayWidthPx,
                          }}
                        />
                      )}

                      <div className="relative flex h-full items-center px-1">
                        {bar && (
                          <TaskTimelineBar
                            task={task}
                            left={`${bar.leftPx}px`}
                            width={`${bar.widthPx}px`}
                            showBarLabel={showBarLabel}
                          />
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </>
        )}
      </div>

    </div>
  );
}
