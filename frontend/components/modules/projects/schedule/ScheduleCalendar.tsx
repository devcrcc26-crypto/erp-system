'use client';

import { useMemo, useState } from 'react';
import { Badge, Calendar, Segmented, type CalendarProps } from 'antd';
import dayjs, { type Dayjs } from 'dayjs';
import FormLayout from '@/components/ui/FormLayout/FormLayout';
import type { Task } from '@/lib/api/project-management.types';
import { tokens } from '@/lib/theme/tokens';
import { formatLocalizedName } from '@/lib/utils/bilingual-name';

type CalendarViewMode = 'month' | 'year';

function taskAccentColor(task: Task): string {
  if (task.isCritical) {
    return '#dc2626';
  }
  if (task.status === 'COMPLETED') {
    return '#16a34a';
  }
  if (task.status === 'DELAYED') {
    return '#d97706';
  }
  return tokens.colorPrimary;
}

function enumerateDateKeys(start: string | null, finish: string | null): string[] {
  if (!start && !finish) {
    return [];
  }

  const startKey = (start ?? finish)?.slice(0, 10);
  const finishKey = (finish ?? start)?.slice(0, 10);
  if (!startKey || !finishKey) {
    return [];
  }

  const keys: string[] = [];
  let cursor = dayjs(startKey);
  const end = dayjs(finishKey);

  while (cursor.isBefore(end) || cursor.isSame(end, 'day')) {
    keys.push(cursor.format('YYYY-MM-DD'));
    cursor = cursor.add(1, 'day');
  }

  return keys;
}

export default function ScheduleCalendar({
  tasks,
}: {
  tasks: Task[];
}): React.ReactNode {
  const [viewMode, setViewMode] = useState<CalendarViewMode>('month');
  const [panelDate, setPanelDate] = useState<Dayjs>(() => dayjs());

  const tasksByDate = useMemo(() => {
    const map = new Map<string, Task[]>();

    for (const task of tasks) {
      for (const key of enumerateDateKeys(task.startDate, task.finishDate)) {
        const list = map.get(key) ?? [];
        if (!list.some((entry) => entry.id === task.id)) {
          list.push(task);
        }
        map.set(key, list);
      }
    }

    return map;
  }, [tasks]);

  const tasksByMonth = useMemo(() => {
    const map = new Map<string, Task[]>();

    for (const task of tasks) {
      const start = task.startDate?.slice(0, 10) ?? task.finishDate?.slice(0, 10);
      const finish = task.finishDate?.slice(0, 10) ?? task.startDate?.slice(0, 10);
      if (!start || !finish) {
        continue;
      }

      let cursor = dayjs(start).startOf('month');
      const end = dayjs(finish).startOf('month');

      while (cursor.isBefore(end) || cursor.isSame(end, 'month')) {
        const key = cursor.format('YYYY-MM');
        const list = map.get(key) ?? [];
        if (!list.some((entry) => entry.id === task.id)) {
          list.push(task);
        }
        map.set(key, list);
        cursor = cursor.add(1, 'month');
      }
    }

    return map;
  }, [tasks]);

  const schedulableTaskCount = useMemo(
    () => tasks.filter((task) => task.startDate || task.finishDate).length,
    [tasks],
  );

  const cellRender: CalendarProps<Dayjs>['cellRender'] = (current, info) => {
    if (viewMode === 'month' && info.type === 'date') {
      const key = current.format('YYYY-MM-DD');
      const dayTasks = tasksByDate.get(key) ?? [];
      if (dayTasks.length === 0) {
        return null;
      }

      return (
        <ul className="mt-1 space-y-1">
          {dayTasks.slice(0, 2).map((task) => (
            <li
              key={`${key}-${task.id}`}
              className="truncate rounded px-1.5 py-0.5 text-[10px] font-medium text-white"
              style={{ backgroundColor: taskAccentColor(task) }}
              title={`${task.taskIdCode} - ${formatLocalizedName(task)}`}
            >
              {task.taskIdCode}
            </li>
          ))}
          {dayTasks.length > 2 && (
            <li className="text-[10px] font-medium text-slate-500">
              +{dayTasks.length - 2} more
            </li>
          )}
        </ul>
      );
    }

    if (viewMode === 'year' && info.type === 'month') {
      const key = current.format('YYYY-MM');
      const monthTasks = tasksByMonth.get(key) ?? [];
      if (monthTasks.length === 0) {
        return null;
      }

      const criticalCount = monthTasks.filter((task) => task.isCritical).length;

      return (
        <div className="mt-2 space-y-1 px-1">
          <Badge
            count={monthTasks.length}
            style={{ backgroundColor: tokens.colorPrimary }}
            overflowCount={99}
          />
          <ul className="space-y-0.5">
            {monthTasks.slice(0, 3).map((task) => (
              <li
                key={`${key}-${task.id}`}
                className="truncate text-[11px] text-slate-600"
                title={formatLocalizedName(task)}
              >
                <span
                  className="mr-1 inline-block h-2 w-2 rounded-full"
                  style={{ backgroundColor: taskAccentColor(task) }}
                />
                {task.taskIdCode}
              </li>
            ))}
          </ul>
          {criticalCount > 0 && (
            <p className="text-[10px] font-medium text-red-600">
              {criticalCount} critical
            </p>
          )}
        </div>
      );
    }

    return info.originNode;
  };

  return (
    <FormLayout
      title="Schedule calendar"
      description="Tasks appear across their full planned duration. Switch between month and year views."
      extra={
        <Segmented<CalendarViewMode>
          value={viewMode}
          onChange={setViewMode}
          options={[
            { label: 'Month', value: 'month' },
            { label: 'Year', value: 'year' },
          ]}
        />
      }
    >
      <div className="mb-4 flex flex-wrap gap-4 text-xs text-slate-600">
        <span>{schedulableTaskCount} tasks with dates</span>
        <span className="flex items-center gap-2">
          <span
            className="inline-block h-2.5 w-2.5 rounded-full"
            style={{ backgroundColor: tokens.colorPrimary }}
          />
          Active
        </span>
        <span className="flex items-center gap-2">
          <span className="inline-block h-2.5 w-2.5 rounded-full bg-red-600" />
          Critical
        </span>
        <span className="flex items-center gap-2">
          <span className="inline-block h-2.5 w-2.5 rounded-full bg-green-600" />
          Completed
        </span>
      </div>

      <Calendar
        fullscreen
        mode={viewMode}
        value={panelDate}
        onPanelChange={(date: Dayjs, mode: CalendarViewMode) => {
          setPanelDate(date);
          setViewMode(mode);
        }}
        cellRender={cellRender}
      />
    </FormLayout>
  );
}
