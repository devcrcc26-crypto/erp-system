import { describe, expect, it } from 'vitest';
import { rowSpans } from './layout';

const rowsAreFull = (spans: number[]): boolean =>
  spans.reduce((sum, span) => sum + span, 0) % 12 === 0;

describe('rowSpans', () => {
  it.each([
    [1, [12]],
    [2, [6, 6]],
    [3, [4, 4, 4]],
    [4, [6, 6, 6, 6]],
    [5, [4, 4, 4, 6, 6]],
  ])('lays out %i small widgets as %j', (count, expected) => {
    const spans = rowSpans(count);
    expect(spans).toEqual(expected);
    expect(rowsAreFull(spans)).toBe(true);
  });
});
