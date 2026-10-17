import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { BadRequestException } from '@nestjs/common';
import { HrApprovalChainService } from './hr-approval-chain.service';
import type { PrismaService } from '../../../../shared/prisma/prisma.service';

const COMPANY_ID = '00000000-0000-4000-8000-000000000002';
const SUPERVISOR_ID = '00000000-0000-4000-8000-000000000101';
const ARCH_EMP_ID = '00000000-0000-4000-8000-000000000102';
const HR_MANAGER_ID = '00000000-0000-4000-8000-000000000103';

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

  it.each(['General Manager', 'Managing Director', 'System Administrator'])(
    '%s → HR Manager tier (never auto-approved)',
    async (role) => {
      jest.spyOn(service, 'getPrimaryRoleName').mockResolvedValue(role);
      jest.spyOn(service, 'getHRManager').mockResolvedValue({ id: HR_MANAGER_ID });

      const chain = await service.buildSiteAssignmentApprovalChain(
        ARCH_EMP_ID,
        COMPANY_ID,
      );

      expect(chain).toEqual([
        {
          tierOrder: 1,
          label: 'HR Manager',
          approverId: HR_MANAGER_ID,
          resolver: 'ROLE:HR Manager',
        },
      ]);
    },
  );

  it('Work from home is unchanged: GM → empty chain (auto-approve)', async () => {
    jest.spyOn(service, 'getPrimaryRoleName').mockResolvedValue('General Manager');

    await expect(
      service.buildWorkFromHomeApprovalChain(ARCH_EMP_ID, COMPANY_ID),
    ).resolves.toEqual([]);
    await expect(
      service.buildChainForModule('WORK_FROM_HOME', ARCH_EMP_ID, COMPANY_ID),
    ).resolves.toEqual([]);
  });

  it('Work from home employee → Reports to only', async () => {
    jest.spyOn(service, 'getPrimaryRoleName').mockResolvedValue('Site Engineer');
    jest
      .spyOn(service, 'getReportsToRequired')
      .mockResolvedValue({ id: SUPERVISOR_ID });

    const chain = await service.buildWorkFromHomeApprovalChain(
      ARCH_EMP_ID,
      COMPANY_ID,
    );
    expect(chain.map((tier) => tier.approverId)).toEqual([SUPERVISOR_ID]);
  });

  it('GM with no HR Manager / HR Officer → BadRequestException', async () => {
    jest.spyOn(service, 'getPrimaryRoleName').mockResolvedValue('General Manager');
    jest
      .spyOn(service, 'getHRManager')
      .mockRejectedValue(new BadRequestException('HR Manager position is vacant'));

    await expect(
      service.buildSiteAssignmentApprovalChain(ARCH_EMP_ID, COMPANY_ID),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
