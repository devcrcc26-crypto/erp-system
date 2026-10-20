import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { BadRequestException } from '@nestjs/common';
import { PerDiemStatus } from '@prisma/client';
import type { PrismaService } from '../../../../shared/prisma/prisma.service';
import type { ApprovalsService } from '../../../approvals/application/services/approvals.service';
import type { ApprovalDecisionRegistry } from '../../../approvals/application/services/approval-decision-registry.service';
import type { HrApprovalChainService } from '../../../hr-shared/application/services/hr-approval-chain.service';
import type { EmployeePerDiemRateService } from './employee-per-diem-rate.service';
import { PerDiemSettlementService } from './per-diem-settlement.service';

const COMPANY_ID = '00000000-0000-4000-8000-000000000002';
const USER_ID = '00000000-0000-4000-8000-000000000201';
const UNPAID_ID = '00000000-0000-4000-8000-000000000301';
const PAID_ID = '00000000-0000-4000-8000-000000000302';

describe('PerDiemSettlementService advance payment gate', () => {
  let service: PerDiemSettlementService;
  let prisma: {
    perDiemRequest: {
      findMany: jest.Mock<() => Promise<unknown[]>>;
    };
  };

  beforeEach(() => {
    prisma = {
      perDiemRequest: {
        findMany: jest.fn<() => Promise<unknown[]>>(),
      },
    };
    service = new PerDiemSettlementService(
      prisma as unknown as PrismaService,
      {} as ApprovalsService,
      {} as HrApprovalChainService,
      {
        register: jest.fn(),
        unregister: jest.fn(),
      } as unknown as ApprovalDecisionRegistry,
      {
        hasPermission: jest.fn(),
      } as unknown as import('../../../../shared/permissions/permission.service').PermissionService,
      {
        resolveActiveRateForCategory: jest.fn(),
      } as unknown as EmployeePerDiemRateService,
    );
  });

  it('listUnsettledAdvances returns disbursement counts for payment UI', async () => {
    prisma.perDiemRequest.findMany.mockResolvedValue([
      {
        id: UNPAID_ID,
        _count: { disbursements: 0 },
        status: PerDiemStatus.APPROVED,
      },
      {
        id: PAID_ID,
        _count: { disbursements: 1 },
        status: PerDiemStatus.ACTIVE,
      },
    ]);

    const rows = (await service.listUnsettledAdvances(
      COMPANY_ID,
      USER_ID,
    )) as Array<{ id: string; _count: { disbursements: number } }>;

    expect(rows).toHaveLength(2);
    expect(rows.find((row) => row.id === UNPAID_ID)?._count.disbursements).toBe(
      0,
    );
    expect(rows.find((row) => row.id === PAID_ID)?._count.disbursements).toBe(1);
  });

  it('submitSettlement rejects advances without disbursements', async () => {
    prisma.perDiemRequest.findMany.mockResolvedValue([]);

    await expect(
      service.submitSettlement(
        {
          destination: 'Adama',
          actualDepartureDate: '2026-09-01',
          actualDepartureTime: '08:00',
          actualReturnDate: '2026-09-05',
          actualReturnTime: '18:00',
          actualDays: 5,
          advanceIds: [UNPAID_ID],
        },
        COMPANY_ID,
        USER_ID,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(prisma.perDiemRequest.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          disbursements: { some: {} },
        }),
      }),
    );
  });
});
