import { describe, expect, it, jest } from '@jest/globals';
import {
  ApprovalRequestStatus,
  ApprovalTierDecision,
} from '@prisma/client';
import type { PrismaService } from '../../../../shared/prisma/prisma.service';
import type { PermissionService } from '../../../../shared/permissions/permission.service';
import { ApprovalsService } from './approvals.service';

const COMPANY_ID = '00000000-0000-4000-8000-000000000002';
const REQUESTER_ID = '00000000-0000-4000-8000-000000000201';
const SUPERVISOR_ID = '00000000-0000-4000-8000-000000000202';
const HR_ID = '00000000-0000-4000-8000-000000000203';
const REQUEST_ID = '00000000-0000-4000-8000-000000000401';
const TIER_1 = '00000000-0000-4000-8000-000000000501';
const TIER_2 = '00000000-0000-4000-8000-000000000502';

describe('ApprovalsService.restartChainAfterEdit', () => {
  it('restartFromFirst clears every tier and resumes at tier 1', async () => {
    const tierUpdates: Array<{ id: string; data: Record<string, unknown> }> =
      [];
    const responseCreates: Array<Record<string, unknown>> = [];
    let requestUpdate: Record<string, unknown> | null = null;

    const request = {
      id: REQUEST_ID,
      companyId: COMPANY_ID,
      requestedBy: REQUESTER_ID,
      createdBy: REQUESTER_ID,
      requestNumber: 'APR-OT-1',
      status: ApprovalRequestStatus.RETURNED,
      currentTier: 2,
      overtimeSheet: { id: 'sheet-1' },
      category: { code: 'OVERTIME_APPLICATION' },
      tiers: [
        {
          id: TIER_1,
          tierOrder: 1,
          label: 'Reports to',
          approverId: SUPERVISOR_ID,
          resolver: 'REPORTS_TO',
          decision: ApprovalTierDecision.APPROVED,
        },
        {
          id: TIER_2,
          tierOrder: 2,
          label: 'HR Manager',
          approverId: HR_ID,
          resolver: 'ROLE:HR Manager',
          decision: ApprovalTierDecision.RETURNED,
        },
      ],
    };

    const prisma = {
      approvalRequest: {
        findFirst: jest.fn(async () => request),
        update: jest.fn(async ({ data }: { data: Record<string, unknown> }) => {
          requestUpdate = data;
          return {};
        }),
      },
      approvalTier: {
        update: jest.fn(
          async ({
            where,
            data,
          }: {
            where: { id: string };
            data: Record<string, unknown>;
          }) => {
            tierUpdates.push({ id: where.id, data });
            return {};
          },
        ),
      },
      approvalResponse: {
        create: jest.fn(async ({ data }: { data: Record<string, unknown> }) => {
          responseCreates.push(data);
          return {};
        }),
      },
      overtimeSheet: {
        update: jest.fn(async () => ({})),
      },
      $transaction: jest.fn(async (fn: (tx: unknown) => Promise<unknown>) =>
        fn(prisma),
      ),
      user: {
        findMany: jest.fn(async () => []),
      },
    };

    const notificationService = {
      send: jest.fn(async () => ({ emailQueued: false })),
    };

    const service = new ApprovalsService(
      prisma as unknown as PrismaService,
      {} as never,
      notificationService as never,
      { notify: jest.fn(async () => undefined) } as never,
      {
        hasPermission: async (): Promise<boolean> => false,
      } as unknown as PermissionService,
      {} as never,
      {} as never,
    );

    await service.restartChainAfterEdit(
      REQUEST_ID,
      COMPANY_ID,
      REQUESTER_ID,
      'Resubmitted with changes – restarted from first approver',
      { restartFromFirst: true },
    );

    expect(tierUpdates.map((row) => row.id).sort()).toEqual(
      [TIER_1, TIER_2].sort(),
    );
    expect(requestUpdate).toMatchObject({
      status: ApprovalRequestStatus.SUBMITTED,
      currentTier: 1,
    });
    expect(responseCreates[0]?.note).toBe(
      'Resubmitted with changes – restarted from first approver',
    );
    expect(notificationService.send).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        recipientId: SUPERVISOR_ID,
        eventType: 'approval.pending',
      }),
    );
  });

  it('without restartFromFirst resumes at the returned tier only', async () => {
    const tierUpdates: Array<{ id: string }> = [];
    let requestUpdate: Record<string, unknown> | null = null;

    const request = {
      id: REQUEST_ID,
      companyId: COMPANY_ID,
      requestedBy: REQUESTER_ID,
      createdBy: REQUESTER_ID,
      requestNumber: 'APR-OT-2',
      status: ApprovalRequestStatus.RETURNED,
      currentTier: 2,
      overtimeSheet: { id: 'sheet-2' },
      category: { code: 'OVERTIME_APPLICATION' },
      tiers: [
        {
          id: TIER_1,
          tierOrder: 1,
          label: 'Reports to',
          approverId: SUPERVISOR_ID,
          resolver: 'REPORTS_TO',
          decision: ApprovalTierDecision.APPROVED,
        },
        {
          id: TIER_2,
          tierOrder: 2,
          label: 'HR Manager',
          approverId: HR_ID,
          resolver: 'ROLE:HR Manager',
          decision: ApprovalTierDecision.RETURNED,
        },
      ],
    };

    const prisma = {
      approvalRequest: {
        findFirst: jest.fn(async () => request),
        update: jest.fn(async ({ data }: { data: Record<string, unknown> }) => {
          requestUpdate = data;
          return {};
        }),
      },
      approvalTier: {
        update: jest.fn(async ({ where }: { where: { id: string } }) => {
          tierUpdates.push({ id: where.id });
          return {};
        }),
      },
      approvalResponse: {
        create: jest.fn(async () => ({})),
      },
      overtimeSheet: {
        update: jest.fn(async () => ({})),
      },
      $transaction: jest.fn(async (fn: (tx: unknown) => Promise<unknown>) =>
        fn(prisma),
      ),
      user: {
        findMany: jest.fn(async () => []),
      },
    };

    const notificationService = {
      send: jest.fn(async () => ({ emailQueued: false })),
    };

    const service = new ApprovalsService(
      prisma as unknown as PrismaService,
      {} as never,
      notificationService as never,
      { notify: jest.fn(async () => undefined) } as never,
      {
        hasPermission: async (): Promise<boolean> => false,
      } as unknown as PermissionService,
      {} as never,
      {} as never,
    );

    await service.restartChainAfterEdit(
      REQUEST_ID,
      COMPANY_ID,
      REQUESTER_ID,
      'Request edited and resubmitted after return',
    );

    expect(tierUpdates.map((row) => row.id)).toEqual([TIER_2]);
    expect(requestUpdate).toMatchObject({
      status: ApprovalRequestStatus.SUBMITTED,
      currentTier: 2,
    });
    expect(notificationService.send).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        recipientId: HR_ID,
        eventType: 'approval.pending',
      }),
    );
  });
});
