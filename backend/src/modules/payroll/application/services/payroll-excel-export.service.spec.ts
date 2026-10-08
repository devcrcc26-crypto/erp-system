import { describe, expect, it } from '@jest/globals';
import * as ExcelJS from 'exceljs';
import { Decimal } from '@prisma/client/runtime/library';
import type { PrismaService } from '../../../../shared/prisma/prisma.service';
import {
  PAYROLL_SETTING_DEFAULTS,
  PayrollCompanySettings,
  PayrollCompanySettingsService,
} from './payroll-company-settings.service';
import {
  PayrollExcelExportService,
  PayrollExportEntry,
  computeDataSheetTotals,
} from './payroll-excel-export.service';

const COMPANY_ID = 'company-1';
const RUN_ID = 'run-1';
const DATA_FIRST_ROW = 5;

/** Data sheet column numbers (1-based) used by assertions. */
const DATA_COL = {
  name: 5,
  position: 6,
  employDate: 7,
  basic: 8,
  days: 9,
  earned: 10,
  totalOt: 21,
  bones: 22,
  pensionEmr: 23,
  pensionEmp: 24,
  taxableIncome: 25,
  incomeTax: 26,
  totalDeduction: 27,
  netPay: 28,
  notes: 30,
} as const;

const dec = (value: number): Decimal => new Decimal(value);
const utc = (y: number, m: number, d: number): Date =>
  new Date(Date.UTC(y, m - 1, d));

type EntryOverrides = Partial<Omit<PayrollExportEntry, 'employee'>> & {
  employee?: Partial<PayrollExportEntry['employee']>;
};

function makeEntry(overrides: EntryOverrides = {}): PayrollExportEntry {
  const { employee, ...rest } = overrides;
  return {
    flag: 'NONE',
    flagNote: null,
    notes: null,
    bonusTopUpReason: null,
    contractNetBonus: dec(0),
    netTopUp: dec(0),
    netTopUpReason: null,
    basicSalary: dec(10000),
    payrollDays: dec(30),
    earnedSalary: dec(10000),
    transportAllowance: dec(1000),
    taxableTransport: dec(0),
    normalOtHours: dec(0),
    normalOtPay: dec(0),
    eveningOtHours: dec(0),
    eveningOtPay: dec(0),
    sundayOtHours: dec(0),
    sundayOtPay: dec(0),
    holidayOtHours: dec(0),
    holidayOtPay: dec(0),
    totalOtPay: dec(0),
    monthlyBonus: dec(0),
    bonusTopUp: dec(0),
    pensionEmployer: dec(1100),
    pensionEmployee: dec(700),
    taxableIncome: dec(9300),
    incomeTax: dec(1500.25),
    totalDeductions: dec(2200.25),
    netPay: dec(8799.75),
    contract: { startDate: utc(2024, 2, 1) },
    salaryPeriods: [],
    ...rest,
    employee: {
      firstName: 'Abebe',
      lastName: 'Kebede',
      tin: '0012345678',
      department: { name: 'Finance' },
      position: { title: 'Accountant' },
      ...employee,
    },
  };
}

/** Small fixture: one single-period entry and one mid-month salary change. */
function makeFixtureEntries(): PayrollExportEntry[] {
  const single = makeEntry();
  const changed = makeEntry({
    employee: {
      firstName: 'Sara',
      lastName: 'Tesfaye',
      tin: null,
      position: { title: 'Site Engineer' },
    },
    basicSalary: dec(12000),
    payrollDays: dec(30),
    earnedSalary: dec(11000),
    transportAllowance: dec(1500),
    taxableTransport: dec(100.5),
    normalOtHours: dec(4),
    normalOtPay: dec(300.5),
    totalOtPay: dec(300.5),
    monthlyBonus: dec(200),
    bonusTopUp: dec(50),
    pensionEmployer: dec(1210),
    pensionEmployee: dec(770),
    taxableIncome: dec(10500.75),
    incomeTax: dec(1800.5),
    totalDeductions: dec(2570.5),
    netPay: dec(9229.5),
    contractNetBonus: dec(500),
    salaryPeriods: [
      {
        periodStart: utc(2026, 9, 1),
        periodEnd: utc(2026, 9, 15),
        days: dec(15),
        basicSalary: dec(10000),
        earnedSalary: dec(5000),
        normalOtHours: dec(2),
        normalOtPay: dec(100),
        totalOtPay: dec(100),
      },
      {
        periodStart: utc(2026, 9, 16),
        periodEnd: utc(2026, 9, 30),
        days: dec(15),
        basicSalary: dec(12000),
        earnedSalary: dec(6000),
        normalOtHours: dec(2),
        normalOtPay: dec(200.5),
        totalOtPay: dec(200.5),
      },
    ],
  });
  return [single, changed];
}

function runTotals(entries: PayrollExportEntry[]): {
  totalNetPay: Decimal;
  totalTax: Decimal;
  totalPensionEmp: Decimal;
  totalPensionEmr: Decimal;
} {
  const sum = (pick: (e: PayrollExportEntry) => Decimal): Decimal =>
    entries.reduce((acc, e) => acc.plus(pick(e)), dec(0));
  return {
    totalNetPay: sum((e) => e.netPay as Decimal),
    totalTax: sum((e) => e.incomeTax as Decimal),
    totalPensionEmp: sum((e) => e.pensionEmployee as Decimal),
    totalPensionEmr: sum((e) => e.pensionEmployer as Decimal),
  };
}

async function exportFixture(
  entries: PayrollExportEntry[],
  settings: PayrollCompanySettings = PAYROLL_SETTING_DEFAULTS,
): Promise<ExcelJS.Workbook> {
  const run = {
    id: RUN_ID,
    companyId: COMPANY_ID,
    runNumber: 'PR-2026-09',
    month: 9,
    year: 2026,
    status: 'GM_APPROVED' as const,
    creator: { firstName: 'Hana', lastName: 'Preparer' },
    approver: { firstName: 'Hiwot', lastName: 'Checker' },
    gmApprover: { firstName: 'Girma', lastName: 'Manager' },
    entries,
  };
  const prisma = {
    payrollRun: { findFirst: async (): Promise<typeof run> => run },
    employeeContract: {
      findMany: async (): Promise<
        Array<{
          employeeId: string;
          startDate: Date;
          endDate: Date;
          employee: { firstName: string; lastName: string; tin: string | null };
        }>
      > => [
        {
          employeeId: 'emp-resigned',
          startDate: utc(2023, 1, 10),
          endDate: utc(2026, 9, 20),
          employee: { firstName: 'Yonas', lastName: 'Bekele', tin: '0099887766' },
        },
      ],
    },
  };
  const settingsService = {
    getSettings: async (): Promise<PayrollCompanySettings> => settings,
  };
  const service = new PayrollExcelExportService(
    prisma as unknown as PrismaService,
    settingsService as unknown as PayrollCompanySettingsService,
  );
  const result = await service.exportRun(RUN_ID, COMPANY_ID);
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(result.buffer as unknown as ArrayBuffer);
  return workbook;
}

function cellNumber(sheet: ExcelJS.Worksheet, row: number, col: number): number {
  const value = sheet.getCell(row, col).value;
  return typeof value === 'number' ? value : 0;
}

function findDataTotalRow(sheet: ExcelJS.Worksheet): number {
  for (let row = DATA_FIRST_ROW; row < DATA_FIRST_ROW + 50; row += 1) {
    if (sheet.getCell(row, DATA_COL.name).value === 'TOTAL') {
      return row;
    }
  }
  throw new Error('TOTAL row not found on Data sheet');
}

function sumDataColumn(
  sheet: ExcelJS.Worksheet,
  col: number,
  lastRow: number,
): number {
  let total = 0;
  for (let row = DATA_FIRST_ROW; row <= lastRow; row += 1) {
    total += cellNumber(sheet, row, col);
  }
  return Math.round(total * 100) / 100;
}

describe('PayrollExcelExportService — Data sheet', () => {
  it('places POSITION between NAME EMPLOYEE and DATE OF EMPLOY\'T', async () => {
    const workbook = await exportFixture(makeFixtureEntries());
    const sheet = workbook.getWorksheet('Data')!;

    expect(sheet.getCell(3, DATA_COL.name).value).toBe('NAME EMPLOYEE');
    expect(sheet.getCell(3, DATA_COL.position).value).toBe('POSITION');
    expect(sheet.getCell(3, DATA_COL.employDate).value).toBe("DATE OF EMPLOY'T");
    expect(sheet.getCell(3, DATA_COL.basic).value).toBe(
      'BASIC SALARY/Br./MONTH',
    );
    expect(sheet.getCell(3, DATA_COL.netPay).value).toBe('NET PAY');
    expect(sheet.getCell(3, DATA_COL.notes).value).toBe('NOTES');
  });

  it('writes the title rows', async () => {
    const workbook = await exportFixture(makeFixtureEntries());
    const sheet = workbook.getWorksheet('Data')!;
    expect(sheet.getCell(1, 4).value).toBe(
      'CCECC Ethiopian Branch Salary Calculation Form',
    );
    expect(sheet.getCell(2, 4).value).toBe('Month September,2026');
  });

  it('writes the employee position on the first row of each employee', async () => {
    const workbook = await exportFixture(makeFixtureEntries());
    const sheet = workbook.getWorksheet('Data')!;
    expect(sheet.getCell(DATA_FIRST_ROW, DATA_COL.position).value).toBe(
      'Accountant',
    );
    expect(sheet.getCell(DATA_FIRST_ROW + 1, DATA_COL.position).value).toBe(
      'Site Engineer',
    );
  });

  it('splits a mid-month salary change into period rows with totals on the last row', async () => {
    const entries = makeFixtureEntries();
    const workbook = await exportFixture(entries);
    const sheet = workbook.getWorksheet('Data')!;

    const firstPeriodRow = DATA_FIRST_ROW + 1;
    const lastPeriodRow = DATA_FIRST_ROW + 2;

    expect(cellNumber(sheet, firstPeriodRow, DATA_COL.basic)).toBe(10000);
    expect(cellNumber(sheet, firstPeriodRow, DATA_COL.days)).toBe(15);
    expect(cellNumber(sheet, firstPeriodRow, DATA_COL.earned)).toBe(5000);
    expect(cellNumber(sheet, lastPeriodRow, DATA_COL.basic)).toBe(12000);
    expect(cellNumber(sheet, lastPeriodRow, DATA_COL.earned)).toBe(6000);

    // Entry-level tax/net only on the last period row; OT is per period.
    expect(sheet.getCell(firstPeriodRow, DATA_COL.netPay).value).toBeNull();
    expect(sheet.getCell(firstPeriodRow, DATA_COL.incomeTax).value).toBeNull();
    expect(cellNumber(sheet, firstPeriodRow, DATA_COL.totalOt)).toBe(100);
    expect(cellNumber(sheet, lastPeriodRow, DATA_COL.totalOt)).toBe(200.5);
    expect(cellNumber(sheet, lastPeriodRow, DATA_COL.netPay)).toBe(9229.5);
    expect(cellNumber(sheet, lastPeriodRow, DATA_COL.incomeTax)).toBe(1800.5);
    expect(cellNumber(sheet, lastPeriodRow, DATA_COL.bones)).toBe(250);

    // Identity columns merged vertically; notes on the first row.
    expect(sheet.getCell(lastPeriodRow, DATA_COL.name).value).toBe(
      'Sara Tesfaye',
    );
    const notes = String(sheet.getCell(firstPeriodRow, DATA_COL.notes).value);
    expect(notes).toContain('Salary change on 16/09/2026; total net 9,229.50');
    expect(notes).toContain('500 net bonus monthly');
    expect(sheet.getCell(lastPeriodRow, DATA_COL.notes).value).toBeNull();
  });

  it('sums data rows to the payroll run totals for run-level money columns', async () => {
    const entries = makeFixtureEntries();
    const totals = runTotals(entries);
    const workbook = await exportFixture(entries);
    const sheet = workbook.getWorksheet('Data')!;

    const totalRow = findDataTotalRow(sheet);
    const lastDataRow = totalRow - 1;

    expect(sumDataColumn(sheet, DATA_COL.netPay, lastDataRow)).toBeCloseTo(
      Number(totals.totalNetPay),
      2,
    );
    expect(sumDataColumn(sheet, DATA_COL.incomeTax, lastDataRow)).toBeCloseTo(
      Number(totals.totalTax),
      2,
    );
    expect(sumDataColumn(sheet, DATA_COL.pensionEmp, lastDataRow)).toBeCloseTo(
      Number(totals.totalPensionEmp),
      2,
    );
    expect(sumDataColumn(sheet, DATA_COL.pensionEmr, lastDataRow)).toBeCloseTo(
      Number(totals.totalPensionEmr),
      2,
    );

    // Basic/days/earned come from the period rows of the changed entry.
    expect(sumDataColumn(sheet, DATA_COL.earned, lastDataRow)).toBeCloseTo(
      10000 + 5000 + 6000,
      2,
    );

    const totalNetCell = sheet.getCell(totalRow, DATA_COL.netPay).value;
    expect(totalNetCell).toMatchObject({
      formula: `SUM(AB${DATA_FIRST_ROW}:AB${lastDataRow})`,
    });
  });

  it('computeDataSheetTotals equals the run totals', () => {
    const entries = makeFixtureEntries();
    const totals = runTotals(entries);
    const computed = computeDataSheetTotals(entries);

    expect(computed.netPay).toBeCloseTo(Number(totals.totalNetPay), 2);
    expect(computed.incomeTax).toBeCloseTo(Number(totals.totalTax), 2);
    expect(computed.pensionEmployee).toBeCloseTo(
      Number(totals.totalPensionEmp),
      2,
    );
    expect(computed.pensionEmployer).toBeCloseTo(
      Number(totals.totalPensionEmr),
      2,
    );
    expect(computed.taxableIncome).toBeCloseTo(9300 + 10500.75, 2);
  });
});

describe('PayrollExcelExportService — Payroll sheet', () => {
  it('writes the tax declaration header and one row per employee', async () => {
    const entries = makeFixtureEntries();
    const workbook = await exportFixture(entries);
    const sheet = workbook.getWorksheet('Payroll')!;

    expect(sheet.getCell(1, 1).value).toBe(PAYROLL_SETTING_DEFAULTS.orgNameTax);
    expect(sheet.getCell(2, 1).value).toBe(
      'PAYROLL FOR THE MONTH OF September 2026',
    );
    expect(sheet.getCell(3, 1).value).toBe('NAME LISTS OF INCOME TAX PAYER');
    expect(sheet.getCell(10, 3).value).toBe('c) Full name');
    expect(sheet.getCell(9, 2).value).toBe('b) Employee TIN');
    expect(sheet.getCell(10, 15).value).toBe('p) Net pay');

    // One row per employee (not per salary period).
    expect(sheet.getCell(11, 3).value).toBe('Abebe Kebede');
    expect(sheet.getCell(12, 3).value).toBe('Sara Tesfaye');
    expect(sheet.getCell(13, 1).value).toBe('Total Amount');
  });

  it('uses entry-level amounts and highlights a missing TIN', async () => {
    const workbook = await exportFixture(makeFixtureEntries());
    const sheet = workbook.getWorksheet('Payroll')!;

    // Employee 2 (salary change): e) earned for the whole entry, i) bonus only.
    expect(cellNumber(sheet, 12, 5)).toBe(11000);
    expect(cellNumber(sheet, 12, 9)).toBe(250);
    expect(cellNumber(sheet, 12, 14)).toBe(0);
    expect(cellNumber(sheet, 12, 15)).toBe(9229.5);

    expect(sheet.getCell(11, 2).value).toBe('0012345678');
    expect(sheet.getCell(12, 2).value).toBeNull();
    const fill = sheet.getCell(12, 2).fill as ExcelJS.FillPattern;
    expect(fill.fgColor?.argb).toBe('FFFFE0A0');
  });

  it('lists resigned employees and the signature row', async () => {
    const workbook = await exportFixture(makeFixtureEntries());
    const sheet = workbook.getWorksheet('Payroll')!;

    const texts: string[] = [];
    sheet.eachRow((row) => {
      row.eachCell((cell) => {
        if (typeof cell.value === 'string') {
          texts.push(cell.value);
        }
      });
    });
    expect(texts).toContain('Yonas Bekele');
    expect(texts).toContain('20/09/2026');
    expect(texts).toContain('Prepared By: Hana Preparer');
    expect(texts).toContain('Checked By: Hiwot Checker');
    expect(texts).toContain('Approved By: Girma Manager');
    expect(texts).toContain('Total amount paid for the Month');
    expect(texts).toContain('10  Total No of Employee');
  });
});
