import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  AuditLogSource,
  Prisma,
  type EmployeeType,
  type PayrollEntryFlag,
  type PayrollRunStatus,
} from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';
import * as ExcelJS from 'exceljs';
import { existsSync } from 'fs';
import { join } from 'path';
import { AuditService } from '../../../audit/application/services/audit.service';
import { PrismaService } from '../../../../shared/prisma/prisma.service';
import { formatEnglishName } from '../../../../shared/utils/user-display.util';
import {
  allowanceFormulaOrValue,
  colLetter,
  dataCellFormula,
  dataSumFormula,
  earnedFormula,
  eveningOtPayFormula,
  holidayOtPayFormula,
  incomeTaxFormula,
  netPayFormula,
  normalOtPayFormula,
  pensionEmployeeFormula,
  pensionEmployerFormula,
  round2,
  sumFormula,
  sundayOtPayFormula,
  taxableIncomeFormula,
  totalDeductionFormula,
  totalOtFormula,
} from './payroll-excel-export.formulas';
import { PayrollCompanySettingsService } from './payroll-company-settings.service';

const XLSX_MIME =
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

const MONEY_FORMAT = '#,##0.00';
const TEMPLATE_FILE = 'payroll-export-template.xlsx';

const DATA_FIRST_ROW = 5;
const DATA_TEMPLATE_LAST_EMP_ROW = 102;
const DATA_TEMPLATE_TOTALS_ROW = 103;

const PAYROLL_FIRST_ROW = 11;
const PAYROLL_TEMPLATE_LAST_EMP_ROW = 108;
const PAYROLL_TEMPLATE_TOTALS_ROW = 109;

const MONTH_NAMES = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
] as const;

/** Data sheet columns D–AB (1-based). */
const COL = {
  sn: 4,
  name: 5,
  position: 6,
  employDate: 7,
  basic: 8,
  payrollDays: 9,
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
  sign: 29,
  notes: 30,
} as const;

const DATA_SUM_COLS = [
  COL.basic,
  COL.payrollDays,
  COL.earned,
  COL.transport,
  COL.taxableTransport,
  COL.normalHr,
  COL.normalPay,
  COL.eveningHr,
  COL.eveningPay,
  COL.sundayHr,
  COL.sundayPay,
  COL.holidayHr,
  COL.holidayPay,
  COL.totalOt,
  COL.bones,
  COL.pensionEmr,
  COL.pensionEmp,
  COL.taxableIncome,
  COL.incomeTax,
  COL.totalDeduction,
  COL.netPay,
] as const;

const IDENTITY_COLS = [COL.sn, COL.name, COL.position, COL.employDate] as const;

const PCOL = {
  sn: 1,
  tin: 2,
  name: 3,
  employDate: 4,
  basic: 5,
  transport: 6,
  taxableTransport: 7,
  overTime: 8,
  bonus: 9,
  ssfEmployee: 10,
  ssfEmployer: 11,
  taxableIncome: 12,
  taxWithheld: 13,
  advance: 14,
  netPay: 15,
} as const;

type Numeric = Decimal | number;

export interface PayrollExportSalaryPeriod {
  periodStart: Date;
  periodEnd: Date;
  days: Numeric;
  basicSalary: Numeric;
  earnedSalary: Numeric;
  normalOtHours?: Numeric;
  normalOtPay?: Numeric;
  eveningOtHours?: Numeric;
  eveningOtPay?: Numeric;
  sundayOtHours?: Numeric;
  sundayOtPay?: Numeric;
  holidayOtHours?: Numeric;
  holidayOtPay?: Numeric;
  totalOtPay?: Numeric;
  /** Monthly transport on the contract in force for this period. */
  contractTransport?: Numeric;
  /** Monthly bonus on the contract in force for this period. */
  contractBonus?: Numeric;
}

export interface PayrollExportEntry {
  flag: PayrollEntryFlag;
  flagNote: string | null;
  notes: string | null;
  bonusTopUpReason: string | null;
  contractNetBonus: Numeric;
  netTopUp: Numeric;
  netTopUpReason: string | null;
  basicSalary: Numeric;
  payrollDays: Numeric;
  earnedSalary: Numeric;
  transportAllowance: Numeric;
  taxableTransport: Numeric;
  normalOtHours: Numeric;
  normalOtPay: Numeric;
  eveningOtHours: Numeric;
  eveningOtPay: Numeric;
  sundayOtHours: Numeric;
  sundayOtPay: Numeric;
  holidayOtHours: Numeric;
  holidayOtPay: Numeric;
  totalOtPay: Numeric;
  monthlyBonus: Numeric;
  bonusTopUp: Numeric;
  pensionEmployer: Numeric;
  pensionEmployee: Numeric;
  taxableIncome: Numeric;
  incomeTax: Numeric;
  totalDeductions: Numeric;
  netPay: Numeric;
  /** False for expatriate / freelancer contracts (pension formulas write 0). */
  pensionApplicable?: boolean;
  employee: {
    firstName: string;
    middleName?: string | null;
    lastName: string;
    tin: string | null;
    employeeType?: EmployeeType | null;
    excludedFromHrProcesses?: boolean;
    department: { name: string } | null;
    position: { title: string } | null;
  };
  contract: { startDate: Date; pensionApplicable?: boolean } | null;
  salaryPeriods: PayrollExportSalaryPeriod[];
}

export interface DataSheetTotals {
  netPay: number;
  incomeTax: number;
  taxableIncome: number;
  pensionEmployee: number;
  pensionEmployer: number;
}

export interface PayrollExcelExportResult {
  buffer: Buffer;
  filename: string;
  mimeType: string;
  /** Employees whose AB formula includes a post-tax net bonus / top-up term. */
  postTaxTopUpCount: number;
}

interface PersonName {
  firstName: string;
  middleName?: string | null;
  lastName: string;
}

interface EmployeeRowSpan {
  entry: PayrollExportEntry;
  firstRow: number;
  lastRow: number;
  serial: number;
}

/**
 * Sums entry-level money columns exactly as they appear on the Data sheet
 * first-row aggregates (net/tax/pension/taxable).
 */
export function computeDataSheetTotals(
  entries: ReadonlyArray<
    Pick<
      PayrollExportEntry,
      | 'netPay'
      | 'incomeTax'
      | 'taxableIncome'
      | 'pensionEmployee'
      | 'pensionEmployer'
    >
  >,
): DataSheetTotals {
  const totals: DataSheetTotals = {
    netPay: 0,
    incomeTax: 0,
    taxableIncome: 0,
    pensionEmployee: 0,
    pensionEmployer: 0,
  };
  for (const entry of entries) {
    totals.netPay += toNumber(entry.netPay);
    totals.incomeTax += toNumber(entry.incomeTax);
    totals.taxableIncome += toNumber(entry.taxableIncome);
    totals.pensionEmployee += toNumber(entry.pensionEmployee);
    totals.pensionEmployer += toNumber(entry.pensionEmployer);
  }
  return {
    netPay: round2(totals.netPay),
    incomeTax: round2(totals.incomeTax),
    taxableIncome: round2(totals.taxableIncome),
    pensionEmployee: round2(totals.pensionEmployee),
    pensionEmployer: round2(totals.pensionEmployer),
  };
}

@Injectable()
export class PayrollExcelExportService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly companySettings: PayrollCompanySettingsService,
    private readonly audit: AuditService,
  ) {}

  /**
   * Builds an HR salary-sheet Excel workbook for a payroll run from the
   * cleaned template (Data + Payroll). Buffer only — not stored on disk.
   */
  async exportRun(
    runId: string,
    companyId: string,
    userId: string,
  ): Promise<PayrollExcelExportResult> {
    const run = await this.prisma.payrollRun.findFirst({
      where: { id: runId, companyId, deletedAt: null },
      include: {
        entries: {
          include: {
            employee: {
              select: {
                firstName: true,
                middleName: true,
                lastName: true,
                employeeId: true,
                tin: true,
                employeeType: true,
                excludedFromHrProcesses: true,
                department: { select: { name: true } },
                position: { select: { title: true } },
              },
            },
            contract: {
              select: { startDate: true, pensionApplicable: true },
            },
            salaryPeriods: {
              orderBy: { periodStart: 'asc' },
              include: {
                contract: {
                  select: {
                    transportationAllowance: true,
                    monthlyBonus: true,
                  },
                },
              },
            },
          },
        },
      },
    });

    if (!run) {
      throw new NotFoundException('Payroll run not found');
    }
    if (run.status === 'CANCELLED') {
      throw new BadRequestException('Cannot export a cancelled payroll run');
    }

    await this.hydrateSalaryPeriodOvertime(run.entries);

    const entries: PayrollExportEntry[] = run.entries
      .filter((e) => e.employee.excludedFromHrProcesses !== true)
      .map((e) => this.mapEntry(e))
      .sort((a, b) => {
      const deptA = a.employee.department?.name ?? '';
      const deptB = b.employee.department?.name ?? '';
      const deptCmp = deptA.localeCompare(deptB, undefined, {
        sensitivity: 'base',
      });
      if (deptCmp !== 0) {
        return deptCmp;
      }
      return fullName(a.employee).localeCompare(fullName(b.employee), undefined, {
        sensitivity: 'base',
      });
    });

    await this.companySettings.getSettings(companyId);

    const workbook = await this.loadTemplate();
    const dataSheet = workbook.getWorksheet('Data');
    const payrollSheet = workbook.getWorksheet('Payroll');
    if (!dataSheet || !payrollSheet) {
      throw new NotFoundException('Payroll export template sheets missing');
    }

    const monthName = MONTH_NAMES[run.month - 1] ?? String(run.month);
    this.writePeriodTexts(dataSheet, payrollSheet, monthName, run.year);

    const dataRowCount = entries.reduce(
      (sum, e) => sum + Math.max(1, e.salaryPeriods.length > 1 ? e.salaryPeriods.length : 1),
      0,
    );
    this.resizeEmployeeBlock(
      dataSheet,
      DATA_FIRST_ROW,
      DATA_TEMPLATE_LAST_EMP_ROW,
      DATA_TEMPLATE_TOTALS_ROW,
      dataRowCount,
    );
    const payrollEmpCount = entries.length;
    this.resizeEmployeeBlock(
      payrollSheet,
      PAYROLL_FIRST_ROW,
      PAYROLL_TEMPLATE_LAST_EMP_ROW,
      PAYROLL_TEMPLATE_TOTALS_ROW,
      payrollEmpCount,
    );

    const spans = this.fillDataSheet(dataSheet, entries, run.status);
    const postTaxTopUpCount = this.fillPayrollSheet(payrollSheet, spans);

    const buffer = Buffer.from(await workbook.xlsx.writeBuffer());
    const mm = String(run.month).padStart(2, '0');
    const safeRun = run.runNumber.replace(/[^\w.-]+/g, '_');
    const filename = `Payroll_${run.year}_${mm}_${safeRun}.xlsx`;

    await this.audit.create({
        companyId,
      userId,
      module: 'payroll',
      action: 'export',
      recordType: 'PayrollRun',
      recordId: run.id,
      recordReference: run.runNumber,
      source: AuditLogSource.USER_ACTION,
      afterValue: {
        format: 'excel',
        filename,
        entryCount: entries.length,
        postTaxTopUpCount,
      },
    });

    return { buffer, filename, mimeType: XLSX_MIME, postTaxTopUpCount };
  }

  private mapEntry(raw: {
    flag: PayrollEntryFlag;
    flagNote: string | null;
    notes: string | null;
    bonusTopUpReason: string | null;
    contractNetBonus: Numeric;
    netTopUp: Numeric;
    netTopUpReason: string | null;
    basicSalary: Numeric;
    payrollDays: Numeric;
    earnedSalary: Numeric;
    transportAllowance: Numeric;
    taxableTransport: Numeric;
    normalOtHours: Numeric;
    normalOtPay: Numeric;
    eveningOtHours: Numeric;
    eveningOtPay: Numeric;
    sundayOtHours: Numeric;
    sundayOtPay: Numeric;
    holidayOtHours: Numeric;
    holidayOtPay: Numeric;
    totalOtPay: Numeric;
    monthlyBonus: Numeric;
    bonusTopUp: Numeric;
    pensionEmployer: Numeric;
    pensionEmployee: Numeric;
    taxableIncome: Numeric;
    incomeTax: Numeric;
    totalDeductions: Numeric;
    netPay: Numeric;
    employee: PayrollExportEntry['employee'];
    contract: { startDate: Date; pensionApplicable?: boolean } | null;
    salaryPeriods: Array<
      PayrollExportSalaryPeriod & {
        contract?: {
          transportationAllowance: Numeric | null;
          monthlyBonus: Numeric | null;
        } | null;
        normalOtHours?: Numeric;
        eveningOtHours?: Numeric;
        sundayOtHours?: Numeric;
        holidayOtHours?: Numeric;
        normalOtPay?: Numeric;
        eveningOtPay?: Numeric;
        sundayOtPay?: Numeric;
        holidayOtPay?: Numeric;
        totalOtPay?: Numeric;
      }
    >;
  }): PayrollExportEntry {
    return {
      flag: raw.flag,
      flagNote: raw.flagNote,
      notes: raw.notes,
      bonusTopUpReason: raw.bonusTopUpReason,
      contractNetBonus: raw.contractNetBonus,
      netTopUp: raw.netTopUp,
      netTopUpReason: raw.netTopUpReason,
      basicSalary: raw.basicSalary,
      payrollDays: raw.payrollDays,
      earnedSalary: raw.earnedSalary,
      transportAllowance: raw.transportAllowance,
      taxableTransport: raw.taxableTransport,
      normalOtHours: raw.normalOtHours,
      normalOtPay: raw.normalOtPay,
      eveningOtHours: raw.eveningOtHours,
      eveningOtPay: raw.eveningOtPay,
      sundayOtHours: raw.sundayOtHours,
      sundayOtPay: raw.sundayOtPay,
      holidayOtHours: raw.holidayOtHours,
      holidayOtPay: raw.holidayOtPay,
      totalOtPay: raw.totalOtPay,
      monthlyBonus: raw.monthlyBonus,
      bonusTopUp: raw.bonusTopUp,
      pensionEmployer: raw.pensionEmployer,
      pensionEmployee: raw.pensionEmployee,
      taxableIncome: raw.taxableIncome,
      incomeTax: raw.incomeTax,
      totalDeductions: raw.totalDeductions,
      netPay: raw.netPay,
      employee: raw.employee,
      contract: raw.contract,
      pensionApplicable:
        raw.employee.employeeType === 'FREELANCER'
          ? false
          : (raw.contract?.pensionApplicable ?? true),
      salaryPeriods: raw.salaryPeriods.map((p) => ({
        periodStart: p.periodStart,
        periodEnd: p.periodEnd,
        days: p.days,
        basicSalary: p.basicSalary,
        earnedSalary: p.earnedSalary,
        normalOtHours: p.normalOtHours,
        eveningOtHours: p.eveningOtHours,
        sundayOtHours: p.sundayOtHours,
        holidayOtHours: p.holidayOtHours,
        normalOtPay: p.normalOtPay,
        eveningOtPay: p.eveningOtPay,
        sundayOtPay: p.sundayOtPay,
        holidayOtPay: p.holidayOtPay,
        totalOtPay: p.totalOtPay,
        contractTransport: p.contract?.transportationAllowance ?? undefined,
        contractBonus: p.contract?.monthlyBonus ?? undefined,
      })),
    };
  }

  private async hydrateSalaryPeriodOvertime(
    entries: Array<{ salaryPeriods: Array<Record<string, unknown>> }>,
  ): Promise<void> {
    const periodIds = entries
      .flatMap((e) => e.salaryPeriods.map((p) => p.id))
      .filter((id): id is string => typeof id === 'string' && id.length > 0);
    if (periodIds.length === 0) {
      return;
    }
    const rows = await this.prisma.$queryRaw<
      Array<{
        id: string;
        normal_ot_hours: Decimal;
        evening_ot_hours: Decimal;
        sunday_ot_hours: Decimal;
        holiday_ot_hours: Decimal;
        normal_ot_pay: Decimal;
        evening_ot_pay: Decimal;
        sunday_ot_pay: Decimal;
        holiday_ot_pay: Decimal;
        total_ot_pay: Decimal;
      }>
    >`
      SELECT id,
             normal_ot_hours, evening_ot_hours, sunday_ot_hours, holiday_ot_hours,
             normal_ot_pay, evening_ot_pay, sunday_ot_pay, holiday_ot_pay, total_ot_pay
      FROM payroll_salary_period
      WHERE id IN (${Prisma.join(periodIds)})
    `;
    const byId = new Map(rows.map((r) => [r.id, r]));
    for (const entry of entries) {
      for (const period of entry.salaryPeriods) {
        const ot = byId.get(String(period.id));
        if (!ot) continue;
        period.normalOtHours = ot.normal_ot_hours;
        period.eveningOtHours = ot.evening_ot_hours;
        period.sundayOtHours = ot.sunday_ot_hours;
        period.holidayOtHours = ot.holiday_ot_hours;
        period.normalOtPay = ot.normal_ot_pay;
        period.eveningOtPay = ot.evening_ot_pay;
        period.sundayOtPay = ot.sunday_ot_pay;
        period.holidayOtPay = ot.holiday_ot_pay;
        period.totalOtPay = ot.total_ot_pay;
      }
    }
  }

  private async loadTemplate(): Promise<ExcelJS.Workbook> {
    const candidates = [
      join(process.cwd(), 'assets', 'templates', TEMPLATE_FILE),
      join(process.cwd(), 'backend', 'assets', 'templates', TEMPLATE_FILE),
    ];
    const path = candidates.find((p) => existsSync(p));
    if (!path) {
      throw new NotFoundException(
        `Payroll export template not found (${TEMPLATE_FILE})`,
      );
    }
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(path);
    return workbook;
  }

  private writePeriodTexts(
    dataSheet: ExcelJS.Worksheet,
    payrollSheet: ExcelJS.Worksheet,
    monthName: string,
    year: number,
  ): void {
    dataSheet.getCell(2, COL.sn).value = `Month ${monthName},${year}`;
    payrollSheet.getCell(2, 1).value = `PAYROLL FOR THE MONTH OF ${monthName} ${year}`;
    payrollSheet.getCell(5, 12).value = `Month: ${monthName}`;
    const yearCell = payrollSheet.getCell(5, 15);
    if (
      yearCell.value &&
      typeof yearCell.value === 'object' &&
      'richText' in yearCell.value
    ) {
      yearCell.value = {
        richText: [
          { text: 'Year', font: yearCell.value.richText[0]?.font },
          { text: ` ${year}`, font: yearCell.value.richText[1]?.font },
        ],
      };
    } else {
      yearCell.value = `Year ${year}`;
    }
  }

  /**
   * Shrinks or grows the empty employee block so data occupies
   * firstRow..(firstRow+needed-1) and totals sit at firstRow+needed.
   */
  private resizeEmployeeBlock(
    sheet: ExcelJS.Worksheet,
    firstRow: number,
    templateLastEmpRow: number,
    templateTotalsRow: number,
    needed: number,
  ): void {
    const templateCapacity = templateLastEmpRow - firstRow + 1;
    const totalsRow = templateTotalsRow;
    if (needed < templateCapacity) {
      const deleteStart = firstRow + Math.max(needed, 1);
      // Keep at least one prototype row when needed === 0 for style, then clear.
      const deleteCount = templateLastEmpRow - deleteStart + 1;
      if (deleteCount > 0) {
        this.spliceRowsPreserveMerges(sheet, deleteStart, deleteCount, 0);
      }
      if (needed === 0) {
        this.spliceRowsPreserveMerges(sheet, firstRow, 1, 0);
      }
      return;
    }
    if (needed > templateCapacity) {
      const insertAt = totalsRow;
      const insertCount = needed - templateCapacity;
      this.spliceRowsPreserveMerges(sheet, insertAt, 0, insertCount);
      const styleSource = sheet.getRow(firstRow);
      for (let i = 0; i < insertCount; i += 1) {
        const target = sheet.getRow(templateLastEmpRow + 1 + i);
        target.height = styleSource.height;
        for (let c = 1; c <= 30; c += 1) {
          const src = styleSource.getCell(c);
          const dst = target.getCell(c);
          if (src.style) {
            dst.style = { ...src.style };
          }
        }
      }
    }
  }

  private spliceRowsPreserveMerges(
    sheet: ExcelJS.Worksheet,
    start: number,
    deleteCount: number,
    insertCount: number,
  ): void {
    const delta = insertCount - deleteCount;
    if (delta === 0 && deleteCount === 0) {
      return;
    }
    const merges = [...(sheet.model.merges ?? [])];
    const toShift: Array<{ t: number; l: number; b: number; r: number }> = [];
    for (const rangeStr of merges) {
      const parsed = parseMerge(rangeStr);
      if (!parsed) continue;
      if (parsed.t >= start) {
        sheet.unMergeCells(parsed.t, parsed.l, parsed.b, parsed.r);
        toShift.push(parsed);
      }
    }
    sheet.spliceRows(start, deleteCount, ...Array.from({ length: insertCount }, () => []));
    for (const m of toShift) {
      sheet.mergeCells(m.t + delta, m.l, m.b + delta, m.r);
    }
  }

  private fillDataSheet(
    sheet: ExcelJS.Worksheet,
    entries: PayrollExportEntry[],
    _status: PayrollRunStatus,
  ): EmployeeRowSpan[] {
    const spans: EmployeeRowSpan[] = [];
    const columnSums = new Map<number, number>();
    let row = DATA_FIRST_ROW;
    let serial = 1;

    for (const entry of entries) {
      const periods =
        entry.salaryPeriods.length > 1
          ? [...entry.salaryPeriods].sort(
              (a, b) => a.periodStart.getTime() - b.periodStart.getTime(),
            )
          : null;
      const rowCount = periods ? periods.length : 1;
      const firstRow = row;
      const lastRow = row + rowCount - 1;
      spans.push({ entry, firstRow, lastRow, serial });

      for (let i = 0; i < rowCount; i += 1) {
        const r = firstRow + i;
        const isFirst = i === 0;
        const period = periods ? periods[i]! : null;
        this.writeDataEmployeeRow(sheet, r, {
          entry,
          period,
          serial,
          isFirst,
          firstRow,
          lastRow,
          columnSums,
        });
      }

      if (rowCount > 1) {
        for (const col of IDENTITY_COLS) {
          sheet.mergeCells(firstRow, col, lastRow, col);
        }
      }

      row = lastRow + 1;
      serial += 1;
    }

    const totalsRow = row;
    this.writeDataTotalsRow(sheet, totalsRow, DATA_FIRST_ROW, row - 1, columnSums);
    return spans;
  }

  private writeDataEmployeeRow(
    sheet: ExcelJS.Worksheet,
    row: number,
    ctx: {
      entry: PayrollExportEntry;
      period: PayrollExportSalaryPeriod | null;
      serial: number;
      isFirst: boolean;
      firstRow: number;
      lastRow: number;
      columnSums: Map<number, number>;
    },
  ): void {
    const { entry, period, serial, isFirst, firstRow, lastRow, columnSums } = ctx;
    const setValue = (
        col: number,
        value: string | number | null,
        numFmt?: string,
      ): void => {
      const cell = sheet.getCell(row, col);
      cell.value = value === '' ? null : value;
      if (typeof value === 'number' && numFmt) {
            cell.numFmt = numFmt;
          }
      if (typeof value === 'number' && (DATA_SUM_COLS as readonly number[]).includes(col)) {
        columnSums.set(col, round2((columnSums.get(col) ?? 0) + value));
      }
    };
    const setFormula = (
      col: number,
      formula: string,
      result: number,
      numFmt = MONEY_FORMAT,
    ): void => {
      const cell = sheet.getCell(row, col);
      cell.value = { formula, result };
      cell.numFmt = numFmt;
      if ((DATA_SUM_COLS as readonly number[]).includes(col)) {
        columnSums.set(col, round2((columnSums.get(col) ?? 0) + result));
      }
    };

    if (isFirst) {
      setValue(COL.sn, serial);
      setValue(COL.name, fullName(entry.employee));
      setValue(COL.position, entry.employee.position?.title ?? null);
      setValue(
        COL.employDate,
        entry.contract?.startDate
          ? formatDdMmYyyy(entry.contract.startDate)
          : null,
      );
    }

    const basic = toNumber(period ? period.basicSalary : entry.basicSalary);
    const days = toNumber(period ? period.days : entry.payrollDays);
    const earned = toNumber(period ? period.earnedSalary : entry.earnedSalary);
    setValue(COL.basic, basic, MONEY_FORMAT);
    setValue(COL.payrollDays, days);
    setFormula(COL.earned, earnedFormula(row), earned);

    const fullyAbsent =
      days === 0 &&
      toNumber(entry.transportAllowance) === 0 &&
      toNumber(entry.monthlyBonus) === 0;

    setValue(COL.taxableTransport, 0, MONEY_FORMAT);

    // Single-period rows use the engine's already-prorated amounts (plain values).
    // Multi-period rows use monthly×contractDays/30 formulas with calendar days.
    if (!period) {
      setValue(
        COL.transport,
        fullyAbsent ? 0 : toNumber(entry.transportAllowance),
        MONEY_FORMAT,
      );
      const topUp = isFirst ? toNumber(entry.bonusTopUp) : 0;
      setValue(
        COL.bones,
        fullyAbsent
          ? 0
          : round2(toNumber(entry.monthlyBonus) + topUp),
        MONEY_FORMAT,
      );
    } else {
      const monthlyTransport = toNumber(
        period.contractTransport ?? entry.transportAllowance,
      );
      const monthlyBonus = toNumber(
        period.contractBonus ?? entry.monthlyBonus,
      );
      const contractDays = inclusiveCalendarDays(
        period.periodStart,
        period.periodEnd,
      );
      const transportPart = fullyAbsent
        ? { value: 0 }
        : allowanceFormulaOrValue(monthlyTransport, contractDays);
      if (transportPart.formula) {
        setFormula(COL.transport, transportPart.formula, transportPart.value);
      } else {
        setValue(COL.transport, transportPart.value, MONEY_FORMAT);
      }

      const bonusBase = fullyAbsent
        ? { value: 0 }
        : allowanceFormulaOrValue(monthlyBonus, contractDays);
      const topUp = isFirst ? toNumber(entry.bonusTopUp) : 0;
      const bonusShare = round2(bonusBase.value + topUp);
      if (bonusBase.formula && topUp !== 0) {
        setFormula(COL.bones, `${bonusBase.formula}+${topUp}`, bonusShare);
      } else if (bonusBase.formula) {
        setFormula(COL.bones, bonusBase.formula, bonusBase.value);
      } else {
        setValue(COL.bones, bonusShare, MONEY_FORMAT);
      }
    }

    const nHr = toNumber(period ? period.normalOtHours ?? 0 : entry.normalOtHours);
    const eHr = toNumber(period ? period.eveningOtHours ?? 0 : entry.eveningOtHours);
    const sHr = toNumber(period ? period.sundayOtHours ?? 0 : entry.sundayOtHours);
    const hHr = toNumber(period ? period.holidayOtHours ?? 0 : entry.holidayOtHours);
    const nPay = toNumber(period ? period.normalOtPay ?? 0 : entry.normalOtPay);
    const ePay = toNumber(period ? period.eveningOtPay ?? 0 : entry.eveningOtPay);
    const sPay = toNumber(period ? period.sundayOtPay ?? 0 : entry.sundayOtPay);
    const hPay = toNumber(period ? period.holidayOtPay ?? 0 : entry.holidayOtPay);
    const totOt = toNumber(period ? period.totalOtPay ?? 0 : entry.totalOtPay);

    setValue(COL.normalHr, nHr);
    setValue(COL.eveningHr, eHr);
    setValue(COL.sundayHr, sHr);
    setValue(COL.holidayHr, hHr);
    setFormula(COL.normalPay, normalOtPayFormula(row), nPay);
    setFormula(COL.eveningPay, eveningOtPayFormula(row), ePay);
    setFormula(COL.sundayPay, sundayOtPayFormula(row), sPay);
    setFormula(COL.holidayPay, holidayOtPayFormula(row), hPay);
    setFormula(COL.totalOt, totalOtFormula(row), totOt);

      if (isFirst) {
      const exempt = isPensionExempt(entry);
      setFormula(
        COL.pensionEmr,
        pensionEmployerFormula(firstRow, lastRow, exempt),
        toNumber(entry.pensionEmployer),
      );
      setFormula(
        COL.pensionEmp,
        pensionEmployeeFormula(firstRow, lastRow, exempt),
        toNumber(entry.pensionEmployee),
      );
      setFormula(
        COL.taxableIncome,
        taxableIncomeFormula(firstRow, lastRow),
        toNumber(entry.taxableIncome),
      );
      setFormula(
        COL.incomeTax,
        incomeTaxFormula(firstRow),
        toNumber(entry.incomeTax),
      );
      setFormula(
        COL.totalDeduction,
        totalDeductionFormula(firstRow),
        toNumber(entry.totalDeductions),
      );
      const postTax = round2(
        toNumber(entry.contractNetBonus) + toNumber(entry.netTopUp),
      );
      const netCell = sheet.getCell(row, COL.netPay);
      netCell.value = {
        formula: netPayFormula(firstRow, lastRow, postTax),
        result: toNumber(entry.netPay),
      };
      netCell.numFmt = MONEY_FORMAT;
      columnSums.set(
        COL.netPay,
        round2((columnSums.get(COL.netPay) ?? 0) + toNumber(entry.netPay)),
      );
      if (postTax > 0) {
        netCell.note =
          `Includes post-tax net bonus/top-up ${postTax.toFixed(2)}` +
          (entry.netTopUpReason ? ` — ${entry.netTopUpReason}` : '');
      }
    }
  }

  private writeDataTotalsRow(
    sheet: ExcelJS.Worksheet,
    totalsRow: number,
    firstDataRow: number,
    lastDataRow: number,
    sums: Map<number, number>,
  ): void {
    const hasData = lastDataRow >= firstDataRow;
    for (const col of DATA_SUM_COLS) {
      const cell = sheet.getCell(totalsRow, col);
      const letter = colLetter(col);
      const result = round2(sums.get(col) ?? 0);
      if (hasData) {
        cell.value = {
          formula: sumFormula(letter, firstDataRow, lastDataRow),
          result,
        };
      } else {
        cell.value = 0;
      }
        cell.numFmt = MONEY_FORMAT;
      cell.font = { ...(cell.font ?? {}), bold: true };
    }
  }

  private fillPayrollSheet(
    sheet: ExcelJS.Worksheet,
    spans: EmployeeRowSpan[],
  ): number {
    let postTaxTopUpCount = 0;
    const sums = new Map<number, number>();
    let row = PAYROLL_FIRST_ROW;

    for (const span of spans) {
      const { entry, firstRow, lastRow, serial } = span;
      const postTax = round2(
        toNumber(entry.contractNetBonus) + toNumber(entry.netTopUp),
      );
      if (postTax > 0) {
        postTaxTopUpCount += 1;
      }

      const setF = (
        col: number,
        formula: string,
        result: number,
      ): void => {
        const cell = sheet.getCell(row, col);
        cell.value = { formula, result };
        cell.numFmt = MONEY_FORMAT;
        sums.set(col, round2((sums.get(col) ?? 0) + result));
      };

      sheet.getCell(row, PCOL.sn).value = serial;
      sheet.getCell(row, PCOL.tin).value = entry.employee.tin?.trim() || null;
      sheet.getCell(row, PCOL.name).value = fullName(entry.employee);
      sheet.getCell(row, PCOL.employDate).value = entry.contract?.startDate
        ? formatDdMmYyyy(entry.contract.startDate)
        : null;

      setF(
        PCOL.basic,
        dataSumFormula('J', firstRow, lastRow),
        toNumber(entry.earnedSalary),
      );
      setF(
        PCOL.transport,
        dataSumFormula('K', firstRow, lastRow),
        toNumber(entry.transportAllowance),
      );
      setF(PCOL.taxableTransport, dataSumFormula('L', firstRow, lastRow), 0);
      setF(
        PCOL.overTime,
        dataSumFormula('U', firstRow, lastRow),
        toNumber(entry.totalOtPay),
      );
      setF(
        PCOL.bonus,
        dataSumFormula('V', firstRow, lastRow),
        round2(toNumber(entry.monthlyBonus) + toNumber(entry.bonusTopUp)),
      );
      setF(
        PCOL.ssfEmployee,
        dataCellFormula('X', firstRow),
        toNumber(entry.pensionEmployee),
      );
      setF(
        PCOL.ssfEmployer,
        dataCellFormula('W', firstRow),
        toNumber(entry.pensionEmployer),
      );
      const taxable = toNumber(entry.taxableIncome);
      sheet.getCell(row, PCOL.taxableIncome).value = {
        formula: `E${row}+G${row}+H${row}+I${row}`,
        result: taxable,
      };
      sheet.getCell(row, PCOL.taxableIncome).numFmt = MONEY_FORMAT;
      sums.set(
        PCOL.taxableIncome,
        round2((sums.get(PCOL.taxableIncome) ?? 0) + taxable),
      );
      setF(
        PCOL.taxWithheld,
        dataCellFormula('Z', firstRow),
        toNumber(entry.incomeTax),
      );
      sheet.getCell(row, PCOL.advance).value = 0;
      sheet.getCell(row, PCOL.advance).numFmt = MONEY_FORMAT;
      setF(
        PCOL.netPay,
        dataCellFormula('AB', firstRow),
        toNumber(entry.netPay),
      );

      row += 1;
    }

    const totalsRow = row;
    const firstEmp = PAYROLL_FIRST_ROW;
    const lastEmp = row - 1;
    const payrollSumCols = [
      PCOL.basic,
      PCOL.transport,
      PCOL.taxableTransport,
      PCOL.overTime,
      PCOL.bonus,
      PCOL.ssfEmployee,
      PCOL.ssfEmployer,
      PCOL.taxableIncome,
      PCOL.taxWithheld,
      PCOL.advance,
      PCOL.netPay,
    ] as const;
    for (const col of payrollSumCols) {
      const cell = sheet.getCell(totalsRow, col);
      const letter = colLetter(col);
      const result = round2(sums.get(col) ?? 0);
      if (lastEmp >= firstEmp) {
        cell.value = {
          formula: sumFormula(letter, firstEmp, lastEmp),
          result,
        };
      } else {
        cell.value = 0;
      }
      cell.numFmt = MONEY_FORMAT;
      cell.font = { ...(cell.font ?? {}), bold: true };
    }
    // Ensure "Total Amount" label remains on the totals row.
    const label = sheet.getCell(totalsRow, PCOL.sn).value;
    if (label == null || label === '') {
      sheet.getCell(totalsRow, PCOL.sn).value = 'Total Amount';
    }

    // Keep footer labels; leave Prepared / Checked / Approved name cells blank.
    this.clearSignerNameCells(sheet);

    return postTaxTopUpCount;
  }

  /**
   * Clears name cells beside Prepared By / Checked By / Approved By so the
   * export does not fill (or leave template) signer names.
   */
  private clearSignerNameCells(sheet: ExcelJS.Worksheet): void {
    for (let r = 20; r <= 200; r += 1) {
      const a = stringifyCell(sheet.getCell(r, 1).value);
      if (a.includes('Prepared By')) {
        sheet.getCell(r, 2).value = null;
        sheet.getCell(r, 3).value = null;
      }
      const j = stringifyCell(sheet.getCell(r, 10).value);
      if (j.includes('Checked By')) {
        sheet.getCell(r, 11).value = null;
        sheet.getCell(r, 12).value = null;
      }
      const n = stringifyCell(sheet.getCell(r, 14).value);
      if (n.includes('Approved By')) {
        sheet.getCell(r, 15).value = null;
      }
      for (let c = 1; c <= 15; c += 1) {
        const v = sheet.getCell(r, c).value;
        if (typeof v === 'string' && /Mekides Asfaw|Asli M\./i.test(v)) {
          sheet.getCell(r, c).value = null;
        }
      }
    }
  }
}

function fullName(person: PersonName): string {
  return formatEnglishName(person);
}

function toNumber(value: Numeric | null | undefined): number {
  if (value == null) {
    return 0;
  }
  if (typeof value === 'number') {
    return value;
  }
  return Number(value);
}

function isPensionExempt(entry: PayrollExportEntry): boolean {
  if (entry.pensionApplicable === false) {
    return true;
  }
  if (entry.employee.employeeType === 'FREELANCER') {
    return true;
  }
  // Expatriate contracts store pensionApplicable=false; treat zero pensions as exempt.
  return (
    toNumber(entry.pensionEmployer) === 0 && toNumber(entry.pensionEmployee) === 0
  );
}

function inclusiveCalendarDays(start: Date, end: Date): number {
  const ms = utcDateOnly(end).getTime() - utcDateOnly(start).getTime();
  return Math.floor(ms / (24 * 60 * 60 * 1000)) + 1;
}

function utcDateOnly(date: Date): Date {
  return new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
  );
}

function formatDdMmYyyy(date: Date): string {
  const day = String(date.getUTCDate()).padStart(2, '0');
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const year = date.getUTCFullYear();
  if (
    date.getUTCHours() === 0 &&
    date.getUTCMinutes() === 0 &&
    date.getUTCSeconds() === 0 &&
    date.getUTCMilliseconds() === 0
  ) {
    return `${day}/${month}/${year}`;
  }
  const localDay = String(date.getDate()).padStart(2, '0');
  const localMonth = String(date.getMonth() + 1).padStart(2, '0');
  const localYear = date.getFullYear();
  return `${localDay}/${localMonth}/${localYear}`;
}

function parseMerge(
  rangeStr: string,
): { t: number; l: number; b: number; r: number } | null {
  const m = /^([A-Z]+)(\d+):([A-Z]+)(\d+)$/.exec(rangeStr);
  if (!m) {
    return null;
  }
  return {
    l: lettersToCol(m[1]!),
    t: Number(m[2]),
    r: lettersToCol(m[3]!),
    b: Number(m[4]),
  };
}

function lettersToCol(letters: string): number {
  let n = 0;
  for (const ch of letters) {
    n = n * 26 + (ch.charCodeAt(0) - 64);
  }
  return n;
}

function stringifyCell(value: ExcelJS.CellValue): string {
  if (value == null) {
    return '';
  }
  if (typeof value === 'string' || typeof value === 'number') {
    return String(value);
  }
  if (typeof value === 'object' && 'richText' in value && Array.isArray(value.richText)) {
    return value.richText.map((p) => p.text).join('');
  }
  if (typeof value === 'object' && 'text' in value && typeof value.text === 'string') {
    return value.text;
  }
  return '';
}
