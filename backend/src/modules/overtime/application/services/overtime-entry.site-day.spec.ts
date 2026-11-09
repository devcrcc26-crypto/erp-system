import { beforeEach, describe, expect, it } from '@jest/globals';
import { BadRequestException } from '@nestjs/common';
import type { PrismaService } from '../../../../shared/prisma/prisma.service';
import type { WorkScheduleService } from '../../../work-schedule/application/services/work-schedule.service';
import { OvertimeEntryService } from './overtime-entry.service';

/**
 * Site-assignment days use the same outside-schedule OT rule as office days
 * unless `siteDayScheduledHoursClaimable` is explicitly turned on.
 * September 2026: Tue 1st … Mon 7, Tue 8, … Fri 11, Sat 12, … Sat 19, Sun 20, Mon 21.
 */
const COMPANY_ID = 'company-1';
const EMPLOYEE_ID = 'employee-1';

type Assignment = {
  id: string;
  siteName: string;
  startDate: Date;
  endDate: Date;
  status: 'APPROVED' | 'SUBMITTED' | 'CANCELLED';
  deletedAt: Date | null;
};

const d = (ymd: string): Date => new Date(`${ymd}T00:00:00.000Z`);

const FULL_DAY = {
  isWorkingDay: true,
  isHalfDay: false,
  morningStart: '08:30',
  morningEnd: '12:30',
  afternoonStart: '13:30',
  afternoonEnd: '17:30',
};
const HALF_DAY = {
  isWorkingDay: true,
  isHalfDay: true,
  morningStart: '08:30',
  morningEnd: '12:30',
  afternoonStart: null,
  afternoonEnd: null,
};
const OFF_DAY = {
  isWorkingDay: false,
  isHalfDay: false,
  morningStart: null,
  morningEnd: null,
  afternoonStart: null,
  afternoonEnd: null,
};
/** CRCC standard: Mon–Fri 08:30–17:30 (lunch 12:30–13:30), Sat 08:30–12:30. */
const SCHEDULE = {
  days: [
    { dayOfWeek: 0, ...OFF_DAY },
    ...[1, 2, 3, 4, 5].map((dayOfWeek) => ({ dayOfWeek, ...FULL_DAY })),
    { dayOfWeek: 6, ...HALF_DAY },
  ],
};

function buildService(options: {
  assignments: Assignment[];
  holidays?: string[];
  policyRows?: Array<{ key: string; value: unknown; effectiveFrom: Date }>;
  leave?: Record<string, 'FULL' | 'MORNING' | 'AFTERNOON'>;
}): OvertimeEntryService {
  const prisma = {
    user: {
      findFirst: async () => ({ id: EMPLOYEE_ID, nationality: null }),
      findUnique: async () => null,
    },
    employmentPeriod: { findMany: async () => [] },
    inactivePeriod: { findMany: async () => [] },
    policySetting: {
      findMany: async () =>
        (options.policyRows ?? []).map((row) => ({
          ...row,
          createdAt: new Date('2026-01-01T00:00:00.000Z'),
        })),
    },
    leaveRequestPeriod: {
      findMany: async (args: { where: { startDate: { lte: Date } } }) => {
        const key = args.where.startDate.lte.toISOString().slice(0, 10);
        const portion = options.leave?.[key];
        return portion ? [{ dayPortion: portion }] : [];
      },
    },
    siteAssignment: {
      // Evaluates the same filter Prisma would.
      findFirst: async (args: {
        where: {
          employeeId: string;
          status: string;
          deletedAt: null;
          startDate: { lte: Date };
          endDate: { gte: Date };
        };
      }) => {
        const w = args.where;
        const row = options.assignments.find(
          (a) =>
            w.employeeId === EMPLOYEE_ID &&
            a.status === w.status &&
            a.deletedAt === w.deletedAt &&
            a.startDate.getTime() <= w.startDate.lte.getTime() &&
            a.endDate.getTime() >= w.endDate.gte.getTime(),
        );
        return row ? { id: row.id, siteName: row.siteName } : null;
      },
    },
    attendanceRecord: { findFirst: async () => null },
    attendanceDailyLog: { findFirst: async () => null },
  };
  const workSchedule = {
    isHolidayForEmployee: async (_c: string, _n: unknown, date: Date) => {
      const isHoliday = (options.holidays ?? []).includes(
        date.toISOString().slice(0, 10),
      );
      return { isHoliday, holidayName: isHoliday ? 'Holiday' : null };
    },
    getActiveSchedule: async () => SCHEDULE,
  };
  return new OvertimeEntryService(
    prisma as unknown as PrismaService,
    workSchedule as unknown as WorkScheduleService,
    {} as never,
  );
}

const SITE_A: Assignment = {
  id: 'sa-a',
  siteName: 'Dam site',
  startDate: d('2026-09-08'), // Tue
  endDate: d('2026-09-11'), // Fri
  status: 'APPROVED',
  deletedAt: null,
};
const SITE_WEEKEND: Assignment = {
  ...SITE_A,
  id: 'sa-w',
  startDate: d('2026-09-19'), // Sat
  endDate: d('2026-09-21'), // Mon (public holiday below)
};

describe('OvertimeEntryService – site assignment days', () => {
  let service: OvertimeEntryService;

  beforeEach(() => {
    service = buildService({
      assignments: [SITE_A, SITE_WEEKEND],
      holidays: ['2026-09-21'],
    });
  });

  const classify = (
    date: string,
    start: string,
    end: string,
    extra?: { isOvernight?: boolean; enforceSelectableWindows?: boolean },
  ) => service.classifyEntry(EMPLOYEE_ID, COMPANY_ID, d(date), start, end, extra);

  it('office day 09:00–12:00 → rejected (start falls in scheduled duty)', async () => {
    await expect(classify('2026-09-14', '09:00', '12:00')).rejects.toBeInstanceOf(
      BadRequestException,
    );
    const priced = await classify('2026-09-14', '09:00', '12:00', {
      enforceSelectableWindows: false,
    });
    expect(priced.totalHours).toBe(0);
    expect(priced.siteAssignmentId).toBeNull();
  });

  it('office day evening 18:00–20:00 → normal OT, no site label', async () => {
    const result = await classify('2026-09-14', '18:00', '20:00');
    expect(result.regularHours).toBe(2);
    expect(result.siteAssignmentId).toBeNull();
    expect(result.siteWithinScheduleHours).toBe(0);
  });

  it('site day duty hours 09:00–12:00 → rejected (same as office; default policy off)', async () => {
    await expect(classify('2026-09-09', '09:00', '12:00')).rejects.toBeInstanceOf(
      BadRequestException,
    );
    const priced = await classify('2026-09-09', '09:00', '12:00', {
      enforceSelectableWindows: false,
    });
    expect(priced.totalHours).toBe(0);
    expect(priced.siteAssignmentId).toBe('sa-a');
    expect(priced.siteName).toBe('Dam site');
    expect(priced.siteWithinScheduleHours).toBe(0);
  });

  it('site day evening 18:00–20:00 → normal OT, labelled with site', async () => {
    const result = await classify('2026-09-09', '18:00', '20:00');
    expect(result).toMatchObject({
      regularHours: 2,
      siteAssignmentId: 'sa-a',
      siteName: 'Dam site',
      siteWithinScheduleHours: 0,
    });
  });

  it('site day 07:00–08:30 → before schedule is claimable; crossing into duty is rejected', async () => {
    const before = await classify('2026-09-09', '07:00', '08:30');
    expect(before.regularHours).toBe(1.5);
    expect(before.siteWithinScheduleHours).toBe(0);
    await expect(classify('2026-09-09', '07:00', '09:30')).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('site day 23:00–02:00 → night OT', async () => {
    const result = await classify('2026-09-09', '23:00', '02:00', {
      isOvernight: true,
    });
    expect(result).toMatchObject({
      regularHours: 0,
      nightHours: 3,
      siteWithinScheduleHours: 0,
      siteAssignmentId: 'sa-a',
    });
  });

  it('site day lunch 12:30–13:30 → rejected when lunchCountsAsOvertime is off', async () => {
    await expect(classify('2026-09-09', '12:30', '13:30')).rejects.toBeInstanceOf(
      BadRequestException,
    );
    const windows = await service.getSelectableWindows(
      { employeeId: EMPLOYEE_ID, date: '2026-09-09' } as never,
      COMPANY_ID,
      EMPLOYEE_ID,
    );
    expect(windows.windows).toEqual([
      { start: '00:00', end: '08:30' },
      { start: '17:30', end: '24:00' },
    ]);
  });

  it('site Saturday morning duty → rejected; after morning → weekend OT', async () => {
    await expect(classify('2026-09-19', '08:30', '12:30')).rejects.toBeInstanceOf(
      BadRequestException,
    );
    const afternoon = await classify('2026-09-19', '12:30', '14:00');
    expect(afternoon).toMatchObject({
      regularHours: 0,
      weekendHours: 1.5,
      siteWithinScheduleHours: 0,
      siteAssignmentId: 'sa-w',
    });
  });

  it('office Saturday 08:30–12:30 → start in duty window is rejected', async () => {
    await expect(classify('2026-09-12', '08:30', '12:30')).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('site Sunday → weekend category, labelled', async () => {
    const result = await classify('2026-09-20', '09:00', '12:00');
    expect(result).toMatchObject({
      weekendHours: 3,
      regularHours: 0,
      siteAssignmentId: 'sa-w',
      siteWithinScheduleHours: 0,
    });
  });

  it('site public holiday → holiday category, labelled', async () => {
    const result = await classify('2026-09-21', '09:00', '12:00');
    expect(result).toMatchObject({
      holidayHours: 3,
      regularHours: 0,
      siteAssignmentId: 'sa-w',
      siteWithinScheduleHours: 0,
    });
  });

  it('assignment first and last day are inclusive; the days either side are not', async () => {
    expect((await classify('2026-09-08', '18:00', '19:00')).regularHours).toBe(1);
    expect((await classify('2026-09-11', '18:00', '19:30')).regularHours).toBe(1.5);
    await expect(classify('2026-09-07', '09:00', '10:00')).rejects.toBeInstanceOf(
      BadRequestException,
    );
    await expect(classify('2026-09-12', '09:00', '10:00')).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('only APPROVED assignments count (submitted / cancelled do not)', async () => {
    service = buildService({
      assignments: [
        { ...SITE_A, status: 'SUBMITTED' },
        { ...SITE_A, id: 'sa-c', status: 'CANCELLED' },
      ],
    });
    const result = await classify('2026-09-09', '18:00', '19:00');
    expect(result.siteAssignmentId).toBeNull();
  });

  it('leave on a site day stays excluded', async () => {
    service = buildService({
      assignments: [SITE_A],
      leave: { '2026-09-09': 'MORNING' },
    });
    await expect(classify('2026-09-09', '09:00', '12:00')).rejects.toBeInstanceOf(
      BadRequestException,
    );
    // Afternoon duty still inside schedule → rejected under default policy.
    await expect(classify('2026-09-09', '14:00', '15:00')).rejects.toBeInstanceOf(
      BadRequestException,
    );
    const evening = await classify('2026-09-09', '18:00', '19:00');
    expect(evening.regularHours).toBe(1);
    expect(evening.siteWithinScheduleHours).toBe(0);
  });

  it('site day scheduled hours stay blocked when siteDayScheduledHoursClaimable is off', async () => {
    service = buildService({
      assignments: [SITE_A],
      policyRows: [
        {
          key: 'siteDayScheduledHoursClaimable',
          value: false,
          effectiveFrom: d('2026-09-01'),
        },
      ],
    });
    await expect(classify('2026-09-09', '09:00', '12:00')).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('site day scheduled hours become claimable when siteDayScheduledHoursClaimable is on', async () => {
    service = buildService({
      assignments: [SITE_A],
      policyRows: [
        {
          key: 'siteDayScheduledHoursClaimable',
          value: true,
          effectiveFrom: d('2026-09-01'),
        },
      ],
    });
    const morning = await classify('2026-09-09', '09:00', '12:00');
    expect(morning).toMatchObject({
      regularHours: 3,
      siteAssignmentId: 'sa-a',
      siteWithinScheduleHours: 3,
    });
  });

  it('site and office weekday pickers both exclude scheduled duty (default policy)', async () => {
    const site = await service.getSelectableWindows(
      { employeeId: EMPLOYEE_ID, date: '2026-09-09' } as never,
      COMPANY_ID,
      EMPLOYEE_ID,
    );
    expect(site.windows).toEqual([
      { start: '00:00', end: '08:30' },
      { start: '17:30', end: '24:00' },
    ]);
    expect(site.siteAssignmentDay).toBe(true);

    const office = await service.getSelectableWindows(
      { employeeId: EMPLOYEE_ID, date: '2026-09-14' } as never,
      COMPANY_ID,
      EMPLOYEE_ID,
    );
    expect(office.windows).toEqual([
      { start: '00:00', end: '08:30' },
      { start: '17:30', end: '24:00' },
    ]);
  });
});
