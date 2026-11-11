import { describe, expect, it, jest } from '@jest/globals';
import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { ApprovalReassignmentService } from './approval-reassignment.service';
import { ApprovalsService } from './approvals.service';
import { ApprovalResolverService } from './approval-resolver.service';

const COMPANY = 'co-1';
const HR_MANAGER = 'hr-manager';
const OLD_APPROVER = 'leader-old';
const NEW_APPROVER = 'leader-new';
const REQUESTER = 'emp-1';

interface UserRow {
  id: string;
  isActive: boolean;
  employmentStatus: 'ACTIVE' | 'INACTIVE' | 'SEPARATED';
  excludedFromHrProcesses: boolean;
  deletedAt: null;
}

function makeWorld(options: { isHrManager?: boolean } = {}) {
  const tier = {
    id: 'tier-1',
    requestId: 'req-1',
    tierOrder: 1,
    label: 'Department Head',
    approverId: OLD_APPROVER,
    decision: 'PENDING',
    comment: null,
    conditions: null,
    decidedAt: null,
    request: {
      id: 'req-1',
      companyId: COMPANY,
      requestNumber: 'AR-0001',
      status: 'PENDING',
      currentTier: 1,
      requestedBy: REQUESTER,
      deletedAt: null,
    },
  };
  const users: Record<string, UserRow> = {
    [NEW_APPROVER]: {
      id: NEW_APPROVER,
      isActive: true,
      employmentStatus: 'ACTIVE',
      excludedFromHrProcesses: true,
      deletedAt: null,
    },
    'on-leave': {
      id: 'on-leave',
      isActive: true,
      employmentStatus: 'INACTIVE',
      excludedFromHrProcesses: true,
      deletedAt: null,
    },
    'not-approver-only': {
      id: 'not-approver-only',
      isActive: true,
      employmentStatus: 'ACTIVE',
      excludedFromHrProcesses: false,
      deletedAt: null,
    },
    [REQUESTER]: {
      id: REQUESTER,
      isActive: true,
      employmentStatus: 'ACTIVE',
      excludedFromHrProcesses: false,
      deletedAt: null,
    },
  };
  const prisma: any = {
    userRole: {
      findMany: jest.fn(async () => (options.isHrManager === false ? [] : [{ id: 'ur-1' }])),
    },
    approvalTier: {
      findFirst: jest.fn(async () => ({ ...tier, request: { ...tier.request } })),
      update: jest.fn(async ({ data }: any) => Object.assign(tier, data)),
    },
    approvalRequest: { findFirst: jest.fn(async () => ({ id: tier.request.id })) },
    user: { findFirst: jest.fn(async ({ where }: any) => users[where.id] ?? null) },
  };
  const audit = { create: jest.fn(async () => undefined), buildFromRequestContext: (x: any) => x };
  const notifications = { send: jest.fn(async () => undefined) };
  const reassignment = new ApprovalReassignmentService(prisma, audit as any, notifications as any);
  const approvals = new ApprovalsService(
    prisma,
    {} as never,
    notifications as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
  );
  const loadTierForAction = (userId: string) =>
    (approvals as unknown as {
      loadTierForAction: (requestId: string, tierId: string, userId: string) => Promise<unknown>;
    }).loadTierForAction('req-1', 'tier-1', userId);
  return { tier, prisma, audit, notifications, reassignment, loadTierForAction };
}

const ctx = { companyId: COMPANY, userId: HR_MANAGER };

describe('ApprovalReassignmentService', () => {
  it('reassigned tier is actionable by the new approver only; audited and the new approver notified', async () => {
    const { tier, audit, notifications, reassignment, loadTierForAction } = makeWorld();

    await reassignment.reassignTier(ctx, 'tier-1', NEW_APPROVER, 'Leader on long leave');

    expect(tier.approverId).toBe(NEW_APPROVER);
    await expect(loadTierForAction(NEW_APPROVER)).resolves.toMatchObject({
      tier: { id: 'tier-1', approverId: NEW_APPROVER },
    });
    await expect(loadTierForAction(OLD_APPROVER)).rejects.toBeInstanceOf(ForbiddenException);
    expect(audit.create).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'reassign_tier',
        beforeValue: { approverId: OLD_APPROVER },
        afterValue: expect.objectContaining({ approverId: NEW_APPROVER, reason: 'Leader on long leave' }),
      }),
    );
    expect(notifications.send).toHaveBeenCalledWith(
      ctx,
      expect.objectContaining({ recipientId: NEW_APPROVER, eventType: 'approval.reassigned' }),
    );
  });

  it('only HR Manager / System Administrator may reassign', async () => {
    const { reassignment } = makeWorld({ isHrManager: false });
    await expect(reassignment.reassignTier(ctx, 'tier-1', NEW_APPROVER, 'Because')).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('needs a reason, an active new approver, and never the requester', async () => {
    const { reassignment } = makeWorld();
    await expect(reassignment.reassignTier(ctx, 'tier-1', NEW_APPROVER, ' ')).rejects.toThrow('reason');
    await expect(reassignment.reassignTier(ctx, 'tier-1', 'on-leave', 'Cover')).rejects.toThrow(
      'must be an active employee',
    );
    await expect(reassignment.reassignTier(ctx, 'tier-1', REQUESTER, 'Cover')).rejects.toThrow(
      'cannot approve their own request',
    );
  });

  it('rejects reassignment to a non–approver-only employee', async () => {
    const { reassignment } = makeWorld();
    await expect(
      reassignment.reassignTier(ctx, 'tier-1', 'not-approver-only', 'Cover'),
    ).rejects.toThrow('approver-only');
  });
});

describe('vacant approver at submit', () => {
  function resolverWith(users: Record<string, Partial<UserRow>>, extra: Record<string, unknown> = {}) {
    const prisma: any = {
      user: {
        findFirst: jest.fn(async ({ where }: any) =>
          where.id === REQUESTER
            ? { departmentId: 'dep-1', department: { leaderUserId: OLD_APPROVER } }
            : users[where.id] ?? null,
        ),
      },
      ...extra,
    };
    const resolver = new ApprovalResolverService(prisma);
    return (tier: Record<string, unknown>) =>
      (resolver as unknown as {
        resolveApprover: (companyId: string, submitterId: string, tier: unknown) => Promise<string>;
      }).resolveApprover(COMPANY, REQUESTER, tier);
  }

  it('department leader who is separated or inactive → "Approver position vacant: <role> - ask HR"', async () => {
    for (const employmentStatus of ['SEPARATED', 'INACTIVE'] as const) {
      const resolve = resolverWith({ [OLD_APPROVER]: { id: OLD_APPROVER, isActive: true, employmentStatus } });
      await expect(resolve({ label: 'Department Head', resolver: 'DEPARTMENT_LEADER' })).rejects.toThrow(
        new BadRequestException('Approver position vacant: Department Head - ask HR'),
      );
    }
  });

  it('a role with no active holder is vacant', async () => {
    const resolve = resolverWith(
      {},
      {
        role: { findFirst: jest.fn(async () => ({ id: 'role-gm', name: 'General Manager' })) },
        userRole: { findFirst: jest.fn(async () => null) },
      },
    );
    await expect(resolve({ label: 'GM', resolver: 'ROLE', roleCode: 'General Manager' })).rejects.toThrow(
      'Approver position vacant',
    );
  });

  it('an active approver resolves normally', async () => {
    const resolve = resolverWith({
      [OLD_APPROVER]: { id: OLD_APPROVER, isActive: true, employmentStatus: 'ACTIVE' },
    });
    await expect(resolve({ label: 'Department Head', resolver: 'DEPARTMENT_LEADER' })).resolves.toBe(OLD_APPROVER);
  });
});
