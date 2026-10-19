import { describe, expect, it, jest } from '@jest/globals';
import { ApprovalRequestStatus, WorkFromHomeScope } from '@prisma/client';
import {
  formatWorkFromHomeRangeLabel,
  planWorkFromHomeRange,
  workFromHomeFormDates,
  WFH_MAX_RANGE_DAYS,
  type ScheduleDayType,
} from './work-from-home-range.util';
import { WorkFromHomeDayService } from './work-from-home-day.service';
import type { DayCover } from '../../../hr-shared/application/utils/day-coverage.util';

function d(key: string): Date {
  return new Date(`${key}T00:00:00.000Z`);
}

/** Mon–Fri working, Saturday half day, Sunday off; optional holidays. */
function schedule(
  start: string,
  end: string,
  holidays: Record<string, string> = {},
): ScheduleDayType[] {
  const rows: ScheduleDayType[] = [];
  for (let t = d(start).getTime(); t <= d(end).getTime(); t += 86_400_000) {
    const date = new Date(t);
    const key = date.toISOString().slice(0, 10);
    if (holidays[key]) {
      rows.push({ date, type: 'holiday', holidayName: holidays[key] });
    } else if (date.getUTCDay() === 0) {
      rows.push({ date, type: 'weekend' });
    } else {
      rows.push({ date, type: date.getUTCDay() === 6 ? 'half' : 'working' });
    }
  }
  return rows;
}

describe('planWorkFromHomeRange', () => {
  it('a range across a Sunday and a holiday skips them', () => {
    // Thu 2026-08-13 … Tue 2026-08-18; Sun 16th; holiday Mon 17th.
    const plan = planWorkFromHomeRange({
      start: d('2026-08-13'),
      end: d('2026-08-18'),
      schedule: schedule('2026-08-13', '2026-08-18', { '2026-08-17': 'Founders Day' }),
      covers: [],
    });
    expect(plan.dates).toEqual(['2026-08-13', '2026-08-14', '2026-08-15', '2026-08-18']);
    expect(plan.workingDays).toBe(4);
    expect(plan.skipped).toEqual([
      { date: '2026-08-16', reason: 'NON_WORKING_DAY' },
      { date: '2026-08-17', reason: 'HOLIDAY' },
    ]);
    expect(plan.days.find((day) => day.date === '2026-08-17')?.holidayName).toBe('Founders Day');
  });

  it('days overlapping approved leave, site assignment or existing WFH are skipped', () => {
    const covers: DayCover[] = [
      { date: '2026-08-11', module: 'LEAVE', state: 'APPROVED', reference: 'LR-0001' },
      { date: '2026-08-12', module: 'SITE_ASSIGNMENT', state: 'APPROVED', reference: 'SA-0002' },
      { date: '2026-08-13', module: 'WORK_FROM_HOME', state: 'APPROVED' },
      { date: '2026-08-14', module: 'WORK_FROM_HOME', state: 'REQUESTED', reference: 'WFH-9' },
    ];
    const plan = planWorkFromHomeRange({
      start: d('2026-08-10'),
      end: d('2026-08-15'),
      schedule: schedule('2026-08-10', '2026-08-15'),
      covers,
    });
    expect(plan.dates).toEqual(['2026-08-10', '2026-08-15']);
    expect(plan.skipped).toEqual([
      { date: '2026-08-11', reason: 'LEAVE' },
      { date: '2026-08-12', reason: 'SITE_ASSIGNMENT' },
      { date: '2026-08-13', reason: 'ALREADY_WFH' },
      { date: '2026-08-14', reason: 'WFH_REQUESTED' },
    ]);
    expect(plan.days.find((day) => day.date === '2026-08-11')?.reference).toBe('LR-0001');
  });

  it('a schedule day off (e.g. Saturday off) is skipped as NON_WORKING_DAY', () => {
    const rows = schedule('2026-08-14', '2026-08-15').map((row) =>
      row.date.getUTCDay() === 6 ? { ...row, type: 'weekend' as const } : row,
    );
    const plan = planWorkFromHomeRange({
      start: d('2026-08-14'),
      end: d('2026-08-15'),
      schedule: rows,
      covers: [],
    });
    expect(plan.skipped).toEqual([{ date: '2026-08-15', reason: 'NON_WORKING_DAY' }]);
  });

  it(`more than ${WFH_MAX_RANGE_DAYS} days is rejected; 31 days is allowed`, () => {
    expect(() =>
      planWorkFromHomeRange({ start: d('2026-08-01'), end: d('2026-09-01'), schedule: [], covers: [] }),
    ).toThrow('at most 31 days');
    expect(() =>
      planWorkFromHomeRange({ start: d('2026-08-01'), end: d('2026-08-31'), schedule: [], covers: [] }),
    ).not.toThrow();
    expect(() =>
      planWorkFromHomeRange({ start: d('2026-08-05'), end: d('2026-08-04'), schedule: [], covers: [] }),
    ).toThrow('on or after');
  });

  it('labels and form dates', () => {
    expect(formatWorkFromHomeRangeLabel('2026-08-11', '2026-08-15', 4)).toBe('Aug 11 – Aug 15 (4 days)');
    expect(formatWorkFromHomeRangeLabel('2026-08-11', '2026-08-11', 1)).toBe('Aug 11 (1 day)');
    expect(workFromHomeFormDates({ dates: ['2026-08-11', '2026-08-12'] })).toEqual(['2026-08-11', '2026-08-12']);
    expect(workFromHomeFormDates({ date: '2026-08-11' })).toEqual(['2026-08-11']);
  });
});

describe('WorkFromHomeDayService - range request lifecycle', () => {
  function setup(options: { leaveOn?: string; holidayOn?: string } = {}) {
    type DayRow = {
      id: string;
      companyId: string;
      date: Date;
      scope: WorkFromHomeScope;
      employeeIds: string[];
      departmentIds: string[];
      deletedAt: Date | null;
    };
    const days: DayRow[] = [];
    const approvals: Record<string, Record<string, unknown>> = {};
    let seq = 0;

    const prisma = {
      workFromHomeDay: {
        findFirst: async ({ where }: { where: { companyId: string; date: Date } }) =>
          days.find(
            (row) =>
              row.companyId === where.companyId &&
              row.date.getTime() === where.date.getTime() &&
              row.deletedAt == null,
          ) ?? null,
        create: async ({ data }: { data: DayRow }) => {
          days.push({ ...data, deletedAt: null });
          return { ...data, createdAt: new Date(), updatedAt: new Date() };
        },
        update: async ({ where, data }: { where: { id: string }; data: Partial<DayRow> }) => {
          const row = days.find((item) => item.id === where.id)!;
          Object.assign(row, data);
          return row;
        },
      },
      approvalRequest: {
        findFirst: async ({ where }: { where: { id: string } }) => approvals[where.id] ?? null,
        update: async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
          Object.assign(approvals[where.id]!, data);
          return approvals[where.id];
        },
      },
      user: { findFirst: async () => ({ departmentId: null }) },
    };

    const recalc = jest.fn(async () => ({ updated: 1 }));
    const approvalsService = {
      submitRequest: jest.fn(async (body: { formData: unknown; title: string }) => {
        seq += 1;
        const id = `apr-${seq}`;
        approvals[id] = {
          id,
          companyId: 'c1',
          createdBy: 'e1',
          requestedBy: 'e1',
          status: ApprovalRequestStatus.SUBMITTED,
          title: body.title,
          formData: body.formData,
          category: { code: 'WORK_FROM_HOME' },
        };
        return { id, requestNumber: `WFH-${seq}` };
      }),
    };
    const workScheduleService = {
      calculateWorkingDays: jest.fn(async (_e: string, _c: string, start: Date, end: Date) => ({
        breakdown: schedule(
          start.toISOString().slice(0, 10),
          end.toISOString().slice(0, 10),
          options.holidayOn ? { [options.holidayOn]: 'Holiday' } : {},
        ).map((row) => ({ ...row, weight: 1 })),
      })),
    };
    const dayCoverage = {
      findCovers: jest.fn(async () =>
        options.leaveOn
          ? [{ date: options.leaveOn, module: 'LEAVE', state: 'APPROVED', reference: 'LR-1' }]
          : [],
      ),
    };
    const isHr = { value: false };
    const audit = {
      create: jest.fn(async (_entry: unknown) => undefined),
      buildFromRequestContext: (i: unknown) => i,
    };

    const service = new WorkFromHomeDayService(
      prisma as never,
      { recalculateCompanyAttendanceMonth: recalc } as never,
      { hasPermission: jest.fn(async () => isHr.value) } as never,
      { buildWorkFromHomeApprovalChain: jest.fn(async () => [{ approverId: 'dl' }]) } as never,
      approvalsService as never,
      { register: jest.fn(), unregister: jest.fn() } as never,
      {
        resolveHrProcessSubjectId: jest.fn(async (_u: string, _c: string, target?: string) => target ?? 'e1'),
        resolveInitiation: jest.fn(async (_u: string, _c: string, _t: string, target?: string) => ({
          employeeId: target ?? 'e1',
          initiatedAs: target ? 'DELEGATE' : 'SELF',
        })),
        recordOnBehalfCreate: jest.fn(async () => undefined),
      } as never,
      dayCoverage as never,
      {
        validateSubmissionDates: jest.fn(async () => ({ isLateSubmission: false, lateReason: null })),
      } as never,
      workScheduleService as never,
      audit as never,
    );

    const activeDays = (): string[] =>
      days
        .filter((row) => row.deletedAt == null && row.employeeIds.includes('e1'))
        .map((row) => row.date.toISOString().slice(0, 10))
        .sort();

    return { service, approvals, recalc, isHr, activeDays, approvalsService, audit };
  }

  it('one request for the range; approval creates exactly the previewed days, recalculated once', async () => {
    const t = setup({ holidayOn: '2026-08-17', leaveOn: '2026-08-14' });
    const preview = await t.service.previewRange(
      { startDate: '2026-08-13', endDate: '2026-08-18' },
      'c1',
      'e1',
    );
    expect(preview.dates).toEqual(['2026-08-13', '2026-08-15', '2026-08-18']);
    expect(preview.label).toBe('Aug 13 – Aug 18 (3 days)');

    const approval = (await t.service.submitRequest(
      { startDate: '2026-08-13', endDate: '2026-08-18', reason: 'Renovation at home office' },
      'c1',
      'e1',
    )) as { id: string };
    expect(t.approvalsService.submitRequest).toHaveBeenCalledTimes(1);
    expect(t.approvals[approval.id]!.title).toBe('Work from home - Aug 13 – Aug 18 (3 days)');
    expect(t.activeDays()).toEqual([]); // nothing before approval

    await t.service.onApprovalDecision(approval.id, 'APPROVED');
    expect(t.activeDays()).toEqual(preview.dates);
    expect(t.recalc).toHaveBeenCalledTimes(1);
    expect(t.recalc).toHaveBeenCalledWith('c1', 8, 2026, 'e1');
    expect((t.approvals[approval.id]!.formData as { appliedDates: string[] }).appliedDates).toEqual(
      preview.dates,
    );
  });

  it('reject creates and removes nothing; cancelling a pending request removes nothing', async () => {
    const t = setup();
    const first = (await t.service.submitRequest(
      { startDate: '2026-08-10', endDate: '2026-08-12', reason: 'Child care' },
      'c1',
      'e1',
    )) as { id: string };
    await t.service.onApprovalDecision(first.id, 'REJECTED');
    expect(t.activeDays()).toEqual([]);

    const second = (await t.service.submitRequest(
      { startDate: '2026-08-10', endDate: '2026-08-12', reason: 'Child care' },
      'c1',
      'e1',
    )) as { id: string };
    const cancelled = await t.service.cancelRequest(second.id, {}, 'c1', 'e1');
    expect(cancelled).toEqual({ status: 'CANCELLED', removedDates: [] });
    expect(t.recalc).not.toHaveBeenCalled();
  });

  it('cancelling an approved request (HR) removes its day rows and recalculates', async () => {
    const t = setup();
    const approval = (await t.service.submitRequest(
      { startDate: '2026-08-28', endDate: '2026-09-02', reason: 'Home move' },
      'c1',
      'e1',
    )) as { id: string };
    await t.service.onApprovalDecision(approval.id, 'APPROVED');
    // The approval engine marks the request APPROVED before notifying.
    t.approvals[approval.id]!.status = ApprovalRequestStatus.APPROVED;
    expect(t.activeDays()).toEqual(['2026-08-28', '2026-08-29', '2026-08-31', '2026-09-01', '2026-09-02']);
    expect(t.recalc).toHaveBeenCalledTimes(2); // August + September, once each

    await expect(t.service.cancelRequest(approval.id, {}, 'c1', 'e1')).rejects.toThrow('Only HR');
    t.isHr.value = true;
    t.recalc.mockClear();
    const result = await t.service.cancelRequest(approval.id, { reason: 'Back in office' }, 'c1', 'hr');
    expect(result.removedDates).toHaveLength(5);
    expect(t.activeDays()).toEqual([]);
    expect(t.approvals[approval.id]!.status).toBe('CANCELLED');
    expect(t.recalc).toHaveBeenCalledTimes(2);
  });

  it('a range with no working days is refused', async () => {
    const t = setup();
    await expect(
      t.service.submitRequest(
        { startDate: '2026-08-16', endDate: '2026-08-16', reason: 'Sunday' },
        'c1',
        'e1',
      ),
    ).rejects.toThrow('None of the selected days');
  });

  it('direct assign without approval: Discipline Leads and other non-HR users are refused', async () => {
    const t = setup();
    t.isHr.value = false;
    await expect(
      t.service.create(
        { date: '2026-08-13', reason: 'Team offsite', scope: 'EMPLOYEES', employeeIds: ['e1'] } as never,
        'c1',
        'dl',
      ),
    ).rejects.toThrow('Only users with wfh.manage can assign work-from-home days directly');
    await expect(t.service.listAssignableEmployees('dl', 'c1')).rejects.toThrow(
      'Only users with wfh.manage can assign work-from-home days directly',
    );
    expect(t.audit.create).not.toHaveBeenCalled();
  });

  it('direct assign by HR is applied immediately and audit-logged', async () => {
    const t = setup();
    t.isHr.value = true;
    await t.service.create(
      { date: '2026-08-13', reason: 'Power outage at HQ', scope: 'ALL' } as never,
      'c1',
      'hr',
    );
    expect(t.audit.create).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'hr',
        module: 'work_from_home',
        action: 'direct_assign_create',
        afterValue: expect.objectContaining({ scope: 'ALL', days: 1 }),
      }),
    );
  });
});
