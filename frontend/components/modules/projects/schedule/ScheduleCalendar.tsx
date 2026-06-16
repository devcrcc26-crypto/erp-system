'use client';

import { useMemo } from 'react';
import { Badge, Calendar, type CalendarProps } from 'antd';
import type { Dayjs } from 'dayjs';
import FormLayout from '@/components/ui/FormLayout/FormLayout';
import type { Task } from '@/lib/api/project-management.types';

export default function ScheduleCalendar({
  tasks,
}: {
  tasks: Task[];
}): React.ReactNode {
  const tasksByDate = useMemo(() => {
    const map = new Map<string, Task[]>();
    for (const task of tasks) {
      const start = task.startDate?.slice(0, 10);
      const finish = task.finishDate?.slice(0, 10);
      if (start) {
        const list = map.get(start) ?? [];
        list.push(task);
        map.set(start, list);
      }
      if (finish && finish !== start) {
        const list = map.get(finish) ?? [];
        list.push(task);
        map.set(finish, list);
      }
    }
    return map;
  }, [tasks]);

  const cellRender: CalendarProps<Dayjs>['cellRender'] = (current, info) => {
    if (info.type !== 'date') {
      return info.originNode;
    }
    const key = current.format('YYYY-MM-DD');
    const dayTasks = tasksByDate.get(key) ?? [];
    if (dayTasks.length === 0) {
      return null;
    }
    return (
      <ul className="mt-1 space-y-0.5">
        {dayTasks.slice(0, 3).map((task) => (
          <li key={`${key}-${task.id}`}>
            <Badge
              color={task.isCritical ? 'red' : 'orange'}
              text={
                <span className="text-[10px] text-slate-600">
                  {task.taskIdCode}
                </span>
              }
            />
          </li>
        ))}
        {dayTasks.length > 3 && (
          <li className="text-[10px] text-slate-400">
            +{dayTasks.length - 3} more
          </li>
        )}
      </ul>
    );
  };

  return (
    <FormLayout
      title="Schedule calendar"
      description="Tasks with start or finish dates appear on the calendar."
    >
      <Calendar fullscreen={false} cellRender={cellRender} />
    </FormLayout>
  );
}
