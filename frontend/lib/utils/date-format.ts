import dayjs from 'dayjs';

/** Canonical display format for calendar dates across the ERP UI. */
export const DISPLAY_DATE_FORMAT = 'DD/MM/YYYY';

/** Canonical display format for date-times. */
export const DISPLAY_DATETIME_FORMAT = 'DD/MM/YYYY HH:mm';

/**
 * Renders a date (or date-time) as DD/MM/YYYY for UI display.
 * Date-only ISO strings (YYYY-MM-DD) are parsed without timezone shift.
 */
export function formatDisplayDate(
  value: string | Date | null | undefined,
): string {
  if (value === null || value === undefined || value === '') {
    return '-';
  }

  if (typeof value === 'string') {
    const dateOnly = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
    if (dateOnly) {
      return `${dateOnly[3]}/${dateOnly[2]}/${dateOnly[1]}`;
    }
    const withTime = /^(\d{4})-(\d{2})-(\d{2})/.exec(value.trim());
    if (withTime && value.includes('T')) {
      return dayjs(value).format(DISPLAY_DATE_FORMAT);
    }
  }

  const parsed = dayjs(value);
  if (!parsed.isValid()) {
    return '-';
  }
  return parsed.format(DISPLAY_DATE_FORMAT);
}

/**
 * Renders a date with the viewer's preferred pattern (e.g. MM/DD/YYYY,
 * YYYY-MM-DD), falling back to DD/MM/YYYY. Empty values render as '-'.
 */
export function formatDateWithPattern(
  value: string | Date | null | undefined,
  pattern?: string | null,
): string {
  if (value === null || value === undefined || value === '') {
    return '-';
  }
  const parsed = dayjs(value);
  if (!parsed.isValid()) {
    return '-';
  }
  return parsed.format(pattern?.trim() || DISPLAY_DATE_FORMAT);
}

/**
 * Renders a date-time as DD/MM/YYYY HH:mm.
 */
export function formatDisplayDateTime(
  value: string | Date | null | undefined,
): string {
  if (value === null || value === undefined || value === '') {
    return '-';
  }
  const parsed = dayjs(value);
  if (!parsed.isValid()) {
    return '-';
  }
  return parsed.format(DISPLAY_DATETIME_FORMAT);
}

function relativeUnit(
  count: number,
  singular: string,
  plural: string,
): string {
  if (count <= 1) {
    return singular;
  }
  return `${count} ${plural}`;
}

/**
 * Human-relative time (e.g. "3 hours ago") without dayjs relativeTime.
 * Webpack can duplicate the dayjs instance, which drops plugin methods like fromNow.
 */
export function formatRelativeTime(
  value: string | Date | number | null | undefined,
): string {
  if (value === null || value === undefined || value === '') {
    return '-';
  }

  const parsed = dayjs(value);
  if (!parsed.isValid()) {
    return '-';
  }

  const seconds = dayjs().diff(parsed, 'second');
  const future = seconds < 0;
  const abs = Math.abs(seconds);

  let label: string;
  if (abs < 45) {
    label = 'a few seconds';
  } else if (abs < 90) {
    label = 'a minute';
  } else if (abs < 45 * 60) {
    label = relativeUnit(Math.round(abs / 60), 'a minute', 'minutes');
  } else if (abs < 90 * 60) {
    label = 'an hour';
  } else if (abs < 22 * 60 * 60) {
    label = relativeUnit(Math.round(abs / 3600), 'an hour', 'hours');
  } else if (abs < 36 * 60 * 60) {
    label = 'a day';
  } else if (abs < 26 * 24 * 60 * 60) {
    label = relativeUnit(Math.round(abs / 86400), 'a day', 'days');
  } else if (abs < 46 * 24 * 60 * 60) {
    label = 'a month';
  } else if (abs < 320 * 24 * 60 * 60) {
    label = relativeUnit(Math.round(abs / (30 * 86400)), 'a month', 'months');
  } else if (abs < 548 * 24 * 60 * 60) {
    label = 'a year';
  } else {
    label = relativeUnit(Math.round(abs / (365 * 86400)), 'a year', 'years');
  }

  return future ? `in ${label}` : `${label} ago`;
}
