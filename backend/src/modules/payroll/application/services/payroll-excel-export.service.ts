import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, type PayrollEntryFlag, type PayrollRunStatus } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';
import * as ExcelJS from 'exceljs';
import { PrismaService } from '../../../../shared/prisma/prisma.service';
import {
  PayrollCompanySettings,
  PayrollCompanySettingsService,
} from './payroll-company-settings.service';

const XLSX_MIME =
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

const MONEY_FORMAT = '#,##0.00';
const HOURS_DAYS_FORMAT = '0.0';
const AMBER_FILL = 'FFFFF8E1';
const MISSING_TIN_FILL = 'FFFFE0A0';
const HEADER_FILL = 'FFF2F2F2';
const BLACK = 'FF000000';
const THIN_BORDER: Partial<ExcelJS.Borders> = {
  top: { style: 'thin', color: { argb: BLACK } },
  left: { style: 'thin', color: { argb: BLACK } },
  bottom: { style: 'thin', color: { argb: BLACK } },
  right: { style: 'thin', color: { argb: BLACK } },
};

/** Excel paper size 8 = A3 (not in ExcelJS.PaperSize enum). */
const PAPER_SIZE_A3 = 8 as ExcelJS.PaperSize;
/** Excel paper size 9 = A4. */
const PAPER_SIZE_A4 = 9 as ExcelJS.PaperSize;

const FIRST_DATA_ROW = 5;
const PAYROLL_SHEET_FIRST_DATA_ROW = 11;
const MONEY_DECIMALS_FACTOR = 100;

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

/** Column indices (1-based) for Data sheet columns D–AD. */
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

const SUM_COLUMNS = [
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

const MONEY_COLUMNS = new Set<number>([
  COL.basic,
  COL.earned,
  COL.transport,
  COL.taxableTransport,
  COL.normalPay,
  COL.eveningPay,
  COL.sundayPay,
  COL.holidayPay,
  COL.totalOt,
  COL.bones,
  COL.pensionEmr,
  COL.pensionEmp,
  COL.taxableIncome,
  COL.incomeTax,
  COL.totalDeduction,
  COL.netPay,
]);

const HOURS_DAYS_COLUMNS = new Set<number>([
  COL.payrollDays,
  COL.normalHr,
  COL.eveningHr,
  COL.sundayHr,
  COL.holidayHr,
]);

/** Columns merged vertically across the period rows of a mid-month salary change. */
const IDENTITY_COLUMNS = [
  COL.sn,
  COL.name,
  COL.position,
  COL.employDate,
] as const;

/** Column indices (1-based) for the Payroll (tax declaration) sheet. */
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

const PAYROLL_SUM_COLUMNS = [
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

const TRUE_AFFIRMATION_TEXT =
  'True Affirmation: I declare that the information given in this payroll ' +
  'declaration is true and complete to the best of my knowledge and belief, ' +
  'and that the income tax withheld has been correctly computed.';

type Numeric = Decimal | number;

/** Salary period row as loaded for the export. */
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
}

/** Payroll entry shape consumed by the Excel export (Prisma result is assignable). */
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
  employee: {
    firstName: string;
    lastName: string;
    tin: string | null;
    department: { name: string } | null;
    position: { title: string } | null;
  };
  contract: { startDate: Date } | null;
  salaryPeriods: PayrollExportSalaryPeriod[];
}

/** Entry-level totals shown on the Data sheet TOTAL row (money columns only). */
export interface DataSheetTotals {
  netPay: number;
  incomeTax: number;
  taxableIncome: number;
  pensionEmployee: number;
  pensionEmployer: number;
}

interface PersonName {
  firstName: string;
  lastName: string;
}

interface ResignedEmployeeRow {
  name: string;
  tin: string | null;
  startDate: Date | null;
  endDate: Date;
}

export interface PayrollExcelExportResult {
  buffer: Buffer;
  filename: string;
  mimeType: string;
}

/**
 * Sums entry-level money columns exactly as they appear on the Data sheet.
 * Salary-period rows never contribute to these columns (they are written once
 * per entry, on the last period row), so the result must equal the run totals.
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
    netPay: roundMoney(totals.netPay),
    incomeTax: roundMoney(totals.incomeTax),
    taxableIncome: roundMoney(totals.taxableIncome),
    pensionEmployee: roundMoney(totals.pensionEmployee),
    pensionEmployer: roundMoney(totals.pensionEmployer),
  };
}

@Injectable()
export class PayrollExcelExportService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly companySettings: PayrollCompanySettingsService,
  ) {}

  /**
   * Attach per-period OT fields (raw SQL until Prisma client includes them).
   */
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

  /**
   * Builds an HR salary-sheet-compatible Excel workbook for a payroll run
   * (Data sheet + Payroll tax-declaration sheet).
   */
  async exportRun(
    runId: string,
    companyId: string,
  ): Promise<PayrollExcelExportResult> {
    const run = await this.prisma.payrollRun.findFirst({
      where: { id: runId, companyId, deletedAt: null },
      include: {
        creator: { select: { firstName: true, lastName: true } },
        approver: { select: { firstName: true, lastName: true } },
        gmApprover: { select: { firstName: true, lastName: true } },
        entries: {
          include: {
            employee: {
              select: {
                firstName: true,
                lastName: true,
                employeeId: true,
                tin: true,
                department: { select: { name: true } },
                position: { select: { title: true } },
              },
            },
            contract: { select: { startDate: true } },
            salaryPeriods: { orderBy: { periodStart: 'asc' } },
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

    const entries: PayrollExportEntry[] = [...run.entries].sort((a, b) => {
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

    const [settings, resigned] = await Promise.all([
      this.companySettings.getSettings(companyId),
      this.loadResignedEmployees(companyId, run.month, run.year),
    ]);

    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'CCECC PWF ERP';
    workbook.created = new Date();

    this.buildDataSheet(workbook, run, entries);
    this.buildPayrollSheet(workbook, {
      run,
      entries,
      settings,
      resigned,
      preparedBy: run.creator ? fullName(run.creator) : '',
      checkedBy: run.approver ? fullName(run.approver) : '',
      approvedBy: run.gmApprover ? fullName(run.gmApprover) : '',
    });

    const buffer = Buffer.from(await workbook.xlsx.writeBuffer());
    const mm = String(run.month).padStart(2, '0');
    const safeRun = run.runNumber.replace(/[^\w.-]+/g, '_');
    const filename = `Payroll_${run.year}_${mm}_${safeRun}.xlsx`;

    return { buffer, filename, mimeType: XLSX_MIME };
  }

  /**
   * Contracts that end inside the run month (one row per employee).
   */
  private async loadResignedEmployees(
    companyId: string,
    month: number,
    year: number,
  ): Promise<ResignedEmployeeRow[]> {
    const monthStart = new Date(Date.UTC(year, month - 1, 1));
    const monthEnd = new Date(Date.UTC(year, month, 0));
    const contracts = await this.prisma.employeeContract.findMany({
      where: {
        companyId,
        deletedAt: null,
        endDate: { gte: monthStart, lte: monthEnd },
      },
      select: {
        employeeId: true,
        startDate: true,
        endDate: true,
        employee: { select: { firstName: true, lastName: true, tin: true } },
      },
      orderBy: { endDate: 'asc' },
    });

    const seen = new Set<string>();
    const rows: ResignedEmployeeRow[] = [];
    for (const contract of contracts) {
      if (!contract.endDate || seen.has(contract.employeeId)) {
        continue;
      }
      seen.add(contract.employeeId);
      rows.push({
        name: fullName(contract.employee),
        tin: contract.employee.tin,
        startDate: contract.startDate,
        endDate: contract.endDate,
      });
    }
    return rows;
  }

  // ─── Data sheet ────────────────────────────────────────────────────────────

  private buildDataSheet(
    workbook: ExcelJS.Workbook,
    run: { month: number; year: number; runNumber: string; status: PayrollRunStatus },
    entries: PayrollExportEntry[],
  ): void {
    const sheet = workbook.addWorksheet('Data', {
      views: [
        {
          state: 'frozen',
          xSplit: COL.position,
          ySplit: FIRST_DATA_ROW - 1,
          activeCell: `${columnLetter(COL.employDate)}${FIRST_DATA_ROW}`,
        },
      ],
      pageSetup: {
        orientation: 'landscape',
        paperSize: PAPER_SIZE_A3,
        fitToPage: true,
        fitToWidth: 1,
        fitToHeight: 0,
      },
    });

    this.applyColumnWidths(sheet);
    this.writeTitleRows(sheet, run);
    this.writeHeaderRows(sheet);

    const sums = new Map<number, number>();
    let nextRow = FIRST_DATA_ROW;
    for (let i = 0; i < entries.length; i += 1) {
      nextRow += this.writeEntryRows(sheet, nextRow, i + 1, entries[i]!, sums);
    }

    const lastDataRow = nextRow - 1;
    this.writeTotalRow(sheet, nextRow, FIRST_DATA_ROW, lastDataRow, sums);
  }

  private applyColumnWidths(sheet: ExcelJS.Worksheet): void {
    sheet.getColumn(1).width = 3;
    sheet.getColumn(2).width = 3;
    sheet.getColumn(3).width = 3;
    sheet.getColumn(COL.sn).width = 6;
    sheet.getColumn(COL.name).width = 22;
    sheet.getColumn(COL.position).width = 20;
    sheet.getColumn(COL.employDate).width = 14;
    sheet.getColumn(COL.basic).width = 12;
    sheet.getColumn(COL.payrollDays).width = 10;
    sheet.getColumn(COL.earned).width = 12;
    sheet.getColumn(COL.transport).width = 12;
    sheet.getColumn(COL.taxableTransport).width = 12;
    for (let col = COL.normalHr; col <= COL.holidayPay; col += 1) {
      sheet.getColumn(col).width = 8;
    }
    sheet.getColumn(COL.totalOt).width = 10;
    sheet.getColumn(COL.bones).width = 10;
    sheet.getColumn(COL.pensionEmr).width = 12;
    sheet.getColumn(COL.pensionEmp).width = 12;
    sheet.getColumn(COL.taxableIncome).width = 14;
    sheet.getColumn(COL.incomeTax).width = 10;
    sheet.getColumn(COL.totalDeduction).width = 12;
    sheet.getColumn(COL.netPay).width = 12;
    sheet.getColumn(COL.sign).width = 10;
    sheet.getColumn(COL.notes).width = 36;
  }

  private writeTitleRows(
    sheet: ExcelJS.Worksheet,
    run: { month: number; year: number; status: PayrollRunStatus },
  ): void {
    const monthName = MONTH_NAMES[run.month - 1] ?? String(run.month);
    const needsDraftBanner =
      run.status !== 'GM_APPROVED' && run.status !== 'PAID';

    sheet.mergeCells(1, COL.sn, 1, COL.notes);
    const titleCell = sheet.getCell(1, COL.sn);
    titleCell.value = 'CCECC Ethiopian Branch Salary Calculation Form';
    titleCell.font = { bold: true, size: 14 };
    titleCell.alignment = { vertical: 'middle', horizontal: 'left' };

    const monthLastCol = needsDraftBanner ? COL.netPay : COL.notes;
    sheet.mergeCells(2, COL.sn, 2, monthLastCol);
    const subCell = sheet.getCell(2, COL.sn);
    subCell.value = `Month ${monthName},${run.year}`;
    subCell.font = { bold: true, size: 11 };
    subCell.alignment = { vertical: 'middle', horizontal: 'left' };

    if (needsDraftBanner) {
      sheet.mergeCells(2, COL.sign, 2, COL.notes);
      const banner = sheet.getCell(2, COL.sign);
      banner.value = 'DRAFT — NOT APPROVED';
      banner.font = { bold: true, color: { argb: 'FFFF0000' }, size: 11 };
      banner.alignment = { vertical: 'middle', horizontal: 'right' };
    }

    sheet.getRow(1).height = 22;
    sheet.getRow(2).height = 18;
  }

  private writeHeaderRows(sheet: ExcelJS.Worksheet): void {
    const row3 = sheet.getRow(3);
    const row4 = sheet.getRow(4);
    row3.height = 36;
    row4.height = 20;

    const singleHeaders: Array<{ col: number; text: string }> = [
      { col: COL.sn, text: 'S/N' },
      { col: COL.name, text: 'NAME EMPLOYEE' },
      { col: COL.position, text: 'POSITION' },
      { col: COL.employDate, text: "DATE OF EMPLOY'T" },
      { col: COL.basic, text: 'BASIC SALARY/Br./MONTH' },
      { col: COL.payrollDays, text: 'WORK PERFORMED DAYS (DAYS)' },
      { col: COL.earned, text: 'EARNED SALARY' },
      { col: COL.transport, text: 'TRANSP. ALLOWANCES/Br./MONTH' },
      { col: COL.taxableTransport, text: 'TAXABLE TRANSPORTATION' },
      { col: COL.totalOt, text: 'Total OT' },
      { col: COL.bones, text: 'Bones' },
      { col: COL.pensionEmr, text: 'FROM EMPLOYER/ 11%' },
      { col: COL.pensionEmp, text: 'FROM EMPLOYEE /7%/' },
      { col: COL.taxableIncome, text: 'TOTAL INCOME SUBJECT TO TAX' },
      { col: COL.incomeTax, text: 'INCOME TAX' },
      { col: COL.totalDeduction, text: 'TOTAL DEDUCTION' },
      { col: COL.netPay, text: 'NET PAY' },
      { col: COL.sign, text: 'SIGN' },
      { col: COL.notes, text: 'NOTES' },
    ];

    for (const { col, text } of singleHeaders) {
      sheet.mergeCells(3, col, 4, col);
      const cell = sheet.getCell(3, col);
      cell.value = text;
      this.styleHeaderCell(cell);
      this.styleHeaderCell(sheet.getCell(4, col));
    }

    const otGroups: Array<{
      start: number;
      end: number;
      title: string;
      left: string;
      right: string;
    }> = [
      {
        start: COL.normalHr,
        end: COL.normalPay,
        title: 'Normal',
        left: 'HR',
        right: '1.5',
      },
      {
        start: COL.eveningHr,
        end: COL.eveningPay,
        title: 'Evening',
        left: 'HR',
        right: '1.75',
      },
      {
        start: COL.sundayHr,
        end: COL.sundayPay,
        title: 'Weekend',
        left: 'HR',
        right: '2',
      },
      {
        start: COL.holidayHr,
        end: COL.holidayPay,
        title: 'Holiday',
        left: 'HR',
        right: '2.5',
      },
    ];

    for (const group of otGroups) {
      sheet.mergeCells(3, group.start, 3, group.end);
      const titleCell = sheet.getCell(3, group.start);
      titleCell.value = group.title;
      this.styleHeaderCell(titleCell);
      this.styleHeaderCell(sheet.getCell(3, group.end));

      const left = sheet.getCell(4, group.start);
      left.value = group.left;
      this.styleHeaderCell(left);
      const right = sheet.getCell(4, group.end);
      right.value = group.right;
      this.styleHeaderCell(right);
    }
  }

  private styleHeaderCell(cell: ExcelJS.Cell): void {
    cell.font = { bold: true, size: 9 };
    cell.alignment = {
      wrapText: true,
      horizontal: 'center',
      vertical: 'middle',
    };
    cell.border = THIN_BORDER;
    cell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: HEADER_FILL },
    };
  }

  /**
   * Writes one row for a single-period entry, or one row per salary period for
   * a mid-month salary change. Returns the number of rows written.
   */
  private writeEntryRows(
    sheet: ExcelJS.Worksheet,
    startRow: number,
    serial: number,
    entry: PayrollExportEntry,
    sums: Map<number, number>,
  ): number {
    const periods = [...entry.salaryPeriods].sort(
      (a, b) => a.periodStart.getTime() - b.periodStart.getTime(),
    );
    const multi = periods.length > 1;
    const rowCount = multi ? periods.length : 1;
    const flagged = entry.flag !== 'NONE';
    const totalNet = toNumber(entry.netPay);

    for (let i = 0; i < rowCount; i += 1) {
      const rowNumber = startRow + i;
      const isFirst = i === 0;
      const isLast = i === rowCount - 1;
      const period = multi ? periods[i]! : null;
      const row = sheet.getRow(rowNumber);

      const set = (
        col: number,
        value: string | number | null,
        numFmt?: string,
      ): void => {
        const cell = row.getCell(col);
        if (value === null || value === '') {
          cell.value = null;
        } else {
          cell.value = value;
        }
        if (typeof value === 'number') {
          if (numFmt) {
            cell.numFmt = numFmt;
          }
          if ((SUM_COLUMNS as readonly number[]).includes(col)) {
            sums.set(col, (sums.get(col) ?? 0) + value);
          }
        }
        cell.border = THIN_BORDER;
        cell.alignment = {
          vertical: 'middle',
          horizontal:
            col === COL.name ||
            col === COL.position ||
            col === COL.notes ||
            col === COL.employDate
              ? 'left'
              : 'center',
        };
        if (flagged) {
          cell.fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: AMBER_FILL },
          };
        }
      };

      // Identity columns: value on first row, borders/fill on every row.
      set(COL.sn, isFirst ? serial : null);
      set(COL.name, isFirst ? fullName(entry.employee) : null);
      set(COL.position, isFirst ? (entry.employee.position?.title ?? null) : null);
      set(
        COL.employDate,
        isFirst && entry.contract?.startDate
          ? formatDdMmYyyy(entry.contract.startDate)
          : null,
      );

      // Salary columns: per period when the salary changed mid-month.
      set(
        COL.basic,
        toNumber(period ? period.basicSalary : entry.basicSalary),
        MONEY_FORMAT,
      );
      set(
        COL.payrollDays,
        toNumber(period ? period.days : entry.payrollDays),
        HOURS_DAYS_FORMAT,
      );
      set(
        COL.earned,
        toNumber(period ? period.earnedSalary : entry.earnedSalary),
        MONEY_FORMAT,
      );

      // Per-period OT on each salary-period row (HR two-row layout); entry OT
      // totals also on the last row when multi-period so the sheet TOTAL matches.
      if (multi && period) {
        setOt(
          set,
          COL.normalHr,
          COL.normalPay,
          period.normalOtHours ?? 0,
          period.normalOtPay ?? 0,
        );
        setOt(
          set,
          COL.eveningHr,
          COL.eveningPay,
          period.eveningOtHours ?? 0,
          period.eveningOtPay ?? 0,
        );
        setOt(
          set,
          COL.sundayHr,
          COL.sundayPay,
          period.sundayOtHours ?? 0,
          period.sundayOtPay ?? 0,
        );
        setOt(
          set,
          COL.holidayHr,
          COL.holidayPay,
          period.holidayOtHours ?? 0,
          period.holidayOtPay ?? 0,
        );
        set(COL.totalOt, blankIfZero(toNumber(period.totalOtPay ?? 0)), MONEY_FORMAT);
      }

      // Everything else is entry-level: written once, on the last row.
      if (isLast) {
        set(COL.transport, toNumber(entry.transportAllowance), MONEY_FORMAT);
        set(COL.taxableTransport, toNumber(entry.taxableTransport), MONEY_FORMAT);
        if (!multi) {
          setOt(set, COL.normalHr, COL.normalPay, entry.normalOtHours, entry.normalOtPay);
          setOt(
            set,
            COL.eveningHr,
            COL.eveningPay,
            entry.eveningOtHours,
            entry.eveningOtPay,
          );
          setOt(set, COL.sundayHr, COL.sundayPay, entry.sundayOtHours, entry.sundayOtPay);
          setOt(
            set,
            COL.holidayHr,
            COL.holidayPay,
            entry.holidayOtHours,
            entry.holidayOtPay,
          );
          set(COL.totalOt, blankIfZero(toNumber(entry.totalOtPay)), MONEY_FORMAT);
        }
        set(
          COL.bones,
          toNumber(entry.monthlyBonus) + toNumber(entry.bonusTopUp),
          MONEY_FORMAT,
        );
        set(COL.pensionEmr, toNumber(entry.pensionEmployer), MONEY_FORMAT);
        set(COL.pensionEmp, toNumber(entry.pensionEmployee), MONEY_FORMAT);
        set(COL.taxableIncome, toNumber(entry.taxableIncome), MONEY_FORMAT);
        set(COL.incomeTax, toNumber(entry.incomeTax), MONEY_FORMAT);
        set(COL.totalDeduction, toNumber(entry.totalDeductions), MONEY_FORMAT);
        set(COL.netPay, totalNet, MONEY_FORMAT);
      } else {
        const otCols = new Set<number>([
          COL.normalHr,
          COL.normalPay,
          COL.eveningHr,
          COL.eveningPay,
          COL.sundayHr,
          COL.sundayPay,
          COL.holidayHr,
          COL.holidayPay,
          COL.totalOt,
        ]);
        for (let col = COL.transport; col <= COL.netPay; col += 1) {
          // OT columns already written for multi-period rows above.
          if (multi && otCols.has(col)) {
            continue;
          }
          set(col, null);
        }
      }

      set(COL.sign, null);

      if (isFirst) {
        const parts: string[] = [];
        if (multi) {
          const changeDate = formatDdMmYyyy(periods[1]!.periodStart);
          parts.push(
            `Salary change on ${changeDate}; total net ${formatFixedAmount(totalNet)}`,
          );
        }
        const baseNotes = buildNotes(entry);
        if (baseNotes) {
          parts.push(baseNotes);
        }
        set(COL.notes, parts.length > 0 ? parts.join('; ') : null);
      } else {
        set(COL.notes, null);
      }
    }

    if (multi) {
      for (const col of IDENTITY_COLUMNS) {
        sheet.mergeCells(startRow, col, startRow + rowCount - 1, col);
      }
    }

    return rowCount;
  }

  private writeTotalRow(
    sheet: ExcelJS.Worksheet,
    totalRow: number,
    firstDataRow: number,
    lastDataRow: number,
    sums: Map<number, number>,
  ): void {
    const row = sheet.getRow(totalRow);
    const label = row.getCell(COL.name);
    label.value = 'TOTAL';
    label.font = { bold: true };
    label.border = THIN_BORDER;
    label.alignment = { horizontal: 'right', vertical: 'middle' };

    for (const col of [
      COL.sn,
      COL.position,
      COL.employDate,
      COL.sign,
      COL.notes,
    ]) {
      row.getCell(col).border = THIN_BORDER;
    }

    const hasData = lastDataRow >= firstDataRow;
    for (const col of SUM_COLUMNS) {
      const cell = row.getCell(col);
      cell.font = { bold: true };
      cell.border = THIN_BORDER;
      cell.alignment = { horizontal: 'center', vertical: 'middle' };
      if (hasData) {
        const letter = columnLetter(col);
        cell.value = {
          formula: `SUM(${letter}${firstDataRow}:${letter}${lastDataRow})`,
          result: roundMoney(sums.get(col) ?? 0),
        };
      } else {
        cell.value = 0;
      }
      if (MONEY_COLUMNS.has(col)) {
        cell.numFmt = MONEY_FORMAT;
      } else if (HOURS_DAYS_COLUMNS.has(col)) {
        cell.numFmt = HOURS_DAYS_FORMAT;
      }
    }
  }

  // ─── Payroll (tax declaration) sheet ───────────────────────────────────────

  private buildPayrollSheet(
    workbook: ExcelJS.Workbook,
    ctx: {
      run: { month: number; year: number };
      entries: PayrollExportEntry[];
      settings: PayrollCompanySettings;
      resigned: ResignedEmployeeRow[];
      preparedBy: string;
      checkedBy: string;
      approvedBy: string;
    },
  ): void {
    const { run, entries, settings } = ctx;
    const monthName = MONTH_NAMES[run.month - 1] ?? String(run.month);
    const periodLabel = `${monthName} ${run.year}`;

    const sheet = workbook.addWorksheet('Payroll', {
      pageSetup: {
        orientation: 'landscape',
        paperSize: PAPER_SIZE_A4,
        fitToPage: true,
        fitToWidth: 1,
        fitToHeight: 0,
        printTitlesRow: '9:10',
      },
    });

    const widths: Array<[number, number]> = [
      [PCOL.sn, 6],
      [PCOL.tin, 16],
      [PCOL.name, 30],
      [PCOL.employDate, 14],
      [PCOL.basic, 14],
      [PCOL.transport, 14],
      [PCOL.taxableTransport, 14],
      [PCOL.overTime, 12],
      [PCOL.bonus, 12],
      [PCOL.ssfEmployee, 13],
      [PCOL.ssfEmployer, 13],
      [PCOL.taxableIncome, 15],
      [PCOL.taxWithheld, 13],
      [PCOL.advance, 12],
      [PCOL.netPay, 15],
    ];
    for (const [col, width] of widths) {
      sheet.getColumn(col).width = width;
    }

    this.writePayrollHeaderBlock(sheet, settings, periodLabel);
    this.writePayrollColumnHeaders(sheet);

    // Data rows — one per employee.
    const sums = new Map<number, number>();
    let rowNumber = PAYROLL_SHEET_FIRST_DATA_ROW;
    entries.forEach((entry, index) => {
      this.writePayrollEntryRow(sheet, rowNumber, index + 1, entry, sums);
      rowNumber += 1;
    });
    const lastDataRow = rowNumber - 1;
    const firstDataRow = PAYROLL_SHEET_FIRST_DATA_ROW;
    const hasData = lastDataRow >= firstDataRow;

    // Total Amount row.
    const totalRow = rowNumber;
    sheet.mergeCells(totalRow, PCOL.sn, totalRow, PCOL.employDate);
    const totalLabel = sheet.getCell(totalRow, PCOL.sn);
    totalLabel.value = 'Total Amount';
    totalLabel.font = { bold: true };
    totalLabel.alignment = { horizontal: 'right', vertical: 'middle' };
    boxRange(sheet, totalRow, PCOL.sn, totalRow, PCOL.employDate);
    for (const col of PAYROLL_SUM_COLUMNS) {
      const cell = sheet.getCell(totalRow, col);
      const total = roundMoney(sums.get(col) ?? 0);
      if (hasData) {
        const letter = columnLetter(col);
        cell.value = {
          formula: `SUM(${letter}${firstDataRow}:${letter}${lastDataRow})`,
          result: total,
        };
      } else {
        cell.value = 0;
      }
      cell.numFmt = MONEY_FORMAT;
      cell.font = { bold: true };
      cell.border = THIN_BORDER;
      cell.alignment = { horizontal: 'center', vertical: 'middle' };
    }

    const totalNet = roundMoney(sums.get(PCOL.netPay) ?? 0);
    const totalTaxable = roundMoney(sums.get(PCOL.taxableIncome) ?? 0);
    const totalTax = roundMoney(sums.get(PCOL.taxWithheld) ?? 0);

    // Summary block.
    let cursor = totalRow + 2;
    const summaryRows: Array<{ label: string; value: number; money: boolean }> = [
      { label: 'Total amount paid for the Month', value: totalNet, money: true },
      { label: '10  Total No of Employee', value: entries.length, money: false },
      { label: '20  Total Taxable Income', value: totalTaxable, money: true },
      { label: '30  Total Income Tax Withheld', value: totalTax, money: true },
    ];
    for (const item of summaryRows) {
      sheet.mergeCells(cursor, PCOL.sn, cursor, PCOL.employDate);
      const label = sheet.getCell(cursor, PCOL.sn);
      label.value = item.label;
      label.font = { bold: true };
      label.alignment = { horizontal: 'left', vertical: 'middle' };
      boxRange(sheet, cursor, PCOL.sn, cursor, PCOL.employDate);

      sheet.mergeCells(cursor, PCOL.basic, cursor, PCOL.transport);
      const value = sheet.getCell(cursor, PCOL.basic);
      value.value = item.value;
      value.numFmt = item.money ? MONEY_FORMAT : '0';
      value.font = { bold: true };
      value.alignment = { horizontal: 'right', vertical: 'middle' };
      boxRange(sheet, cursor, PCOL.basic, cursor, PCOL.transport);
      cursor += 1;
    }

    // Resigned employees.
    cursor += 1;
    sheet.mergeCells(cursor, PCOL.sn, cursor, PCOL.basic);
    const resignedTitle = sheet.getCell(cursor, PCOL.sn);
    resignedTitle.value = `Resigned / contract-ended employees in ${periodLabel}`;
    resignedTitle.font = { bold: true };
    resignedTitle.alignment = { horizontal: 'left', vertical: 'middle' };
    cursor += 1;

    const resignedHeaders: Array<{ col: number; text: string }> = [
      { col: PCOL.sn, text: 'S/N' },
      { col: PCOL.tin, text: 'Employee TIN' },
      { col: PCOL.name, text: 'Full name' },
      { col: PCOL.employDate, text: 'Date of Employment' },
      { col: PCOL.basic, text: 'Date of Resignation' },
    ];
    for (const { col, text } of resignedHeaders) {
      const cell = sheet.getCell(cursor, col);
      cell.value = text;
      this.styleHeaderCell(cell);
    }
    cursor += 1;

    if (ctx.resigned.length === 0) {
      sheet.mergeCells(cursor, PCOL.sn, cursor, PCOL.basic);
      const none = sheet.getCell(cursor, PCOL.sn);
      none.value = 'None';
      none.alignment = { horizontal: 'center', vertical: 'middle' };
      boxRange(sheet, cursor, PCOL.sn, cursor, PCOL.basic);
      cursor += 1;
    } else {
      ctx.resigned.forEach((person, index) => {
        const cells: Array<[number, string | number]> = [
          [PCOL.sn, index + 1],
          [PCOL.tin, person.tin ?? ''],
          [PCOL.name, person.name],
          [
            PCOL.employDate,
            person.startDate ? formatDdMmYyyy(person.startDate) : '',
          ],
          [PCOL.basic, formatDdMmYyyy(person.endDate)],
        ];
        for (const [col, value] of cells) {
          const cell = sheet.getCell(cursor, col);
          cell.value = value === '' ? null : value;
          cell.border = THIN_BORDER;
          cell.alignment = {
            vertical: 'middle',
            horizontal: col === PCOL.name ? 'left' : 'center',
          };
        }
        cursor += 1;
      });
    }

    // PREPARED BY / APPROVED BY.
    cursor += 1;
    sheet.mergeCells(cursor, PCOL.sn, cursor, PCOL.basic);
    const preparedLabel = sheet.getCell(cursor, PCOL.sn);
    preparedLabel.value = 'PREPARED BY';
    preparedLabel.font = { bold: true };
    sheet.mergeCells(cursor, PCOL.ssfEmployee, cursor, PCOL.netPay);
    const approvedLabel = sheet.getCell(cursor, PCOL.ssfEmployee);
    approvedLabel.value = 'APPROVED BY';
    approvedLabel.font = { bold: true };
    cursor += 1;
    sheet.mergeCells(cursor, PCOL.sn, cursor, PCOL.basic);
    sheet.getCell(cursor, PCOL.sn).value =
      'Name: ........................  Signature: ................  Date: ..........';
    sheet.mergeCells(cursor, PCOL.ssfEmployee, cursor, PCOL.netPay);
    sheet.getCell(cursor, PCOL.ssfEmployee).value =
      'Name: ........................  Signature: ................  Date: ..........';
    cursor += 2;

    // True affirmation.
    sheet.mergeCells(cursor, PCOL.sn, cursor, PCOL.netPay);
    const affirmation = sheet.getCell(cursor, PCOL.sn);
    affirmation.value = TRUE_AFFIRMATION_TEXT;
    affirmation.alignment = {
      wrapText: true,
      vertical: 'middle',
      horizontal: 'left',
    };
    sheet.getRow(cursor).height = 34;
    cursor += 2;

    // For Office use only box.
    const boxTop = cursor;
    const boxBottom = cursor + 3;
    sheet.mergeCells(boxTop, PCOL.sn, boxBottom, PCOL.employDate);
    const officeBox = sheet.getCell(boxTop, PCOL.sn);
    officeBox.value =
      'For Office use only\nReceived by: ...................................\n' +
      'Date: ........................\nSignature & Stamp: ........................';
    officeBox.alignment = {
      wrapText: true,
      vertical: 'top',
      horizontal: 'left',
    };
    officeBox.font = { size: 10 };
    boxRange(sheet, boxTop, PCOL.sn, boxBottom, PCOL.employDate);
    cursor = boxBottom + 2;

    // Signature row.
    const signatureSegments: Array<{ from: number; to: number; text: string }> = [
      { from: PCOL.sn, to: PCOL.employDate, text: `Prepared By: ${ctx.preparedBy}` },
      { from: PCOL.basic, to: PCOL.overTime, text: 'Finance: ' },
      { from: PCOL.bonus, to: PCOL.taxableIncome, text: `Checked By: ${ctx.checkedBy}` },
      { from: PCOL.taxWithheld, to: PCOL.netPay, text: `Approved By: ${ctx.approvedBy}` },
    ];
    for (const segment of signatureSegments) {
      sheet.mergeCells(cursor, segment.from, cursor, segment.to);
      const cell = sheet.getCell(cursor, segment.from);
      cell.value = segment.text;
      cell.font = { bold: true };
      cell.alignment = { vertical: 'middle', horizontal: 'left' };
      boxRange(sheet, cursor, segment.from, cursor, segment.to);
    }
    sheet.getRow(cursor).height = 26;
  }

  private writePayrollHeaderBlock(
    sheet: ExcelJS.Worksheet,
    settings: PayrollCompanySettings,
    periodLabel: string,
  ): void {
    const titles: Array<{ row: number; text: string; size: number }> = [
      { row: 1, text: settings.orgNameTax, size: 14 },
      { row: 2, text: `PAYROLL FOR THE MONTH OF ${periodLabel}`, size: 12 },
      { row: 3, text: 'NAME LISTS OF INCOME TAX PAYER', size: 12 },
    ];
    for (const title of titles) {
      sheet.mergeCells(title.row, PCOL.sn, title.row, PCOL.netPay);
      const cell = sheet.getCell(title.row, PCOL.sn);
      cell.value = title.text;
      cell.font = { bold: true, size: title.size };
      cell.alignment = { horizontal: 'center', vertical: 'middle' };
      sheet.getRow(title.row).height = 20;
    }

    type Field = { row: number; label: string; value: string };
    const left: Field[] = [
      { row: 4, label: '1. Name of Organization', value: settings.orgNameTax },
      { row: 5, label: '3. TIN', value: settings.tin },
      { row: 6, label: '4. Tax Account No', value: settings.taxAccountNo },
      { row: 7, label: '8. Payment Period Month/Year', value: periodLabel },
      { row: 8, label: 'Page', value: '1 of 1' },
    ];
    const middle: Field[] = [
      { row: 4, label: '2a. Region', value: settings.region },
      { row: 5, label: '2b. Zone', value: settings.zone },
      { row: 6, label: '5. Tax Collector Office', value: settings.taxCollectorOffice },
      { row: 7, label: 'Document No', value: '' },
    ];
    const right: Field[] = [
      { row: 4, label: '2c. Woreda', value: settings.woreda },
      { row: 5, label: '2d. Kebele', value: settings.kebele },
      { row: 6, label: 'House No', value: settings.houseNo },
      { row: 7, label: 'Tel', value: settings.phone },
      { row: 8, label: 'Fax', value: settings.fax },
    ];

    const groups: Array<{ fields: Field[]; from: number; to: number }> = [
      { fields: left, from: PCOL.sn, to: PCOL.basic },
      { fields: middle, from: PCOL.transport, to: PCOL.bonus },
      { fields: right, from: PCOL.ssfEmployee, to: PCOL.netPay },
    ];
    for (const group of groups) {
      for (const field of group.fields) {
        sheet.mergeCells(field.row, group.from, field.row, group.to);
        const cell = sheet.getCell(field.row, group.from);
        cell.value = {
          richText: [
            { text: `${field.label}: `, font: { bold: true, size: 10 } },
            { text: field.value, font: { size: 10 } },
          ],
        };
        cell.alignment = {
          horizontal: 'left',
          vertical: 'middle',
          wrapText: true,
        };
        boxRange(sheet, field.row, group.from, field.row, group.to);
      }
    }
    sheet.getRow(4).height = 30;
  }

  private writePayrollColumnHeaders(sheet: ExcelJS.Worksheet): void {
    sheet.getRow(9).height = 30;
    sheet.getRow(10).height = 48;

    const single: Array<{ col: number; text: string }> = [
      { col: PCOL.sn, text: 'a) S/N' },
      { col: PCOL.tin, text: 'b) Employee TIN' },
      { col: PCOL.name, text: 'c) Full name' },
      { col: PCOL.employDate, text: 'd) Date of Employment' },
      { col: PCOL.basic, text: 'e) Basic Salary' },
      { col: PCOL.transport, text: 'f) Transportation Allowances' },
      { col: PCOL.taxableIncome, text: 'l) Taxable Income (e+g+h+i)' },
      { col: PCOL.taxWithheld, text: 'm) Tax withheld' },
      { col: PCOL.advance, text: 'n) Advance payment' },
      { col: PCOL.netPay, text: 'p) Net pay' },
    ];
    for (const { col, text } of single) {
      sheet.mergeCells(9, col, 10, col);
      const cell = sheet.getCell(9, col);
      cell.value = text;
      this.styleHeaderCell(cell);
      this.styleHeaderCell(sheet.getCell(10, col));
    }

    const groups: Array<{
      from: number;
      to: number;
      title: string;
      subs: string[];
    }> = [
      {
        from: PCOL.taxableTransport,
        to: PCOL.bonus,
        title: 'Additional Benefits',
        subs: [
          'g) Taxable Transportation Allowances',
          'h) Over Time',
          'i) Other bonus',
        ],
      },
      {
        from: PCOL.ssfEmployee,
        to: PCOL.ssfEmployer,
        title: 'Social Security',
        subs: ['j) 7% SSF Employee', 'k) 11% SSF Employer'],
      },
    ];
    for (const group of groups) {
      sheet.mergeCells(9, group.from, 9, group.to);
      const title = sheet.getCell(9, group.from);
      title.value = group.title;
      this.styleHeaderCell(title);
      for (let col = group.from; col <= group.to; col += 1) {
        this.styleHeaderCell(sheet.getCell(9, col));
        const sub = sheet.getCell(10, col);
        sub.value = group.subs[col - group.from] ?? null;
        this.styleHeaderCell(sub);
      }
    }
  }

  private writePayrollEntryRow(
    sheet: ExcelJS.Worksheet,
    rowNumber: number,
    serial: number,
    entry: PayrollExportEntry,
    sums: Map<number, number>,
  ): void {
    const tin = entry.employee.tin?.trim() || null;
    const values: Array<[number, string | number | null, string?]> = [
      [PCOL.sn, serial],
      [PCOL.tin, tin],
      [PCOL.name, fullName(entry.employee)],
      [
        PCOL.employDate,
        entry.contract?.startDate ? formatDdMmYyyy(entry.contract.startDate) : null,
      ],
      [PCOL.basic, toNumber(entry.earnedSalary), MONEY_FORMAT],
      [PCOL.transport, toNumber(entry.transportAllowance), MONEY_FORMAT],
      [PCOL.taxableTransport, toNumber(entry.taxableTransport), MONEY_FORMAT],
      [PCOL.overTime, toNumber(entry.totalOtPay), MONEY_FORMAT],
      [
        PCOL.bonus,
        toNumber(entry.monthlyBonus) + toNumber(entry.bonusTopUp),
        MONEY_FORMAT,
      ],
      [PCOL.ssfEmployee, toNumber(entry.pensionEmployee), MONEY_FORMAT],
      [PCOL.ssfEmployer, toNumber(entry.pensionEmployer), MONEY_FORMAT],
      [PCOL.taxableIncome, toNumber(entry.taxableIncome), MONEY_FORMAT],
      [PCOL.taxWithheld, toNumber(entry.incomeTax), MONEY_FORMAT],
      [PCOL.advance, 0, MONEY_FORMAT],
      [PCOL.netPay, toNumber(entry.netPay), MONEY_FORMAT],
    ];

    const row = sheet.getRow(rowNumber);
    for (const [col, value, numFmt] of values) {
      const cell = row.getCell(col);
      cell.value = value;
      if (typeof value === 'number') {
        if (numFmt) {
          cell.numFmt = numFmt;
        }
        if ((PAYROLL_SUM_COLUMNS as readonly number[]).includes(col)) {
          sums.set(col, (sums.get(col) ?? 0) + value);
        }
      }
      cell.border = THIN_BORDER;
      cell.alignment = {
        vertical: 'middle',
        horizontal:
          col === PCOL.name ? 'left' : col === PCOL.sn || col === PCOL.tin ? 'center' : 'right',
      };
      if (col === PCOL.tin && tin === null) {
        cell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: MISSING_TIN_FILL },
        };
      }
    }
  }
}

function boxRange(
  sheet: ExcelJS.Worksheet,
  top: number,
  left: number,
  bottom: number,
  right: number,
): void {
  for (let r = top; r <= bottom; r += 1) {
    for (let c = left; c <= right; c += 1) {
      sheet.getCell(r, c).border = THIN_BORDER;
    }
  }
}

function setOt(
  set: (col: number, value: string | number | null, numFmt?: string) => void,
  hrCol: number,
  payCol: number,
  hours: Numeric,
  pay: Numeric,
): void {
  const h = toNumber(hours);
  const p = toNumber(pay);
  set(hrCol, blankIfZero(h), HOURS_DAYS_FORMAT);
  set(payCol, blankIfZero(p), MONEY_FORMAT);
}

function blankIfZero(value: number): number | null {
  return value === 0 ? null : value;
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

function roundMoney(value: number): number {
  return Math.round(value * MONEY_DECIMALS_FACTOR) / MONEY_DECIMALS_FACTOR;
}

function fullName(person: PersonName): string {
  return `${person.firstName} ${person.lastName}`.trim();
}

function formatDdMmYyyy(date: Date): string {
  const day = String(date.getUTCDate()).padStart(2, '0');
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const year = date.getUTCFullYear();
  // @db.Date values are stored at UTC midnight; other timestamps use local parts.
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

function buildNotes(entry: {
  flag: PayrollEntryFlag;
  flagNote: string | null;
  bonusTopUpReason: string | null;
  contractNetBonus: Numeric;
  netTopUp: Numeric;
  netTopUpReason: string | null;
  notes: string | null;
}): string | null {
  const parts: string[] = [];
  if (entry.flag !== 'NONE') {
    const flagLabel = formatFlagLabel(entry.flag);
    parts.push(
      entry.flagNote ? `${flagLabel}: ${entry.flagNote}` : flagLabel,
    );
  }
  if (entry.bonusTopUpReason?.trim()) {
    parts.push(`Bonus top-up: ${entry.bonusTopUpReason.trim()}`);
  }
  const contractNet = toNumber(entry.contractNetBonus);
  if (contractNet > 0) {
    parts.push(`${formatNoteAmount(contractNet)} net bonus monthly`);
  }
  const oneTimeNet = toNumber(entry.netTopUp);
  if (oneTimeNet > 0) {
    const reason = entry.netTopUpReason?.trim();
    parts.push(
      reason
        ? `${formatNoteAmount(oneTimeNet)} net bonus this month only — ${reason}`
        : `${formatNoteAmount(oneTimeNet)} net bonus this month only`,
    );
  }
  if (entry.notes?.trim()) {
    parts.push(entry.notes.trim());
  }
  return parts.length > 0 ? parts.join('; ') : null;
}

function formatNoteAmount(value: number): string {
  return new Intl.NumberFormat('en-US', {
    maximumFractionDigits: 2,
  }).format(value);
}

function formatFixedAmount(value: number): string {
  return new Intl.NumberFormat('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

function formatFlagLabel(flag: PayrollEntryFlag): string {
  switch (flag) {
    case 'MISSING_ATTENDANCE':
      return 'Missing attendance';
    case 'MISSING_CONTRACT':
      return 'Missing contract';
    case 'MISSING_OVERTIME_APPROVAL':
      return 'Overtime not approved';
    case 'ZERO_SALARY':
      return 'Zero salary';
    case 'MANUAL_OVERRIDE':
      return 'Manual override';
    default:
      return flag;
  }
}

function columnLetter(col: number): string {
  let n = col;
  let s = '';
  while (n > 0) {
    const rem = (n - 1) % 26;
    s = String.fromCharCode(65 + rem) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}
