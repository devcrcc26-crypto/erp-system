import {
  EmployeeContractStatus,
  EmployeeContractType,
  Prisma,
} from '@prisma/client';
import { EmployeeContractService } from './employee-contract.service';
import type { LeaveLedgerService } from '../../../leave-policy/application/services/leave-ledger.service';

const PAY_FIELDS = [
  'basicSalary',
  'transportationAllowance',
  'monthlyBonus',
  'monthlyNetBonus',
] as const;

function buildService(leaveLedger: {
  onContractActivated: jest.Mock;
  recomputeContractEntries: jest.Mock;
}): EmployeeContractService {
  return new EmployeeContractService(
    { employeeContract: { findFirst: jest.fn() } } as never,
    {} as never,
    {} as never,
    {} as never,
    leaveLedger as unknown as LeaveLedgerService,
  );
}

async function syncActivated(
  service: EmployeeContractService,
  contractId: string,
  userId: string,
): Promise<void> {
  await (
    service as unknown as {
      syncLeaveLedger: (
        contractId: string,
        userId: string,
        mode: 'activated' | 'recompute',
      ) => Promise<void>;
    }
  ).syncLeaveLedger(contractId, userId, 'activated');
}

describe('EmployeeContractService.getMyActiveContract', () => {
  const findFirst = jest.fn();
  const prisma = { employeeContract: { findFirst } };
  const leaveLedger = {
    onContractActivated: jest.fn(),
    recomputeContractEntries: jest.fn(),
  };
  const service = new EmployeeContractService(
    prisma as never,
    {} as never,
    {} as never,
    {} as never,
    leaveLedger as unknown as LeaveLedgerService,
  );

  beforeEach(() => {
    findFirst.mockReset();
    leaveLedger.onContractActivated.mockReset();
    leaveLedger.recomputeContractEntries.mockReset();
  });

  it('returns { contract: null } when the employee has no active contract', async () => {
    findFirst.mockResolvedValue(null);

    await expect(
      service.getMyActiveContract('company-1', 'user-1'),
    ).resolves.toEqual({ contract: null });
  });

  it('scopes to the current user and ACTIVE status, and selects pay fields', async () => {
    findFirst.mockResolvedValue(null);

    await service.getMyActiveContract('company-1', 'user-1');

    const args = findFirst.mock.calls[0][0] as {
      where: Record<string, unknown>;
      select: Record<string, unknown>;
    };
    expect(args.where).toMatchObject({
      companyId: 'company-1',
      employeeId: 'user-1',
      status: EmployeeContractStatus.ACTIVE,
    });
    for (const field of PAY_FIELDS) {
      expect(args.select).toHaveProperty(field);
    }
  });

  it('returns date-only strings and pay amounts for the active contract', async () => {
    findFirst.mockResolvedValue({
      id: 'contract-1',
      contractNumber: 'EC-2026-0001',
      contractType: EmployeeContractType.FIXED_TERM,
      status: EmployeeContractStatus.ACTIVE,
      signedAt: new Date('2026-01-05T00:00:00.000Z'),
      startDate: new Date('2026-01-10T00:00:00.000Z'),
      endDate: null,
      probationEndDate: new Date('2026-04-10T00:00:00.000Z'),
      governedBy: 'Ethiopian Labour Proclamation 1156/2019',
      currency: 'ETB',
      basicSalary: new Prisma.Decimal(50000),
      transportationAllowance: new Prisma.Decimal(1500),
      monthlyBonus: new Prisma.Decimal(2000),
      monthlyNetBonus: new Prisma.Decimal(0),
      pensionApplicable: true,
      taxApplicable: true,
    });

    const result = await service.getMyActiveContract('company-1', 'user-1');

    expect(result.contract).toEqual({
      id: 'contract-1',
      contractNumber: 'EC-2026-0001',
      contractType: EmployeeContractType.FIXED_TERM,
      status: EmployeeContractStatus.ACTIVE,
      signedAt: '2026-01-05',
      startDate: '2026-01-10',
      endDate: null,
      probationEndDate: '2026-04-10',
      governedBy: 'Ethiopian Labour Proclamation 1156/2019',
      currency: 'ETB',
      basicSalary: 50000,
      transportationAllowance: 1500,
      monthlyBonus: 2000,
      monthlyNetBonus: 0,
      pensionApplicable: true,
      taxApplicable: true,
    });
  });

  it('loads a specific own contract when contractId is provided', async () => {
    findFirst.mockResolvedValue(null);

    await service.getMyActiveContract('company-1', 'user-1', 'contract-2');

    const args = findFirst.mock.calls[0][0] as {
      where: Record<string, unknown>;
    };
    expect(args.where).toMatchObject({
      companyId: 'company-1',
      employeeId: 'user-1',
      id: 'contract-2',
    });
    expect(args.where).not.toHaveProperty('status');
  });
});

describe('EmployeeContractService leave ledger hook', () => {
  it('renewal on anniversary grants entitlement once (re-saving never grants twice)', async () => {
    let entitlementGrants = 0;
    const leaveLedger = {
      onContractActivated: jest.fn(async () => {
        entitlementGrants += 1;
        if (entitlementGrants === 1) {
          return { renewal: true, leaveYear: { id: 'ly-2025' } };
        }
        return { renewal: false, leaveYear: { id: 'ly-2025' } };
      }),
      recomputeContractEntries: jest.fn(),
    };
    const service = buildService(leaveLedger);

    await syncActivated(service, 'k2', 'hr');
    await syncActivated(service, 'k2', 'hr');
    await syncActivated(service, 'k2', 'hr');

    expect(leaveLedger.onContractActivated).toHaveBeenCalledTimes(3);
    const resolved = await Promise.all(
      leaveLedger.onContractActivated.mock.results.map(
        (r) => r.value as Promise<{ renewal: boolean }>,
      ),
    );
    expect(resolved.filter((r) => r.renewal)).toHaveLength(1);
    expect(resolved.filter((r) => !r.renewal)).toHaveLength(2);
  });

  it('a mid-year contract change grants nothing', async () => {
    const leaveLedger = {
      onContractActivated: jest.fn(async () => ({
        renewal: false,
        leaveYear: null,
      })),
      recomputeContractEntries: jest.fn(),
    };
    const service = buildService(leaveLedger);

    await syncActivated(service, 'k2', 'hr');

    expect(leaveLedger.onContractActivated).toHaveBeenCalledWith('k2', 'hr');
    await expect(
      leaveLedger.onContractActivated.mock.results[0]!.value,
    ).resolves.toEqual({ renewal: false, leaveYear: null });
  });
});

describe('EmployeeContractService convert to freelancer', () => {
  it('new contract in the same employment period (no separation), pension always on for freelancers', async () => {
    const created: Array<Record<string, unknown>> = [];
    const superseded: Array<Record<string, unknown>> = [];
    const tx = {
      employeeContract: {
        update: jest.fn(async ({ data }: { data: Record<string, unknown> }) => superseded.push(data)),
        create: jest.fn(async ({ data }: { data: Record<string, unknown> }) => created.push(data)),
      },
    };
    // No employmentPeriod / user.update on the client: touching either would throw.
    const prisma = {
      user: { findFirst: jest.fn(async () => ({ id: 'emp-1', employeeType: 'FREELANCER' })) },
      employeeContract: {
        findFirst: jest.fn(async () => ({
          id: 'k1',
          contractNumber: 'EC-0001',
          startDate: new Date(Date.UTC(2025, 0, 1)),
        })),
      },
      $transaction: jest.fn(async (fn: (client: typeof tx) => Promise<void>) => fn(tx)),
    };
    const service = new EmployeeContractService(
      prisma as never,
      {} as never,
      {} as never,
      {} as never,
      { onContractActivated: jest.fn(), recomputeContractEntries: jest.fn() } as never,
    );
    const internals = service as unknown as Record<string, unknown>;
    internals.assertCanManage = jest.fn(async () => undefined);
    internals.nextContractNumber = jest.fn(async () => 'EC-0002');
    internals.syncLeaveLedger = jest.fn(async () => undefined);
    internals.getContract = jest.fn(async () => ({ id: 'k2' }));

    await service.createContract(
      {
        employeeId: 'emp-1',
        contractType: EmployeeContractType.FIXED_TERM,
        signedAt: '2026-10-01',
        startDate: '2026-10-01',
        endDate: '2027-09-30',
        basicSalary: 20000,
      } as never,
      'co-1',
      'hr-1',
    );

    expect(superseded[0]).toMatchObject({ status: EmployeeContractStatus.SUPERSEDED });
    expect(created[0]).toMatchObject({ pensionApplicable: true, status: EmployeeContractStatus.ACTIVE });
  });
});
