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
