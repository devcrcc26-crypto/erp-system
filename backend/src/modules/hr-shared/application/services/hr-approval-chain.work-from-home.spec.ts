import { BadRequestException } from '@nestjs/common';
import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { HrApprovalChainService } from './hr-approval-chain.service';
import type { PrismaService } from '../../../../shared/prisma/prisma.service';

const COMPANY_ID = '00000000-0000-4000-8000-000000000002';
const SUPERVISOR_ID = '00000000-0000-4000-8000-000000000101';
const HR_OFFICER_ID = '00000000-0000-4000-8000-000000000201';
const ARCH_EMP_ID = '00000000-0000-4000-8000-000000000102';

describe('WORK_FROM_HOME approval chain', () => {
  let service: HrApprovalChainService;

  beforeEach(() => {
    service = new HrApprovalChainService({} as unknown as PrismaService);
  });

  it('buildChainForModule(WORK_FROM_HOME) → Reports to + HR Officer', async () => {
    jest.spyOn(service, 'getPrimaryRoleName').mockResolvedValue('Site Engineer');
    jest
      .spyOn(service, 'getReportsToRequired')
      .mockResolvedValue({ id: SUPERVISOR_ID });
    jest
      .spyOn(service, 'getHROfficer')
      .mockResolvedValue({ id: HR_OFFICER_ID });

    const chain = await service.buildChainForModule(
      'WORK_FROM_HOME',
      ARCH_EMP_ID,
      COMPANY_ID,
    );

    expect(chain).toHaveLength(2);
    expect(chain[0]?.label).toBe('Reports to');
    expect(chain[0]?.approverId).toBe(SUPERVISOR_ID);
    expect(chain[1]?.label).toBe('HR Officer');
    expect(chain[1]?.approverId).toBe(HR_OFFICER_ID);
  });

  it('reportsTo present → tier 1 is the reportsTo user', async () => {
    jest.spyOn(service, 'getPrimaryRoleName').mockResolvedValue('Engineer');
    jest
      .spyOn(service, 'getReportsToRequired')
      .mockResolvedValue({ id: SUPERVISOR_ID });
    jest
      .spyOn(service, 'getHROfficer')
      .mockResolvedValue({ id: HR_OFFICER_ID });

    const chain = await service.buildWorkFromHomeApprovalChain(
      ARCH_EMP_ID,
      COMPANY_ID,
    );

    expect(chain[0]?.tierOrder).toBe(1);
    expect(chain[0]?.approverId).toBe(SUPERVISOR_ID);
    expect(chain[0]?.resolver).toBe('REPORTS_TO');
  });

  it('reportsTo absent → throws BadRequestException with WFH message', async () => {
    jest.spyOn(service, 'getPrimaryRoleName').mockResolvedValue('Engineer');
    jest
      .spyOn(service, 'getReportsToRequired')
      .mockRejectedValue(new BadRequestException('No supervisor'));

    await expect(
      service.buildWorkFromHomeApprovalChain(ARCH_EMP_ID, COMPANY_ID),
    ).rejects.toThrow('No direct supervisor assigned — contact HR');
  });

  it('tier 2 is always HR Officer regardless of reportsTo', async () => {
    const OTHER_SUPERVISOR = '00000000-0000-4000-8000-000000000999';
    jest.spyOn(service, 'getPrimaryRoleName').mockResolvedValue('Architect');
    jest
      .spyOn(service, 'getReportsToRequired')
      .mockResolvedValue({ id: OTHER_SUPERVISOR });
    jest
      .spyOn(service, 'getHROfficer')
      .mockResolvedValue({ id: HR_OFFICER_ID });

    const chain = await service.buildWorkFromHomeApprovalChain(
      ARCH_EMP_ID,
      COMPANY_ID,
    );

    expect(chain).toHaveLength(2);
    expect(chain[1]?.label).toBe('HR Officer');
    expect(chain[1]?.approverId).toBe(HR_OFFICER_ID);
    expect(chain[1]?.tierOrder).toBe(2);
  });
});
