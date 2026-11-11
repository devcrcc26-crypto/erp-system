import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { BadRequestException } from '@nestjs/common';
import { HrApprovalChainService } from './hr-approval-chain.service';
import type { PrismaService } from '../../../../shared/prisma/prisma.service';

const COMPANY_ID = '00000000-0000-4000-8000-000000000002';
const SUPERVISOR_ID = '00000000-0000-4000-8000-000000000101';
const ARCH_EMP_ID = '00000000-0000-4000-8000-000000000102';
const HR_MANAGER_ID = '00000000-0000-4000-8000-000000000103';
const HR_OFFICER_ID = '00000000-0000-4000-8000-000000000104';

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

  it('Employee with no Reports to → HR Manager fallback', async () => {
    jest.spyOn(service, 'getPrimaryRoleName').mockResolvedValue('Site Engineer');
    jest.spyOn(service, 'getReportsToRequired').mockRejectedValue(
      new BadRequestException(
        'Employee has no Reports to assigned - ask HR to set a supervisor before submitting.',
      ),
    );
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

  it('Work from home employee → Reports to then HR Officer', async () => {
    jest.spyOn(service, 'getPrimaryRoleName').mockResolvedValue('Site Engineer');
    jest
      .spyOn(service, 'getReportsToRequired')
      .mockResolvedValue({ id: SUPERVISOR_ID });
    jest.spyOn(service, 'getHROfficer').mockResolvedValue({ id: HR_OFFICER_ID });

    const chain = await service.buildWorkFromHomeApprovalChain(
      ARCH_EMP_ID,
      COMPANY_ID,
    );
    expect(chain.map((tier) => tier.approverId)).toEqual([
      SUPERVISOR_ID,
      HR_OFFICER_ID,
    ]);
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

describe('startChainAboveSubmitter (supervisor filings)', () => {
  const SUBMITTER = '00000000-0000-4000-8000-000000000201';
  const ABOVE = '00000000-0000-4000-8000-000000000202';
  const HR = '00000000-0000-4000-8000-000000000203';
  const GM = '00000000-0000-4000-8000-000000000204';
  const OTHER = '00000000-0000-4000-8000-000000000205';

  function build(reportsTo: { id: string; isActive: boolean; deletedAt: Date | null } | null) {
    const service = new HrApprovalChainService({
      user: { findFirst: jest.fn(async () => ({ reportsTo })) },
    } as unknown as PrismaService);
    jest.spyOn(service, 'getHRManager').mockResolvedValue({ id: HR });
    jest.spyOn(service, 'getGeneralManager').mockResolvedValue({ id: GM });
    return service;
  }

  const supervisorChain = [
    { tierOrder: 1, label: 'Reports to', approverId: SUBMITTER, resolver: 'REPORTS_TO' },
  ];

  it("starts at the supervisor's own Reports to", async () => {
    const service = build({ id: ABOVE, isActive: true, deletedAt: null });
    const chain = await service.startChainAboveSubmitter(supervisorChain, SUBMITTER, COMPANY_ID);
    expect(chain).toEqual([
      { tierOrder: 1, label: "Submitter's Reports to", approverId: ABOVE, resolver: 'SUBMITTER_REPORTS_TO' },
    ]);
  });

  it('goes to the HR Manager when the supervisor has no Reports to', async () => {
    const service = build(null);
    const chain = await service.startChainAboveSubmitter(supervisorChain, SUBMITTER, COMPANY_ID);
    expect(chain.map((t) => t.approverId)).toEqual([HR]);
  });

  it('skips an inactive Reports to and never uses the submitter', async () => {
    const service = build({ id: ABOVE, isActive: false, deletedAt: null });
    const chain = await service.startChainAboveSubmitter(supervisorChain, SUBMITTER, COMPANY_ID);
    expect(chain.map((t) => t.approverId)).toEqual([HR]);
    expect(chain.some((t) => t.approverId === SUBMITTER)).toBe(false);
  });

  it('goes to the GM when the HR Manager is the submitting supervisor', async () => {
    const service = build(null);
    jest.spyOn(service, 'getHRManager').mockResolvedValue({ id: SUBMITTER });
    const chain = await service.startChainAboveSubmitter(supervisorChain, SUBMITTER, COMPANY_ID);
    expect(chain.map((t) => t.approverId)).toEqual([GM]);
  });

  it('multi-tier chains: only the submitter tier moves; duplicates collapse', async () => {
    const service = build({ id: OTHER, isActive: true, deletedAt: null });
    const chain = await service.startChainAboveSubmitter(
      [
        { tierOrder: 1, label: 'Reports to', approverId: SUBMITTER, resolver: 'REPORTS_TO' },
        { tierOrder: 2, label: 'HR Officer', approverId: OTHER, resolver: 'ROLE:HR Officer' },
        { tierOrder: 3, label: 'General Manager', approverId: GM, resolver: 'ROLE:General Manager' },
      ],
      SUBMITTER,
      COMPANY_ID,
    );
    expect(chain.map((t) => [t.tierOrder, t.approverId])).toEqual([
      [1, OTHER],
      [2, GM],
    ]);
  });

  it('leaves a chain without the submitter unchanged', async () => {
    const service = build(null);
    const chain = [{ tierOrder: 1, label: 'Reports to', approverId: OTHER, resolver: 'REPORTS_TO' }];
    await expect(service.startChainAboveSubmitter(chain, SUBMITTER, COMPANY_ID)).resolves.toBe(chain);
  });
});
