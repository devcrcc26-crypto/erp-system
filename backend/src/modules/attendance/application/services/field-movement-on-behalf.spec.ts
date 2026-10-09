import { describe, expect, it, jest } from '@jest/globals';
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
import {
  isOnBehalfCreator,
  ON_BEHALF_CREATOR_APPROVAL_MESSAGE,
} from '../../../approvals/application/utils/on-behalf-approval.util';

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
        return USERS[where.id as string] ?? null;
      }),
      findMany: jest.fn(async (_args?: unknown) => []),
    },
    department: { findMany: jest.fn(async () => []) },
    discipline: { findMany: jest.fn(async () => []) },
    attendanceDailyLog: {
      findMany: jest.fn(async () => [
        {
          id: 'log-1',
          date: new Date(Date.UTC(2026, 7, 3)),
          flag: 'MISSING_CLOCK_IN',
          record: { employeeId: EMPLOYEE, companyId: COMPANY, month: 8, year: 2026 },
        },
      ]),
    },
    fieldMovementEntry: { findMany: jest.fn(async () => []) },
    fieldMovementLog: {
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
  const service = new AttendanceService(
    prisma as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    { register: jest.fn() } as never,
    onBehalf,
  );
  return { service, onBehalf, prisma, created, audits };
}

const ENTRY_DTO = {
  entries: [
    {
      dailyLogId: 'log-1',
      reason: 'FORGOT_CLOCK_IN' as const,
      notes: 'Paper form signed by the site lead',
    },
  ],
};

describe('Field movement on behalf', () => {
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

describe('Creator cannot approve their own on-behalf field movement', () => {
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

  it('the admin who filed it gets 403 even though they hold the current tier', async () => {
    const { service, prisma } = buildApprovals(ADMIN);
    await expect(service.approveTier('req-1', 'tier-1', ADMIN)).rejects.toThrow(
      new ForbiddenException(ON_BEHALF_CREATOR_APPROVAL_MESSAGE),
    );
    expect(prisma.$transaction).not.toHaveBeenCalled();
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
