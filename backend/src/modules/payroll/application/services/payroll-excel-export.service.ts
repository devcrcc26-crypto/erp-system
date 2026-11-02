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
} from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';
import * as ExcelJS from 'exceljs';
import type { Response } from 'express';
import { PassThrough, type Stream } from 'stream';
import { AuditService } from '../../../audit/application/services/audit.service';
import { PrismaService } from '../../../../shared/prisma/prisma.service';
import { formatEnglishName } from '../../../../shared/utils/user-display.util';
import {
  DOCUMENT_STYLE,
  documentFooter,
  documentMetaRichText,
  formatGeneratedAt,
} from '../../../../shared/utils/excel-document.util';
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
/** Hours / days: `30` → `30.0`, `12.5` → `12.5`, `7.25` → `7.25`. */
const QUANTITY_FORMAT = '#,##0.0#';
/** Page size for entry fetches — never load a full run into memory. */
const ENTRY_PAGE_SIZE = 50;

/*
 * Both sheets follow the shared document layout (excel-document.util.ts):
 * row 1 company, row 2 title, row 3 metadata + rule, row 4 spacer,
 * row 5 column headers, data from row 6.
 */
const HEADER_ROW = 5;
const DATA_FIRST_ROW = HEADER_ROW + 1;
const PAYROLL_FIRST_ROW = HEADER_ROW + 1;

const DOC = DOCUMENT_STYLE;
const BODY_FONT: Partial<ExcelJS.Font> = {
  name: DOC.font,
  size: 9,
  color: { argb: DOC.body },
};
const STRONG_FONT: Partial<ExcelJS.Font> = {
  name: DOC.font,
  size: 9,
  bold: true,
  color: { argb: DOC.ink },
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

/** Data columns that hold hours or days rather than money. */
const DATA_QUANTITY_COLS = new Set<number>([
  COL.payrollDays,
  COL.normalHr,
  COL.eveningHr,
  COL.sundayHr,
  COL.holidayHr,
]);

/*
 * Column widths. Money columns are wide enough for a bold run total of
 * 99,999,999.99 in 9pt Arial so Excel never shows `#####`.
 */
const MONEY_WIDTH = 15;
const DATA_WIDTHS: Record<number, number> = {
  1: 2,
  2: 2,
  3: 2,
  [COL.sn]: 6,
  [COL.name]: 30,
  [COL.position]: 24,
  [COL.employDate]: 13,
  [COL.payrollDays]: 9,
  [COL.normalHr]: 10,
  [COL.eveningHr]: 10,
  [COL.sundayHr]: 10,
  [COL.holidayHr]: 10,
  [COL.netPay]: 16,
};
const PAYROLL_WIDTHS: Record<number, number> = {
  [PCOL.sn]: 6,
  [PCOL.tin]: 14,
  [PCOL.name]: 30,
  [PCOL.employDate]: 13,
  [PCOL.netPay]: 16,
};

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
  /** False for expatriate contracts (pension formulas write 0). Always true for freelancers. */
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
   * Test/helper: builds the export into a buffer via the streaming writer.
   * Production downloads must call {@link streamExcelExport} so the HTTP
   * response is never fully buffered in process memory.
   */
  async exportRun(
    runId: string,
    companyId: string,
    userId: string,
  ): Promise<PayrollExcelExportResult> {
    const chunks: Buffer[] = [];
    const pass = new PassThrough();
    pass.on('data', (chunk: Buffer) => {
      chunks.push(chunk);
    });
    const finished = new Promise<void>((resolve, reject) => {
      pass.on('finish', () => resolve());
      pass.on('error', reject);
    });
    const meta = await this.streamExcelExport(runId, companyId, userId, pass);
    await finished;
    return {
      buffer: Buffer.concat(chunks),
      filename: meta.filename,
      mimeType: XLSX_MIME,
      postTaxTopUpCount: meta.postTaxTopUpCount,
    };
  }

  /**
   * Streams an HR salary-sheet workbook (Data + Payroll) with ExcelJS
   * WorkbookWriter. Entries are loaded in pages of {@link ENTRY_PAGE_SIZE};
   * each worksheet row is committed immediately.
   */
  async streamExcelExport(
    runId: string,
    companyId: string,
    userId: string,
    stream: Stream,
  ): Promise<{ filename: string; postTaxTopUpCount: number; entryCount: number }> {
    const run = await this.prisma.payrollRun.findFirst({
      where: { id: runId, companyId, deletedAt: null },
      select: {
        id: true,
        runNumber: true,
        month: true,
        year: true,
        status: true,
      },
    });

    if (!run) {
      throw new NotFoundException('Payroll run not found');
    }
    if (run.status === 'CANCELLED') {
      throw new BadRequestException('Cannot export a cancelled payroll run');
    }

    const [settings, exporter] = await Promise.all([
      this.companySettings.getSettings(companyId),
      this.prisma.user.findUnique({
        where: { id: userId },
        select: { firstName: true, lastName: true },
      }),
    ]);

    const orderedIds = await this.loadOrderedEntryIds(runId, companyId);
    const mm = String(run.month).padStart(2, '0');
    const safeRun = run.runNumber.replace(/[^\w.-]+/g, '_');
    const filename = `Payroll_${run.year}_${mm}_${safeRun}.xlsx`;
    const monthName = MONTH_NAMES[run.month - 1] ?? String(run.month);

    this.applyDownloadHeaders(stream, filename);

    const doc: SheetDocument = {
      companyName: settings.orgNameTax,
      meta: [
        ['Period', `${monthName} ${run.year}`],
        ['Run', run.runNumber],
        ['Generated', formatGeneratedAt(new Date())],
        ...(exporter
          ? ([
              ['Prepared by', `${exporter.firstName} ${exporter.lastName}`.trim()],
            ] as Array<[string, string]>)
          : []),
        ['Employees', orderedIds.length.toLocaleString('en-US')],
      ],
    };
    const dataTitle = `Salary Sheet (Data) - ${monthName} ${run.year}`;
    const payrollTitle = `PAYROLL FOR THE MONTH OF ${monthName} ${run.year}`;

    const workbook = new ExcelJS.stream.xlsx.WorkbookWriter({
      stream,
      useStyles: true,
      useSharedStrings: false,
    });
    workbook.creator = settings.orgNameTax;
    const dataSheet = workbook.addWorksheet(
      'Data',
      documentSheetOptions(doc.companyName, dataTitle, HEADER_ROW, COL.name),
    );
    const payrollSheet = workbook.addWorksheet(
      'Payroll',
      documentSheetOptions(doc.companyName, payrollTitle, HEADER_ROW, PCOL.name),
    );
    applyColumnWidths(dataSheet, COL.netPay, DATA_WIDTHS);
    applyColumnWidths(payrollSheet, PCOL.netPay, PAYROLL_WIDTHS);

    await this.writeStreamingDataHeaders(dataSheet, doc, dataTitle);
    await this.writeStreamingPayrollHeaders(payrollSheet, doc, payrollTitle);

    const dataSums = new Map<number, number>();
    const payrollSums = new Map<number, number>();
    let dataRow = DATA_FIRST_ROW;
    let payrollRow = PAYROLL_FIRST_ROW;
    let serial = 1;
    let postTaxTopUpCount = 0;
    let entryCount = 0;

    for (let offset = 0; offset < orderedIds.length; offset += ENTRY_PAGE_SIZE) {
      const pageIds = orderedIds.slice(offset, offset + ENTRY_PAGE_SIZE);
      const page = await this.loadEntriesByIds(pageIds);
      await this.hydrateSalaryPeriodOvertime(page);

      for (const raw of page) {
        const entry = this.mapEntry(raw);
        entryCount += 1;

        const periods =
          entry.salaryPeriods.length > 1
            ? [...entry.salaryPeriods].sort(
                (a, b) => a.periodStart.getTime() - b.periodStart.getTime(),
              )
            : null;
        const rowCount = periods ? periods.length : 1;
        const firstRow = dataRow;
        const lastRow = dataRow + rowCount - 1;

        for (let i = 0; i < rowCount; i += 1) {
          const r = firstRow + i;
          this.writeDataEmployeeRow(dataSheet, r, {
            entry,
            period: periods ? periods[i]! : null,
            serial,
            isFirst: i === 0,
            firstRow,
            lastRow,
            columnSums: dataSums,
          });
        }
        for (let r = firstRow; r <= lastRow; r += 1) {
          styleBodyRow(dataSheet, r, COL.sn, COL.netPay);
        }
        if (rowCount > 1) {
          for (const col of IDENTITY_COLS) {
            dataSheet.mergeCells(firstRow, col, lastRow, col);
          }
        }
        for (let r = firstRow; r <= lastRow; r += 1) {
          await dataSheet.getRow(r).commit();
        }

        const topUps = this.writePayrollEmployeeRow(
          payrollSheet,
          payrollRow,
          { entry, firstRow, lastRow, serial },
          payrollSums,
        );
        postTaxTopUpCount += topUps;
        styleBodyRow(payrollSheet, payrollRow, PCOL.sn, PCOL.netPay);
        await payrollSheet.getRow(payrollRow).commit();

        dataRow = lastRow + 1;
        payrollRow += 1;
        serial += 1;
      }
    }

    this.writeDataTotalsRow(
      dataSheet,
      dataRow,
      DATA_FIRST_ROW,
      dataRow - 1,
      dataSums,
    );
    await dataSheet.getRow(dataRow).commit();

    this.writePayrollTotalsRow(
      payrollSheet,
      payrollRow,
      PAYROLL_FIRST_ROW,
      payrollRow - 1,
      payrollSums,
    );
    await payrollSheet.getRow(payrollRow).commit();

    await this.writePayrollFooter(payrollSheet, payrollRow + 2);
    await dataSheet.commit();
    await payrollSheet.commit();
    await workbook.commit();

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
        entryCount,
        postTaxTopUpCount,
      },
    });

    return { filename, postTaxTopUpCount, entryCount };
  }

  private applyDownloadHeaders(stream: Stream, filename: string): void {
    const res = stream as unknown as Response;
    if (typeof res.setHeader !== 'function') {
      return;
    }
    res.setHeader('Content-Type', XLSX_MIME);
    const ascii = filename.replace(/[^\x20-\x7E]/g, '_').replace(/"/g, '');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(filename)}`,
    );
  }

  private async loadOrderedEntryIds(
    runId: string,
    companyId: string,
  ): Promise<string[]> {
    const light = await this.prisma.payrollEntry.findMany({
      where: { runId, companyId },
      select: {
        id: true,
        employee: {
          select: {
            firstName: true,
            middleName: true,
            lastName: true,
            excludedFromHrProcesses: true,
          },
        },
      },
    });
    return light
      .filter((e) => e.employee.excludedFromHrProcesses !== true)
      // Alphabetical by full name (first, middle, last) on both sheets.
      .sort((a, b) =>
        fullName(a.employee).localeCompare(fullName(b.employee), undefined, {
          sensitivity: 'base',
        }),
      )
      .map((e) => e.id);
  }

  private async loadEntriesByIds(ids: string[]): Promise<
    Array<{
      id: string;
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
          id: string;
          contract?: {
            transportationAllowance: Numeric | null;
            monthlyBonus: Numeric | null;
          } | null;
        }
      >;
    }>
  > {
    if (ids.length === 0) {
      return [];
    }
    const rows = await this.prisma.payrollEntry.findMany({
      where: { id: { in: ids } },
      include: {
        employee: {
          select: {
            firstName: true,
            middleName: true,
            lastName: true,
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
    });
    const byId = new Map(rows.map((r) => [r.id, r]));
    return ids
      .map((id) => byId.get(id))
      .filter((row): row is NonNullable<typeof row> => row != null);
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
          ? true
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
    entries: Array<{
      salaryPeriods: Array<{
        id?: string;
        normalOtHours?: Numeric;
        eveningOtHours?: Numeric;
        sundayOtHours?: Numeric;
        holidayOtHours?: Numeric;
        normalOtPay?: Numeric;
        eveningOtPay?: Numeric;
        sundayOtPay?: Numeric;
        holidayOtPay?: Numeric;
        totalOtPay?: Numeric;
      }>;
    }>,
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

  private async writeStreamingDataHeaders(
    sheet: ExcelJS.Worksheet,
    doc: SheetDocument,
    title: string,
  ): Promise<void> {
    await writeDocumentHeader(sheet, doc, title, COL.sn, COL.netPay);
    const headers: Array<[number, string]> = [
      [COL.sn, 'S/N'],
      [COL.name, 'Name'],
      [COL.position, 'Position'],
      [COL.employDate, 'Date of Employment'],
      [COL.basic, 'Basic Salary'],
      [COL.payrollDays, 'Work Days'],
      [COL.earned, 'Earned Salary'],
      [COL.transport, 'Transport Allowance'],
      [COL.taxableTransport, 'Taxable Transport'],
      [COL.normalHr, 'OT Normal Hrs'],
      [COL.normalPay, 'OT Normal'],
      [COL.eveningHr, 'OT Evening Hrs'],
      [COL.eveningPay, 'OT Evening'],
      [COL.sundayHr, 'OT Sunday Hrs'],
      [COL.sundayPay, 'OT Sunday'],
      [COL.holidayHr, 'OT Holiday Hrs'],
      [COL.holidayPay, 'OT Holiday'],
      [COL.totalOt, 'OT Total'],
      [COL.bones, 'Bonus'],
      [COL.pensionEmr, 'Pension Employer'],
      [COL.pensionEmp, 'Pension Employee'],
      [COL.taxableIncome, 'Taxable Income'],
      [COL.incomeTax, 'Income Tax'],
      [COL.totalDeduction, 'Total Deduction'],
      [COL.netPay, 'Net Pay'],
    ];
    await writeTableHeaderRow(sheet, headers);
  }

  private async writeStreamingPayrollHeaders(
    sheet: ExcelJS.Worksheet,
    doc: SheetDocument,
    title: string,
  ): Promise<void> {
    await writeDocumentHeader(sheet, doc, title, PCOL.sn, PCOL.netPay);
    const headers: Array<[number, string]> = [
      [PCOL.sn, 'S/N'],
      [PCOL.tin, 'TIN'],
      [PCOL.name, 'Name'],
      [PCOL.employDate, 'Date of Employment'],
      [PCOL.basic, 'Earned Salary'],
      [PCOL.transport, 'Transport'],
      [PCOL.taxableTransport, 'Taxable Transport'],
      [PCOL.overTime, 'Overtime'],
      [PCOL.bonus, 'Bonus'],
      [PCOL.ssfEmployee, 'SSF Employee'],
      [PCOL.ssfEmployer, 'SSF Employer'],
      [PCOL.taxableIncome, 'Taxable Income'],
      [PCOL.taxWithheld, 'Tax Withheld'],
      [PCOL.advance, 'Advance'],
      [PCOL.netPay, 'Net Pay'],
    ];
    await writeTableHeaderRow(sheet, headers);
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
          (entry.netTopUpReason ? ` - ${entry.netTopUpReason}` : '');
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
      cell.numFmt = DATA_QUANTITY_COLS.has(col) ? QUANTITY_FORMAT : MONEY_FORMAT;
    }
    sheet.getCell(totalsRow, COL.name).value = 'Total';
    styleTotalsRow(sheet, totalsRow, COL.sn, COL.netPay);
  }

  /**
   * Writes one Payroll-sheet employee row that references Data rows.
   * @returns 1 when the row includes a post-tax top-up, else 0
   */
  private writePayrollEmployeeRow(
    sheet: ExcelJS.Worksheet,
    row: number,
    span: EmployeeRowSpan,
    sums: Map<number, number>,
  ): number {
    const { entry, firstRow, lastRow, serial } = span;
    const postTax = round2(
      toNumber(entry.contractNetBonus) + toNumber(entry.netTopUp),
    );

    const setF = (col: number, formula: string, result: number): void => {
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

    return postTax > 0 ? 1 : 0;
  }

  private writePayrollTotalsRow(
    sheet: ExcelJS.Worksheet,
    totalsRow: number,
    firstEmp: number,
    lastEmp: number,
    sums: Map<number, number>,
  ): void {
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
    }
    sheet.getCell(totalsRow, PCOL.name).value = 'Total Amount';
    styleTotalsRow(sheet, totalsRow, PCOL.sn, PCOL.netPay);
  }

  /** Sign-off block: three labels with a signature rule beneath each. */
  private async writePayrollFooter(
    sheet: ExcelJS.Worksheet,
    startRow: number,
  ): Promise<void> {
    const blocks: Array<[string, number, number]> = [
      ['Prepared By', PCOL.sn, PCOL.name],
      ['Checked By', PCOL.basic, PCOL.overTime],
      ['Approved By', PCOL.ssfEmployer, PCOL.taxWithheld],
    ];
    for (const [label, from] of blocks) {
      const cell = sheet.getCell(startRow, from);
      cell.value = label;
      cell.font = STRONG_FONT;
    }
    await sheet.getRow(startRow).commit();
    await sheet.getRow(startRow + 1).commit();
    const signRow = startRow + 2;
    sheet.getRow(signRow).height = 24;
    for (const [, from, to] of blocks) {
      for (let col = from; col <= to; col += 1) {
        sheet.getCell(signRow, col).border = { bottom: DOC.ruleThin };
      }
    }
    await sheet.getRow(signRow).commit();
  }
}

interface SheetDocument {
  companyName: string;
  meta: Array<[string, string]>;
}

/** Frozen header + identity columns, no gridlines, A4 landscape, document footer. */
function documentSheetOptions(
  companyName: string,
  title: string,
  headerRow: number,
  frozenThroughCol: number,
): Partial<ExcelJS.AddWorksheetOptions> {
  return {
    views: [
      {
        state: 'frozen',
        xSplit: frozenThroughCol,
        ySplit: headerRow,
        topLeftCell: `${colLetter(frozenThroughCol + 1)}${headerRow + 1}`,
        activeCell: `${colLetter(frozenThroughCol + 1)}${headerRow + 1}`,
        showGridLines: false,
      },
    ],
    pageSetup: {
      paperSize: 9, // A4
      orientation: 'landscape',
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 0,
      horizontalCentered: true,
      margins: { left: 0.5, right: 0.5, top: 0.6, bottom: 0.75, header: 0.3, footer: 0.3 },
    },
    headerFooter: {
      differentFirst: false,
      differentOddEven: false,
      oddFooter: documentFooter(companyName, title),
    },
  };
}

function applyColumnWidths(
  sheet: ExcelJS.Worksheet,
  lastCol: number,
  widths: Record<number, number>,
): void {
  for (let col = 1; col <= lastCol; col += 1) {
    sheet.getColumn(col).width = widths[col] ?? MONEY_WIDTH;
  }
}

/** Rows 1–4: company, title, metadata line over a strong rule, spacer. */
async function writeDocumentHeader(
  sheet: ExcelJS.Worksheet,
  doc: SheetDocument,
  title: string,
  firstCol: number,
  lastCol: number,
): Promise<void> {
  const company = sheet.getCell(1, firstCol);
  company.value = doc.companyName.toUpperCase();
  company.font = { name: DOC.font, size: 8, bold: true, color: { argb: DOC.muted } };
  await sheet.getRow(1).commit();

  sheet.getRow(2).height = 28;
  const titleCell = sheet.getCell(2, firstCol);
  titleCell.value = title;
  titleCell.font = { name: DOC.font, size: 16, bold: true, color: { argb: DOC.ink } };
  titleCell.alignment = { vertical: 'middle' };
  await sheet.getRow(2).commit();

  sheet.getRow(3).height = 22;
  const metaCell = sheet.getCell(3, firstCol);
  metaCell.value = documentMetaRichText(doc.meta);
  metaCell.alignment = { vertical: 'top' };
  for (let col = firstCol; col <= lastCol; col += 1) {
    sheet.getCell(3, col).border = { bottom: DOC.ruleStrong };
  }
  await sheet.getRow(3).commit();

  sheet.getRow(4).height = 12;
  await sheet.getRow(4).commit();
}

async function writeTableHeaderRow(
  sheet: ExcelJS.Worksheet,
  headers: Array<[number, string]>,
): Promise<void> {
  const row = sheet.getRow(HEADER_ROW);
  row.height = 36;
  for (const [col, label] of headers) {
    const cell = row.getCell(col);
    cell.value = label;
    cell.font = STRONG_FONT;
    cell.alignment = { vertical: 'middle', wrapText: true };
    cell.border = { bottom: DOC.ruleThin };
  }
  await row.commit();
}

function isNumericCell(value: ExcelJS.CellValue): boolean {
  return (
    typeof value === 'number' ||
    (value != null && typeof value === 'object' && 'formula' in value)
  );
}

/** Body row: 9pt Arial, hairline divider, numbers right-aligned. */
function styleBodyRow(
  sheet: ExcelJS.Worksheet,
  rowNumber: number,
  firstCol: number,
  lastCol: number,
): void {
  for (let col = firstCol; col <= lastCol; col += 1) {
    const cell = sheet.getCell(rowNumber, col);
    const value = cell.value;
    const numeric = isNumericCell(value);
    cell.font = BODY_FONT;
    cell.border = { bottom: DOC.ruleHair };
    if (typeof value === 'number' && !cell.numFmt) {
      cell.numFmt = Number.isInteger(value) ? '#,##0' : QUANTITY_FORMAT;
    }
    cell.alignment = {
      vertical: 'top',
      horizontal: numeric ? 'right' : 'left',
      wrapText: !numeric,
    };
  }
}

/** Totals row: bold, rule above and below. */
function styleTotalsRow(
  sheet: ExcelJS.Worksheet,
  rowNumber: number,
  firstCol: number,
  lastCol: number,
): void {
  sheet.getRow(rowNumber).height = 20;
  for (let col = firstCol; col <= lastCol; col += 1) {
    const cell = sheet.getCell(rowNumber, col);
    const numeric = isNumericCell(cell.value);
    cell.font = STRONG_FONT;
    cell.border = { top: DOC.ruleThin, bottom: DOC.ruleStrong };
    cell.alignment = {
      vertical: 'middle',
      horizontal: numeric ? 'right' : 'left',
    };
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
  // Freelancers always pay pension.
  if (entry.employee.employeeType === 'FREELANCER') {
    return false;
  }
  if (entry.pensionApplicable === false) {
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
