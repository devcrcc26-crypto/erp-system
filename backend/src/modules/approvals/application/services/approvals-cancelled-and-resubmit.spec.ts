import { describe, expect, it, jest } from '@jest/globals';
import { ForbiddenException } from '@nestjs/common';
import { ApprovalRequestStatus } from '@prisma/client';
import type { PrismaService } from '../../../../shared/prisma/prisma.service';
import type { PermissionService } from '../../../../shared/permissions/permission.service';
import { ApprovalsService } from './approvals.service';

const COMPANY_ID = '00000000-0000-4000-8000-000000000002';
const REQUESTER_ID = '00000000-0000-4000-8000-000000000201';
const APPROVER_ID = '00000000-0000-4000-8000-000000000202';
const REQUEST_ID = '00000000-0000-4000-8000-000000000401';

function makeService(
  request: Record<string, unknown>,
  fullAccess = false,
): ApprovalsService {
  const prisma = {
    approvalRequest: {
      findFirst: jest.fn(async () => request),
    },
  };
  const permissionService = {
    hasPermission: async (): Promise<boolean> => fullAccess,
  };
  return new ApprovalsService(
    prisma as unknown as PrismaService,
    {} as never,
    {} as never,
    {} as never,
    permissionService as unknown as PermissionService,
    {} as never,
    {} as never,
  );
}

function approval(status: ApprovalRequestStatus): Record<string, unknown> {
  return {
    id: REQUEST_ID,
    companyId: COMPANY_ID,
    requestedBy: REQUESTER_ID,
    createdBy: REQUESTER_ID,
    status,
    currentTier: 1,
    tiers: [{ id: 't1', tierOrder: 1, approverId: APPROVER_ID }],
  };
}

describe('ApprovalsService - cancelled requests', () => {
  it('hides a cancelled request from an approver on the chain', async () => {
    const service = makeService(approval(ApprovalRequestStatus.CANCELLED));
    await expect(
      service.getRequest(REQUEST_ID, COMPANY_ID, APPROVER_ID),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
});

describe('ApprovalsService.resubmitRequest', () => {
  it.each([
    ApprovalRequestStatus.SUBMITTED,
    ApprovalRequestStatus.APPROVED,
    ApprovalRequestStatus.CANCELLED,
  ])('rejects resubmitting a %s request with 403', async (status) => {
    const service = makeService(approval(status));
    await expect(
      service.resubmitRequest(REQUEST_ID, COMPANY_ID, REQUESTER_ID, 'note', []),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('rejects resubmit by someone other than the requester', async () => {
    const service = makeService(approval(ApprovalRequestStatus.RETURNED));
    await expect(
      service.resubmitRequest(REQUEST_ID, COMPANY_ID, APPROVER_ID, undefined, []),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
});
