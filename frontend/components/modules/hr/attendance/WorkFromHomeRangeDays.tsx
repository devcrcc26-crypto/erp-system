'use client';

import { Tag } from 'antd';
import { useEpcTranslation } from '@/hooks/use-epc-translation';
import type {
  WorkFromHomeRangeDay,
  WorkFromHomeSkipReason,
} from '@/lib/api/work-from-home.api';
import { formatProjectDate } from '@/lib/utils/project-display';

const KEY = 'pages.hr.workFromHome.range';

function weekday(dateKey: string): string {
  return new Date(`${dateKey}T00:00:00Z`).toLocaleDateString(undefined, {
    weekday: 'short',
    timeZone: 'UTC',
  });
}

/**
 * Day-by-day list of a work-from-home range: days that become WFH, and
 * greyed skipped days with the reason (Sunday, holiday, leave, …).
 */
export default function WorkFromHomeRangeDays({
  days,
}: {
  days: ReadonlyArray<WorkFromHomeRangeDay>;
}): React.ReactNode {
  const { t } = useEpcTranslation();

  const reasonLabel = (day: WorkFromHomeRangeDay): string => {
    const reason = day.reason as WorkFromHomeSkipReason;
    const base = t(`${KEY}.reasons.${reason}`);
    if (reason === 'HOLIDAY' && day.holidayName) {
      return `${base}: ${day.holidayName}`;
    }
    return day.reference ? `${base} (${day.reference})` : base;
  };

  return (
    <ul className="m-0 flex list-none flex-col gap-1 p-0" aria-label={t(`${KEY}.dayListLabel`)}>
      {days.map((day) => (
        <li
          key={day.date}
          className={`flex flex-wrap items-center justify-between gap-2 rounded-lg px-3 py-1.5 text-[13px] ${
            day.included ? 'bg-emerald-50 text-slate-900' : 'bg-slate-50 text-slate-600'
          }`}
        >
          <span className={day.included ? 'font-medium' : 'line-through decoration-slate-400'}>
            <span className="mr-2 inline-block w-9 text-slate-600">{weekday(day.date)}</span>
            {formatProjectDate(day.date)}
          </span>
          {day.included ? (
            <Tag color="green" className="m-0 rounded-full">
              {t(`${KEY}.included`)}
            </Tag>
          ) : (
            <span className="text-xs text-slate-600">
              {t(`${KEY}.skipped`)} — {reasonLabel(day)}
            </span>
          )}
        </li>
      ))}
    </ul>
  );
}
