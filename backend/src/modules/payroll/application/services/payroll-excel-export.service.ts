import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { PayrollEntryFlag, PayrollRunStatus } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';
import * as ExcelJS from 'exceljs';
import { PrismaService } from '../../../../shared/prisma/prisma.service';

const XLSX_MIME =
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

const MONEY_FORMAT = '#,##0.00';
const HOURS_DAYS_FORMAT = '0.0';
const AMBER_FILL = 'FFF8E1';
const HEADER_FILL = 'FFF2F2F2';
const THIN_BORDER: Partial<ExcelJS.Borders> = {
  top: { style: 'thin', color: { argb: 'FF000000' } },
  left: { style: 'thin', color: { argb: 'FF000000' } },
  bottom: { style: 'thin', color: { argb: 'FF000000' } },
  right: { style: 'thin', color: { argb: 'FF000000' } },
};

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

/** Column indices (1-based) for data columns D–AC. */
const COL = {
  sn: 4,
  name: 5,
  employDate: 6,
  basic: 7,
  payrollDays: 8,
  earned: 9,
  transport: 10,
  taxableTransport: 11,
  normalHr: 12,
  normalPay: 13,
  eveningHr: 14,
  eveningPay: 15,
  sundayHr: 16,
  sundayPay: 17,
  holidayHr: 18,
  holidayPay: 19,
  totalOt: 20,
  bones: 21,
  pensionEmr: 22,
  pensionEmp: 23,
  taxableIncome: 24,
  incomeTax: 25,
  totalDeduction: 26,
  netPay: 27,
  sign: 28,
  notes: 29,
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

export interface PayrollExcelExportResult {
  buffer: Buffer;
  filename: string;
  mimeType: string;
}

@Injectable()
export class PayrollExcelExportService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Builds an HR salary-sheet-compatible Excel workbook for a payroll run.
   */
  async exportRun(
    runId: string,
    companyId: string,
  ): Promise<PayrollExcelExportResult> {
    const run = await this.prisma.payrollRun.findFirst({
      where: { id: runId, companyId, deletedAt: null },
      include: {
        entries: {
          include: {
            employee: {
              select: {
                firstName: true,
                lastName: true,
                employeeId: true,
                department: { select: { name: true } },
              },
            },
            contract: { select: { startDate: true } },
          },
        },
      },
    });

    if (!run) {
      throw new NotFoundException('Payroll run not found');
    }

    if (run.status === 'CANCELLED') {
      throw new BadRequestException(
        'Cannot export a cancelled payroll run',
      );
    }

    const entries = [...run.entries].sort((a, b) => {
      const deptA = a.employee.department?.name ?? '';
      const deptB = b.employee.department?.name ?? '';
      const deptCmp = deptA.localeCompare(deptB, undefined, {
        sensitivity: 'base',
      });
      if (deptCmp !== 0) {
        return deptCmp;
      }
      const nameA = `${a.employee.firstName} ${a.employee.lastName}`.trim();
      const nameB = `${b.employee.firstName} ${b.employee.lastName}`.trim();
      return nameA.localeCompare(nameB, undefined, { sensitivity: 'base' });
    });

    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'CCECC PWF ERP';
    workbook.created = new Date();

    const sheet = workbook.addWorksheet('Data', {
      views: [{ state: 'frozen', xSplit: 5, ySplit: 4, activeCell: 'F5' }],
      pageSetup: {
        orientation: 'landscape',
        // Excel paper size 8 = A3 (not in ExcelJS.PaperSize enum)
        paperSize: 8 as ExcelJS.PaperSize,
        fitToPage: true,
        fitToWidth: 1,
        fitToHeight: 0,
      },
    });

    this.applyColumnWidths(sheet);
    this.writeTitleRows(sheet, run);
    this.writeHeaderRows(sheet);

    const firstDataRow = 5;
    for (let i = 0; i < entries.length; i += 1) {
      this.writeEntryRow(sheet, firstDataRow + i, i + 1, entries[i]!);
    }

    const lastDataRow =
      entries.length === 0 ? firstDataRow - 1 : firstDataRow + entries.length - 1;
    const totalRow = lastDataRow + 1;
    this.writeTotalRow(sheet, totalRow, firstDataRow, lastDataRow);

    const buffer = Buffer.from(await workbook.xlsx.writeBuffer());
    const mm = String(run.month).padStart(2, '0');
    const safeRun = run.runNumber.replace(/[^\w.-]+/g, '_');
    const filename = `Payroll_${run.year}_${mm}_${safeRun}.xlsx`;

    return { buffer, filename, mimeType: XLSX_MIME };
  }

  private applyColumnWidths(sheet: ExcelJS.Worksheet): void {
    sheet.getColumn(1).width = 3;
    sheet.getColumn(2).width = 3;
    sheet.getColumn(3).width = 3;
    sheet.getColumn(COL.sn).width = 6;
    sheet.getColumn(COL.name).width = 22;
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
    sheet.getColumn(COL.notes).width = 28;
  }

  private writeTitleRows(
    sheet: ExcelJS.Worksheet,
    run: {
      month: number;
      year: number;
      runNumber: string;
      status: PayrollRunStatus;
    },
  ): void {
    const monthName = MONTH_NAMES[run.month - 1] ?? String(run.month);
    const title = `CCECC Ethiopia Branch — Payroll for ${monthName} ${run.year}`;
    const generated = formatDdMmYyyy(new Date());
    let subtitle = `Run ${run.runNumber} · Status ${run.status} · Generated ${generated}`;
    const needsDraftBanner =
      run.status !== 'GM_APPROVED' && run.status !== 'PAID';
    if (needsDraftBanner) {
      subtitle = `${subtitle} · DRAFT — NOT APPROVED`;
    }

    sheet.mergeCells(1, COL.sn, 1, COL.notes);
    const titleCell = sheet.getCell(1, COL.sn);
    titleCell.value = title;
    titleCell.font = { bold: true, size: 14 };
    titleCell.alignment = { vertical: 'middle', horizontal: 'left' };

    sheet.mergeCells(2, COL.sn, 2, COL.notes);
    const subCell = sheet.getCell(2, COL.sn);
    subCell.value = subtitle;
    subCell.font = needsDraftBanner
      ? { bold: true, color: { argb: 'FFFF0000' }, size: 11 }
      : { size: 11 };
    subCell.alignment = { vertical: 'middle', horizontal: 'left' };

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
        title: 'Sunday',
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

  private writeEntryRow(
    sheet: ExcelJS.Worksheet,
    rowNumber: number,
    serial: number,
    entry: {
      flag: PayrollEntryFlag;
      flagNote: string | null;
      notes: string | null;
      bonusTopUpReason: string | null;
      basicSalary: Decimal;
      payrollDays: Decimal;
      earnedSalary: Decimal;
      transportAllowance: Decimal;
      taxableTransport: Decimal;
      normalOtHours: Decimal;
      normalOtPay: Decimal;
      eveningOtHours: Decimal;
      eveningOtPay: Decimal;
      sundayOtHours: Decimal;
      sundayOtPay: Decimal;
      holidayOtHours: Decimal;
      holidayOtPay: Decimal;
      totalOtPay: Decimal;
      monthlyBonus: Decimal;
      bonusTopUp: Decimal;
      pensionEmployer: Decimal;
      pensionEmployee: Decimal;
      taxableIncome: Decimal;
      incomeTax: Decimal;
      totalDeductions: Decimal;
      netPay: Decimal;
      employee: {
        firstName: string;
        lastName: string;
      };
      contract: { startDate: Date } | null;
    },
  ): void {
    const row = sheet.getRow(rowNumber);
    const flagged = entry.flag !== 'NONE';

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
      if (numFmt && typeof value === 'number') {
        cell.numFmt = numFmt;
      }
      cell.border = THIN_BORDER;
      cell.alignment = {
        vertical: 'middle',
        horizontal:
          col === COL.name || col === COL.notes || col === COL.employDate
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

    set(COL.sn, serial);
    set(
      COL.name,
      `${entry.employee.firstName} ${entry.employee.lastName}`.trim(),
    );
    set(
      COL.employDate,
      entry.contract?.startDate
        ? formatDdMmYyyy(entry.contract.startDate)
        : null,
    );
    set(COL.basic, toNumber(entry.basicSalary), MONEY_FORMAT);
    set(COL.payrollDays, toNumber(entry.payrollDays), HOURS_DAYS_FORMAT);
    set(COL.earned, toNumber(entry.earnedSalary), MONEY_FORMAT);
    set(COL.transport, toNumber(entry.transportAllowance), MONEY_FORMAT);
    set(COL.taxableTransport, toNumber(entry.taxableTransport), MONEY_FORMAT);

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
    set(COL.netPay, toNumber(entry.netPay), MONEY_FORMAT);
    set(COL.sign, null);
    set(COL.notes, buildNotes(entry));
  }

  private writeTotalRow(
    sheet: ExcelJS.Worksheet,
    totalRow: number,
    firstDataRow: number,
    lastDataRow: number,
  ): void {
    const row = sheet.getRow(totalRow);
    const label = row.getCell(COL.name);
    label.value = 'TOTAL';
    label.font = { bold: true };
    label.border = THIN_BORDER;
    label.alignment = { horizontal: 'right', vertical: 'middle' };

    for (const col of [COL.sn, COL.employDate, COL.sign, COL.notes]) {
      const cell = row.getCell(col);
      cell.border = THIN_BORDER;
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
}

function setOt(
  set: (col: number, value: string | number | null, numFmt?: string) => void,
  hrCol: number,
  payCol: number,
  hours: Decimal,
  pay: Decimal,
): void {
  const h = toNumber(hours);
  const p = toNumber(pay);
  set(hrCol, blankIfZero(h), HOURS_DAYS_FORMAT);
  set(payCol, blankIfZero(p), MONEY_FORMAT);
}

function blankIfZero(value: number): number | null {
  return value === 0 ? null : value;
}

function toNumber(value: Decimal | number | null | undefined): number {
  if (value == null) {
    return 0;
  }
  if (typeof value === 'number') {
    return value;
  }
  return Number(value);
}

function formatDdMmYyyy(date: Date): string {
  const day = String(date.getUTCDate()).padStart(2, '0');
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const year = date.getUTCFullYear();
  // Generated "now" may be local; for @db.Date use UTC parts which match stored dates.
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
  if (entry.notes?.trim()) {
    parts.push(entry.notes.trim());
  }
  return parts.length > 0 ? parts.join('; ') : null;
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
