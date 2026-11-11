import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { BadRequestException } from '@nestjs/common';
import { HrApprovalChainService } from './hr-approval-chain.service';
import type { PrismaService } from '../../../../shared/prisma/prisma.service';

const COMPANY_ID = '00000000-0000-4000-8000-000000000002';
const SUPERVISOR_ID = '00000000-0000-4000-8000-000000000101';
const ARCH_EMP_ID = '00000000-0000-4000-8000-000000000102';
const HR_MANAGER_ID = '00000000-0000-4000-8000-000000000103';
const LOCAL_HR_ID = '00000000-0000-4000-8000-000000000105';
const GM_ID = '00000000-0000-4000-8000-000000000106';

describe('buildDisciplineLeadSingleTierChain (per diem advance)', () => {
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

  function mockEmployee(
    employeeId: string,
    ledDisciplines: Array<{ id: string }> = [],
  ): void {
    prisma.user.findFirst.mockResolvedValue({
      id: employeeId,
      ledDisciplines,
    });
  }

  it('Architecture employee advance → Reports to only', async () => {
    mockEmployee(ARCH_EMP_ID);
    jest.spyOn(service, 'getPrimaryRoleName').mockResolvedValue('Site Engineer');
    jest
      .spyOn(service, 'getReportsToRequired')
      .mockResolvedValue({ id: SUPERVISOR_ID });

    const chain = await service.buildDisciplineLeadSingleTierChain(
      ARCH_EMP_ID,
      COMPANY_ID,
    );

    expect(chain).toHaveLength(1);
    expect(chain[0]?.approverId).toBe(SUPERVISOR_ID);
    expect(chain[0]?.label).toBe('Reports to');
  });

  it('Advance with no Reports to → BadRequestException', async () => {
    mockEmployee(ARCH_EMP_ID);
    jest.spyOn(service, 'getPrimaryRoleName').mockResolvedValue('Site Engineer');
    jest.spyOn(service, 'getReportsToRequired').mockRejectedValue(
      new BadRequestException(
        'Employee has no Reports to assigned - ask HR to set a supervisor before submitting.',
      ),
    );

    await expect(
      service.buildDisciplineLeadSingleTierChain(ARCH_EMP_ID, COMPANY_ID),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});

describe('buildPerDiemSettlementApprovalChain', () => {
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

  it('Settlement → HR Manager only (no Reports to tier)', async () => {
    jest.spyOn(service, 'getPrimaryRoleName').mockResolvedValue('Site Engineer');
    jest
      .spyOn(
        service as unknown as {
          findActiveUserByPrimaryRoleName: (
            companyId: string,
            role: string,
          ) => Promise<{ id: string } | null>;
        },
        'findActiveUserByPrimaryRoleName',
      )
      .mockImplementation(async (_companyId: string, role: string) => {
        if (role === 'HR Manager') {
          return { id: HR_MANAGER_ID };
        }
        if (role === 'Local HR Manager') {
          return { id: LOCAL_HR_ID };
        }
        return null;
      });
    jest.spyOn(service, 'getGeneralManager').mockResolvedValue({ id: GM_ID });

    const chain = await service.buildPerDiemSettlementApprovalChain(
      ARCH_EMP_ID,
      COMPANY_ID,
    );

    expect(chain).toHaveLength(1);
    expect(chain[0]?.approverId).toBe(HR_MANAGER_ID);
    expect(chain[0]?.label).toBe('HR Manager');
    expect(chain.some((tier) => tier.label === 'Reports to')).toBe(false);
  });

  it('HR Manager submitter → Local HR Manager', async () => {
    jest.spyOn(service, 'getPrimaryRoleName').mockResolvedValue('HR Manager');
    jest
      .spyOn(
        service as unknown as {
          findActiveUserByPrimaryRoleName: (
            companyId: string,
            role: string,
          ) => Promise<{ id: string } | null>;
        },
        'findActiveUserByPrimaryRoleName',
      )
      .mockImplementation(async (_companyId: string, role: string) => {
        if (role === 'HR Manager') {
          return { id: HR_MANAGER_ID };
        }
        if (role === 'Local HR Manager') {
          return { id: LOCAL_HR_ID };
        }
        return null;
      });
    jest.spyOn(service, 'getGeneralManager').mockResolvedValue({ id: GM_ID });

    const chain = await service.buildPerDiemSettlementApprovalChain(
      HR_MANAGER_ID,
      COMPANY_ID,
    );

    expect(chain).toHaveLength(1);
    expect(chain[0]?.approverId).toBe(LOCAL_HR_ID);
    expect(chain[0]?.label).toBe('Local HR Manager');
  });
});
