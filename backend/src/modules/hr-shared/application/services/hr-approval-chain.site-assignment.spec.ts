import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { BadRequestException } from '@nestjs/common';
import { HrApprovalChainService } from './hr-approval-chain.service';
import type { PrismaService } from '../../../../shared/prisma/prisma.service';

const COMPANY_ID = '00000000-0000-4000-8000-000000000002';
const SUPERVISOR_ID = '00000000-0000-4000-8000-000000000101';
const ARCH_EMP_ID = '00000000-0000-4000-8000-000000000102';

describe('buildSiteAssignmentApprovalChain', () => {
  let service: HrApprovalChainService;

  beforeEach(() => {
    service = new HrApprovalChainService({} as unknown as PrismaService);
  });

  it('Architecture employee → Reports to only', async () => {
    jest.spyOn(service, 'getPrimaryRoleName').mockResolvedValue('Site Engineer');
    jest
      .spyOn(service, 'getReportsToRequired')
      .mockResolvedValue({ id: SUPERVISOR_ID });

    const chain = await service.buildSiteAssignmentApprovalChain(
      ARCH_EMP_ID,
      COMPANY_ID,
    );

    expect(chain).toHaveLength(1);
    expect(chain[0]?.approverId).toBe(SUPERVISOR_ID);
    expect(chain[0]?.label).toBe('Reports to');
  });

  it('Employee with no Reports to → BadRequestException', async () => {
    jest.spyOn(service, 'getPrimaryRoleName').mockResolvedValue('Site Engineer');
    jest.spyOn(service, 'getReportsToRequired').mockRejectedValue(
      new BadRequestException(
        'Employee has no Reports to assigned - ask HR to set a supervisor before submitting.',
      ),
    );

    await expect(
      service.buildSiteAssignmentApprovalChain(ARCH_EMP_ID, COMPANY_ID),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('GM / MD / System Administrator → empty chain (auto-approve)', async () => {
    jest
      .spyOn(service, 'getPrimaryRoleName')
      .mockResolvedValue('General Manager');

    const chain = await service.buildSiteAssignmentApprovalChain(
      ARCH_EMP_ID,
      COMPANY_ID,
    );

    expect(chain).toHaveLength(0);
  });
});
