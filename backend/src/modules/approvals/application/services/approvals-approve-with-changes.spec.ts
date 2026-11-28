import { describe, expect, it, jest } from '@jest/globals';
import {
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import {
  ApprovalRequestStatus,
  ApprovalTierDecision,
} from '@prisma/client';
import type { ModuleRef } from '@nestjs/core';
import type { PrismaService } from '../../../../shared/prisma/prisma.service';
import type { PermissionService } from '../../../../shared/permissions/permission.service';
import {
  ApprovalsService,
  RESPONSE_TYPE_APPROVE_WITH_CHANGES,
} from './approvals.service';

const COMPANY_ID = '00000000-0000-4000-8000-000000000002';
const REQUESTER_ID = '00000000-0000-4000-8000-000000000201';
const APPROVER_ID = '00000000-0000-4000-8000-000000000202';
const HR_ID = '00000000-0000-4000-8000-000000000203';
const REQUEST_ID = '00000000-0000-4000-8000-000000000401';
const TIER1_ID = '00000000-0000-4000-8000-000000000501';
const TIER2_ID = '00000000-0000-4000-8000-000000000502';
const SHEET_ID = '00000000-0000-4000-8000-000000000601';

function makeService(options?: {
  tierResolver?: string;
  tierLabel?: string;
  tierOrder?: number;
  tierId?: string;
  approverId?: string;
  categoryCode?: string;
  hasSheet?: boolean;
}): {
  service: ApprovalsService;
  applyApproverChanges: jest.Mock;
  approveTier: jest.Mock;
  notifySafe: jest.Mock;
  responseCreate: jest.Mock;
} {
  const tierId = options?.tierId ?? TIER1_ID;
  const tierOrder = options?.tierOrder ?? 1;
  const approverId = options?.approverId ?? APPROVER_ID;
  const applyApproverChanges = jest.fn(async () => ({
    adjustment: { changes: [] },
    timelineNote: 'Approved with changes by approver (3h → 2h)',
    previousTotalHours: 3,
    newTotalHours: 2,
  }));
  const responseCreate = jest.fn(async () => ({}));

  const prisma = {
    approvalRequest: {
      findFirst: jest.fn(async (args: { where?: { id?: string } }) => {
        if (args?.where && 'id' in (args.where as object) && !('overtimeSheet' in ((args as { include?: object }).include ?? {}))) {
          // loadTierForAction request lookup is nested under tier
        }
        return {
          id: REQUEST_ID,
          companyId: COMPANY_ID,
          requestedBy: REQUESTER_ID,
          createdBy: REQUESTER_ID,
          requestNumber: 'APR-OT-1',
          status: ApprovalRequestStatus.SUBMITTED,
          currentTier: tierOrder,
          categoryId: 'cat-ot',
          category: { code: options?.categoryCode ?? 'OVERTIME_APPLICATION' },
          overtimeSheet: options?.hasSheet === false ? null : { id: SHEET_ID },
        };
      }),
    },
    approvalTier: {
      findFirst: jest.fn(async () => ({
        id: tierId,
        requestId: REQUEST_ID,
        tierOrder,
        approverId,
        decision: ApprovalTierDecision.PENDING,
        conditions: [],
        label: options?.tierLabel ?? 'Reports to',
        resolver: options?.tierResolver ?? 'REPORTS_TO',
        request: {
          id: REQUEST_ID,
          companyId: COMPANY_ID,
          requestedBy: REQUESTER_ID,
          createdBy: REQUESTER_ID,
          requestNumber: 'APR-OT-1',
          status: ApprovalRequestStatus.SUBMITTED,
          currentTier: tierOrder,
          categoryId: 'cat-ot',
        },
      })),
    },
    approvalResponse: {
      create: responseCreate,
    },
    approvalComment: {
      create: jest.fn(async () => ({})),
    },
  };

  const moduleRef = {
    get: jest.fn(() => ({ applyApproverChanges })),
  };

  const service = new ApprovalsService(
    prisma as unknown as PrismaService,
    {} as never,
    { send: jest.fn(async () => ({ emailQueued: false })) } as never,
    { notify: jest.fn(async () => undefined) } as never,
    {
      hasPermission: async (): Promise<boolean> => false,
    } as unknown as PermissionService,
    {} as never,
    {} as never,
    moduleRef as unknown as ModuleRef,
  );

  const approveTier = jest.fn(async () => ({ id: REQUEST_ID }));
  const notifySafe = jest.fn(async () => undefined);
  (
    service as unknown as { approveTier: typeof approveTier }
  ).approveTier = approveTier;
  (
    service as unknown as { notifySafe: typeof notifySafe }
  ).notifySafe = notifySafe;
  jest.spyOn(service, 'getRequest').mockResolvedValue({
    id: REQUEST_ID,
    comments: [],
  });

  return { service, applyApproverChanges, approveTier, notifySafe, responseCreate };
}

const validDto = {
  note: 'Adjusted site hours',
  entries: [
    {
      id: 'entry-1',
      date: '2026-11-10',
      startTime: '18:00',
      endTime: '20:00',
      taskDescription: 'Pour concrete',
      reason: 'Shortened evening work',
    },
  ],
  removedEntries: [
    {
      id: 'entry-2',
      reason: 'Duplicate entry removed',
    },
  ],
};

describe('ApprovalsService.approveWithChanges', () => {
  it('applies OT changes, records APPROVE_WITH_CHANGES, approves tier, notifies employee', async () => {
    const {
      service,
      applyApproverChanges,
      approveTier,
      notifySafe,
      responseCreate,
    } = makeService();

    await service.approveWithChanges(
      REQUEST_ID,
      TIER1_ID,
      APPROVER_ID,
      COMPANY_ID,
      validDto,
    );

    expect(applyApproverChanges).toHaveBeenCalledWith(
      SHEET_ID,
      COMPANY_ID,
      APPROVER_ID,
      validDto,
    );
    expect(responseCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          responseType: RESPONSE_TYPE_APPROVE_WITH_CHANGES,
          respondedBy: APPROVER_ID,
        }),
      }),
    );
    expect(approveTier).toHaveBeenCalledWith(
      REQUEST_ID,
      TIER1_ID,
      APPROVER_ID,
      expect.any(String),
    );
    expect(notifySafe).toHaveBeenCalledWith(
      COMPANY_ID,
      APPROVER_ID,
      expect.objectContaining({
        recipientId: REQUESTER_ID,
        eventType: 'approval.approved_with_changes',
        subject: expect.stringContaining('approved with changes'),
      }),
    );
  });

  it('refuses when actor is not the assigned Reports-to approver', async () => {
    const { service, applyApproverChanges } = makeService();
    await expect(
      service.approveWithChanges(
        REQUEST_ID,
        TIER1_ID,
        HR_ID,
        COMPANY_ID,
        validDto,
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(applyApproverChanges).not.toHaveBeenCalled();
  });

  it('refuses HR Manager (tier 2) even when assigned', async () => {
    const { service, applyApproverChanges } = makeService({
      tierId: TIER2_ID,
      tierOrder: 2,
      approverId: HR_ID,
      tierResolver: 'ROLE',
      tierLabel: 'HR Manager',
    });
    await expect(
      service.approveWithChanges(
        REQUEST_ID,
        TIER2_ID,
        HR_ID,
        COMPANY_ID,
        validDto,
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(applyApproverChanges).not.toHaveBeenCalled();
  });

  it('refuses non-overtime categories', async () => {
    const { service, applyApproverChanges } = makeService({
      categoryCode: 'LEAVE_REQUEST',
      hasSheet: false,
    });
    await expect(
      service.approveWithChanges(
        REQUEST_ID,
        TIER1_ID,
        APPROVER_ID,
        COMPANY_ID,
        validDto,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(applyApproverChanges).not.toHaveBeenCalled();
  });
});

describe('ApprovalsService.addComment', () => {
  it('creates a comment for a requester who can view the request', async () => {
    const { service } = makeService();
    const prisma = (service as unknown as { prisma: { approvalComment: { create: jest.Mock } } })
      .prisma;
    await service.addComment(REQUEST_ID, COMPANY_ID, REQUESTER_ID, {
      commentText: 'Thanks for clarifying the hours.',
    });
    expect(prisma.approvalComment.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          requestId: REQUEST_ID,
          commentBy: REQUESTER_ID,
          commentText: 'Thanks for clarifying the hours.',
        }),
      }),
    );
  });
});
