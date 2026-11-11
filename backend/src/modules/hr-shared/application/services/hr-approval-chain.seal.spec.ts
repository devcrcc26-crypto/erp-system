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
const MD_2_ID = '00000000-0000-4000-8000-000000000302';
const MD_3_ID = '00000000-0000-4000-8000-000000000303';

type SealBuilder = 'buildOfficialSealApprovalChain' | 'buildProjectSealApprovalChain';
const BUILDERS: SealBuilder[] = [
  'buildOfficialSealApprovalChain',
  'buildProjectSealApprovalChain',
];

type CountMock = jest.Mock<(args: unknown) => Promise<number>>;

describe('Seal approval chains (official + project)', () => {
  let service: HrApprovalChainService;
  let findMany: jest.Mock<(args: unknown) => Promise<Array<{ id: string }>>>;
  let officialCount: CountMock;
  let projectCount: CountMock;

  beforeEach(() => {
    findMany = jest.fn<(args: unknown) => Promise<Array<{ id: string }>>>();
    officialCount = jest.fn<(args: unknown) => Promise<number>>().mockResolvedValue(0);
    projectCount = jest.fn<(args: unknown) => Promise<number>>().mockResolvedValue(0);
    service = new HrApprovalChainService({
      user: { findMany },
      officialSeal: { count: officialCount },
      projectSeal: { count: projectCount },
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
      findMany.mockResolvedValue([{ id: MD_ID }]);

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
        expect(findMany).not.toHaveBeenCalled();
      },
    );

    it('no active Managing Director → descriptive BadRequestException', async () => {
      jest.spyOn(service, 'getPrimaryRoleName').mockResolvedValue('Employee');
      findMany.mockResolvedValue([]);

      const result = service[builder](SUBMITTER_ID, COMPANY_ID);
      await expect(result).rejects.toBeInstanceOf(BadRequestException);
      await expect(service[builder](SUBMITTER_ID, COMPANY_ID)).rejects.toThrow(
        SEAL_NO_MANAGING_DIRECTOR_MESSAGE,
      );
    });
  });

  describe('round-robin across Managing Directors', () => {
    beforeEach(() => {
      jest.spyOn(service, 'getPrimaryRoleName').mockResolvedValue('Employee');
    });

    async function approverFor(
      official: number,
      project: number,
      directors: string[],
    ): Promise<string | undefined> {
      findMany.mockResolvedValue(directors.map((id) => ({ id })));
      officialCount.mockResolvedValue(official);
      projectCount.mockResolvedValue(project);
      const chain = await service.buildOfficialSealApprovalChain(SUBMITTER_ID, COMPANY_ID);
      return chain[0]?.approverId;
    }

    it('one Managing Director → always them, no seal count needed', async () => {
      await expect(approverFor(7, 4, [MD_ID])).resolves.toBe(MD_ID);
      expect(officialCount).not.toHaveBeenCalled();
      expect(projectCount).not.toHaveBeenCalled();
    });

    it('two Managing Directors → even count first, odd count second', async () => {
      await expect(approverFor(0, 0, [MD_ID, MD_2_ID])).resolves.toBe(MD_ID);
      await expect(approverFor(2, 1, [MD_ID, MD_2_ID])).resolves.toBe(MD_2_ID);
      await expect(approverFor(2, 2, [MD_ID, MD_2_ID])).resolves.toBe(MD_ID);
    });

    it('three Managing Directors → count % 3', async () => {
      const directors = [MD_ID, MD_2_ID, MD_3_ID];
      await expect(approverFor(3, 2, directors)).resolves.toBe(MD_3_ID);
      await expect(approverFor(4, 2, directors)).resolves.toBe(MD_ID);
    });

    it('counts official + project seals for the company, excluding drafts and deleted rows', async () => {
      await approverFor(1, 0, [MD_ID, MD_2_ID]);
      const expected = {
        where: { companyId: COMPANY_ID, deletedAt: null, status: { not: 'DRAFT' } },
      };
      expect(officialCount).toHaveBeenCalledWith(expected);
      expect(projectCount).toHaveBeenCalledWith(expected);
    });
  });

  it('buildChainForModule routes both seal codes to the Managing Director', async () => {
    jest.spyOn(service, 'getPrimaryRoleName').mockResolvedValue('Employee');
    findMany.mockResolvedValue([{ id: MD_ID }]);

    for (const code of ['OFFICIAL_SEAL_USAGE', 'PROJECT_SEAL_USAGE'] as const) {
      const chain = await service.buildChainForModule(code, SUBMITTER_ID, COMPANY_ID);
      expect(chain.map((tier) => tier.approverId)).toEqual([MD_ID]);
    }
  });
});
