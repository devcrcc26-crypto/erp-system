import { describe, expect, it } from '@jest/globals';
import { BadRequestException } from '@nestjs/common';
import { Decimal } from '@prisma/client/runtime/library';
import type { PayrollRunStatus } from '@prisma/client';
import type { PrismaService } from '../../../../shared/prisma/prisma.service';
import {
  PAYROLL_SETTING_DEFAULTS,
  PayrollCompanySettings,
  PayrollCompanySettingsService,
} from './payroll-company-settings.service';
import { PayrollBankLetterService } from './payroll-bank-letter.service';

const COMPANY_ID = 'company-1';
const USER_ID = 'user-1';
const RUN_ID = 'run-1';
const NEXT_SEQUENCE = 7;

interface RunFixture {
  id: string;
  month: number;
  year: number;
  status: PayrollRunStatus;
  bankLetterRefNo: string | null;
  gmApprover: { firstName: string; lastName: string };
  entries: Array<{
    employeeId: string;
    netPay: Decimal;
    bankAccountNumber: string | null;
    employee: { firstName: string; lastName: string };
  }>;
}

function makeRun(overrides: Partial<RunFixture> = {}): RunFixture {
  return {
    id: RUN_ID,
    month: 9,
    year: 2026,
    status: 'GM_APPROVED',
    bankLetterRefNo: null,
    gmApprover: { firstName: 'Girma', lastName: 'Manager' },
    entries: [
      {
        employeeId: 'e1',
        netPay: new Decimal(1000.5),
        bankAccountNumber: '1000123456789',
        employee: { firstName: 'Abebe', lastName: 'Kebede' },
      },
      {
        employeeId: 'e2',
        netPay: new Decimal(2000.25),
        bankAccountNumber: null,
        employee: { firstName: 'Sara', lastName: 'Tesfaye' },
      },
      {
        employeeId: 'e3',
        netPay: new Decimal(0),
        bankAccountNumber: null,
        employee: { firstName: 'Zero', lastName: 'Pay' },
      },
      {
        employeeId: 'e4',
        netPay: new Decimal(3000),
        bankAccountNumber: '1000987654321',
        employee: { firstName: 'Chaltu', lastName: 'Bekele' },
      },
    ],
    ...overrides,
  };
}

function makeService(run: RunFixture | null): {
  service: PayrollBankLetterService;
  sequenceCalls: number[];
  savedRefs: string[];
} {
  const sequenceCalls: number[] = [];
  const savedRefs: string[] = [];
  const prisma = {
    payrollRun: {
      findFirst: async (): Promise<RunFixture | null> => run,
      updateMany: async (args: {
        data: { bankLetterRefNo: string };
      }): Promise<{ count: number }> => {
        savedRefs.push(args.data.bankLetterRefNo);
        return { count: 1 };
      },
    },
  };
  const settings = {
    getSettings: async (): Promise<PayrollCompanySettings> => ({
      ...PAYROLL_SETTING_DEFAULTS,
      companyAccountNumber: '1000111122223',
    }),
    nextBankLetterSequence: async (
      _companyId: string,
      year: number,
    ): Promise<number> => {
      sequenceCalls.push(year);
      return NEXT_SEQUENCE;
    },
  };
  const service = new PayrollBankLetterService(
    prisma as unknown as PrismaService,
    settings as unknown as PayrollCompanySettingsService,
  );
  return { service, sequenceCalls, savedRefs };
}

describe('PayrollBankLetterService', () => {
  it('rejects runs that are not GM approved or paid', async () => {
    const { service } = makeService(makeRun({ status: 'APPROVED' }));
    await expect(service.generate(RUN_ID, COMPANY_ID, USER_ID)).rejects.toBeInstanceOf(
      BadRequestException,
    );
    await expect(service.preview(RUN_ID, COMPANY_ID)).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('previews included and excluded employees without allocating a reference', async () => {
    const { service, sequenceCalls } = makeService(makeRun());
    const preview = await service.preview(RUN_ID, COMPANY_ID);

    expect(preview.allowed).toBe(true);
    expect(preview.refNo).toBeNull();
    expect(preview.includedCount).toBe(2);
    expect(preview.totalNet).toBeCloseTo(4000.5, 2);
    // Zero-net employees are not warned about; only payable staff without accounts.
    expect(preview.excludedEmployees).toEqual([{ id: 'e2', name: 'Sara Tesfaye' }]);
    expect(sequenceCalls).toHaveLength(0);
  });

  it('allocates and saves a reference, then returns a .docx buffer', async () => {
    const { service, sequenceCalls, savedRefs } = makeService(makeRun());
    const result = await service.generate(RUN_ID, COMPANY_ID, USER_ID);

    expect(result.refNo).toBe(`CRIECC-FZY-2026-00${NEXT_SEQUENCE}`);
    expect(sequenceCalls).toEqual([2026]);
    expect(savedRefs).toEqual([result.refNo]);
    expect(result.excludedEmployees).toEqual([{ id: 'e2', name: 'Sara Tesfaye' }]);
    expect(result.filename.endsWith('.docx')).toBe(true);
    expect(result.mimeType).toBe(
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    );
    // .docx files are zip archives.
    expect(result.buffer.subarray(0, 2).toString('latin1')).toBe('PK');
  });

  it('reuses an existing reference', async () => {
    const { service, sequenceCalls, savedRefs } = makeService(
      makeRun({ bankLetterRefNo: 'CRIECC-FZY-2026-001' }),
    );
    const result = await service.generate(RUN_ID, COMPANY_ID, USER_ID);

    expect(result.refNo).toBe('CRIECC-FZY-2026-001');
    expect(sequenceCalls).toHaveLength(0);
    expect(savedRefs).toHaveLength(0);
  });

  it('refuses to generate when nobody is payable', async () => {
    const run = makeRun();
    run.entries = run.entries.filter((e) => e.bankAccountNumber === null);
    const { service } = makeService(run);

    const preview = await service.preview(RUN_ID, COMPANY_ID);
    expect(preview.allowed).toBe(false);
    await expect(service.generate(RUN_ID, COMPANY_ID, USER_ID)).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });
});
