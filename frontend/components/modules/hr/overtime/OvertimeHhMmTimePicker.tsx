'use client';

import { Select, Space } from 'antd';
import {
  END_OF_DAY,
  allowedHoursFromTimes,
  allowedMinutesForHour,
  parseHhMmToMinutes,
} from '@/components/modules/hr/overtime/overtime-time-periods';

function pad2(value: number): string {
  return String(value).padStart(2, '0');
}

function splitHhMm(value: string | undefined): {
  hour: number | undefined;
  minute: number | undefined;
} {
  if (!value) {
    return { hour: undefined, minute: undefined };
  }
  if (value === END_OF_DAY) {
    return { hour: 24, minute: 0 };
  }
  const total = parseHhMmToMinutes(value);
  return {
    hour: Math.floor(total / 60),
    minute: total % 60,
  };
}

function joinHhMm(hour: number, minute: number): string {
  if (hour === 24) {
    return END_OF_DAY;
  }
  return `${pad2(hour)}:${pad2(minute)}`;
}

/**
 * Custom OT time picker (hour + minute). End mode includes hour 24 with
 * minute fixed at 00 → value `24:00` (exact midnight / end of calendar day).
 */
export default function OvertimeHhMmTimePicker({
  value,
  onChange,
  disabled,
  placeholder,
  allowEndOfDay = false,
  allowedTimes = [],
}: {
  value?: string;
  onChange?: (value: string | undefined) => void;
  disabled?: boolean;
  placeholder?: string;
  /** When true, hour list includes 24 (minutes locked to 00). */
  allowEndOfDay?: boolean;
  /** Selectable HH:mm values (and optionally 24:00) from OT windows. */
  allowedTimes?: string[];
}): React.ReactNode {
  const { hour, minute } = splitHhMm(value);
  const hours = allowedHoursFromTimes(allowedTimes, {
    includeEndOfDay: allowEndOfDay,
  });
  const minutes =
    hour === undefined
      ? []
      : hour === 24
        ? [0]
        : allowedMinutesForHour(allowedTimes, hour);

  const hourOptions = hours.map((h) => ({
    value: h,
    label: pad2(h),
  }));
  const minuteOptions = minutes.map((m) => ({
    value: m,
    label: pad2(m),
  }));

  function commit(nextHour: number, nextMinute: number): void {
    if (nextHour === 24) {
      onChange?.(END_OF_DAY);
      return;
    }
    onChange?.(joinHhMm(nextHour, nextMinute));
  }

  return (
    <Space.Compact className="w-full">
      <Select
        className="w-[50%]"
        disabled={disabled}
        placeholder={placeholder ?? 'HH'}
        options={hourOptions}
        value={hour}
        showSearch
        optionFilterProp="label"
        listHeight={280}
        onChange={(nextHour: number) => {
          if (nextHour === 24) {
            commit(24, 0);
            return;
          }
          const allowedMins = allowedMinutesForHour(allowedTimes, nextHour);
          const nextMinute =
            minute !== undefined && allowedMins.includes(minute)
              ? minute
              : (allowedMins[0] ?? 0);
          commit(nextHour, nextMinute);
        }}
      />
      <Select
        className="w-[50%]"
        disabled={disabled || hour === undefined || hour === 24}
        placeholder="mm"
        options={minuteOptions}
        value={hour === 24 ? 0 : minute}
        showSearch
        optionFilterProp="label"
        listHeight={280}
        onChange={(nextMinute: number) => {
          if (hour === undefined || hour === 24) {
            return;
          }
          commit(hour, nextMinute);
        }}
      />
    </Space.Compact>
  );
}
