import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { HrApprovalChainService } from './hr-approval-chain.service';
import type { PrismaService } from '../../../../shared/prisma/prisma.service';

const COMPANY_ID = '00000000-0000-4000-8000-000000000002';
const SAMUEL_ID = '00000000-0000-4000-8000-000000000101';
const ARCH_EMP_ID = '00000000-0000-4000-8000-000000000102';

describe('WORK_FROM_HOME approval chain', () => {
  let service: HrApprovalChainService;

  beforeEach(() => {
    service = new HrApprovalChainService({} as unknown as PrismaService);
  });

  it('buildChainForModule(WORK_FROM_HOME) → Discipline Lead only', async () => {
    jest.spyOn(service, 'getPrimaryRoleName').mockResolvedValue('Site Engineer');
    jest
      .spyOn(service, 'getDisciplineLeadSafe')
      .mockResolvedValue({ found: true, id: SAMUEL_ID });

    const chain = await service.buildChainForModule(
      'WORK_FROM_HOME',
      ARCH_EMP_ID,
      COMPANY_ID,
    );

    expect(chain).toHaveLength(1);
    expect(chain[0]?.label).toBe('Discipline Lead');
    expect(chain[0]?.approverId).toBe(SAMUEL_ID);
  });
});
