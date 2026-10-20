import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { ForbiddenException } from '@nestjs/common';
import { PerDiemStatus } from '@prisma/client';
import type { PrismaService } from '../../../../shared/prisma/prisma.service';
import type { PermissionService } from '../../../../shared/permissions/permission.service';
import type { ApprovalsService } from '../../../approvals/application/services/approvals.service';
import type { ApprovalDecisionRegistry } from '../../../approvals/application/services/approval-decision-registry.service';
import type { HrApprovalChainService } from '../../../hr-shared/application/services/hr-approval-chain.service';
import type { OnBehalfService } from '../../../on-behalf/on-behalf.service';
import type { EmployeePerDiemRateService } from './employee-per-diem-rate.service';
import { PerDiemService } from './per-diem.service';

const COMPANY_ID = '00000000-0000-4000-8000-000000000002';
const EMPLOYEE_ID = '00000000-0000-4000-8000-000000000201';
const SUBMITTER_ID = '00000000-0000-4000-8000-000000000202';
const OTHER_ID = '00000000-0000-4000-8000-000000000203';
const REQUEST_ID = '00000000-0000-4000-8000-000000000301';

describe('PerDiemService.cancelRequest on-behalf', () => {
  let service: PerDiemService;
  let prisma: {
    perDiemRequest: {
      findFirst: jest.Mock<() => Promise<unknown>>;
      update: jest.Mock<() => Promise<unknown>>;
    };
    approvalRequest: {
      update: jest.Mock<() => Promise<unknown>>;
    };
    $transaction: jest.Mock<(fn: (tx: unknown) => Promise<unknown>) => Promise<unknown>>;
  };

  beforeEach(() => {
    prisma = {
      perDiemRequest: {
        findFirst: jest.fn<() => Promise<unknown>>(),
        update: jest.fn<() => Promise<unknown>>(),
      },
      approvalRequest: {
        update: jest.fn<() => Promise<unknown>>(),
      },
      $transaction: jest.fn(async (fn) => fn(prisma)),
    };

    service = new PerDiemService(
      prisma as unknown as PrismaService,
      {} as ApprovalsService,
      {} as HrApprovalChainService,
      {} as OnBehalfService,
      {
        register: jest.fn(),
        unregister: jest.fn(),
      } as unknown as ApprovalDecisionRegistry,
      {
        hasPermission: jest.fn(),
      } as unknown as PermissionService,
      {} as EmployeePerDiemRateService,
      {
        upload: jest.fn(),
        getPresignedDownloadUrl: jest.fn(),
      } as unknown as import('../../../../shared/storage/storage.interface').IStorageService,
    );

    jest.spyOn(service, 'getRequest').mockResolvedValue({ id: REQUEST_ID });
  });

  it('allows the on-behalf submitter to cancel', async () => {
    prisma.perDiemRequest.findFirst.mockResolvedValue({
      id: REQUEST_ID,
      companyId: COMPANY_ID,
      employeeId: EMPLOYEE_ID,
      createdBy: SUBMITTER_ID,
      status: PerDiemStatus.SUBMITTED,
      settlementId: null,
      approvalRequestId: null,
    });

    await expect(
      service.cancelRequest(REQUEST_ID, COMPANY_ID, SUBMITTER_ID),
    ).resolves.toEqual({ id: REQUEST_ID });
  });

  it('rejects cancel from an unrelated user', async () => {
    prisma.perDiemRequest.findFirst.mockResolvedValue({
      id: REQUEST_ID,
      companyId: COMPANY_ID,
      employeeId: EMPLOYEE_ID,
      createdBy: SUBMITTER_ID,
      status: PerDiemStatus.SUBMITTED,
      settlementId: null,
      approvalRequestId: null,
    });

    await expect(
      service.cancelRequest(REQUEST_ID, COMPANY_ID, OTHER_ID),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
});
