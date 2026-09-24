/**
 * Group items by a string key (order of first appearance preserved).
 */
export function groupBy<T>(
  items: readonly T[],
  keyFn: (item: T) => string,
): Record<string, T[]> {
  const result: Record<string, T[]> = {};
  for (const item of items) {
    const key = keyFn(item);
    const bucket = result[key];
    if (bucket) {
      bucket.push(item);
    } else {
      result[key] = [item];
    }
  }
  return result;
}

function parseDateOnly(value: string | Date): Date {
  if (value instanceof Date) {
    return new Date(value.getFullYear(), value.getMonth(), value.getDate());
  }
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value.trim());
  if (match) {
    return new Date(
      Number(match[1]),
      Number(match[2]) - 1,
      Number(match[3]),
    );
  }
  const parsed = new Date(value);
  return new Date(parsed.getFullYear(), parsed.getMonth(), parsed.getDate());
}

function formatRange(start: Date, end: Date): string {
  if (start.getTime() === end.getTime()) {
    return start.toLocaleDateString('en-GB', {
      day: 'numeric',
      month: 'short',
    });
  }
  return `${start.toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
  })} – ${end.toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
  })}`;
}

/**
 * Formats dates as a compact list, collapsing consecutive days into ranges.
 * Example: "Aug 1 – 7, Aug 10 – 14, Aug 31"
 */
export function formatDateList(dates: Array<string | Date>): string {
  if (dates.length === 0) {
    return '';
  }

  const sorted = [...dates]
    .map(parseDateOnly)
    .sort((a, b) => a.getTime() - b.getTime());

  const ranges: string[] = [];
  let rangeStart = sorted[0]!;
  let rangeEnd = sorted[0]!;

  for (let i = 1; i < sorted.length; i += 1) {
    const current = sorted[i]!;
    const diffDays =
      (current.getTime() - rangeEnd.getTime()) / (1000 * 60 * 60 * 24);
    if (diffDays === 1) {
      rangeEnd = current;
    } else {
      ranges.push(formatRange(rangeStart, rangeEnd));
      rangeStart = current;
      rangeEnd = current;
    }
  }
  ranges.push(formatRange(rangeStart, rangeEnd));

  return ranges.join(', ');
}
