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
  gmApprover: { firstName: string; middleName?: string | null; lastName: string };
  entries: Array<{
    employeeId: string;
    netPay: Decimal;
    bankAccountNumber: string | null;
    employee: {
      firstName: string;
      middleName?: string | null;
      lastName: string;
      bankAccountNumber: string | null;
    };
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
        employee: { firstName: 'Abebe', lastName: 'Kebede', bankAccountNumber: '1000123456789' },
      },
      {
        employeeId: 'e2',
        netPay: new Decimal(2000.25),
        bankAccountNumber: null,
        employee: {
          firstName: 'Sara',
          middleName: 'Alemu',
          lastName: 'Tesfaye',
          bankAccountNumber: null,
        },
      },
      {
        employeeId: 'e3',
        netPay: new Decimal(0),
        bankAccountNumber: null,
        employee: { firstName: 'Zero', lastName: 'Pay', bankAccountNumber: null },
      },
      {
        employeeId: 'e4',
        netPay: new Decimal(3000),
        bankAccountNumber: '1000987654321',
        employee: { firstName: 'Chaltu', lastName: 'Bekele', bankAccountNumber: '1000987654321' },
      },
      {
        // Account added to the profile after the run was generated.
        employeeId: 'e5',
        netPay: new Decimal(500),
        bankAccountNumber: null,
        employee: { firstName: 'Dawit', lastName: 'Late', bankAccountNumber: '1000555555555' },
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

  it('previews every payable employee without allocating a reference', async () => {
    const { service, sequenceCalls } = makeService(makeRun());
    const preview = await service.preview(RUN_ID, COMPANY_ID);

    expect(preview.allowed).toBe(true);
    expect(preview.refNo).toBeNull();
    // Payable staff without an account stay in the letter with a blank cell.
    expect(preview.includedCount).toBe(4);
    expect(preview.totalNet).toBeCloseTo(6500.75, 2);
    // Zero-net employees are not warned about; profile accounts count even if the entry has none.
    expect(preview.excludedEmployees).toEqual([
      { id: 'e2', name: 'Sara Alemu Tesfaye' },
    ]);
    expect(sequenceCalls).toHaveLength(0);
  });

  it('allocates and saves a reference, then returns a .docx buffer', async () => {
    const { service, sequenceCalls, savedRefs } = makeService(makeRun());
    const result = await service.generate(RUN_ID, COMPANY_ID, USER_ID);

    expect(result.refNo).toBe(`CRIECC-FZY-2026-00${NEXT_SEQUENCE}`);
    expect(sequenceCalls).toEqual([2026]);
    expect(savedRefs).toEqual([result.refNo]);
    expect(result.excludedEmployees).toEqual([
      { id: 'e2', name: 'Sara Alemu Tesfaye' },
    ]);
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
    run.entries = run.entries.filter((e) => Number(e.netPay) === 0);
    const { service } = makeService(run);

    const preview = await service.preview(RUN_ID, COMPANY_ID);
    expect(preview.allowed).toBe(false);
    await expect(service.generate(RUN_ID, COMPANY_ID, USER_ID)).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });
});
