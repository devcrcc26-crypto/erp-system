import type { WidgetSpan } from './WidgetCard';

/**
 * Desktop spans for `count` small widgets so every 12-column row is full:
 * threes at 4, a leftover pair at 6, a single leftover at 12. Four widgets
 * become two rows of 6 rather than 4-4-4-12.
 */
export function rowSpans(count: number): WidgetSpan[] {
  if (count === 4) {
    return [6, 6, 6, 6];
  }
  const remainder = count % 3;
  const spans: WidgetSpan[] = Array.from({ length: count - remainder }, () => 4);
  if (remainder === 2) {
    spans.push(6, 6);
  } else if (remainder === 1) {
    spans.push(12);
  }
  return spans;
}
