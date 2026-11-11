import { describe, expect, it, jest } from '@jest/globals';
import { ForbiddenException } from '@nestjs/common';
import { ApprovalRequestStatus, ApprovalTierDecision } from '@prisma/client';
import {
  APPROVE_ON_BEHALF_OWN_REQUEST_MESSAGE,
  APPROVE_ON_BEHALF_OWN_SUBMISSION_MESSAGE,
  APPROVE_ON_BEHALF_ROLE_MESSAGE,
  ApprovalsService,
} from './approvals.service';

const COMPANY = 'company-1';
const REQUEST = 'request-1';
const TIER_1 = 'tier-1';
const ASSIGNED = 'assigned-approver';
const GM = 'gm-1';
const SUBJECT = 'subject-employee';
const FILER = 'filing-delegate';
const PLAIN = 'plain-user';

const PRIMARY_ROLE: Record<string, string> = {
  [GM]: 'General Manager',
  [ASSIGNED]: 'Discipline Lead',
  [PLAIN]: 'Site Engineer',
  [SUBJECT]: 'HR Manager',
  [FILER]: 'HR Officer',
};

function setup(request?: { requestedBy?: string; createdBy?: string }) {
  const tierUpdates: Array<Record<string, unknown>> = [];
  const tiers = [
    {
      id: TIER_1,
      tierOrder: 1,
      label: 'Reports to',
      approverId: ASSIGNED,
      decision: ApprovalTierDecision.PENDING,
      conditions: [],
    },
    {
      id: 'tier-2',
      tierOrder: 2,
      label: 'HR Manager',
      approverId: 'hr-manager-1',
      decision: ApprovalTierDecision.PENDING,
      conditions: [],
    },
  ];
  const prisma = {
    approvalTier: {
      findFirst: jest.fn(async () => ({
        ...tiers[0],
        comment: null,
        decidedAt: null,
        request: {
          id: REQUEST,
          companyId: COMPANY,
          status: ApprovalRequestStatus.PENDING,
          currentTier: 1,
          requestedBy: request?.requestedBy ?? SUBJECT,
          createdBy: request?.createdBy ?? SUBJECT,
          requestNumber: 'AR-0001',
          deletedAt: null,
        },
      })),
      update: jest.fn(async (args: { data: Record<string, unknown> }) => {
        tierUpdates.push(args.data);
        tiers[0] = { ...tiers[0], ...(args.data as object) };
        return {};
      }),
      findMany: jest.fn(async () => tiers),
    },
    approvalRequest: {
      findFirst: jest.fn(async () => ({ id: REQUEST })),
      update: jest.fn(async () => ({})),
    },
    userRole: {
      findFirst: jest.fn(async (args: { where: { userId: string } }) => {
        const name = PRIMARY_ROLE[args.where.userId];
        return name ? { role: { name } } : null;
      }),
    },
    fieldMovementLog: { findFirst: jest.fn(async () => null) },
    user: {
      findMany: jest.fn(async () => [
        { id: GM, firstName: 'Gena', middleName: null, lastName: 'Manager' },
        { id: ASSIGNED, firstName: 'Asha', middleName: null, lastName: 'Approver' },
      ]),
    },
    $transaction: jest.fn(async (fn: (tx: unknown) => Promise<unknown>) => fn(prisma)),
  };
  const notifications = { send: jest.fn(async () => undefined) };
  const audit = {
    create: jest.fn(async () => undefined),
    buildFromRequestContext: (input: unknown) => input,
  };
  const service = new ApprovalsService(
    prisma as never,
    {} as never,
    notifications as never,
    { notify: jest.fn(async () => undefined) } as never,
    {} as never,
    {} as never,
    {} as never,
    audit as never,
  );
  jest.spyOn(service, 'getRequest').mockResolvedValue({});
  return { service, prisma, notifications, audit, tierUpdates };
}

describe('ApprovalsService - approve on behalf', () => {
  it('a full-access role approves for the assigned approver; both ids are recorded', async () => {
    const t = setup();
    await t.service.approveTier(REQUEST, TIER_1, GM, 'Approving while they are away', {
      onBehalf: true,
    });

    expect(t.tierUpdates[0]).toMatchObject({
      decision: ApprovalTierDecision.APPROVED,
      actingApproverId: GM,
      onBehalfOfApproverId: ASSIGNED,
    });
  });

  it('notifies the assigned approver and writes the audit entry', async () => {
    const t = setup();
    await t.service.approveTier(REQUEST, TIER_1, GM, undefined, { onBehalf: true });

    expect(t.notifications.send).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        recipientId: ASSIGNED,
        eventType: 'approval.approved_on_behalf',
        body: expect.stringContaining('Gena Manager approved the "Reports to" tier'),
      }),
    );
    expect(t.audit.create).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'approve_on_behalf',
        userId: GM,
        afterValue: expect.objectContaining({
          actingApproverName: 'Gena Manager',
          onBehalfOfApproverName: 'Asha Approver',
        }),
      }),
    );
  });

  it('the assigned approver approving normally records no on-behalf fields', async () => {
    const t = setup();
    await t.service.approveTier(REQUEST, TIER_1, ASSIGNED);

    expect(t.tierUpdates[0]).not.toHaveProperty('actingApproverId');
    expect(t.notifications.send).not.toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ eventType: 'approval.approved_on_behalf' }),
    );
  });

  it('guard: no approving on behalf on a request you submitted or filed', async () => {
    const t = setup({ createdBy: GM });
    await expect(
      t.service.approveTier(REQUEST, TIER_1, GM, undefined, { onBehalf: true }),
    ).rejects.toThrow(new ForbiddenException(APPROVE_ON_BEHALF_OWN_SUBMISSION_MESSAGE));
    expect(t.tierUpdates).toHaveLength(0);
  });

  it('guard: no approving on behalf on your own request (you are the subject)', async () => {
    const t = setup({ requestedBy: GM, createdBy: FILER });
    await expect(
      t.service.approveTier(REQUEST, TIER_1, GM, undefined, { onBehalf: true }),
    ).rejects.toThrow(new ForbiddenException(APPROVE_ON_BEHALF_OWN_REQUEST_MESSAGE));
    expect(t.tierUpdates).toHaveLength(0);
  });

  it('only full-access roles may approve on behalf', async () => {
    const t = setup();
    await expect(
      t.service.approveTier(REQUEST, TIER_1, PLAIN, undefined, { onBehalf: true }),
    ).rejects.toThrow(new ForbiddenException(APPROVE_ON_BEHALF_ROLE_MESSAGE));
  });

  it('without the onBehalf flag only the assigned approver may act', async () => {
    const t = setup();
    await expect(t.service.approveTier(REQUEST, TIER_1, GM)).rejects.toThrow(
      'Only the assigned approver can act on this tier',
    );
  });
});

describe('ApprovalsService - return on behalf', () => {
  it('a full-access role returns for the assigned approver; ids, notification and audit recorded', async () => {
    const t = setup();
    await t.service.returnTier(REQUEST, TIER_1, GM, 'Missing site address', { onBehalf: true });

    expect(t.tierUpdates[0]).toMatchObject({
      decision: ApprovalTierDecision.RETURNED,
      actingApproverId: GM,
      onBehalfOfApproverId: ASSIGNED,
    });
    expect(t.notifications.send).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        recipientId: ASSIGNED,
        eventType: 'approval.returned_on_behalf',
        body: expect.stringContaining('Gena Manager returned the "Reports to" tier'),
      }),
    );
    // The requester still gets the normal returned notice.
    expect(t.notifications.send).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ recipientId: SUBJECT, eventType: 'approval.returned' }),
    );
    expect(t.audit.create).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'return_on_behalf', userId: GM }),
    );
  });

  it('guard: no returning on behalf on a request you submitted or filed', async () => {
    const t = setup({ createdBy: GM });
    await expect(
      t.service.returnTier(REQUEST, TIER_1, GM, undefined, { onBehalf: true }),
    ).rejects.toThrow(new ForbiddenException(APPROVE_ON_BEHALF_OWN_SUBMISSION_MESSAGE));
    expect(t.tierUpdates).toHaveLength(0);
  });

  it('guard: no returning on behalf on your own request', async () => {
    const t = setup({ requestedBy: GM, createdBy: FILER });
    await expect(
      t.service.returnTier(REQUEST, TIER_1, GM, undefined, { onBehalf: true }),
    ).rejects.toThrow(new ForbiddenException(APPROVE_ON_BEHALF_OWN_REQUEST_MESSAGE));
    expect(t.tierUpdates).toHaveLength(0);
  });

  it('only full-access roles may return on behalf', async () => {
    const t = setup();
    await expect(
      t.service.returnTier(REQUEST, TIER_1, PLAIN, undefined, { onBehalf: true }),
    ).rejects.toThrow(new ForbiddenException(APPROVE_ON_BEHALF_ROLE_MESSAGE));
  });

  it('the assigned approver returning normally records no on-behalf fields', async () => {
    const t = setup();
    await t.service.returnTier(REQUEST, TIER_1, ASSIGNED, 'Fix dates');
    expect(t.tierUpdates[0]).not.toHaveProperty('actingApproverId');
    expect(t.audit.create).not.toHaveBeenCalled();
  });
});

describe('ApprovalsService - reject stays with the assigned approver', () => {
  it('a full-access role cannot reject on behalf', async () => {
    const t = setup();
    await expect(t.service.rejectTier(REQUEST, TIER_1, GM, 'No')).rejects.toThrow(
      'Only the assigned approver can act on this tier',
    );
    expect(t.tierUpdates).toHaveLength(0);
  });
});
