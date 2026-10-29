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
    <ul className="erp-wfh-day-list" aria-label={t(`${KEY}.dayListLabel`)}>
      {days.map((day) => (
        <li
          key={day.date}
          className={`erp-wfh-day ${
            day.included ? 'erp-wfh-day--included' : 'erp-wfh-day--skipped'
          }`}
        >
          <span className="erp-wfh-day-date">
            <span className="erp-wfh-day-weekday">{weekday(day.date)}</span>
            {formatProjectDate(day.date)}
          </span>
          {day.included ? (
            <Tag color="green" className="erp-wfh-day-chip">
              {t(`${KEY}.included`)}
            </Tag>
          ) : (
            <span className="erp-wfh-day-skip-reason">
              {t(`${KEY}.skipped`)} - {reasonLabel(day)}
            </span>
          )}
        </li>
      ))}
    </ul>
  );
}
