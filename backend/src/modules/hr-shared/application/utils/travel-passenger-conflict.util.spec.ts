import { describe, expect, it } from '@jest/globals';
import {
  travelWindowEnd,
  travelWindowsOverlap,
} from './travel-passenger-conflict.util';

describe('travelWindowsOverlap', () => {
  const d = (iso: string): Date => new Date(iso);

  it('detects identical departure times as overlap', () => {
    const dep = d('2026-09-01T08:00:00.000Z');
    expect(travelWindowsOverlap(dep, null, dep, null)).toBe(true);
  });

  it('detects overlapping round trips', () => {
    expect(
      travelWindowsOverlap(
        d('2026-09-01T08:00:00.000Z'),
        d('2026-09-10T18:00:00.000Z'),
        d('2026-09-05T08:00:00.000Z'),
        d('2026-09-07T18:00:00.000Z'),
      ),
    ).toBe(true);
  });

  it('allows non-overlapping trips on the same calendar day', () => {
    expect(
      travelWindowsOverlap(
        d('2026-09-01T08:00:00.000Z'),
        null,
        d('2026-09-01T14:00:00.000Z'),
        null,
      ),
    ).toBe(false);
  });

  it('allows sequential trips without overlap', () => {
    expect(
      travelWindowsOverlap(
        d('2026-09-01T08:00:00.000Z'),
        d('2026-09-03T18:00:00.000Z'),
        d('2026-09-04T08:00:00.000Z'),
        d('2026-09-06T18:00:00.000Z'),
      ),
    ).toBe(false);
  });
});

describe('travelWindowEnd', () => {
  it('uses departure when return is null', () => {
    const dep = new Date('2026-09-01T08:00:00.000Z');
    expect(travelWindowEnd(dep, null)).toEqual(dep);
  });
});
