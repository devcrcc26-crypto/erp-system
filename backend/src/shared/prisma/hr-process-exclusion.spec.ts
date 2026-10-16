import { describe, expect, it, jest } from '@jest/globals';
import { BadRequestException } from '@nestjs/common';
import { readFileSync, readdirSync, statSync } from 'fs';
import { join, relative } from 'path';
import {
  EXCLUDED_FROM_HR_MESSAGE,
  hrProcessEmployeeWhere,
  isExcludedFromHrProcesses,
} from './hr-process.util';
import { AttendanceMatchingService } from '../../modules/attendance/application/services/attendance-matching.service';
import { AttendanceService } from '../../modules/attendance/application/services/attendance.service';
import { PayrollRunService } from '../../modules/payroll/application/services/payroll-run.service';
import { EvaluationService } from '../../modules/evaluation/application/services/evaluation.service';
import { DashboardService } from '../../modules/reporting/application/services/dashboard.service';
import { HrReportService } from '../../modules/reporting/application/services/hr-report.service';
import { LeaveBalanceService } from '../../modules/leave/application/services/leave-balance.service';
import { LeaveService } from '../../modules/leave/application/services/leave.service';
import { LeavePolicyService } from '../../modules/leave-policy/application/services/leave-policy.service';
import { LeaveBalanceCronService } from '../../modules/leave-policy/application/services/leave-balance-cron.service';
import { WorkFromHomeDayService } from '../../modules/work-schedule/application/services/work-from-home-day.service';
import { OvertimeService } from '../../modules/overtime/application/services/overtime.service';
import { SiteAssignmentService } from '../../modules/site-assignment/application/services/site-assignment.service';
import { HrApprovalChainService } from '../../modules/hr-shared/application/services/hr-approval-chain.service';
import { OnBehalfService } from '../../modules/on-behalf/on-behalf.service';

const COMPANY = 'company-1';
const ACTOR = 'actor-1';
const APPROVER_ONLY = 'approver-only-1';
const FLAG = { excludedFromHrProcesses: false };

type Call = { model: string; method: string; args: Record<string, unknown> };
type Override = (args: Record<string, unknown>) => unknown;

const DEFAULT_RESULT: Record<string, unknown> = {
  findMany: [],
  groupBy: [],
  count: 0,
  findFirst: null,
  findUnique: null,
  aggregate: { _sum: {}, _count: {}, _avg: {} },
};

/**
 * Prisma stand-in that records every model call and answers with empty
 * defaults unless overridden - enough to drive read paths without a database.
 */
function recordingPrisma(overrides: Record<string, Record<string, Override>> = {}) {
  const calls: Call[] = [];
  const prisma: Record<string, unknown> = new Proxy(
    {},
    {
      get(_target, model: string) {
        if (model === '$transaction') {
          return async (arg: unknown) =>
            typeof arg === 'function'
              ? (arg as (tx: unknown) => unknown)(prisma)
              : Promise.all(arg as unknown[]);
        }
        return new Proxy(
          {},
          {
            get(_m, method: string) {
              return async (args: Record<string, unknown> = {}) => {
                calls.push({ model, method, args });
                const override = overrides[model]?.[method];
                if (override) return override(args);
                return method in DEFAULT_RESULT ? DEFAULT_RESULT[method] : {};
              };
            },
          },
        );
      },
    },
  );
  const userWheres = (method?: string) =>
    calls
      .filter((c) => c.model === 'user' && (!method || c.method === method))
      .map((c) => c.args.where as Record<string, unknown>);
  return { prisma, calls, userWheres };
}

/** Builds a service without Nest DI, wiring only the collaborators a test needs. */
function make<T extends object>(
  cls: abstract new (...args: never[]) => T,
  deps: Record<string, unknown>,
): T {
  return Object.assign(Object.create(cls.prototype) as T, deps);
}

const allowAll = { hasPermission: jest.fn(async () => true) };

describe('hrProcessEmployeeWhere', () => {
  it('adds the approver-only exclusion and keeps the caller filter', () => {
    expect(hrProcessEmployeeWhere({ companyId: COMPANY, isActive: true })).toEqual({
      companyId: COMPANY,
      isActive: true,
      excludedFromHrProcesses: false,
    });
    expect(hrProcessEmployeeWhere()).toEqual(FLAG);
  });

  it('cannot be overridden by the caller', () => {
    expect(
      hrProcessEmployeeWhere({ excludedFromHrProcesses: true } as Record<string, unknown>),
    ).toEqual(FLAG);
  });

  it('isExcludedFromHrProcesses only for an explicit true', () => {
    expect(isExcludedFromHrProcesses({ excludedFromHrProcesses: true })).toBe(true);
    expect(isExcludedFromHrProcesses({ excludedFromHrProcesses: false })).toBe(false);
    expect(isExcludedFromHrProcesses(null)).toBe(false);
  });
});

describe('approver-only exclusion - attendance', () => {
  it('import matching never offers approver-only employees', async () => {
    const { prisma, userWheres } = recordingPrisma();
    await new AttendanceMatchingService(prisma as never).matchRows([], COMPANY);
    expect(userWheres('findMany')[0]).toMatchObject({ companyId: COMPANY, ...FLAG });
  });

  it('manual assignment search excludes approver-only employees', async () => {
    const { prisma, userWheres } = recordingPrisma();
    const service = make(AttendanceService, { prisma });
    await service.searchEmployees('ab', COMPANY);
    expect(userWheres('findMany')[0]).toMatchObject(FLAG);
  });

  it('Awaiting enrolment excludes approver-only employees', async () => {
    const { prisma, calls } = recordingPrisma();
    const service = make(AttendanceService, { prisma });
    await service.listAwaitingEnrolment(COMPANY);
    const where = calls.find((c) => c.model === 'attendanceRecord')!.args.where as {
      employee: Record<string, unknown>;
    };
    expect(where.employee).toMatchObject(FLAG);
  });

  it('review page (records list) excludes approver-only employees, with and without search', async () => {
    for (const search of [undefined, 'dong']) {
      const { prisma, calls } = recordingPrisma();
      const service = make(AttendanceService, { prisma, permissionService: allowAll });
      await service.listRecords({ month: 9, year: 2026, search } as never, COMPANY, ACTOR);
      const where = calls.find(
        (c) => c.model === 'attendanceRecord' && c.method === 'findMany',
      )!.args.where as { employee: Record<string, unknown> };
      expect(where.employee).toMatchObject(FLAG);
    }
  });

  it('Not in attendance file, import commit and EXEMPT full-presence use the helper', () => {
    // previewImport / confirmImport need a parsed workbook; guard the queries at source.
    const source = readFileSync(
      join(__dirname, '../../modules/attendance/application/services/attendance.service.ts'),
      'utf8',
    );
    const body = (name: string): string => {
      const start = source.indexOf(`  async ${name}(`);
      const next = source.indexOf('\n  async ', start + 10);
      return source.slice(start, next);
    };
    const wrappedUserQueries = (text: string): number =>
      (text.match(/prisma\.user\.findMany\(\{\s*where: hrProcessEmployeeWhere\(/g) ?? [])
        .length;
    expect(wrappedUserQueries(body('previewImport'))).toBe(1); // Not in attendance file
    expect(wrappedUserQueries(body('confirmImport'))).toBe(2); // assignments + EXEMPT
  });
});

describe('approver-only exclusion - payroll, evaluations, leave, WFH', () => {
  it('payroll generation (entries, flags, MISSING_CONTRACT) skips approver-only employees', async () => {
    const { prisma, userWheres } = recordingPrisma();
    const service = make(PayrollRunService, { prisma });
    const drafts = await (
      service as unknown as {
        buildEntryDrafts(run: unknown, ctx: unknown, topUps: Map<string, unknown>): Promise<unknown[]>;
      }
    ).buildEntryDrafts({ month: 9, year: 2026 }, { companyId: COMPANY, userId: ACTOR }, new Map());
    expect(drafts).toEqual([]);
    expect(userWheres('findMany')[0]).toMatchObject({ includeInPayroll: true, ...FLAG });
  });

  it('evaluation cycle generation never makes approver-only evaluatees', async () => {
    const { prisma, userWheres } = recordingPrisma({
      evaluationCycle: { findFirst: () => ({ id: 'cycle-1', status: 'ACTIVE' }) },
    });
    const service = make(EvaluationService, { prisma });
    await service.createEvaluationsForCycle('cycle-1', { companyId: COMPANY, userId: ACTOR } as never);
    expect(userWheres('findMany')[0]).toMatchObject(FLAG);
  });

  it('a single evaluation for an approver-only employee is rejected', async () => {
    const { prisma } = recordingPrisma({
      evaluationCycle: { findFirst: () => ({ id: 'cycle-1', status: 'ACTIVE' }) },
      user: {
        findFirst: () => ({
          id: APPROVER_ONLY,
          excludedFromHrProcesses: true,
          engineeringDiscipline: null,
        }),
      },
    });
    const service = make(EvaluationService, { prisma });
    await expect(
      service.createEvaluation(
        { cycleId: 'cycle-1', employeeId: APPROVER_ONLY } as never,
        { companyId: COMPANY, userId: ACTOR } as never,
      ),
    ).rejects.toThrow(EXCLUDED_FROM_HR_MESSAGE);
  });

  it('HR leave balance list, policy refresh and anniversary cron skip approver-only employees', async () => {
    const list = recordingPrisma();
    await make(LeaveBalanceService, { prisma: list.prisma }).listCompanyBalances(
      { page: 1, limit: 20 } as never,
      COMPANY,
    );
    expect(list.userWheres('findMany')[0]).toMatchObject(FLAG);
    expect(list.userWheres('count')[0]).toMatchObject(FLAG);

    const refresh = recordingPrisma();
    await make(LeavePolicyService, { prisma: refresh.prisma }).refreshAllBalances(COMPANY, 2026);
    expect(refresh.userWheres('findMany')[0]).toMatchObject(FLAG);

    const cron = recordingPrisma();
    await make(LeaveBalanceCronService, {
      prisma: cron.prisma,
      logger: { log: jest.fn() },
    }).refreshAnniversaryBalances();
    expect(cron.userWheres('findMany')[0]).toMatchObject(FLAG);
  });

  it('WFH assignee dropdown excludes approver-only employees', async () => {
    const { prisma, userWheres } = recordingPrisma();
    const service = make(WorkFromHomeDayService, { prisma, permissionService: allowAll });
    await service.listAssignableEmployees(ACTOR, COMPANY);
    expect(userWheres('findMany')[0]).toMatchObject(FLAG);
  });

  it('WFH rejects explicitly chosen approver-only employees', async () => {
    const { prisma, userWheres } = recordingPrisma({ user: { count: () => 1 } });
    const service = make(WorkFromHomeDayService, { prisma });
    const assert = (
      service as unknown as {
        assertHrProcessEmployees(ids: string[], companyId: string): Promise<void>;
      }
    ).assertHrProcessEmployees.bind(service);
    await expect(assert(['employee-1', APPROVER_ONLY], COMPANY)).rejects.toThrow(
      EXCLUDED_FROM_HR_MESSAGE,
    );
    expect(userWheres('count')[0]).toMatchObject(FLAG);
  });
});

describe('approver-only exclusion - reports and dashboard', () => {
  it('HR dashboard headcount, by-department and no-leave-policy counts exclude approver-only', async () => {
    const { prisma, userWheres } = recordingPrisma();
    await make(DashboardService, { prisma }).getHrDashboard({ companyId: COMPANY } as never);
    const wheres = [...userWheres('count'), ...userWheres('groupBy')];
    expect(wheres).toHaveLength(3);
    for (const where of wheres) {
      expect(where).toMatchObject(FLAG);
    }
  });

  it('HR report headcount / demographics exclude approver-only', async () => {
    const { prisma, userWheres } = recordingPrisma();
    await make(HrReportService, { prisma }).getHrReport(
      { companyId: COMPANY } as never,
      {} as never,
    );
    const wheres = [...userWheres('count'), ...userWheres('groupBy')];
    expect(wheres).toHaveLength(9);
    for (const where of wheres) {
      expect(where).toMatchObject(FLAG);
    }
  });
});

describe('approver-only exclusion - self-submission and on-behalf', () => {
  function onBehalfWith(excluded: boolean) {
    const { prisma, userWheres } = recordingPrisma({
      user: { findFirst: () => ({ id: ACTOR, excludedFromHrProcesses: excluded }) },
    });
    const service = make(OnBehalfService, {
      prisma,
      permissionService: allowAll,
      hrApprovalChain: { isHrOrFullAccessActor: jest.fn(async () => false) },
    });
    return { service, userWheres };
  }

  it('an approver-only user cannot file an HR-process request for themself', async () => {
    const { service } = onBehalfWith(true);
    await expect(service.resolveHrProcessSubjectId(ACTOR, COMPANY)).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('a normal employee filing for themself is the subject', async () => {
    const { service } = onBehalfWith(false);
    await expect(service.resolveHrProcessSubjectId(ACTOR, COMPANY)).resolves.toBe(ACTOR);
  });

  it('on-behalf dropdown excludes approver-only employees', async () => {
    const { service, userWheres } = onBehalfWith(false);
    await service.getEligibleEmployees(ACTOR, COMPANY);
    expect(userWheres('findMany')[0]).toMatchObject(FLAG);
  });

  const rejectingOnBehalf = {
    resolveHrProcessSubjectId: jest.fn(async () => {
      throw new BadRequestException(EXCLUDED_FROM_HR_MESSAGE);
    }),
  };

  it.each([
    [
      'overtime sheet',
      () =>
        make(OvertimeService, { onBehalfService: rejectingOnBehalf }).openSheet(
          { year: 2026, month: 1 } as never,
          COMPANY,
          APPROVER_ONLY,
        ),
    ],
    [
      'leave request',
      () =>
        make(LeaveService, { onBehalfService: rejectingOnBehalf }).submitRequest(
          {} as never,
          COMPANY,
          APPROVER_ONLY,
        ),
    ],
    [
      'site assignment',
      () =>
        make(SiteAssignmentService, { onBehalfService: rejectingOnBehalf }).submitRequest(
          {} as never,
          COMPANY,
          APPROVER_ONLY,
        ),
    ],
    [
      'WFH request',
      () =>
        make(WorkFromHomeDayService, { onBehalfService: rejectingOnBehalf }).submitRequest(
          {} as never,
          COMPANY,
          APPROVER_ONLY,
        ),
    ],
    [
      'WFH preview',
      () =>
        make(WorkFromHomeDayService, { onBehalfService: rejectingOnBehalf }).previewRange(
          {} as never,
          COMPANY,
          APPROVER_ONLY,
        ),
    ],
  ])('%s goes through the HR-process subject guard', async (_label, submit) => {
    rejectingOnBehalf.resolveHrProcessSubjectId.mockClear();
    await expect(submit()).rejects.toThrow(EXCLUDED_FROM_HR_MESSAGE);
    expect(rejectingOnBehalf.resolveHrProcessSubjectId).toHaveBeenCalledWith(
      APPROVER_ONLY,
      COMPANY,
      undefined,
    );
  });
});

describe('approver-only accounts still approve', () => {
  it('role-based approver lookup does not filter approver-only accounts', async () => {
    const { prisma, userWheres } = recordingPrisma({
      user: {
        findFirst: () => ({ id: APPROVER_ONLY }),
        findMany: () => [{ id: APPROVER_ONLY }],
      },
    });
    const chain = new HrApprovalChainService(prisma as never);

    await expect(chain.getHRManager(COMPANY)).resolves.toEqual({ id: APPROVER_ONLY });
    await expect(
      chain.findActiveUsersByPrimaryRoleName(COMPANY, 'General Manager'),
    ).resolves.toEqual([{ id: APPROVER_ONLY }]);
    for (const where of userWheres()) {
      expect(where).not.toHaveProperty('excludedFromHrProcesses');
    }
  });

  it('approval-chain code never applies the HR-process filter', () => {
    const dir = join(__dirname, '../../modules');
    const chainFiles = [
      'hr-shared/application/services/hr-approval-chain.service.ts',
      'approvals/application/services/approvals.service.ts',
    ];
    for (const file of chainFiles) {
      const source = readFileSync(join(dir, file), 'utf8');
      expect(source).not.toContain('hrProcessEmployeeWhere');
      expect(source).not.toContain('excludedFromHrProcesses');
    }
  });
});

describe('one shared helper', () => {
  it('no service hand-writes the excludedFromHrProcesses: false filter', () => {
    const root = join(__dirname, '../..');
    const offenders: string[] = [];
    const walk = (dir: string): void => {
      for (const name of readdirSync(dir)) {
        const path = join(dir, name);
        if (statSync(path).isDirectory()) {
          walk(path);
        } else if (
          name.endsWith('.ts') &&
          !name.endsWith('.spec.ts') &&
          !path.endsWith('hr-process.util.ts') &&
          /excludedFromHrProcesses:\s*false/.test(readFileSync(path, 'utf8'))
        ) {
          offenders.push(relative(root, path));
        }
      }
    };
    walk(root);
    expect(offenders).toEqual([]);
  });
});
