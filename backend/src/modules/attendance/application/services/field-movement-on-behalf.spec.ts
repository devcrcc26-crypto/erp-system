import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import {
  ApprovalRequestStatus,
  ApprovalTierDecision,
} from '@prisma/client';
import {
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { AttendanceService } from './attendance.service';
import {
  EXCLUDED_FROM_HR_MESSAGE,
  OnBehalfService,
} from '../../../on-behalf/on-behalf.service';
import { ApprovalsService } from '../../../approvals/application/services/approvals.service';
import { DayCoverageService } from '../../../hr-shared/application/services/day-coverage.service';
import { isOnBehalfCreator } from '../../../approvals/application/utils/on-behalf-approval.util';

const COMPANY = 'company-1';
const ADMIN = 'admin-1';
const EMPLOYEE = 'employee-1';
const OTHER = 'employee-2';
const APPROVER_ONLY = 'approver-only-1';

type Users = Record<string, { id: string; excludedFromHrProcesses: boolean }>;

const USERS: Users = {
  [ADMIN]: { id: ADMIN, excludedFromHrProcesses: false },
  [EMPLOYEE]: { id: EMPLOYEE, excludedFromHrProcesses: false },
  [OTHER]: { id: OTHER, excludedFromHrProcesses: false },
  [APPROVER_ONLY]: { id: APPROVER_ONLY, excludedFromHrProcesses: true },
};

/** Work-from-home rows the cover lookup sees (date keys covered for EMPLOYEE). */
let wfhDateKeys: string[] = [];
/** Leave requests the cover lookup sees: [status, YYYY-MM-DD]. */
let leaveRows: Array<[string, string]> = [];
/** Scans already on the day being explained (create path). */
let createLogScans: { clockInLocal?: string | null; clockOutLocal?: string | null } = {};

/** Minimal Prisma mock for on-behalf + field movement create. */
function buildPrisma() {
  const created: Array<Record<string, unknown>> = [];
  const audits: Array<Record<string, unknown>> = [];
  const prisma = {
    user: {
      findFirst: jest.fn(async (args: unknown) => {
        const where = (args as { where: Record<string, unknown> }).where;
        // isEligibleFor: AND [eligibility filter, { id }]
        if (Array.isArray(where.AND)) {
          const [filter, byId] = where.AND as [
            Record<string, unknown>,
            { id: string },
          ];
          const user = USERS[byId.id];
          if (!user) return null;
          if (filter.excludedFromHrProcesses === false && user.excludedFromHrProcesses) {
            return null;
          }
          return { id: user.id };
        }
        const user = USERS[where.id as string];
        return user
          ? {
              ...user,
              departmentId: null,
              nationality: null,
              attendanceMode: 'SCANNER',
              employmentDate: null,
            }
          : null;
      }),
      findMany: jest.fn(async (_args?: unknown) => []),
    },
    employeeContract: {
      findMany: jest.fn(async () => []),
    },
    department: { findMany: jest.fn(async () => []) },
    discipline: { findMany: jest.fn(async () => []) },
    attendanceDailyLog: {
      findMany: jest.fn(async (args: unknown) => {
        const where = (args as { where: Record<string, unknown> }).where;
        if (where.attendanceRecordId) {
          // Flagged-days list: Aug 3 (missing clock-in) and Aug 4 (missing clock-out).
          return [3, 4].map((day) => ({
            id: `log-${day}`,
            date: new Date(Date.UTC(2026, 7, day)),
            flag: day === 3 ? 'MISSING_CLOCK_IN' : 'MISSING_CLOCK_OUT',
            clockInLocal: null,
            clockOutLocal: null,
            correctedClockInLocal: null,
            correctedClockOutLocal: null,
            isHalfDay: false,
            fieldMovementEntries: [],
          }));
        }
        return [
          {
            id: 'log-1',
            date: new Date(Date.UTC(2026, 7, 3)),
            flag: 'MISSING_CLOCK_IN',
            clockInLocal: null,
            clockOutLocal: null,
            correctedClockInLocal: null,
            correctedClockOutLocal: null,
            ...createLogScans,
            record: { employeeId: EMPLOYEE, companyId: COMPANY, month: 8, year: 2026 },
          },
        ];
      }),
    },
    attendanceRecord: {
      findUnique: jest.fn(async () => ({ id: 'record-1' })),
    },
    publicHoliday: { findMany: jest.fn(async () => []) },
    leaveRequest: {
      findMany: jest.fn(async () =>
        leaveRows.map(([status, key], index) => ({
          status,
          requestNumber: `LV-000${index + 1}`,
          periods: [
            {
              startDate: new Date(`${key}T00:00:00.000Z`),
              endDate: new Date(`${key}T00:00:00.000Z`),
            },
          ],
        })),
      ),
    },
    approvalRequest: { findMany: jest.fn(async () => []) },
    siteAssignment: { findMany: jest.fn(async () => []) },
    workFromHomeDay: {
      findMany: jest.fn(async () =>
        wfhDateKeys.map((key) => ({
          date: new Date(`${key}T00:00:00.000Z`),
          scope: 'EMPLOYEES',
          departmentIds: [],
          employeeIds: [EMPLOYEE],
        })),
      ),
    },
    fieldMovementEntry: {
      findMany: jest.fn(async () => []),
      deleteMany: jest.fn(async () => ({ count: 0 })),
      createMany: jest.fn(async () => ({ count: 0 })),
      count: jest.fn(async () => 0),
    },
    fieldMovementLog: {
      findFirst: jest.fn(async () => null),
      update: jest.fn(async (args: unknown) => {
        const data = (args as { data: Record<string, unknown> }).data;
        return data;
      }),
      create: jest.fn(async (args: unknown) => {
        const data = (args as { data: Record<string, unknown> }).data;
        created.push(data);
        return { ...data, entries: [] };
      }),
    },
    auditLog: { findFirst: jest.fn(async () => null) },
    $queryRaw: jest.fn(async () => [{ nextval: BigInt(7) }]),
  };
  return { prisma, created, audits };
}

/** hr.view / full-access for ADMIN only. */
function buildOnBehalf(prisma: ReturnType<typeof buildPrisma>['prisma'], audits: unknown[]) {
  const permissionService = {
    hasPermission: jest.fn(async (userId: unknown) => userId === ADMIN),
  };
  const hrApprovalChain = {
    isHrOrFullAccessActor: jest.fn(async (userId: unknown) => userId === ADMIN),
  };
  const auditService = {
    create: jest.fn(async (entry: unknown) => {
      audits.push(entry);
    }),
  };
  return new OnBehalfService(
    prisma as never,
    permissionService as never,
    hrApprovalChain as never,
    {} as never,
    auditService as never,
  );
}

function buildAttendance() {
  const { prisma, created, audits } = buildPrisma();
  const onBehalf = buildOnBehalf(prisma, audits);
  const permissionService = {
    hasPermission: jest.fn(async (userId: unknown) => userId === ADMIN),
  };
  const service = new AttendanceService(
    prisma as never,
    {} as never,
    {} as never,
    permissionService as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    { register: jest.fn() } as never,
    onBehalf,
    new DayCoverageService(prisma as never),
    {
      validateSubmissionDates: jest.fn(async () => ({
        earliestDate: '2026-01-01',
        isLateSubmission: false,
        lateReason: null,
        actorKind: 'EMPLOYEE_SELF',
      })),
    } as never,
  );
  return { service, onBehalf, prisma, created, audits };
}

const ENTRY_DTO = {
  entries: [
    {
      dailyLogId: 'log-1',
      reason: 'FORGOT_CLOCK_IN' as const,
      returnTime: '08:15',
      notes: 'Paper form signed by the site lead',
    },
  ],
};

describe('Field movement on behalf', () => {
  beforeEach(() => {
    wfhDateKeys = [];
    leaveRows = [];
  });

  it('stores createdBy = the admin and employeeId = the employee; never auto-approves', async () => {
    const { service, created, audits } = buildAttendance();
    await service.createFieldMovementLog(
      { ...ENTRY_DTO, onBehalfOfEmployeeId: EMPLOYEE, autoApproveTier: true } as never,
      COMPANY,
      ADMIN,
    );
    expect(created).toHaveLength(1);
    expect(created[0].createdBy).toBe(ADMIN);
    expect(created[0].employeeId).toBe(EMPLOYEE);
    expect(created[0].status).toBe('DRAFT');
    const audit = audits[0] as { action: string; afterValue: Record<string, unknown> };
    expect(audit.action).toBe('CREATE_ON_BEHALF');
    // Requested auto-approve is ignored for field movement.
    expect(audit.afterValue.autoApproveTier).toBe(false);
  });

  it('employee without on-behalf permission gets 403 posting someone else', async () => {
    const { service, created } = buildAttendance();
    await expect(
      service.createFieldMovementLog(
        { ...ENTRY_DTO, onBehalfOfEmployeeId: OTHER } as never,
        COMPANY,
        EMPLOYEE,
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(created).toHaveLength(0);
  });

  it('employee without permission also gets 403 reading someone else’s flagged days', async () => {
    const { service } = buildAttendance();
    await expect(
      service.getFlaggedDaysOnBehalf(EMPLOYEE, OTHER, 8, 2026, COMPANY),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('rejects an approver-only employee as the target (even for an admin)', async () => {
    const { service, created } = buildAttendance();
    await expect(
      service.createFieldMovementLog(
        { ...ENTRY_DTO, onBehalfOfEmployeeId: APPROVER_ONLY } as never,
        COMPANY,
        ADMIN,
      ),
    ).rejects.toThrow(new BadRequestException(EXCLUDED_FROM_HR_MESSAGE));
    expect(created).toHaveLength(0);
  });

  it('rejects an approver-only account filing for themselves', async () => {
    const { service } = buildAttendance();
    await expect(
      service.createFieldMovementLog(ENTRY_DTO as never, COMPANY, APPROVER_ONLY),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('eligible-employees excludes approver-only accounts', async () => {
    const { prisma, audits } = buildPrisma();
    const onBehalf = buildOnBehalf(prisma, audits);
    await onBehalf.getEligibleEmployees(ADMIN, COMPANY);
    const calls = prisma.user.findMany.mock.calls as unknown as Array<
      [{ where: Record<string, unknown> }]
    >;
    const where = calls[0][0].where;
    expect(where.excludedFromHrProcesses).toBe(false);
    expect(where.id).toEqual({ not: ADMIN });
  });
});

describe('Days already covered need no field movement', () => {
  beforeEach(() => {
    wfhDateKeys = [];
    leaveRows = [];
  });

  it('flagged-days list hides a day covered by approved work from home', async () => {
    wfhDateKeys = ['2026-08-04'];
    const { service } = buildAttendance();
    const result = await service.getFlaggedDaysForEmployee(EMPLOYEE, 8, 2026, COMPANY);
    expect(result.flaggedDays.map((day) => day.id)).toEqual(['log-3']);
  });

  it('a day with leave requested stays listed but locked, with the reason', async () => {
    leaveRows = [['SUBMITTED', '2026-08-04']];
    const { service } = buildAttendance();
    const result = await service.getFlaggedDaysForEmployee(EMPLOYEE, 8, 2026, COMPANY);
    const day = result.flaggedDays.find((row) => row.id === 'log-4');
    expect(day?.alreadySubmitted).toBe(true);
    expect(day?.coverMessage).toBe(
      'Leave has been requested for this day (2026-08-04) (LV-0001).',
    );
    expect(result.flaggedDays.find((row) => row.id === 'log-3')?.coverMessage).toBeNull();
  });

  it('approved leave hides the day', async () => {
    leaveRows = [['APPROVED', '2026-08-03']];
    const { service } = buildAttendance();
    const result = await service.getFlaggedDaysForEmployee(EMPLOYEE, 8, 2026, COMPANY);
    expect(result.flaggedDays.map((day) => day.id)).toEqual(['log-4']);
  });

  it('creating an explanation for a covered day is rejected with the reason', async () => {
    wfhDateKeys = ['2026-08-03'];
    const { service, created } = buildAttendance();
    await expect(
      service.createFieldMovementLog(ENTRY_DTO as never, COMPANY, EMPLOYEE),
    ).rejects.toThrow('This day (2026-08-03) has approved work from home.');
    expect(created).toHaveLength(0);
  });
});

describe('"Forgot both" clock-in and clock-out', () => {
  beforeEach(() => {
    wfhDateKeys = [];
    leaveRows = [];
    createLogScans = {};
  });

  const pair = (clockIn: string | undefined, clockOut: string) => ({
    notes: 'Card reader was down',
    entries: [
      { dailyLogId: 'log-1', reason: 'FORGOT_CLOCK_IN', returnTime: clockIn },
      { dailyLogId: 'log-1', reason: 'FORGOT_CLOCK_OUT', departureTime: clockOut },
    ],
  });

  it('stores the stated clock-in and clock-out', async () => {
    const { service, created } = buildAttendance();
    await service.createFieldMovementLog(pair('08:05', '17:40') as never, COMPANY, EMPLOYEE);
    const entries = (created[0].entries as { create: Array<Record<string, unknown>> }).create;
    expect(entries.map((e) => [e.reason, e.returnTime, e.departureTime])).toEqual([
      ['FORGOT_CLOCK_IN', '08:05', null],
      ['FORGOT_CLOCK_OUT', null, '17:40'],
    ]);
  });

  it('requires the stated clock-in', async () => {
    const { service } = buildAttendance();
    await expect(
      service.createFieldMovementLog(pair(undefined, '17:40') as never, COMPANY, EMPLOYEE),
    ).rejects.toThrow('Stated clock-in time is required');
  });

  it('clock-in must be before clock-out', async () => {
    const { service } = buildAttendance();
    await expect(
      service.createFieldMovementLog(pair('18:00', '17:40') as never, COMPANY, EMPLOYEE),
    ).rejects.toThrow('Stated clock-in must be before the stated clock-out');
  });

  it('is refused when the day already has one of the scans', async () => {
    createLogScans = { clockOutLocal: '17:31' };
    const { service } = buildAttendance();
    await expect(
      service.createFieldMovementLog(pair('08:05', '17:40') as never, COMPANY, EMPLOYEE),
    ).rejects.toThrow('only for days with neither scan');
  });

  it('approval fills the stated clock-in (not the 08:30 default)', async () => {
    const { service } = buildAttendance();
    const updates: Array<Record<string, unknown>> = [];
    const tx = {
      attendanceDailyLog: {
        update: jest.fn(async (args: unknown) => {
          updates.push((args as { data: Record<string, unknown> }).data);
        }),
      },
    };
    const dailyLog = {
      id: 'log-1',
      flag: 'MISSING_CLOCK_IN',
      isHalfDay: false,
      clockInLocal: null,
      clockOutLocal: null,
      correctedClockInLocal: null,
      correctedClockOutLocal: null,
    };
    const apply = (
      service as unknown as {
        applyEntryCorrection: (t: unknown, e: unknown, id: string, now: Date) => Promise<void>;
      }
    ).applyEntryCorrection.bind(service);
    await apply(tx, { id: 'e1', reason: 'FORGOT_CLOCK_IN', returnTime: '08:05', dailyLog }, EMPLOYEE, new Date());
    await apply(tx, { id: 'e2', reason: 'FORGOT_CLOCK_IN', returnTime: null, dailyLog }, EMPLOYEE, new Date());
    expect(updates[0].correctedClockInLocal).toBe('08:05');
    expect(updates[1].correctedClockInLocal).toBe('08:30');
  });
});

describe('On-behalf creator may approve when they hold the current tier', () => {
  it('isOnBehalfCreator: only the filer of someone else’s record', () => {
    expect(isOnBehalfCreator({ createdBy: ADMIN, employeeId: EMPLOYEE }, ADMIN)).toBe(true);
    expect(isOnBehalfCreator({ createdBy: ADMIN, employeeId: EMPLOYEE }, 'approver-2')).toBe(false);
    // Self-filed: the employee is not "creator on behalf".
    expect(isOnBehalfCreator({ createdBy: EMPLOYEE, employeeId: EMPLOYEE }, EMPLOYEE)).toBe(false);
    expect(isOnBehalfCreator(null, ADMIN)).toBe(false);
  });

  function buildApprovals(createdBy: string) {
    const prisma = {
      approvalTier: {
        findFirst: jest.fn(async () => ({
          id: 'tier-1',
          tierOrder: 1,
          approverId: ADMIN,
          decision: ApprovalTierDecision.PENDING,
          comment: null,
          conditions: [],
          decidedAt: null,
          request: {
            id: 'req-1',
            companyId: COMPANY,
            status: ApprovalRequestStatus.PENDING,
            currentTier: 1,
            requestedBy: ADMIN,
            createdBy,
            requestNumber: 'APR-1',
            deletedAt: null,
          },
        })),
        update: jest.fn(),
      },
      approvalRequest: { findFirst: jest.fn(async () => ({ id: 'req-1' })) },
      fieldMovementLog: {
        findFirst: jest.fn(async () => ({ createdBy, employeeId: EMPLOYEE })),
      },
      $transaction: jest.fn(async () => {
        throw new Error('reached approval write');
      }),
    };
    const service = new ApprovalsService(
      prisma as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );
    return { service, prisma };
  }

  it('the admin who filed it may approve when they hold the current tier', async () => {
    const { service } = buildApprovals(ADMIN);
    await expect(service.approveTier('req-1', 'tier-1', ADMIN)).rejects.toThrow(
      'reached approval write',
    );
  });

  it('an approver who did not file it proceeds to the approval write', async () => {
    const { service } = buildApprovals('someone-else');
    await expect(service.approveTier('req-1', 'tier-1', ADMIN)).rejects.toThrow(
      'reached approval write',
    );
  });

  it('AUTO_APPROVE_ALL (bypassApproverCheck) is unaffected', async () => {
    const { service } = buildApprovals(ADMIN);
    await expect(
      service.approveTier('req-1', 'tier-1', ADMIN, undefined, {
        bypassApproverCheck: true,
      }),
    ).rejects.toThrow('reached approval write');
  });
});
