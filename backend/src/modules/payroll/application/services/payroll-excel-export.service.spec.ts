import { describe, expect, it } from '@jest/globals';
import * as ExcelJS from 'exceljs';
import { HyperFormula } from 'hyperformula';
import { Decimal } from '@prisma/client/runtime/library';
import type { AuditService } from '../../../audit/application/services/audit.service';
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
import { round2 } from './payroll-excel-export.formulas';

const COMPANY_ID = 'company-1';
const RUN_ID = 'run-1';
const USER_ID = 'user-1';
const DATA_FIRST_ROW = 6;
const PAYROLL_FIRST_ROW = 6;

const DATA_COL = {
  name: 5,
  position: 6,
  basic: 8,
  days: 9,
  earned: 10,
  transport: 11,
  taxableTransport: 12,
  normalHr: 13,
  normalPay: 14,
  eveningHr: 15,
  eveningPay: 16,
  sundayHr: 17,
  sundayPay: 18,
  holidayHr: 19,
  holidayPay: 20,
  totalOt: 21,
  bones: 22,
  pensionEmr: 23,
  pensionEmp: 24,
  taxableIncome: 25,
  incomeTax: 26,
  totalDeduction: 27,
  netPay: 28,
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
    transportAllowance: dec(900),
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
    taxableIncome: dec(10000),
    incomeTax: dec(1650),
    totalDeductions: dec(2350),
    netPay: dec(8550),
    contract: { startDate: utc(2024, 2, 1) },
    salaryPeriods: [],
    ...rest,
    employee: {
      firstName: 'Abebe',
      middleName: 'Tadesse',
      lastName: 'Kebede',
      tin: '0012345678',
      employeeType: 'PERMANENT',
      excludedFromHrProcesses: false,
      department: { name: 'Finance' },
      position: { title: 'Accountant' },
      ...employee,
    },
  };
}

/** Fixture covering the cases required by the export spec. */
function makeFixtureEntries(): PayrollExportEntry[] {
  const fullMonth = makeEntry();

  // Tax on 4200 is 20% bracket: 4200*0.2-500 = 340 (not the 15% band).
  const joiner = makeEntry({
    employee: {
      firstName: 'Hana',
      middleName: null,
      lastName: 'Lemma',
      tin: '002',
      position: { title: 'Joiner' },
    },
    basicSalary: dec(9000),
    payrollDays: dec(14),
    earnedSalary: dec(4200),
    transportAllowance: dec(420),
    monthlyBonus: dec(0),
    pensionEmployer: dec(462),
    pensionEmployee: dec(294),
    taxableIncome: dec(4200),
    incomeTax: dec(340),
    totalDeductions: dec(634),
    netPay: dec(3986),
    contract: { startDate: utc(2026, 8, 17) },
  });

  // Renewal mid-month: two periods, OT on both sides, absence in each part.
  // Calendar days 14+16=30 so K/V formulas sum to monthly transport/bonus.
  // Values below match ROUND(H/30*I,2), OT and tax formulas exactly.
  const renewalEarned = 4000 + 6400; // 10000/30*12 + 12000/30*16
  const renewalOt = 156.25 + 187.5; // H/192*M*1.5 each side
  const renewalBonus = 140 + 160 + 50; // 300*14/30 + 300*16/30 + top-up
  const renewalTaxable = renewalEarned + renewalOt + renewalBonus; // L=0
  const renewalPensionEmr = round2(renewalEarned * 0.11);
  const renewalPensionEmp = round2(renewalEarned * 0.07);
  const renewalTax = round2(renewalTaxable * 0.3 - 1350); // 10400+343.75+350=11193.75 → 30% bracket
  const renewalNet = round2(
    renewalEarned + 900 + renewalOt + renewalBonus - (renewalPensionEmp + renewalTax) + 300,
  );
  const renewal = makeEntry({
    employee: {
      firstName: 'Sara',
      middleName: 'Alemu',
      lastName: 'Tesfaye',
      tin: null,
      position: { title: 'Site Engineer' },
    },
    basicSalary: dec(12000),
    payrollDays: dec(28),
    earnedSalary: dec(renewalEarned),
    transportAllowance: dec(900),
    monthlyBonus: dec(300),
    bonusTopUp: dec(50),
    normalOtHours: dec(4),
    normalOtPay: dec(renewalOt),
    totalOtPay: dec(renewalOt),
    pensionEmployer: dec(renewalPensionEmr),
    pensionEmployee: dec(renewalPensionEmp),
    taxableIncome: dec(round2(renewalTaxable)),
    incomeTax: dec(renewalTax),
    totalDeductions: dec(round2(renewalPensionEmp + renewalTax)),
    netPay: dec(renewalNet),
    contractNetBonus: dec(100),
    netTopUp: dec(200),
    netTopUpReason: 'Project completion',
    salaryPeriods: [
      {
        periodStart: utc(2026, 8, 1),
        periodEnd: utc(2026, 8, 14),
        days: dec(12),
        basicSalary: dec(10000),
        earnedSalary: dec(4000),
        contractTransport: dec(900),
        contractBonus: dec(300),
        normalOtHours: dec(2),
        normalOtPay: dec(156.25),
        totalOtPay: dec(156.25),
      },
      {
        periodStart: utc(2026, 8, 15),
        periodEnd: utc(2026, 8, 30),
        days: dec(16),
        basicSalary: dec(12000),
        earnedSalary: dec(6400),
        contractTransport: dec(900),
        contractBonus: dec(300),
        normalOtHours: dec(2),
        normalOtPay: dec(187.5),
        totalOtPay: dec(187.5),
      },
    ],
  });

  const fullyAbsent = makeEntry({
    employee: {
      firstName: 'Zero',
      middleName: 'Day',
      lastName: 'Absent',
      tin: '003',
      position: { title: 'Labour' },
    },
    payrollDays: dec(0),
    earnedSalary: dec(0),
    transportAllowance: dec(0),
    monthlyBonus: dec(0),
    pensionEmployer: dec(0),
    pensionEmployee: dec(0),
    taxableIncome: dec(0),
    incomeTax: dec(0),
    totalDeductions: dec(0),
    netPay: dec(0),
  });

  const expatriate = makeEntry({
    employee: {
      firstName: 'John',
      middleName: 'Q',
      lastName: 'Expat',
      tin: '004',
      employeeType: 'CONTRACT',
      position: { title: 'Advisor' },
    },
    pensionApplicable: false,
    contract: { startDate: utc(2024, 2, 1), pensionApplicable: false },
    pensionEmployer: dec(0),
    pensionEmployee: dec(0),
    taxableIncome: dec(10000),
    incomeTax: dec(1650),
    totalDeductions: dec(1650),
    netPay: dec(9250),
  });

  return [fullMonth, joiner, renewal, fullyAbsent, expatriate];
}

async function exportFixture(
  entries: PayrollExportEntry[],
): Promise<{
  workbook: ExcelJS.Workbook;
  result: Awaited<ReturnType<PayrollExcelExportService['exportRun']>>;
  auditCalls: unknown[];
}> {
  const run = {
    id: RUN_ID,
    companyId: COMPANY_ID,
    runNumber: 'PR-2026-08',
    month: 8,
    year: 2026,
    status: 'GM_APPROVED' as const,
    creator: { firstName: 'Hana', middleName: null, lastName: 'Preparer' },
    approver: { firstName: 'Hiwot', middleName: null, lastName: 'Checker' },
    gmApprover: { firstName: 'Girma', middleName: null, lastName: 'Manager' },
    entries: entries.map((e, i) => ({
      ...e,
      id: `entry-${i}`,
      salaryPeriods: e.salaryPeriods.map((p, j) => ({
        ...p,
        id: `period-${i}-${j}`,
        contract: {
          transportationAllowance: p.contractTransport ?? e.transportAllowance,
          monthlyBonus: p.contractBonus ?? e.monthlyBonus,
        },
      })),
    })),
  };
  const auditCalls: unknown[] = [];
  const prisma = {
    payrollRun: {
      findFirst: async (): Promise<{
        id: string;
        runNumber: string;
        month: number;
        year: number;
        status: string;
      }> => ({
        id: run.id,
        runNumber: run.runNumber,
        month: run.month,
        year: run.year,
        status: run.status,
      }),
    },
    payrollEntry: {
      findMany: async (args: {
        where?: { runId?: string; id?: { in: string[] } };
        select?: unknown;
        include?: unknown;
      }): Promise<unknown[]> => {
        if (args.where?.id?.in) {
          const idSet = new Set(args.where.id.in);
          return run.entries.filter((e) => idSet.has(e.id));
        }
        // Ordered-id pass: lightweight employee fields only.
        return run.entries.map((e) => ({
          id: e.id,
          employee: {
            firstName: e.employee.firstName,
            middleName: e.employee.middleName ?? null,
            lastName: e.employee.lastName,
            excludedFromHrProcesses: e.employee.excludedFromHrProcesses ?? false,
            department: e.employee.department,
          },
        }));
      },
    },
    $queryRaw: async (): Promise<unknown[]> => [],
    user: {
      findUnique: async (): Promise<{ firstName: string; lastName: string }> => ({
        firstName: 'Hana',
        lastName: 'Preparer',
      }),
    },
  };
  const settingsService = {
    getSettings: async (): Promise<PayrollCompanySettings> =>
      PAYROLL_SETTING_DEFAULTS,
  };
  const audit = {
    create: async (input: unknown): Promise<void> => {
      auditCalls.push(input);
    },
  };
  const service = new PayrollExcelExportService(
    prisma as unknown as PrismaService,
    settingsService as unknown as PayrollCompanySettingsService,
    audit as unknown as AuditService,
  );
  const result = await service.exportRun(RUN_ID, COMPANY_ID, USER_ID);
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(result.buffer as unknown as ArrayBuffer);
  return { workbook, result, auditCalls };
}

function cellFormula(sheet: ExcelJS.Worksheet, row: number, col: number): string | null {
  const value = sheet.getCell(row, col).value;
  if (value && typeof value === 'object' && 'formula' in value) {
    return String(value.formula);
  }
  return null;
}

function cellResult(sheet: ExcelJS.Worksheet, row: number, col: number): number {
  const value = sheet.getCell(row, col).value;
  if (typeof value === 'number') {
    return value;
  }
  if (value && typeof value === 'object' && 'result' in value) {
    return Number(value.result ?? 0);
  }
  return 0;
}

function findDataRowByName(sheet: ExcelJS.Worksheet, name: string): number {
  for (let row = DATA_FIRST_ROW; row < DATA_FIRST_ROW + 50; row += 1) {
    if (sheet.getCell(row, DATA_COL.name).value === name) {
      return row;
    }
  }
  throw new Error(`Employee row not found: ${name}`);
}

function sheetToHfMatrix(
  sheet: ExcelJS.Worksheet,
  maxRow: number,
  maxCol: number,
): (string | number | boolean | null)[][] {
  const rows: (string | number | boolean | null)[][] = [];
  for (let r = 1; r <= maxRow; r += 1) {
    const row: (string | number | boolean | null)[] = [];
    for (let c = 1; c <= maxCol; c += 1) {
      const value = sheet.getCell(r, c).value;
      if (value && typeof value === 'object' && 'formula' in value) {
        row.push(`=${String(value.formula)}`);
      } else if (typeof value === 'number') {
        row.push(value);
      } else if (typeof value === 'boolean') {
        row.push(value);
      } else if (typeof value === 'string') {
        row.push(value);
      } else {
        row.push(null);
      }
    }
    rows.push(row);
  }
  return rows;
}

function hfNumber(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (value && typeof value === 'object' && 'value' in value) {
    const inner = (value as { value: unknown }).value;
    if (typeof inner === 'number') {
      return inner;
    }
    if (typeof inner === 'string') {
      const n = Number(inner);
      return Number.isFinite(n) ? n : Number.NaN;
    }
  }
  return Number.NaN;
}

describe('PayrollExcelExportService - streaming writer + formulas', () => {
  jest.setTimeout(60_000);

  it('writes full first+middle+last names on Data and Payroll', async () => {
    const { workbook } = await exportFixture(makeFixtureEntries());
    const data = workbook.getWorksheet('Data')!;
    const payroll = workbook.getWorksheet('Payroll')!;

    expect(data.getCell(DATA_FIRST_ROW, DATA_COL.name).value).toBe(
      'Abebe Tadesse Kebede',
    );
    expect(payroll.getCell(PAYROLL_FIRST_ROW, 3).value).toBe(
      'Abebe Tadesse Kebede',
    );
    expect(data.getCell(2, 4).value).toBe('Salary Sheet (Data) - August 2026');
    expect(String(payroll.getCell(2, 1).value)).toContain(
      'PAYROLL FOR THE MONTH OF August 2026',
    );
  });

  it('uses the document layout and sizes columns so no number shows #####', async () => {
    const { workbook } = await exportFixture(makeFixtureEntries());
    for (const name of ['Data', 'Payroll']) {
      const sheet = workbook.getWorksheet(name)!;
      expect(sheet.views[0]).toMatchObject({ state: 'frozen', showGridLines: false });
      const headerRow = DATA_FIRST_ROW - 1;
      const firstCol = name === 'Data' ? 4 : 1;
      expect(sheet.getCell(headerRow, firstCol).font).toMatchObject({
        name: 'Arial',
        bold: true,
      });
      sheet.eachRow((row, rowNumber) => {
        if (rowNumber <= headerRow) return;
        row.eachCell((cell, col) => {
          const value = cell.value;
          const num =
            typeof value === 'number'
              ? value
              : value && typeof value === 'object' && 'result' in value
                ? Number(value.result ?? 0)
                : null;
          if (num == null) return;
          const shown = num.toLocaleString('en-US', {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
          });
          const width = sheet.getColumn(col).width ?? 8.43;
          expect({ sheet: name, rowNumber, col, fits: width >= shown.length + 1 }).toEqual({
            sheet: name,
            rowNumber,
            col,
            fits: true,
          });
        });
      });
    }
  });

  it('splits renewal into two Data rows with identity merge and first-row aggregates', async () => {
    const { workbook } = await exportFixture(makeFixtureEntries());
    const data = workbook.getWorksheet('Data')!;
    const first = findDataRowByName(data, 'Sara Alemu Tesfaye');
    const second = first + 1;
    expect(cellResult(data, first, DATA_COL.basic)).toBe(10000);
    expect(cellResult(data, second, DATA_COL.basic)).toBe(12000);
    expect(data.getCell(second, DATA_COL.pensionEmr).value).toBeNull();
    expect(cellFormula(data, first, DATA_COL.pensionEmr)).toContain(
      `SUM(J${first}:J${second})`,
    );
  });

  it('zeros pension for expatriates and keeps fully-absent transport/bonus at 0', async () => {
    const { workbook } = await exportFixture(makeFixtureEntries());
    const data = workbook.getWorksheet('Data')!;
    const absentRow = findDataRowByName(data, 'Zero Day Absent');
    const expatRow = findDataRowByName(data, 'John Q Expat');
    expect(cellResult(data, absentRow, DATA_COL.days)).toBe(0);
    expect(cellResult(data, absentRow, DATA_COL.transport)).toBe(0);
    expect(cellResult(data, absentRow, DATA_COL.bones)).toBe(0);
    expect(cellFormula(data, expatRow, DATA_COL.pensionEmr)).toBe('0');
    expect(cellResult(data, expatRow, DATA_COL.pensionEmp)).toBe(0);
  });

  it('always writes pension formulas for freelancers, even if the contract opts out', async () => {
    const freelancer = makeEntry({
      employee: { firstName: 'Free', middleName: 'L', lastName: 'Ancer', employeeType: 'FREELANCER' },
      contract: { startDate: utc(2025, 1, 1), pensionApplicable: false },
    });
    const { workbook } = await exportFixture([freelancer]);
    const data = workbook.getWorksheet('Data')!;
    const row = findDataRowByName(data, 'Free L Ancer');
    expect(cellFormula(data, row, DATA_COL.pensionEmr)).toBe(`ROUND(SUM(J${row}:J${row})*11%,2)`);
    expect(cellFormula(data, row, DATA_COL.pensionEmp)).toBe(`ROUND(SUM(J${row}:J${row})*7%,2)`);
  });

  it('lists employees alphabetically by full name, ignoring department', async () => {
    const { workbook } = await exportFixture(makeFixtureEntries());
    const data = workbook.getWorksheet('Data')!;
    const payroll = workbook.getWorksheet('Payroll')!;
    const payrollNames: string[] = [];
    for (let row = PAYROLL_FIRST_ROW; ; row += 1) {
      const name = payroll.getCell(row, 3).value;
      if (typeof name !== 'string' || name === 'Total Amount') break;
      payrollNames.push(name);
    }
    const dataNames: string[] = [];
    for (let row = DATA_FIRST_ROW; row < DATA_FIRST_ROW + 50; row += 1) {
      const name = data.getCell(row, DATA_COL.name).value;
      if (name === 'Total') break;
      // A multi-contract employee's merged name cell reads back on each row.
      if (typeof name === 'string' && name !== dataNames[dataNames.length - 1]) {
        dataNames.push(name);
      }
    }
    const sorted = [...payrollNames].sort((a, b) =>
      a.localeCompare(b, undefined, { sensitivity: 'base' }),
    );
    expect(payrollNames.length).toBeGreaterThan(1);
    expect(payrollNames).toEqual(sorted);
    expect(dataNames).toEqual(sorted);
  });

  it('audit-logs the export and reports post-tax top-up count', async () => {
    const { result, auditCalls } = await exportFixture(makeFixtureEntries());
    expect(result.postTaxTopUpCount).toBe(1);
    expect(auditCalls).toHaveLength(1);
    expect(auditCalls[0]).toMatchObject({
      module: 'payroll',
      action: 'export',
      recordType: 'PayrollRun',
      recordId: RUN_ID,
    });
  });

  it('computeDataSheetTotals matches fixture run totals', () => {
    const entries = makeFixtureEntries();
    const computed = computeDataSheetTotals(entries);
    const net = entries.reduce((s, e) => s + Number(e.netPay), 0);
    expect(computed.netPay).toBeCloseTo(round2(net), 2);
  });

  it('HyperFormula recomputes Data money cells to the cached system values', async () => {
    const { workbook } = await exportFixture(makeFixtureEntries());
    const data = workbook.getWorksheet('Data')!;
    const lastDataRow = DATA_FIRST_ROW + 5; // 5 employees, one dual-row → 6 data rows
    const totalsRow = lastDataRow + 1;
    const matrix = sheetToHfMatrix(data, totalsRow, 28);
    const hf = HyperFormula.buildFromArray(matrix, {
      licenseKey: 'gpl-v3',
      precisionRounding: 10,
    });

    const moneyCols = [
      DATA_COL.earned,
      DATA_COL.transport,
      DATA_COL.normalPay,
      DATA_COL.eveningPay,
      DATA_COL.sundayPay,
      DATA_COL.holidayPay,
      DATA_COL.totalOt,
      DATA_COL.bones,
      DATA_COL.pensionEmr,
      DATA_COL.pensionEmp,
      DATA_COL.taxableIncome,
      DATA_COL.incomeTax,
      DATA_COL.totalDeduction,
      DATA_COL.netPay,
    ];

    for (let r = DATA_FIRST_ROW; r <= lastDataRow; r += 1) {
      for (const col of moneyCols) {
        const formula = cellFormula(data, r, col);
        if (!formula) {
          continue;
        }
        const cached = cellResult(data, r, col);
        const recomputed = hf.getCellValue({ sheet: 0, row: r - 1, col: col - 1 });
        const num = hfNumber(recomputed);
        if (Number.isNaN(num)) {
          throw new Error(
            `HF error at r${r} c${col} formula=${formula} cached=${cached} raw=${JSON.stringify(recomputed)}`,
          );
        }
        expect(round2(num)).toBeCloseTo(round2(cached), 2);
      }
    }

    const totalsCached = cellResult(data, totalsRow, DATA_COL.netPay);
    const totalsHf = hf.getCellValue({
      sheet: 0,
      row: totalsRow - 1,
      col: DATA_COL.netPay - 1,
    });
    expect(round2(hfNumber(totalsHf))).toBeCloseTo(round2(totalsCached), 2);
  });
});
