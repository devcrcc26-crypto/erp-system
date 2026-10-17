import { afterEach, describe, expect, it, jest } from '@jest/globals';
import { BadRequestException } from '@nestjs/common';
import {
  ApprovalRequestStatus,
  ApprovalTierDecision,
  FieldMovementStatus,
  LeaveRequestStatus,
  LeaveType,
  OvertimeSheetStatus,
  PerDiemStatus,
  SiteAssignmentStatus,
} from '@prisma/client';
import {
  AUTO_APPROVE_COMMENT,
  AUTO_APPROVE_FALLBACK_TIER_LABEL,
  resolveAutoApproveMode,
} from '../../../../shared/config/auto-approve.mode';
import type { PrismaService } from '../../../../shared/prisma/prisma.service';
import type { PermissionService } from '../../../../shared/permissions/permission.service';
import type { IStorageService } from '../../../../shared/storage/storage.interface';
import type { LeaveBalanceService } from '../../../leave/application/services/leave-balance.service';
import { LeaveService } from '../../../leave/application/services/leave.service';
import { OvertimeService } from '../../../overtime/application/services/overtime.service';
import { PerDiemService } from '../../../per-diem/application/services/per-diem.service';
import { SiteAssignmentService } from '../../../site-assignment/application/services/site-assignment.service';
import { AttendanceService } from '../../../attendance/application/services/attendance.service';
import { HrApprovalChainService } from '../../../hr-shared/application/services/hr-approval-chain.service';
import type { NotificationService } from '../../../notifications/application/services/notification.service';
import { ApprovalsService } from './approvals.service';
import type { ApprovalResolverService } from './approval-resolver.service';
import type { ApprovalDecisionRegistry } from './approval-decision-registry.service';

const ACTOR_ID = '16040ab7-b923-4fe4-87cf-cc3a916c7325';
const COMPANY_ID = 'company-1';
const REQUEST_ID = 'req-1';
const TIER_ID = 'tier-1';

function flushImmediate(): Promise<void> {
  return new Promise((resolve) => {
    setImmediate(resolve);
  });
}

function permissionStub(): PermissionService {
  return {
    hasPermission: jest.fn(async () => true),
    getUserRoleNames: jest.fn(async () => ['Employee']),
    getUserModulePermissionsMap: jest.fn(async () => ({})),
  } as unknown as PermissionService;
}

function buildApprovalsService(
  prisma: unknown,
  resolveRule: ApprovalResolverService['resolveRule'],
): ApprovalsService {
  return new ApprovalsService(
    prisma as unknown as PrismaService,
    { resolveRule } as unknown as ApprovalResolverService,
    { send: jest.fn(async () => undefined) } as unknown as NotificationService,
    { notify: jest.fn(async () => undefined) } as unknown as ApprovalDecisionRegistry,
    permissionStub(),
    {} as unknown as LeaveBalanceService,
    {} as unknown as IStorageService,
  );
}

describe('AUTO_APPROVE_ALL (scenarios)', () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
    jest.restoreAllMocks();
  });

  it('flag on + localhost → auto-approves leave via approveTier; leave balance charged on APPROVED', async () => {
    process.env.AUTO_APPROVE_ALL = 'true';
    process.env.DATABASE_URL =
      'postgresql://postgres:postgres@127.0.0.1:5433/pwf_fresh';
    process.env.AUTO_APPROVE_ACTOR_ID = ACTOR_ID;

    const approveTier = jest.fn(async () => ({
      id: REQUEST_ID,
      status: ApprovalRequestStatus.APPROVED,
    }));

    let findFirstCalls = 0;
    const prisma = {
      approvalCategory: {
        findFirst: jest.fn(async () => ({
          id: 'cat-1',
          code: 'LEAVE_REQUEST',
          numberPrefix: 'APR',
          approvalRules: [],
          isActive: true,
          isUserRequestable: true,
        })),
      },
      document: { findMany: jest.fn(async () => []) },
      $queryRawUnsafe: jest.fn(async () => [{ nextval: 1 }]),
      $transaction: jest.fn(async (fn: (tx: unknown) => Promise<unknown>) =>
        fn({
          approvalRequest: {
            create: jest.fn(async () => ({
              id: REQUEST_ID,
              requestNumber: 'APR-0001',
            })),
          },
        }),
      ),
      approvalRequest: {
        findFirst: jest.fn(async () => {
          findFirstCalls += 1;
          if (findFirstCalls === 1) {
            return { id: REQUEST_ID, requestNumber: 'APR-0001', tiers: [] };
          }
          return {
            status:
              findFirstCalls < 5
                ? ApprovalRequestStatus.PENDING
                : ApprovalRequestStatus.APPROVED,
            leaveRequest: { id: 'leave-1' },
            overtimeSheet: null,
            flightApplication: null,
            businessTrip: null,
            expenseClaim: null,
            perDiemRequest: null,
            perDiemSettlement: null,
            purchaseRequest: null,
            materialRequisition: null,
            consumablesRequisition: null,
            vehicleApplication: null,
            vehicleRefueling: null,
            officialSeal: null,
            projectSeal: null,
            exitPermit: null,
            siteAssignment: null,
            fieldMovementLog: null,
            category: { code: 'LEAVE_REQUEST' },
            currentTier: 1,
            tiers: [
              {
                id: TIER_ID,
                tierOrder: 1,
                decision:
                  findFirstCalls < 5
                    ? ApprovalTierDecision.PENDING
                    : ApprovalTierDecision.APPROVED,
              },
            ],
          };
        }),
      },
      leaveRequest: {
        findFirst: jest.fn(async () => ({
          id: 'leave-1',
          companyId: COMPANY_ID,
          employeeId: 'emp-1',
          leaveType: LeaveType.ANNUAL,
          days: 2,
          startDate: new Date(Date.UTC(2026, 9, 1)),
          status: LeaveRequestStatus.SUBMITTED,
          periods: [
            {
              startDate: new Date(Date.UTC(2026, 9, 1)),
              endDate: new Date(Date.UTC(2026, 9, 2)),
            },
          ],
        })),
        update: jest.fn(async () => ({})),
      },
    };

    const approvals = buildApprovalsService(
      prisma,
      jest.fn(async () => ({
        ruleName: 'test',
        tiers: [
          {
            tierOrder: 1,
            label: 'Discipline Lead',
            approverId: 'approver-1',
            resolver: 'DISCIPLINE_LEAD',
          },
        ],
      })) as never,
    );
    (approvals as unknown as { approveTier: typeof approveTier }).approveTier =
      approveTier;

    await approvals.submitRequest(
      {
        categoryCode: 'LEAVE_REQUEST',
        title: 'Annual leave',
        formData: {},
      },
      COMPANY_ID,
      'employee-1',
    );
    await flushImmediate();
    await new Promise((r) => setTimeout(r, 120));

    expect(approveTier).toHaveBeenCalledWith(
      REQUEST_ID,
      TIER_ID,
      ACTOR_ID,
      AUTO_APPROVE_COMMENT,
      { bypassApproverCheck: true },
    );

    const adjustPendingForDate = jest.fn(async () => undefined);
    const recordLeaveUsed = jest.fn(async () => undefined);
    const leave = new LeaveService(
      prisma as unknown as PrismaService,
      {} as never,
      { adjustPendingForDate } as unknown as LeaveBalanceService,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      { recordLeaveUsed } as never,
    );
    jest
      .spyOn(
        leave as unknown as {
          recalculateAttendanceForLeavePeriods: () => Promise<void>;
        },
        'recalculateAttendanceForLeavePeriods',
      )
      .mockResolvedValue(undefined);
    await leave.onApprovalDecision(REQUEST_ID, 'APPROVED');
    expect(adjustPendingForDate).toHaveBeenCalledWith(
      'emp-1',
      LeaveType.ANNUAL,
      expect.any(Date),
      -2,
      COMPANY_ID,
    );
    expect(recordLeaveUsed).toHaveBeenCalledWith('leave-1');
  });

  it('overtime sheet: APPROVED so hours can appear in the payroll run', async () => {
    const prisma = {
      overtimeSheet: {
        findFirst: jest.fn(async () => ({
          id: 'ot-1',
          companyId: COMPANY_ID,
          status: OvertimeSheetStatus.SUBMITTED,
          employeeId: 'emp-1',
        })),
        update: jest.fn(async () => ({})),
      },
    };

    const service = new OvertimeService(
      prisma as unknown as PrismaService,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );

    await service.onApprovalDecision(REQUEST_ID, 'APPROVED');

    expect(prisma.overtimeSheet.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: OvertimeSheetStatus.APPROVED,
        }),
      }),
    );
  });

  it('per diem advance: approved with a PV number generated', async () => {
    const prisma = {
      perDiemRequest: {
        findFirst: jest.fn(async () => ({
          id: 'pd-1',
          companyId: COMPANY_ID,
          status: PerDiemStatus.SUBMITTED,
          pvNumber: null,
          pvDate: null,
          employeeId: 'emp-1',
        })),
        update: jest.fn(async () => ({})),
      },
      $queryRaw: jest.fn(async () => [{ nextval: BigInt(7) }]),
    };

    const service = new PerDiemService(
      prisma as unknown as PrismaService,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );

    await service.onApprovalDecision(REQUEST_ID, 'APPROVED');

    expect(prisma.perDiemRequest.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: PerDiemStatus.APPROVED,
          pvNumber: 'PV-0007',
        }),
      }),
    );
  });

  it('site assignment: approved and attendance recalculates ON_SITE days', async () => {
    const recalculate = jest.fn(async () => ({ updated: 2 }));
    const prisma = {
      siteAssignment: {
        findFirst: jest.fn(async () => ({
          id: 'sa-1',
          companyId: COMPANY_ID,
          employeeId: 'emp-1',
          startDate: new Date(Date.UTC(2026, 9, 1)),
          endDate: new Date(Date.UTC(2026, 9, 10)),
          status: SiteAssignmentStatus.IN_REVIEW,
        })),
        update: jest.fn(async () => ({})),
      },
    };

    const service = new SiteAssignmentService(
      prisma as unknown as PrismaService,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      { recalculateCompanyAttendanceMonth: recalculate } as never,
      {} as never,
      {} as never,
      {
        create: jest.fn(async () => undefined),
        buildFromRequestContext: (input: unknown) => input,
      } as never,
      { syncAfterApproval: jest.fn(async () => undefined) } as never,
    );

    await service.onApprovalDecision(REQUEST_ID, 'APPROVED');

    expect(recalculate).toHaveBeenCalledWith(COMPANY_ID, 10, 2026, 'emp-1');
  });

  it('field movement: approved and corrections applied (0.5 deduction removed)', async () => {
    const dailyLog = {
      id: 'dl-1',
      date: new Date(Date.UTC(2026, 9, 5)),
      dayDeduction: 0.5,
    };
    const entryUpdate = jest.fn(async () => ({}));
    const dailyLogUpdate = jest.fn(async () => ({}));
    const logUpdate = jest.fn(async () => ({}));

    const prisma = {
      fieldMovementLog: {
        findFirst: jest.fn(async () => ({
          id: 'fm-1',
          companyId: COMPANY_ID,
          employeeId: 'emp-1',
          month: 10,
          year: 2026,
          status: FieldMovementStatus.SUBMITTED,
          entries: [
            {
              id: 'entry-1',
              reason: 'EARLY_DEPARTURE',
              dailyLog,
            },
          ],
        })),
        update: logUpdate,
      },
      $transaction: jest.fn(async (fn: (tx: unknown) => Promise<unknown>) =>
        fn({
          fieldMovementLog: { update: logUpdate },
          fieldMovementEntry: {
            update: entryUpdate,
            updateMany: jest.fn(async () => ({ count: 1 })),
          },
          attendanceDailyLog: { update: dailyLogUpdate },
          attendanceRecord: {
            findFirst: jest.fn(async () => null),
            upsert: jest.fn(async () => ({})),
          },
        }),
      ),
    };

    const service = new AttendanceService(
      prisma as unknown as PrismaService,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );

    jest
      .spyOn(
        service as unknown as {
          applyEntryCorrection: () => Promise<void>;
        },
        'applyEntryCorrection',
      )
      .mockResolvedValue(undefined);
    jest
      .spyOn(
        service as unknown as {
          recalculateCompanyAttendanceMonth: () => Promise<unknown>;
        },
        'recalculateCompanyAttendanceMonth',
      )
      .mockResolvedValue({ updated: 1 });

    await service.onApprovalDecision(REQUEST_ID, 'APPROVED');

    expect(prisma.$transaction).toHaveBeenCalled();
    expect(logUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: FieldMovementStatus.APPROVED,
        }),
      }),
    );
  });

  it('employee with no discipline lead and no HR roles: fallback Test auto-approval tier', async () => {
    process.env.AUTO_APPROVE_ALL = 'true';
    process.env.DATABASE_URL =
      'postgresql://postgres:postgres@localhost:5433/pwf_fresh';
    process.env.AUTO_APPROVE_ACTOR_ID = ACTOR_ID;

    const chain = new HrApprovalChainService({
      user: {
        findFirst: jest.fn(async () => ({
          id: 'emp-orphan',
          ledDisciplines: [],
        })),
      },
    } as unknown as PrismaService);

    jest
      .spyOn(
        chain as unknown as { getPrimaryRoleName: () => Promise<string> },
        'getPrimaryRoleName',
      )
      .mockResolvedValue('Employee');
    jest
      .spyOn(
        chain as unknown as {
          getReportsToRequired: () => Promise<{ id: string }>;
        },
        'getReportsToRequired',
      )
      .mockRejectedValue(
        new BadRequestException(
          'Employee has no Reports to assigned - ask HR to set a supervisor before submitting.',
        ),
      );

    const tiers = await chain.buildOrgApprovalChain(
      'emp-orphan',
      COMPANY_ID,
      false,
    );

    expect(tiers).toEqual([
      {
        tierOrder: 1,
        label: AUTO_APPROVE_FALLBACK_TIER_LABEL,
        approverId: ACTOR_ID,
        resolver: 'AUTO_APPROVE_FALLBACK',
      },
    ]);
  });

  it('flag on + remote host → no auto-approve', async () => {
    const mode = resolveAutoApproveMode({
      AUTO_APPROVE_ALL: 'true',
      DATABASE_URL:
        'postgresql://postgres:postgres@db.prod.example:5432/erp',
    });
    expect(mode.active).toBe(false);
    expect(mode.ignoredNonLocal).toBe(true);

    process.env.AUTO_APPROVE_ALL = 'true';
    process.env.DATABASE_URL =
      'postgresql://postgres:postgres@db.prod.example:5432/erp';

    const approveTier = jest.fn(async () => ({}));
    const prisma = {
      approvalCategory: {
        findFirst: jest.fn(async () => ({
          id: 'cat-1',
          code: 'LEAVE_REQUEST',
          numberPrefix: 'APR',
          approvalRules: [],
          isActive: true,
          isUserRequestable: true,
        })),
      },
      document: { findMany: jest.fn(async () => []) },
      $queryRawUnsafe: jest.fn(async () => [{ nextval: 1 }]),
      $transaction: jest.fn(async (fn: (tx: unknown) => Promise<unknown>) =>
        fn({
          approvalRequest: {
            create: jest.fn(async () => ({
              id: REQUEST_ID,
              requestNumber: 'APR-0001',
            })),
          },
        }),
      ),
      approvalRequest: {
        findFirst: jest.fn(async () => ({
          id: REQUEST_ID,
          requestNumber: 'APR-0001',
          tiers: [],
        })),
      },
    };

    const service = buildApprovalsService(
      prisma,
      jest.fn(async () => ({
        ruleName: 'test',
        tiers: [
          {
            tierOrder: 1,
            label: 'Discipline Lead',
            approverId: 'a1',
            resolver: 'DISCIPLINE_LEAD',
          },
        ],
      })) as never,
    );
    (service as unknown as { approveTier: typeof approveTier }).approveTier =
      approveTier;

    await service.submitRequest(
      {
        categoryCode: 'LEAVE_REQUEST',
        title: 'Leave',
        formData: {},
      },
      COMPANY_ID,
      'emp-1',
    );
    await flushImmediate();
    await new Promise((r) => setTimeout(r, 80));

    expect(approveTier).not.toHaveBeenCalled();
  });

  it('flag off → no auto-approve', async () => {
    const mode = resolveAutoApproveMode({
      AUTO_APPROVE_ALL: 'false',
      DATABASE_URL:
        'postgresql://postgres:postgres@127.0.0.1:5433/pwf_fresh',
    });
    expect(mode.active).toBe(false);
    expect(mode.ignoredNonLocal).toBe(false);

    process.env.AUTO_APPROVE_ALL = 'false';
    process.env.DATABASE_URL =
      'postgresql://postgres:postgres@127.0.0.1:5433/pwf_fresh';

    const approveTier = jest.fn(async () => ({}));
    const prisma = {
      approvalCategory: {
        findFirst: jest.fn(async () => ({
          id: 'cat-1',
          code: 'LEAVE_REQUEST',
          numberPrefix: 'APR',
          approvalRules: [],
          isActive: true,
          isUserRequestable: true,
        })),
      },
      document: { findMany: jest.fn(async () => []) },
      $queryRawUnsafe: jest.fn(async () => [{ nextval: 1 }]),
      $transaction: jest.fn(async (fn: (tx: unknown) => Promise<unknown>) =>
        fn({
          approvalRequest: {
            create: jest.fn(async () => ({
              id: REQUEST_ID,
              requestNumber: 'APR-0001',
            })),
          },
        }),
      ),
      approvalRequest: {
        findFirst: jest.fn(async () => ({
          id: REQUEST_ID,
          requestNumber: 'APR-0001',
          tiers: [],
        })),
      },
    };

    const service = buildApprovalsService(
      prisma,
      jest.fn(async () => ({
        ruleName: 'test',
        tiers: [
          {
            tierOrder: 1,
            label: 'Discipline Lead',
            approverId: 'a1',
            resolver: 'DISCIPLINE_LEAD',
          },
        ],
      })) as never,
    );
    (service as unknown as { approveTier: typeof approveTier }).approveTier =
      approveTier;

    await service.submitRequest(
      {
        categoryCode: 'LEAVE_REQUEST',
        title: 'Leave',
        formData: {},
      },
      COMPANY_ID,
      'emp-1',
    );
    await flushImmediate();
    await new Promise((r) => setTimeout(r, 80));

    expect(approveTier).not.toHaveBeenCalled();
  });

  it('payroll run is never auto-approved', async () => {
    process.env.AUTO_APPROVE_ALL = 'true';
    process.env.DATABASE_URL =
      'postgresql://postgres:postgres@localhost:5433/pwf_fresh';

    const approveTier = jest.fn(async () => ({}));
    const prisma = {
      approvalCategory: {
        findFirst: jest.fn(async () => ({
          id: 'cat-pay',
          code: 'PAYROLL_RUN',
          numberPrefix: 'PR',
          approvalRules: [],
          isActive: true,
          isUserRequestable: true,
        })),
      },
      document: { findMany: jest.fn(async () => []) },
      $queryRawUnsafe: jest.fn(async () => [{ nextval: 1 }]),
      $transaction: jest.fn(async (fn: (tx: unknown) => Promise<unknown>) =>
        fn({
          approvalRequest: {
            create: jest.fn(async () => ({
              id: 'pay-req',
              requestNumber: 'PR-0001',
            })),
          },
        }),
      ),
      approvalRequest: {
        findFirst: jest.fn(async () => ({
          id: 'pay-req',
          requestNumber: 'PR-0001',
          tiers: [],
        })),
      },
    };

    const service = buildApprovalsService(
      prisma,
      jest.fn(async () => ({
        ruleName: 'payroll',
        tiers: [
          {
            tierOrder: 1,
            label: 'HR Manager',
            approverId: 'hr-1',
            resolver: 'ROLE:HR Manager',
          },
        ],
      })) as never,
    );
    (service as unknown as { approveTier: typeof approveTier }).approveTier =
      approveTier;

    await service.submitRequest(
      {
        categoryCode: 'PAYROLL_RUN',
        title: 'Payroll run',
        formData: {},
      },
      COMPANY_ID,
      'hr-1',
    );
    await flushImmediate();
    await new Promise((r) => setTimeout(r, 80));

    expect(approveTier).not.toHaveBeenCalled();
  });

  it('evaluation is never auto-approved', async () => {
    process.env.AUTO_APPROVE_ALL = 'true';
    process.env.DATABASE_URL =
      'postgresql://postgres:postgres@localhost:5433/pwf_fresh';

    const approveTier = jest.fn(async () => ({}));
    const prisma = {
      approvalCategory: {
        findFirst: jest.fn(async () => ({
          id: 'cat-eval',
          code: 'EVALUATION',
          numberPrefix: 'EV',
          approvalRules: [],
          isActive: true,
          isUserRequestable: true,
        })),
      },
      document: { findMany: jest.fn(async () => []) },
      $queryRawUnsafe: jest.fn(async () => [{ nextval: 1 }]),
      $transaction: jest.fn(async (fn: (tx: unknown) => Promise<unknown>) =>
        fn({
          approvalRequest: {
            create: jest.fn(async () => ({
              id: 'eval-req',
              requestNumber: 'EV-0001',
            })),
          },
        }),
      ),
      approvalRequest: {
        findFirst: jest.fn(async () => ({
          id: 'eval-req',
          requestNumber: 'EV-0001',
          tiers: [],
        })),
      },
    };

    const service = buildApprovalsService(
      prisma,
      jest.fn(async () => ({
        ruleName: 'evaluation',
        tiers: [
          {
            tierOrder: 1,
            label: 'Team Lead',
            approverId: 'tl-1',
            resolver: 'TEAM_LEAD',
          },
        ],
      })) as never,
    );
    (service as unknown as { approveTier: typeof approveTier }).approveTier =
      approveTier;

    await service.submitRequest(
      {
        categoryCode: 'EVALUATION',
        title: 'Performance evaluation',
        formData: {},
      },
      COMPANY_ID,
      'tl-1',
    );
    await flushImmediate();
    await new Promise((r) => setTimeout(r, 80));

    expect(approveTier).not.toHaveBeenCalled();
  });
});
