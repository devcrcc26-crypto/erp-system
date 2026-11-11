import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { PerDiemStatus, Prisma } from '@prisma/client';
import type { PrismaService } from '../../../../shared/prisma/prisma.service';
import type { PermissionService } from '../../../../shared/permissions/permission.service';
import type { ApprovalDecisionRegistry } from '../../../approvals/application/services/approval-decision-registry.service';
import type { CreatePerDiemDisbursementDto } from '../dtos/per-diem.dtos';
import { PerDiemService } from './per-diem.service';

const COMPANY_ID = '00000000-0000-4000-8000-000000000002';
const EMPLOYEE_ID = '00000000-0000-4000-8000-000000000201';
const APPROVER_ID = '00000000-0000-4000-8000-000000000202';
const REQUEST_ID = '00000000-0000-4000-8000-000000000301';
const APPROVAL_ID = '00000000-0000-4000-8000-000000000401';

type UpdateArgs = { data: Record<string, unknown> };

describe('PerDiemService - approved rate and approved total', () => {
  let service: PerDiemService;
  let findFirst: jest.Mock<() => Promise<unknown>>;
  let update: jest.Mock<(args: UpdateArgs) => Promise<unknown>>;
  let createDisbursement: jest.Mock<() => Promise<unknown>>;
  let canManage: boolean;

  beforeEach(() => {
    canManage = false;
    findFirst = jest.fn<() => Promise<unknown>>();
    update = jest.fn<(args: UpdateArgs) => Promise<unknown>>();
    createDisbursement = jest.fn<() => Promise<unknown>>();
    const prisma = {
      perDiemRequest: { findFirst, update },
      perDiemDisbursement: { create: createDisbursement },
      approvalRequest: {
        findFirst: async () => ({ formData: { days: 5 } }),
        update: jest.fn(),
      },
      $transaction: async (fn: (tx: unknown) => Promise<unknown>) => fn(prisma),
    };
    service = new PerDiemService(
      prisma as unknown as PrismaService,
      {} as never,
      {} as never,
      {} as never,
      { register: jest.fn(), unregister: jest.fn() } as unknown as ApprovalDecisionRegistry,
      { hasPermission: async () => canManage } as unknown as PermissionService,
      {} as never,
      {} as never,
    );
    jest.spyOn(service, 'getRequest').mockResolvedValue({ id: REQUEST_ID });
  });

  function pending(): Record<string, unknown> {
    return {
      id: REQUEST_ID,
      employeeId: EMPLOYEE_ID,
      status: PerDiemStatus.SUBMITTED,
      days: 5,
      dailyRate: new Prisma.Decimal(500),
      updatedBy: EMPLOYEE_ID,
      approvalRequestId: APPROVAL_ID,
      approvalRequest: {
        currentTier: 1,
        tiers: [{ tierOrder: 1, approverId: APPROVER_ID, decision: 'PENDING' }],
      },
    };
  }

  it('stores approved rate × days as the approved total', async () => {
    findFirst.mockResolvedValue(pending());
    await service.setApprovedRate(REQUEST_ID, 600, COMPANY_ID, APPROVER_ID);

    const data = update.mock.calls[0][0].data;
    expect(Number(data.approvedDailyRate)).toBe(600);
    expect(Number(data.totalAmountEtb)).toBe(3000);
    expect(Number(data.totalAmount)).toBe(3000);
  });

  it('does not let the employee set the rate on their own request', async () => {
    findFirst.mockResolvedValue(pending());
    await expect(
      service.setApprovedRate(REQUEST_ID, 900, COMPANY_ID, EMPLOYEE_ID),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(update).not.toHaveBeenCalled();
  });

  it('refuses to change the rate once the request is approved', async () => {
    findFirst.mockResolvedValue({ ...pending(), status: PerDiemStatus.APPROVED });
    await expect(
      service.setApprovedRate(REQUEST_ID, 600, COMPANY_ID, APPROVER_ID),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('refuses a disbursement above the remaining approved total', async () => {
    canManage = true; // HR / finance may disburse
    findFirst.mockResolvedValue({
      ...pending(),
      status: PerDiemStatus.ACTIVE,
      approvedDailyRate: new Prisma.Decimal(600),
      disbursements: [{ amount: new Prisma.Decimal(2400) }],
    });
    jest
      .spyOn(
        service as unknown as { assertCanDisburse: () => Promise<void> },
        'assertCanDisburse',
      )
      .mockResolvedValue(undefined);

    // 2 days × 600 = 1,200 but only 3,000 − 2,400 = 600 remains.
    await expect(
      service.addDisbursement(
        REQUEST_ID,
        {
          disbursedAt: '2026-10-25',
          coveredDaysFrom: '2026-10-25',
          coveredDaysTo: '2026-10-26',
        } as CreatePerDiemDisbursementDto,
        COMPANY_ID,
        APPROVER_ID,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(createDisbursement).not.toHaveBeenCalled();
  });
});
