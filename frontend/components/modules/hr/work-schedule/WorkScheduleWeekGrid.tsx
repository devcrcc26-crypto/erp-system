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

/** Monday first, Sunday last (dayOfWeek stays 0 = Sunday in data). */
const DISPLAY_ORDER = [1, 2, 3, 4, 5, 6, 0];

/**
 * Monday–Sunday grid for a work schedule week: one tile per day with its type
 * and hours, matching the schedule form.
 */
export default function WorkScheduleWeekGrid({
  days,
}: {
  days: WorkScheduleDay[];
}): React.ReactNode {
  const { t } = useEpcTranslation();
  const byDay = new Map(days.map((day) => [day.dayOfWeek, day]));

  return (
    <ul className="m-0 grid list-none gap-2.5 p-0 sm:grid-cols-2 xl:grid-cols-4">
      {DISPLAY_ORDER.map((dayOfWeek) => {
        const day = byDay.get(dayOfWeek);
        const off = !day || !day.isWorkingDay;
        const half = Boolean(day?.isWorkingDay && day.isHalfDay);
        const badge = off
          ? { label: t('hr.workSchedule.offDay'), className: 'bg-slate-100 text-slate-600' }
          : half
            ? { label: t('hr.workSchedule.halfDay'), className: 'bg-amber-50 text-amber-800' }
            : { label: t('hr.workSchedule.workingDay'), className: 'bg-emerald-50 text-emerald-800' };
        return (
          <li
            key={dayOfWeek}
            className={`rounded-xl px-4 py-3 ${off ? 'bg-slate-50' : 'bg-white ring-1 ring-slate-100'}`}
          >
            <div className="flex items-center justify-between gap-2">
              <p className="m-0 text-sm font-semibold text-slate-900">
                {t(DAY_KEYS[dayOfWeek] ?? DAY_KEYS[0])}
              </p>
              <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${badge.className}`}>
                {badge.label}
              </span>
            </div>
            <p className="m-0 mt-1.5 text-[13px] text-slate-600 tabular-nums">
              {day && !off ? formatDayHours(day, t) : '-'}
            </p>
          </li>
        );
      })}
    </ul>
  );
}
