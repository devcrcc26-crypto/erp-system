import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { BadRequestException } from '@nestjs/common';
import { HrApprovalChainService } from './hr-approval-chain.service';
import type { PrismaService } from '../../../../shared/prisma/prisma.service';

const COMPANY_ID = '00000000-0000-4000-8000-000000000002';
const SAMUEL_ID = '00000000-0000-4000-8000-000000000101';
const ARCH_EMP_ID = '00000000-0000-4000-8000-000000000102';

describe('buildSiteAssignmentApprovalChain', () => {
  let service: HrApprovalChainService;

  beforeEach(() => {
    service = new HrApprovalChainService({} as unknown as PrismaService);
  });

  it('Architecture employee (DL: Samuel) → approver Samuel only', async () => {
    jest.spyOn(service, 'getPrimaryRoleName').mockResolvedValue('Site Engineer');
    jest
      .spyOn(service, 'getDisciplineLeadSafe')
      .mockResolvedValue({ found: true, id: SAMUEL_ID });

    const chain = await service.buildSiteAssignmentApprovalChain(
      ARCH_EMP_ID,
      COMPANY_ID,
    );

    expect(chain).toHaveLength(1);
    expect(chain[0]?.approverId).toBe(SAMUEL_ID);
    expect(chain[0]?.label).toBe('Discipline Lead');
  });

  it('Employee with no DL → BadRequestException', async () => {
    jest.spyOn(service, 'getPrimaryRoleName').mockResolvedValue('Site Engineer');
    jest.spyOn(service, 'getDisciplineLeadSafe').mockResolvedValue({
      found: false,
      reason: 'No Discipline Lead assigned for Architecture',
    });

    await expect(
      service.buildSiteAssignmentApprovalChain(ARCH_EMP_ID, COMPANY_ID),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("Samuel's own assignment → empty chain (no self-approval)", async () => {
    jest.spyOn(service, 'getPrimaryRoleName').mockResolvedValue('Discipline Lead');
    jest
      .spyOn(service, 'getDisciplineLeadSafe')
      .mockResolvedValue({ found: true, id: SAMUEL_ID });

    const chain = await service.buildSiteAssignmentApprovalChain(
      SAMUEL_ID,
      COMPANY_ID,
    );

    expect(chain).toHaveLength(0);
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
