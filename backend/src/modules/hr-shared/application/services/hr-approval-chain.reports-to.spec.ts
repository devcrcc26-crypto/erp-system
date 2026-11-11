import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { BadRequestException } from '@nestjs/common';
import { HrApprovalChainService } from './hr-approval-chain.service';
import type { PrismaService } from '../../../../shared/prisma/prisma.service';

const COMPANY_ID = '00000000-0000-4000-8000-000000000002';
const EMP_ID = '00000000-0000-4000-8000-000000000102';
const SUPERVISOR_ID = '00000000-0000-4000-8000-000000000101';
const HR_MANAGER_ID = '00000000-0000-4000-8000-000000000103';

describe('getReportsToRequired', () => {
  let service: HrApprovalChainService;
  let prisma: {
    user: { findFirst: jest.Mock<() => Promise<unknown>> };
  };

  beforeEach(() => {
    prisma = {
      user: {
        findFirst: jest.fn<() => Promise<unknown>>(),
      },
    };
    service = new HrApprovalChainService(prisma as unknown as PrismaService);
  });

  it('returns the supervisor id when Reports to is set and active', async () => {
    prisma.user.findFirst.mockResolvedValue({
      id: EMP_ID,
      reportsToUserId: SUPERVISOR_ID,
      reportsTo: {
        id: SUPERVISOR_ID,
        deletedAt: null,
        isActive: true,
        employmentStatus: 'ACTIVE',
      },
    });

    await expect(
      service.getReportsToRequired(EMP_ID, COMPANY_ID),
    ).resolves.toEqual({ id: SUPERVISOR_ID });
  });

  it('blocks when Reports to is unset', async () => {
    prisma.user.findFirst.mockResolvedValue({
      id: EMP_ID,
      reportsToUserId: null,
      reportsTo: null,
    });

    await expect(
      service.getReportsToRequired(EMP_ID, COMPANY_ID),
    ).rejects.toThrow(/no Reports to assigned/);
  });

  it('blocks when Reports to is vacant', async () => {
    prisma.user.findFirst.mockResolvedValue({
      id: EMP_ID,
      reportsToUserId: SUPERVISOR_ID,
      reportsTo: {
        id: SUPERVISOR_ID,
        deletedAt: null,
        isActive: false,
        employmentStatus: 'ACTIVE',
      },
    });

    await expect(
      service.getReportsToRequired(EMP_ID, COMPANY_ID),
    ).rejects.toThrow(/Approver position vacant: Reports to/);
  });
});

describe('buildOrgApprovalChain Reports to', () => {
  let service: HrApprovalChainService;
  let prisma: {
    user: { findFirst: jest.Mock<() => Promise<unknown>> };
  };

  beforeEach(() => {
    prisma = {
      user: {
        findFirst: jest.fn<() => Promise<unknown>>(),
      },
    };
    service = new HrApprovalChainService(prisma as unknown as PrismaService);
  });

  it('standard employee → Reports to → HR Manager', async () => {
    prisma.user.findFirst.mockResolvedValue({
      id: EMP_ID,
      ledDisciplines: [],
    });
    jest.spyOn(service, 'getPrimaryRoleName').mockResolvedValue('Employee');
    jest
      .spyOn(service, 'getReportsToRequired')
      .mockResolvedValue({ id: SUPERVISOR_ID });
    jest.spyOn(service, 'getHRManager').mockResolvedValue({ id: HR_MANAGER_ID });

    const chain = await service.buildOrgApprovalChain(EMP_ID, COMPANY_ID, false);

    expect(chain).toEqual([
      {
        tierOrder: 1,
        label: 'Reports to',
        approverId: SUPERVISOR_ID,
        resolver: 'REPORTS_TO',
      },
      {
        tierOrder: 2,
        label: 'HR Manager',
        approverId: HR_MANAGER_ID,
        resolver: 'ROLE:HR Manager',
      },
    ]);
  });

  it('standard employee with no Reports to → BadRequestException', async () => {
    prisma.user.findFirst.mockResolvedValue({
      id: EMP_ID,
      ledDisciplines: [],
    });
    jest.spyOn(service, 'getPrimaryRoleName').mockResolvedValue('Employee');
    jest.spyOn(service, 'getReportsToRequired').mockRejectedValue(
      new BadRequestException(
        'Employee has no Reports to assigned - ask HR to set a supervisor before submitting.',
      ),
    );

    await expect(
      service.buildOrgApprovalChain(EMP_ID, COMPANY_ID, false),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
