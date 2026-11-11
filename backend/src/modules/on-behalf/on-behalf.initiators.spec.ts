import { describe, expect, it, jest } from '@jest/globals';
import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { OnBehalfService } from './on-behalf.service';

const COMPANY = 'company-1';
const SUPERVISOR = 'supervisor-1';
const REPORT = 'report-1';
const GRAND_REPORT = 'grand-report-1';
const DEPT_MEMBER = 'dept-member-1';
const HR_MANAGER = 'hr-manager-1';
const HR_OFFICER = 'hr-officer-1';
const DEPT_LEAD = 'dept-lead-1';
const PLAIN = 'plain-1';
const APPROVER_ONLY_REPORT = 'approver-only-report';
const HR_APPROVER_ONLY = 'hr-approver-only';
const TEAM_UNDER_HR_SUP = 'team-under-hr-sup';

type User = {
  id: string;
  reportsToUserId: string | null;
  departmentId: string | null;
  excludedFromHrProcesses: boolean;
};

const USERS: User[] = [
  { id: SUPERVISOR, reportsToUserId: null, departmentId: 'dept-b', excludedFromHrProcesses: false },
  { id: REPORT, reportsToUserId: SUPERVISOR, departmentId: 'dept-b', excludedFromHrProcesses: false },
  {
    id: APPROVER_ONLY_REPORT,
    reportsToUserId: SUPERVISOR,
    departmentId: 'dept-b',
    excludedFromHrProcesses: true,
  },
  { id: GRAND_REPORT, reportsToUserId: REPORT, departmentId: 'dept-b', excludedFromHrProcesses: false },
  { id: DEPT_MEMBER, reportsToUserId: HR_MANAGER, departmentId: 'dept-a', excludedFromHrProcesses: false },
  {
    id: HR_APPROVER_ONLY,
    reportsToUserId: HR_MANAGER,
    departmentId: 'dept-b',
    excludedFromHrProcesses: true,
  },
  {
    id: TEAM_UNDER_HR_SUP,
    reportsToUserId: HR_APPROVER_ONLY,
    departmentId: 'dept-b',
    excludedFromHrProcesses: false,
  },
  { id: HR_MANAGER, reportsToUserId: null, departmentId: null, excludedFromHrProcesses: false },
  { id: DEPT_LEAD, reportsToUserId: null, departmentId: 'dept-a', excludedFromHrProcesses: false },
  { id: PLAIN, reportsToUserId: null, departmentId: 'dept-c', excludedFromHrProcesses: false },
];

/** Minimal Prisma `where` evaluator for the filters OnBehalfService builds. */
function matches(user: User, where: Record<string, unknown> | undefined): boolean {
  if (!where) return true;
  for (const [key, cond] of Object.entries(where)) {
    if (key === 'AND') {
      if (!(cond as Record<string, unknown>[]).every((w) => matches(user, w))) return false;
      continue;
    }
    if (key === 'OR') {
      if (!(cond as Record<string, unknown>[]).some((w) => matches(user, w))) return false;
      continue;
    }
    if (['companyId', 'deletedAt', 'isActive'].includes(key)) continue;
    const value = (user as unknown as Record<string, unknown>)[key];
    if (cond && typeof cond === 'object') {
      const c = cond as { in?: unknown[]; not?: unknown };
      if (c.in && !c.in.includes(value)) return false;
      if ('not' in c && value === c.not) return false;
      continue;
    }
    if (value !== cond) return false;
  }
  return true;
}

function buildService(options?: {
  policyRows?: Array<{ key: string; value: unknown }>;
  fullAccess?: string[];
  hrViewers?: string[];
  primaryRoles?: Record<string, string | null>;
}) {
  const prisma = {
    policySetting: {
      findMany: async () =>
        (options?.policyRows ?? []).map((row) => ({
          ...row,
          effectiveFrom: new Date(Date.UTC(2026, 0, 1)),
          createdAt: new Date(Date.UTC(2026, 0, 1)),
        })),
    },
    user: {
      findFirst: async (args: { where: Record<string, unknown>; select?: unknown }) => {
        const where = args.where;
        const found = USERS.find((u) => matches(u, where));
        return found ?? null;
      },
      findMany: async (args: { where: Record<string, unknown> }) =>
        USERS.filter((u) => matches(u, args.where)).map((u) => ({
          ...u,
          firstName: u.id,
          middleName: null,
          lastName: 'X',
          employeeId: null,
          department: null,
          position: null,
        })),
    },
    department: {
      findMany: async (args: { where: { leaderUserId: string } }) =>
        args.where.leaderUserId === DEPT_LEAD ? [{ id: 'dept-a' }] : [],
    },
    discipline: { findMany: async () => [] },
  };
  const fullAccess = new Set(options?.fullAccess ?? [HR_MANAGER]);
  const hrViewers = new Set(options?.hrViewers ?? [HR_MANAGER]);
  const primaryRoles = options?.primaryRoles ?? {};
  const service = new OnBehalfService(
    prisma as never,
    { hasPermission: jest.fn(async (userId: string) => hrViewers.has(userId)) } as never,
    {
      isHrOrFullAccessActor: jest.fn(async (userId: string) => fullAccess.has(userId)),
      getPrimaryRoleName: jest.fn(async (userId: string) => {
        if (userId in primaryRoles) {
          return primaryRoles[userId] ?? null;
        }
        if (fullAccess.has(userId)) {
          return 'HR Manager';
        }
        return null;
      }),
    } as never,
    {} as never,
    { create: jest.fn(async () => undefined) } as never,
  );
  return service;
}

describe('OnBehalfService.resolveInitiation', () => {
  it('SELF: allowed where the request type allows it (WFH default)', async () => {
    const service = buildService();
    await expect(
      service.resolveInitiation(PLAIN, COMPANY, 'WORK_FROM_HOME', null),
    ).resolves.toEqual({ employeeId: PLAIN, initiatedAs: 'SELF' });
  });

  it('SELF: refused for site assignments by default (supervisor or delegate only)', async () => {
    const service = buildService();
    await expect(
      service.resolveInitiation(PLAIN, COMPANY, 'SITE_ASSIGNMENT', null),
    ).rejects.toThrow("You can't file a site assignment for yourself");
  });

  it('SUPERVISOR: a direct report (reportsToUserId = submitter)', async () => {
    const service = buildService();
    await expect(
      service.resolveInitiation(SUPERVISOR, COMPANY, 'SITE_ASSIGNMENT', REPORT),
    ).resolves.toEqual({ employeeId: REPORT, initiatedAs: 'SUPERVISOR' });
  });

  it('SUPERVISOR: site assignment may target an approver-only direct report', async () => {
    const service = buildService();
    await expect(
      service.resolveInitiation(
        SUPERVISOR,
        COMPANY,
        'SITE_ASSIGNMENT',
        APPROVER_ONLY_REPORT,
      ),
    ).resolves.toEqual({
      employeeId: APPROVER_ONLY_REPORT,
      initiatedAs: 'SUPERVISOR',
    });
  });

  it('SUPERVISOR: WFH still rejects an approver-only direct report', async () => {
    const service = buildService();
    await expect(
      service.resolveInitiation(
        SUPERVISOR,
        COMPANY,
        'WORK_FROM_HOME',
        APPROVER_ONLY_REPORT,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('SUPERVISOR: indirect reports are refused', async () => {
    const service = buildService();
    await expect(
      service.resolveInitiation(SUPERVISOR, COMPANY, 'SITE_ASSIGNMENT', GRAND_REPORT),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('SUPERVISOR: refused when the request type does not allow it (flight default)', async () => {
    const service = buildService();
    await expect(
      service.resolveInitiation(SUPERVISOR, COMPANY, 'FLIGHT_APPLICATION', REPORT),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('DELEGATE: a department head for their department', async () => {
    const service = buildService();
    await expect(
      service.resolveInitiation(DEPT_LEAD, COMPANY, 'BUSINESS_TRIP', DEPT_MEMBER),
    ).resolves.toEqual({ employeeId: DEPT_MEMBER, initiatedAs: 'DELEGATE' });
  });

  it('DELEGATE: refused outside the delegate scope', async () => {
    const service = buildService();
    await expect(
      service.resolveInitiation(DEPT_LEAD, COMPANY, 'BUSINESS_TRIP', PLAIN),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('HR Officer: site assignment may still target any employee (delegate)', async () => {
    const service = buildService({
      fullAccess: [HR_OFFICER],
      hrViewers: [HR_OFFICER],
      primaryRoles: { [HR_OFFICER]: 'HR Officer' },
    });
    await expect(
      service.resolveInitiation(HR_OFFICER, COMPANY, 'SITE_ASSIGNMENT', PLAIN),
    ).resolves.toEqual({ employeeId: PLAIN, initiatedAs: 'DELEGATE' });
  });

  it('HR Officer: site assignment for employees under an on-behalf supervisor', async () => {
    const service = buildService({
      fullAccess: [HR_OFFICER],
      hrViewers: [HR_OFFICER],
      primaryRoles: { [HR_OFFICER]: 'HR Officer' },
    });
    await expect(
      service.resolveInitiation(
        HR_OFFICER,
        COMPANY,
        'SITE_ASSIGNMENT',
        HR_APPROVER_ONLY,
      ),
    ).resolves.toEqual({ employeeId: HR_APPROVER_ONLY, initiatedAs: 'DELEGATE' });
    await expect(
      service.resolveInitiation(
        HR_OFFICER,
        COMPANY,
        'SITE_ASSIGNMENT',
        TEAM_UNDER_HR_SUP,
      ),
    ).resolves.toEqual({ employeeId: TEAM_UNDER_HR_SUP, initiatedAs: 'DELEGATE' });
  });

  it('full-access role: DELEGATE for anyone except site assignment (direct reports only)', async () => {
    const service = buildService({
      policyRows: [
        {
          key: 'allowedInitiators',
          value: {
            SITE_ASSIGNMENT: ['SELF'],
            WORK_FROM_HOME: ['SELF'],
            FLIGHT_APPLICATION: ['SELF'],
            BUSINESS_TRIP: ['SELF'],
          },
        },
      ],
    });
    await expect(
      service.resolveInitiation(HR_MANAGER, COMPANY, 'SITE_ASSIGNMENT', PLAIN),
    ).rejects.toBeInstanceOf(ForbiddenException);
    for (const type of [
      'WORK_FROM_HOME',
      'FLIGHT_APPLICATION',
      'BUSINESS_TRIP',
    ] as const) {
      await expect(
        service.resolveInitiation(HR_MANAGER, COMPANY, type, PLAIN),
      ).resolves.toEqual({ employeeId: PLAIN, initiatedAs: 'DELEGATE' });
    }
  });

  it('full-access role: site assignment refused for employees outside direct reports', async () => {
    const service = buildService();
    await expect(
      service.resolveInitiation(HR_MANAGER, COMPANY, 'SITE_ASSIGNMENT', PLAIN),
    ).rejects.toBeInstanceOf(ForbiddenException);
    await expect(
      service.resolveInitiation(HR_MANAGER, COMPANY, 'SITE_ASSIGNMENT', REPORT),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('full-access role: site assignment for a direct report of an on-behalf supervisor', async () => {
    const service = buildService();
    await expect(
      service.resolveInitiation(
        HR_MANAGER,
        COMPANY,
        'SITE_ASSIGNMENT',
        TEAM_UNDER_HR_SUP,
      ),
    ).resolves.toEqual({ employeeId: TEAM_UNDER_HR_SUP, initiatedAs: 'DELEGATE' });
  });

  it('a full-access direct supervisor files as SUPERVISOR (chain starts above them)', async () => {
    const service = buildService();
    await expect(
      service.resolveInitiation(HR_MANAGER, COMPANY, 'SITE_ASSIGNMENT', DEPT_MEMBER),
    ).resolves.toEqual({ employeeId: DEPT_MEMBER, initiatedAs: 'SUPERVISOR' });
  });

  it('the setting takes effect immediately (current month version is read now)', async () => {
    const service = buildService({
      policyRows: [
        {
          key: 'allowedInitiators',
          value: {
            SITE_ASSIGNMENT: ['SELF', 'SUPERVISOR', 'DELEGATE'],
            WORK_FROM_HOME: ['SELF', 'SUPERVISOR', 'DELEGATE'],
            FLIGHT_APPLICATION: ['SELF', 'DELEGATE'],
            BUSINESS_TRIP: ['SELF', 'SUPERVISOR', 'DELEGATE'],
          },
        },
      ],
    });
    await expect(
      service.resolveInitiation(PLAIN, COMPANY, 'SITE_ASSIGNMENT', null),
    ).resolves.toEqual({ employeeId: PLAIN, initiatedAs: 'SELF' });
  });
});

describe('OnBehalfService initiable employees and passengers', () => {
  it('supervisor sees only HR-process direct reports for site-assignment crew (no self)', async () => {
    const service = buildService();
    const list = await service.getInitiableEmployees(SUPERVISOR, COMPANY, 'SITE_ASSIGNMENT');
    expect(list.map((e) => [e.id, e.initiatedAs])).toEqual([[REPORT, 'SUPERVISOR']]);
  });

  it('supervisor site-assignment on-behalf lists only approver-only direct reports', async () => {
    const service = buildService();
    const list = await service.getInitiableEmployees(
      SUPERVISOR,
      COMPANY,
      'SITE_ASSIGNMENT',
      { approverOnly: true },
    );
    expect(list.map((e) => [e.id, e.initiatedAs])).toEqual([
      [APPROVER_ONLY_REPORT, 'SUPERVISOR'],
    ]);
  });

  it('HR manager site-assignment lists only direct reports, not the whole company', async () => {
    const service = buildService();
    const onBehalf = await service.getInitiableEmployees(
      HR_MANAGER,
      COMPANY,
      'SITE_ASSIGNMENT',
      { approverOnly: true },
    );
    expect(onBehalf.map((e) => e.id)).toEqual([HR_APPROVER_ONLY]);
    const crew = await service.getInitiableEmployees(
      HR_MANAGER,
      COMPANY,
      'SITE_ASSIGNMENT',
    );
    expect(crew.map((e) => e.id)).toEqual([DEPT_MEMBER]);
    const crewForSupervisor = await service.getInitiableEmployees(
      HR_MANAGER,
      COMPANY,
      'SITE_ASSIGNMENT',
      { crewSupervisorId: HR_APPROVER_ONLY },
    );
    expect(crewForSupervisor.map((e) => e.id)).toEqual([TEAM_UNDER_HR_SUP]);
  });

  it('flight passengers: self + delegate scope, no direct reports (SELF+DELEGATE)', async () => {
    const service = buildService();
    const passengers = await service.getSelectablePassengers(SUPERVISOR, COMPANY, 'FLIGHT_APPLICATION');
    expect(passengers.map((p) => p.id)).toEqual([SUPERVISOR]);
    const lead = await service.getSelectablePassengers(DEPT_LEAD, COMPANY, 'FLIGHT_APPLICATION');
    expect(lead.map((p) => p.id).sort()).toEqual([DEPT_LEAD, DEPT_MEMBER].sort());
  });

  it('business-trip passengers include direct reports (SUPERVISOR allowed)', async () => {
    const service = buildService();
    const passengers = await service.getSelectablePassengers(SUPERVISOR, COMPANY, 'BUSINESS_TRIP');
    expect(passengers.map((p) => p.id).sort()).toEqual(
      [APPROVER_ONLY_REPORT, REPORT, SUPERVISOR].sort(),
    );
  });

  it('full-access roles may pick anyone', async () => {
    const service = buildService();
    const passengers = await service.getSelectablePassengers(HR_MANAGER, COMPANY, 'FLIGHT_APPLICATION');
    expect(passengers).toHaveLength(USERS.length);
  });
});
