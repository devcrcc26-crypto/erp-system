import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { HrApprovalChainService } from './hr-approval-chain.service';
import type { PrismaService } from '../../../../shared/prisma/prisma.service';

const COMPANY_ID = '00000000-0000-4000-8000-000000000002';
const SAMUEL_ID = '00000000-0000-4000-8000-000000000101';
const ARCH_EMP_ID = '00000000-0000-4000-8000-000000000102';
const HR_MANAGER_ID = '00000000-0000-4000-8000-000000000103';
const DEPT_HEAD_ID = '00000000-0000-4000-8000-000000000104';

describe('buildSiteAssignmentApprovalChain', () => {
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

  it('Architecture employee (DL: Samuel) → approver Samuel only', async () => {
    mockEmployee(ARCH_EMP_ID);
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

  it('Employee with no DL → HR Manager', async () => {
    mockEmployee(ARCH_EMP_ID);
    jest.spyOn(service, 'getPrimaryRoleName').mockResolvedValue('Site Engineer');
    jest.spyOn(service, 'getDisciplineLeadSafe').mockResolvedValue({
      found: false,
      reason: 'No Discipline Lead assigned for Architecture',
    });
    jest.spyOn(service, 'getHRManager').mockResolvedValue({ id: HR_MANAGER_ID });

    const chain = await service.buildSiteAssignmentApprovalChain(
      ARCH_EMP_ID,
      COMPANY_ID,
    );

    expect(chain).toHaveLength(1);
    expect(chain[0]?.approverId).toBe(HR_MANAGER_ID);
    expect(chain[0]?.label).toBe('HR Manager');
  });

  it("Samuel's own assignment → Department Head when assigned", async () => {
    mockEmployee(SAMUEL_ID, [{ id: 'disc-arch' }]);
    jest.spyOn(service, 'getPrimaryRoleName').mockResolvedValue('Discipline Lead');
    jest.spyOn(service, 'getDepartmentHead').mockResolvedValue({
      found: true,
      id: DEPT_HEAD_ID,
    });
    jest.spyOn(service, 'getHRManager').mockResolvedValue({ id: HR_MANAGER_ID });

    const chain = await service.buildSiteAssignmentApprovalChain(
      SAMUEL_ID,
      COMPANY_ID,
    );

    expect(chain).toHaveLength(1);
    expect(chain[0]?.approverId).toBe(DEPT_HEAD_ID);
    expect(chain[0]?.label).toBe('Department Head');
  });

  it("Samuel's own assignment → HR Manager when no Department Head", async () => {
    mockEmployee(SAMUEL_ID, [{ id: 'disc-arch' }]);
    jest.spyOn(service, 'getPrimaryRoleName').mockResolvedValue('Discipline Lead');
    jest.spyOn(service, 'getDepartmentHead').mockResolvedValue({
      found: false,
      reason: 'No Department Head assigned',
    });
    jest.spyOn(service, 'getHRManager').mockResolvedValue({ id: HR_MANAGER_ID });

    const chain = await service.buildSiteAssignmentApprovalChain(
      SAMUEL_ID,
      COMPANY_ID,
    );

    expect(chain).toHaveLength(1);
    expect(chain[0]?.approverId).toBe(HR_MANAGER_ID);
  });
});
