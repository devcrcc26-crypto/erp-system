/**
 * Time helpers for Ethiopia-local attendance calculations (HH:mm strings).
 */

/**
 * Hours between two HH:mm times. Handles overnight spans (e.g. 22:00 → 01:00).
 */
export function calculateHoursBetween(start: string, end: string): number {
  const [startHours, startMinutes] = start.split(':').map(Number);
  const [endHours, endMinutes] = end.split(':').map(Number);
  let startTotal = startHours * 60 + startMinutes;
  let endTotal = endHours * 60 + endMinutes;
  if (endTotal < startTotal) {
    endTotal += 24 * 60;
  }
  return Math.round(((endTotal - startTotal) / 60) * 100) / 100;
}

/**
 * True when timeA is strictly after timeB (both HH:mm).
 */
export function isAfterTime(timeA: string, timeB: string): boolean {
  const [aHours, aMinutes] = timeA.split(':').map(Number);
  const [bHours, bMinutes] = timeB.split(':').map(Number);
  return aHours * 60 + aMinutes > bHours * 60 + bMinutes;
}

/**
 * True when timeA is strictly before timeB (both HH:mm).
 */
export function isBeforeTime(timeA: string, timeB: string): boolean {
  return isAfterTime(timeB, timeA);
}

/**
 * Minutes from start to end (both HH:mm). May be negative if end is earlier.
 */
export function minutesBetween(start: string, end: string): number {
  const [startHours, startMinutes] = start.split(':').map(Number);
  const [endHours, endMinutes] = end.split(':').map(Number);
  return endHours * 60 + endMinutes - (startHours * 60 + startMinutes);
}

/**
 * Machine exports use China Standard Time (UTC+8). Ethiopia is UTC+3.
 * Convert by subtracting 5 hours.
 */
export function convertMachineTimeToLocal(machineTime: string): string {
  const [hours, minutes] = machineTime.split(':').map(Number);
  const totalMinutes = hours * 60 + minutes - 5 * 60;
  const adjusted =
    ((totalMinutes % (24 * 60)) + 24 * 60) % (24 * 60);
  const localHours = Math.floor(adjusted / 60);
  const localMinutes = adjusted % 60;
  return `${String(localHours).padStart(2, '0')}:${String(localMinutes).padStart(2, '0')}`;
}
