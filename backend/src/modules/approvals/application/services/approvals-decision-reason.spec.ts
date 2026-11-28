import { describe, expect, it, jest } from '@jest/globals';
import { BadRequestException } from '@nestjs/common';
import {
  ApprovalRequestStatus,
  ApprovalTierDecision,
} from '@prisma/client';
import type { PrismaService } from '../../../../shared/prisma/prisma.service';
import type { PermissionService } from '../../../../shared/permissions/permission.service';
import {
  ApprovalsService,
  DECISION_REASON_REQUIRED_MESSAGE,
} from './approvals.service';

const COMPANY_ID = '00000000-0000-4000-8000-000000000002';
const REQUESTER_ID = '00000000-0000-4000-8000-000000000201';
const APPROVER_ID = '00000000-0000-4000-8000-000000000202';
const REQUEST_ID = '00000000-0000-4000-8000-000000000401';
const TIER_ID = '00000000-0000-4000-8000-000000000501';

function makeService(): {
  service: ApprovalsService;
  tierUpdate: jest.Mock;
} {
  const tierUpdate = jest.fn(async () => ({}));
  const prisma = {
    approvalRequest: {
      findFirst: jest.fn(async () => ({
        id: REQUEST_ID,
        companyId: COMPANY_ID,
        requestedBy: REQUESTER_ID,
        createdBy: REQUESTER_ID,
        requestNumber: 'APR-1',
        status: ApprovalRequestStatus.SUBMITTED,
        currentTier: 1,
        categoryId: 'cat-1',
      })),
    },
    approvalTier: {
      findFirst: jest.fn(async () => ({
        id: TIER_ID,
        requestId: REQUEST_ID,
        tierOrder: 1,
        approverId: APPROVER_ID,
        decision: ApprovalTierDecision.PENDING,
        conditions: [],
        label: 'Reports to',
        resolver: 'REPORTS_TO',
        request: {
          id: REQUEST_ID,
          companyId: COMPANY_ID,
          requestedBy: REQUESTER_ID,
          createdBy: REQUESTER_ID,
          requestNumber: 'APR-1',
          status: ApprovalRequestStatus.SUBMITTED,
          currentTier: 1,
          categoryId: 'cat-1',
        },
      })),
      update: tierUpdate,
    },
    approvalResponse: {
      create: jest.fn(async () => ({})),
    },
    $transaction: jest.fn(async (fn: (tx: unknown) => Promise<unknown>) =>
      fn({
        approvalTier: { update: tierUpdate },
        approvalRequest: {
          update: jest.fn(async () => ({})),
        },
        approvalResponse: {
          create: jest.fn(async () => ({})),
        },
      }),
    ),
  };

  const notificationService = {
    send: jest.fn(async () => ({ emailQueued: false })),
  };
  const decisionRegistry = {
    notify: jest.fn(async () => undefined),
  };

  const service = new ApprovalsService(
    prisma as unknown as PrismaService,
    {} as never,
    notificationService as never,
    decisionRegistry as never,
    {
      hasPermission: async (): Promise<boolean> => false,
    } as unknown as PermissionService,
    {} as never,
    {} as never,
  );
  jest.spyOn(service, 'getRequest').mockResolvedValue({});

  return { service, tierUpdate };
}

describe('ApprovalsService - Return/Reject require a reason', () => {
  it.each([undefined, '', '  ', 'abcd'])(
    'rejectTier rejects note %j',
    async (note) => {
      const { service, tierUpdate } = makeService();
      await expect(
        service.rejectTier(REQUEST_ID, TIER_ID, APPROVER_ID, note),
      ).rejects.toBeInstanceOf(BadRequestException);
      await expect(
        service.rejectTier(REQUEST_ID, TIER_ID, APPROVER_ID, note),
      ).rejects.toThrow(DECISION_REASON_REQUIRED_MESSAGE);
      expect(tierUpdate).not.toHaveBeenCalled();
    },
  );

  it.each([undefined, '', '  ', 'abcd'])(
    'returnTier rejects note %j',
    async (note) => {
      const { service, tierUpdate } = makeService();
      await expect(
        service.returnTier(REQUEST_ID, TIER_ID, APPROVER_ID, note),
      ).rejects.toBeInstanceOf(BadRequestException);
      await expect(
        service.returnTier(REQUEST_ID, TIER_ID, APPROVER_ID, note),
      ).rejects.toThrow(DECISION_REASON_REQUIRED_MESSAGE);
      expect(tierUpdate).not.toHaveBeenCalled();
    },
  );

  it('rejectTier accepts a reason of at least 5 characters', async () => {
    const { service, tierUpdate } = makeService();
    // getRequest after mutation — stub findFirst for detail load
    await expect(
      service.rejectTier(
        REQUEST_ID,
        TIER_ID,
        APPROVER_ID,
        'Hours look wrong',
      ),
    ).resolves.toBeDefined();
    expect(tierUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          decision: ApprovalTierDecision.REJECTED,
          comment: 'Hours look wrong',
        }),
      }),
    );
  });

  it('returnTier accepts a reason of at least 5 characters', async () => {
    const { service, tierUpdate } = makeService();
    await expect(
      service.returnTier(
        REQUEST_ID,
        TIER_ID,
        APPROVER_ID,
        'Please fix times',
      ),
    ).resolves.toBeDefined();
    expect(tierUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          decision: ApprovalTierDecision.RETURNED,
          comment: 'Please fix times',
        }),
      }),
    );
  });
});
