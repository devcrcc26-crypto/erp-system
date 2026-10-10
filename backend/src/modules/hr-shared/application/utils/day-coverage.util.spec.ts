import { describe, expect, it } from '@jest/globals';
import {
  type CoverSources,
  dayCoverMessage,
  eachDay,
  resolveDayCovers,
} from './day-coverage.util';

function d(key: string): Date {
  return new Date(`${key}T00:00:00.000Z`);
}

function sources(partial: Partial<CoverSources> = {}): CoverSources {
  return {
    leaves: [],
    siteAssignments: [],
    workFromHomeApproved: new Set(),
    workFromHomeRequested: new Map(),
    fieldMovements: [],
    attendanceScanKeys: new Set(),
    ...partial,
  };
}

const ALL = [
  'LEAVE',
  'SITE_ASSIGNMENT',
  'WORK_FROM_HOME',
  'FIELD_MOVEMENT',
  'ATTENDANCE',
] as const;

describe('dayCoverMessage', () => {
  it('says approved / requested per module', () => {
    expect(dayCoverMessage({ date: '2026-08-03', module: 'LEAVE', state: 'APPROVED' })).toBe(
      'This day (2026-08-03) has approved leave.',
    );
    expect(
      dayCoverMessage({ date: '2026-08-03', module: 'LEAVE', state: 'REQUESTED', reference: 'LV-0012' }),
    ).toBe('Leave has been requested for this day (2026-08-03) (LV-0012).');
    expect(
      dayCoverMessage({ date: '2026-08-03', module: 'SITE_ASSIGNMENT', state: 'APPROVED' }),
    ).toBe('This day (2026-08-03) has an approved site assignment.');
    expect(
      dayCoverMessage({ date: '2026-08-03', module: 'SITE_ASSIGNMENT', state: 'REQUESTED' }),
    ).toBe('A site assignment has been requested for this day (2026-08-03).');
    expect(
      dayCoverMessage({ date: '2026-08-03', module: 'WORK_FROM_HOME', state: 'APPROVED' }),
    ).toBe('This day (2026-08-03) has approved work from home.');
    expect(
      dayCoverMessage({ date: '2026-08-03', module: 'WORK_FROM_HOME', state: 'REQUESTED' }),
    ).toBe('Work from home has been requested for this day (2026-08-03).');
    expect(
      dayCoverMessage({ date: '2026-08-03', module: 'FIELD_MOVEMENT', state: 'APPROVED' }),
    ).toBe('This day (2026-08-03) has an approved field movement.');
    expect(
      dayCoverMessage({ date: '2026-08-03', module: 'FIELD_MOVEMENT', state: 'REQUESTED' }),
    ).toBe('A field movement has been requested for this day (2026-08-03).');
    expect(dayCoverMessage({ date: '2026-08-03', module: 'ATTENDANCE', state: 'APPROVED' })).toBe(
      'This day (2026-08-03) already has attendance recorded.',
    );
  });
});

describe('resolveDayCovers', () => {
  const monday = d('2026-08-03');

  it('leave: approved and requested count; rejected / cancelled do not', () => {
    const at = (status: string) =>
      resolveDayCovers([{ date: monday }], ['LEAVE'], sources({
        leaves: [{ status, periods: [{ startDate: monday, endDate: monday }] }],
      }));
    expect(at('APPROVED')[0]?.state).toBe('APPROVED');
    expect(at('SUBMITTED')[0]?.state).toBe('REQUESTED');
    expect(at('IN_REVIEW')[0]?.state).toBe('REQUESTED');
    expect(at('RETURNED')[0]?.state).toBe('REQUESTED');
    expect(at('REJECTED')).toEqual([]);
    expect(at('CANCELLED')).toEqual([]);
  });

  it('site assignment covers every day of its range', () => {
    const covers = resolveDayCovers(eachDay(d('2026-08-03'), d('2026-08-05')), ['SITE_ASSIGNMENT'], sources({
      siteAssignments: [{ status: 'APPROVED', startDate: d('2026-08-04'), endDate: d('2026-08-10') }],
    }));
    expect(covers.map((c) => c.date)).toEqual(['2026-08-04', '2026-08-05']);
  });

  it('work from home approved vs requested', () => {
    const covers = resolveDayCovers(
      [{ date: d('2026-08-03') }, { date: d('2026-08-04') }],
      ['WORK_FROM_HOME'],
      sources({
        workFromHomeApproved: new Set(['2026-08-03']),
        workFromHomeRequested: new Map([['2026-08-04', 'APR-9']]),
      }),
    );
    expect(covers).toEqual([
      { date: '2026-08-03', module: 'WORK_FROM_HOME', state: 'APPROVED' },
      { date: '2026-08-04', module: 'WORK_FROM_HOME', state: 'REQUESTED', reference: 'APR-9' },
    ]);
  });

  it('field movement and attendance scans', () => {
    const covers = resolveDayCovers(
      [{ date: d('2026-08-03') }, { date: d('2026-08-04') }],
      ['FIELD_MOVEMENT', 'ATTENDANCE'],
      sources({
        fieldMovements: [{ date: d('2026-08-03'), status: 'SUBMITTED', requestNumber: 'FM-0007' }],
        attendanceScanKeys: new Set(['2026-08-04']),
      }),
    );
    expect(covers.map((c) => [c.date, c.module, c.state])).toEqual([
      ['2026-08-03', 'FIELD_MOVEMENT', 'REQUESTED'],
      ['2026-08-04', 'ATTENDANCE', 'APPROVED'],
    ]);
  });

  it('half-day: attendance scans do not conflict', () => {
    expect(
      resolveDayCovers([{ date: monday, halfDay: true }], ['ATTENDANCE'], sources({
        attendanceScanKeys: new Set(['2026-08-03']),
      })),
    ).toEqual([]);
  });

  it('Sundays are skipped', () => {
    const sunday = d('2026-08-02');
    expect(
      resolveDayCovers([{ date: sunday }], ALL, sources({
        leaves: [{ status: 'APPROVED', periods: [{ startDate: sunday, endDate: sunday }] }],
      })),
    ).toEqual([]);
  });

  it('an approved cover wins over a requested one on the same day', () => {
    const covers = resolveDayCovers([{ date: monday }], ALL, sources({
      leaves: [{ status: 'SUBMITTED', periods: [{ startDate: monday, endDate: monday }] }],
      workFromHomeApproved: new Set(['2026-08-03']),
    }));
    expect(covers).toEqual([{ date: '2026-08-03', module: 'WORK_FROM_HOME', state: 'APPROVED' }]);
  });

  it('nothing covering → no covers', () => {
    expect(resolveDayCovers([{ date: monday }], ALL, sources())).toEqual([]);
  });
});
