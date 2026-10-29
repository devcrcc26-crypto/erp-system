import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { ForbiddenException } from '@nestjs/common';
import { PerDiemStatus, PerDiemTripType } from '@prisma/client';
import type { PrismaService } from '../../../../shared/prisma/prisma.service';
import type { PermissionService } from '../../../../shared/permissions/permission.service';
import type { ApprovalsService } from '../../../approvals/application/services/approvals.service';
import type { ApprovalDecisionRegistry } from '../../../approvals/application/services/approval-decision-registry.service';
import type { HrApprovalChainService } from '../../../hr-shared/application/services/hr-approval-chain.service';
import type { OnBehalfService } from '../../../on-behalf/on-behalf.service';
import type { UpdatePerDiemRequestDto } from '../dtos/per-diem.dtos';
import type { EmployeePerDiemRateService } from './employee-per-diem-rate.service';
import { PerDiemService } from './per-diem.service';

const COMPANY_ID = '00000000-0000-4000-8000-000000000002';
const EMPLOYEE_ID = '00000000-0000-4000-8000-000000000201';
const OTHER_ID = '00000000-0000-4000-8000-000000000203';
const REQUEST_ID = '00000000-0000-4000-8000-000000000301';
const APPROVAL_ID = '00000000-0000-4000-8000-000000000401';

const DTO: UpdatePerDiemRequestDto = {
  tripType: PerDiemTripType.TRAVEL,
  destinationCategory: 'Domestic',
  destination: 'Adama',
  startDate: '2026-11-02',
  endDate: '2026-11-04',
  days: 3,
};

function record(status: PerDiemStatus, employeeId = EMPLOYEE_ID) {
  return {
    id: REQUEST_ID,
    companyId: COMPANY_ID,
    employeeId,
    createdBy: employeeId,
    status,
    settlementId: null,
    approvalRequestId: APPROVAL_ID,
  };
}

describe('PerDiemService.updateRequest', () => {
  let service: PerDiemService;
  let resubmitRequest: jest.Mock<() => Promise<unknown>>;
  let prisma: {
    perDiemRequest: {
      findFirst: jest.Mock<() => Promise<unknown>>;
      update: jest.Mock<(args: { data: Record<string, unknown> }) => Promise<unknown>>;
    };
    approvalRequest: { update: jest.Mock<() => Promise<unknown>> };
    $transaction: jest.Mock<(fn: (tx: unknown) => Promise<unknown>) => Promise<unknown>>;
  };

  beforeEach(() => {
    prisma = {
      perDiemRequest: {
        findFirst: jest.fn<() => Promise<unknown>>(),
        update: jest.fn<(args: { data: Record<string, unknown> }) => Promise<unknown>>(),
      },
      approvalRequest: { update: jest.fn<() => Promise<unknown>>() },
      $transaction: jest.fn(async (fn) => fn(prisma)),
    };
    resubmitRequest = jest.fn<() => Promise<unknown>>();

    service = new PerDiemService(
      prisma as unknown as PrismaService,
      { resubmitRequest } as unknown as ApprovalsService,
      {} as HrApprovalChainService,
      {} as OnBehalfService,
      {
        register: jest.fn(),
        unregister: jest.fn(),
      } as unknown as ApprovalDecisionRegistry,
      { hasPermission: jest.fn() } as unknown as PermissionService,
      {} as EmployeePerDiemRateService,
      {} as unknown as import('../../../../shared/storage/storage.interface').IStorageService,
    );

    jest.spyOn(service, 'getRequest').mockResolvedValue({ id: REQUEST_ID });
    jest
      .spyOn(
        service as unknown as { resolveSubmission: () => Promise<unknown> },
        'resolveSubmission',
      )
      .mockResolvedValue({
        startDate: new Date('2026-11-02'),
        endDate: new Date('2026-11-04'),
        days: 3,
        totalDays: 3,
        tripType: PerDiemTripType.TRAVEL,
        destinationCategory: 'Domestic',
        resolvedRate: { employeePerDiemRateId: 'rate-1', dailyRate: 500 },
        siteAssignmentId: null,
        dailyRate: 500,
        totalAmount: 1500,
        exchangeRate: 1,
        totalAmountEtb: 1500,
      });
  });

  it("rejects editing another employee's request with 403", async () => {
    prisma.perDiemRequest.findFirst.mockResolvedValue(
      record(PerDiemStatus.DRAFT, OTHER_ID),
    );
    await expect(
      service.updateRequest(REQUEST_ID, DTO, COMPANY_ID, EMPLOYEE_ID),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.perDiemRequest.update).not.toHaveBeenCalled();
  });

  it.each([
    PerDiemStatus.SUBMITTED,
    PerDiemStatus.IN_REVIEW,
    PerDiemStatus.APPROVED,
    PerDiemStatus.ACTIVE,
    PerDiemStatus.SETTLED,
  ])('rejects editing a %s request with 403', async (status) => {
    prisma.perDiemRequest.findFirst.mockResolvedValue(record(status));
    await expect(
      service.updateRequest(REQUEST_ID, DTO, COMPANY_ID, EMPLOYEE_ID),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.perDiemRequest.update).not.toHaveBeenCalled();
  });

  it('saves a DRAFT without changing status or resubmitting', async () => {
    prisma.perDiemRequest.findFirst.mockResolvedValue(
      record(PerDiemStatus.DRAFT),
    );
    await service.updateRequest(REQUEST_ID, DTO, COMPANY_ID, EMPLOYEE_ID);

    const data = prisma.perDiemRequest.update.mock.calls[0][0].data;
    expect(data).not.toHaveProperty('status');
    expect(data.destination).toBe('Adama');
    expect(resubmitRequest).not.toHaveBeenCalled();
  });

  it('saves a RETURNED request without resubmitting (Resubmit is separate)', async () => {
    prisma.perDiemRequest.findFirst.mockResolvedValue(
      record(PerDiemStatus.RETURNED),
    );
    await service.updateRequest(REQUEST_ID, DTO, COMPANY_ID, EMPLOYEE_ID);

    const data = prisma.perDiemRequest.update.mock.calls[0][0].data;
    expect(data).not.toHaveProperty('status');
    // The approval card mirrors the edit, but the chain is not restarted.
    expect(prisma.approvalRequest.update).toHaveBeenCalled();
    expect(resubmitRequest).not.toHaveBeenCalled();
  });
});
