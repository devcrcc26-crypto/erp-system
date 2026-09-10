'use client';

import { useEpcTranslation } from '@/hooks/use-epc-translation';
import type { WorkScheduleDay } from '@/lib/api/work-schedule.types';

const DAY_KEYS = [
  'hr.workSchedule.day0',
  'hr.workSchedule.day1',
  'hr.workSchedule.day2',
  'hr.workSchedule.day3',
  'hr.workSchedule.day4',
  'hr.workSchedule.day5',
  'hr.workSchedule.day6',
] as const;

function formatDayHours(
  day: WorkScheduleDay,
  t: ReturnType<typeof useEpcTranslation>['t'],
): string {
  if (!day.isWorkingDay) {
    return t('hr.workSchedule.offDay');
  }
  if (day.isHalfDay) {
    return `${day.morningStart}–${day.morningEnd} (${day.totalHours}h)`;
  }
  return `${day.morningStart}–${day.morningEnd}, ${day.afternoonStart}–${day.afternoonEnd} (${day.totalHours}h)`;
}

/**
 * Sunday–Saturday grid for a work schedule week.
 */
export default function WorkScheduleWeekGrid({
  days,
}: {
  days: WorkScheduleDay[];
}): React.ReactNode {
  const { t } = useEpcTranslation();
  const ordered = [...days].sort((a, b) => a.dayOfWeek - b.dayOfWeek);

  return (
    <div className="grid gap-2 sm:grid-cols-2">
      {ordered.map((day) => (
        <div
          key={day.dayOfWeek}
          className="rounded-lg border border-[#e8ebef] px-3 py-2"
        >
          <p className="m-0 text-sm font-medium">
            {t(DAY_KEYS[day.dayOfWeek] ?? DAY_KEYS[0])}
          </p>
          <p className="erp-users-cell-sub m-0">{formatDayHours(day, t)}</p>
        </div>
      ))}
    </div>
  );
}
