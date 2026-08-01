/**
 * Priority: Holiday > Weekend > Night > Regular.
 * Each 15-minute block belongs to exactly one category.
 *
 * Weekend: Sunday (all day) or Saturday from 12:00 onward.
 * Night: 22:00–06:00 (when not holiday/weekend).
 */
export function calculateOvertimeHours(
  date: Date,
  startTime: string,
  endTime: string,
  isHoliday: boolean,
): {
  regularHours: number;
  nightHours: number;
  weekendHours: number;
  holidayHours: number;
} {
  const dayOfWeek = date.getUTCDay(); // 0=Sunday, 6=Saturday
  const isSunday = dayOfWeek === 0;
  const isSaturday = dayOfWeek === 6;

  const [startH, startM] = startTime.split(':').map(Number);
  const [endH, endM] = endTime.split(':').map(Number);

  const startMinutes = startH * 60 + startM;
  let endMinutes = endH * 60 + endM;

  if (endMinutes <= startMinutes) {
    endMinutes += 24 * 60;
  }

  let regularHours = 0;
  let nightHours = 0;
  let weekendHours = 0;
  let holidayHours = 0;

  const BLOCK = 15;
  for (let m = startMinutes; m < endMinutes; m += BLOCK) {
    const blockHours = BLOCK / 60;
    const minutesInDay = ((m % (24 * 60)) + 24 * 60) % (24 * 60);
    const hour = minutesInDay / 60;

    const isWeekendBlock =
      isSunday || (isSaturday && hour >= 12);

    if (isHoliday) {
      holidayHours += blockHours;
    } else if (isWeekendBlock) {
      weekendHours += blockHours;
    } else if (hour >= 22 || hour < 6) {
      nightHours += blockHours;
    } else {
      regularHours += blockHours;
    }
  }

  return {
    regularHours: Math.round(regularHours * 100) / 100,
    nightHours: Math.round(nightHours * 100) / 100,
    weekendHours: Math.round(weekendHours * 100) / 100,
    holidayHours: Math.round(holidayHours * 100) / 100,
  };
}
