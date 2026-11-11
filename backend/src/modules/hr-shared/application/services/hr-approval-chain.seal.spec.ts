import { BadRequestException } from '@nestjs/common';
import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import {
  HrApprovalChainService,
  SEAL_NO_MANAGING_DIRECTOR_MESSAGE,
} from './hr-approval-chain.service';
import type { PrismaService } from '../../../../shared/prisma/prisma.service';

const COMPANY_ID = '00000000-0000-4000-8000-000000000002';
const SUBMITTER_ID = '00000000-0000-4000-8000-000000000102';
const MD_ID = '00000000-0000-4000-8000-000000000301';

type SealBuilder = 'buildOfficialSealApprovalChain' | 'buildProjectSealApprovalChain';
const BUILDERS: SealBuilder[] = [
  'buildOfficialSealApprovalChain',
  'buildProjectSealApprovalChain',
];

describe('Seal approval chains (official + project)', () => {
  let service: HrApprovalChainService;
  let findFirst: jest.Mock<(args: unknown) => Promise<{ id: string } | null>>;

  beforeEach(() => {
    findFirst = jest.fn<(args: unknown) => Promise<{ id: string } | null>>();
    service = new HrApprovalChainService({
      user: { findFirst },
    } as unknown as PrismaService);
  });

  describe.each(BUILDERS)('%s', (builder) => {
    it.each([
      'Employee',
      'Site Engineer',
      'Department Head',
      'HR Manager',
      'Local HR Manager',
      'General Manager',
    ])('%s submitter → single Managing Director tier', async (role) => {
      jest.spyOn(service, 'getPrimaryRoleName').mockResolvedValue(role);
      findFirst.mockResolvedValue({ id: MD_ID });

      const chain = await service[builder](SUBMITTER_ID, COMPANY_ID);

      expect(chain).toEqual([
        {
          tierOrder: 1,
          label: 'Managing Director',
          approverId: MD_ID,
          resolver: 'ROLE:Managing Director',
        },
      ]);
    });

    it.each(['Managing Director', 'System Administrator'])(
      '%s submitter → empty chain (direct approval)',
      async (role) => {
        jest.spyOn(service, 'getPrimaryRoleName').mockResolvedValue(role);

        await expect(service[builder](SUBMITTER_ID, COMPANY_ID)).resolves.toEqual([]);
        expect(findFirst).not.toHaveBeenCalled();
      },
    );

    it('no active Managing Director → descriptive BadRequestException', async () => {
      jest.spyOn(service, 'getPrimaryRoleName').mockResolvedValue('Employee');
      findFirst.mockResolvedValue(null);

      const result = service[builder](SUBMITTER_ID, COMPANY_ID);
      await expect(result).rejects.toBeInstanceOf(BadRequestException);
      await expect(service[builder](SUBMITTER_ID, COMPANY_ID)).rejects.toThrow(
        SEAL_NO_MANAGING_DIRECTOR_MESSAGE,
      );
    });
  });

  it('buildChainForModule routes both seal codes to the Managing Director', async () => {
    jest.spyOn(service, 'getPrimaryRoleName').mockResolvedValue('Employee');
    findFirst.mockResolvedValue({ id: MD_ID });

    for (const code of ['OFFICIAL_SEAL_USAGE', 'PROJECT_SEAL_USAGE'] as const) {
      const chain = await service.buildChainForModule(code, SUBMITTER_ID, COMPANY_ID);
      expect(chain.map((tier) => tier.approverId)).toEqual([MD_ID]);
    }
  });
});
