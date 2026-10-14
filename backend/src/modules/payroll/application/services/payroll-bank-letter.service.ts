import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import type { PayrollRunStatus } from '@prisma/client';
import {
  AlignmentType,
  BorderStyle,
  Document,
  Packer,
  Paragraph,
  Table,
  TableCell,
  TableRow,
  TabStopType,
  TextRun,
  VerticalAlign,
  WidthType,
  convertMillimetersToTwip,
} from 'docx';
import { PrismaService } from '../../../../shared/prisma/prisma.service';
import { formatEnglishName } from '../../../../shared/utils/user-display.util';
import {
  birrAmountInWords,
  integerInWords,
} from '../utils/amount-in-words.util';
import {
  PayrollCompanySettings,
  PayrollCompanySettingsService,
} from './payroll-company-settings.service';

const DOCX_MIME =
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

const ALLOWED_STATUSES: ReadonlySet<PayrollRunStatus> = new Set<PayrollRunStatus>([
  'GM_APPROVED',
  'PAID',
]);

/** A4 portrait dimensions in twips (1/20 pt). */
const A4_WIDTH_TWIPS = 11906;
const A4_HEIGHT_TWIPS = 16838;

/** Top margin leaves room for the pre-printed company letterhead (~5 cm). */
const MARGIN_TOP_MM = 50;
const MARGIN_SIDE_MM = 25;
const MARGIN_BOTTOM_MM = 20;
/** A4 width minus both side margins. */
const CONTENT_WIDTH_MM = 210 - 2 * MARGIN_SIDE_MM;

const FONT = 'Arial';
const BODY_SIZE = 22; // half-points → 11pt
const SEQUENCE_PADDING = 3;
const CENTS_FACTOR = 100;

/** Table column widths as a percentage of the content width. */
const COL_PCT = { no: 8, name: 40, account: 30, amount: 22 } as const;

export interface BankLetterExcludedEmployee {
  id: string;
  name: string;
}

export interface PayrollBankLetterResult {
  buffer: Buffer;
  filename: string;
  mimeType: string;
  refNo: string;
  excludedEmployees: BankLetterExcludedEmployee[];
}

export interface PayrollBankLetterPreview {
  /** True when the run status allows a letter and at least one employee is payable. */
  allowed: boolean;
  /** Existing reference, or null when none has been issued yet. */
  refNo: string | null;
  totalNet: number;
  includedCount: number;
  /** Employees in the letter with a blank account cell (no account on profile or entry). */
  excludedEmployees: BankLetterExcludedEmployee[];
  /** Human-readable reason when `allowed` is false. */
  reason: string | null;
}

interface LetterLine {
  name: string;
  accountNumber: string;
  netPay: number;
}

interface LetterSelection {
  lines: LetterLine[];
  excluded: BankLetterExcludedEmployee[];
  totalNet: number;
}

interface LetterRun {
  id: string;
  month: number;
  year: number;
  status: PayrollRunStatus;
  bankLetterRefNo: string | null;
  gmApprover: {
    firstName: string;
    middleName?: string | null;
    lastName: string;
  } | null;
  entries: Array<{
    employeeId: string;
    netPay: { toString(): string } | number;
    bankAccountNumber: string | null;
    employee: {
      firstName: string;
      middleName?: string | null;
      lastName: string;
      bankAccountNumber: string | null;
    };
  }>;
}

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

/**
 * Generates the salary bank-transfer request letter (.docx) for an approved run.
 */
@Injectable()
export class PayrollBankLetterService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly companySettings: PayrollCompanySettingsService,
  ) {}

  /**
   * Lightweight JSON summary for the UI warning shown before download.
   * Never consumes a reference number.
   */
  async preview(
    runId: string,
    companyId: string,
  ): Promise<PayrollBankLetterPreview> {
    const run = await this.loadRun(runId, companyId);
    const selection = this.selectLines(run);
    const hasLines = selection.lines.length > 0;
    return {
      allowed: hasLines,
      refNo: run.bankLetterRefNo,
      totalNet: selection.totalNet,
      includedCount: selection.lines.length,
      excludedEmployees: selection.excluded,
      reason: hasLines
        ? null
        : 'No employees with a positive net pay',
    };
  }

  /**
   * Builds the bank letter .docx. Allocates and stores a reference number on
   * first use; later downloads reuse the stored reference.
   */
  async generate(
    runId: string,
    companyId: string,
    userId: string,
  ): Promise<PayrollBankLetterResult> {
    const run = await this.loadRun(runId, companyId);
    const selection = this.selectLines(run);
    if (selection.lines.length === 0) {
      throw new BadRequestException('No employees with a positive net pay');
    }

    const settings = await this.companySettings.getSettings(companyId);
    const refNo = await this.resolveRefNo(run, companyId, userId, settings);
    const letterDate = new Date();

    const document = this.buildDocument({
      run,
      selection,
      settings,
      refNo,
      letterDate,
    });
    const buffer = Buffer.from(await Packer.toBuffer(document));

    const mm = String(run.month).padStart(2, '0');
    const safeRef = refNo.replace(/[^\w.-]+/g, '_');
    return {
      buffer,
      filename: `Bank_Letter_${run.year}_${mm}_${safeRef}.docx`,
      mimeType: DOCX_MIME,
      refNo,
      excludedEmployees: selection.excluded,
    };
  }

  private async loadRun(runId: string, companyId: string): Promise<LetterRun> {
    const run = await this.prisma.payrollRun.findFirst({
      where: { id: runId, companyId, deletedAt: null },
      select: {
        id: true,
        month: true,
        year: true,
        status: true,
        bankLetterRefNo: true,
        gmApprover: {
          select: { firstName: true, middleName: true, lastName: true },
        },
        entries: {
          select: {
            employeeId: true,
            netPay: true,
            bankAccountNumber: true,
            employee: {
              select: {
                firstName: true,
                middleName: true,
                lastName: true,
                bankAccountNumber: true,
              },
            },
          },
        },
      },
    });
    if (!run) {
      throw new NotFoundException('Payroll run not found');
    }
    if (!ALLOWED_STATUSES.has(run.status)) {
      throw new BadRequestException(
        'Bank letter is only available for GM-approved or paid payroll runs',
      );
    }
    return run;
  }

  /**
   * Every employee with net > 0 is a line. The account comes from the employee's
   * current profile (bank details are often entered after the run is generated),
   * falling back to the entry snapshot; with neither, the cell is left blank and
   * the employee is reported in `excluded` so HR can fill it in by hand.
   */
  private selectLines(run: LetterRun): LetterSelection {
    const lines: LetterLine[] = [];
    const excluded: BankLetterExcludedEmployee[] = [];
    let totalCents = 0;

    for (const entry of run.entries) {
      const net = Number(entry.netPay.toString());
      if (!(net > 0)) {
        continue;
      }
      const name = formatEnglishName(entry.employee);
      const account =
        entry.employee.bankAccountNumber?.trim() || entry.bankAccountNumber?.trim() || '';
      if (account === '') {
        excluded.push({ id: entry.employeeId, name });
      }
      lines.push({ name, accountNumber: account, netPay: net });
      totalCents += Math.round(net * CENTS_FACTOR);
    }

    const byName = (a: { name: string }, b: { name: string }): number =>
      a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
    lines.sort(byName);
    excluded.sort(byName);

    return { lines, excluded, totalNet: totalCents / CENTS_FACTOR };
  }

  /**
   * Reuses the stored reference or allocates `{prefix}-{YYYY}-{NNN}` and saves it.
   * The conditional update keeps concurrent requests on a single reference.
   */
  private async resolveRefNo(
    run: LetterRun,
    companyId: string,
    userId: string,
    settings: PayrollCompanySettings,
  ): Promise<string> {
    if (run.bankLetterRefNo) {
      return run.bankLetterRefNo;
    }

    const year = run.year;
    const sequence = await this.companySettings.nextBankLetterSequence(
      companyId,
      year,
      userId,
    );
    const candidate = `${settings.bankLetterRefPrefix}-${year}-${String(
      sequence,
    ).padStart(SEQUENCE_PADDING, '0')}`;

    const updated = await this.prisma.payrollRun.updateMany({
      where: { id: run.id, companyId, bankLetterRefNo: null },
      data: { bankLetterRefNo: candidate, updatedBy: userId },
    });
    if (updated.count === 1) {
      return candidate;
    }

    const current = await this.prisma.payrollRun.findFirst({
      where: { id: run.id, companyId },
      select: { bankLetterRefNo: true },
    });
    return current?.bankLetterRefNo ?? candidate;
  }

  private buildDocument(input: {
    run: LetterRun;
    selection: LetterSelection;
    settings: PayrollCompanySettings;
    refNo: string;
    letterDate: Date;
  }): Document {
    const { run, selection, settings, refNo, letterDate } = input;
    const monthName = MONTH_NAMES[run.month - 1] ?? String(run.month);
    const periodLabel = `${monthName} ${run.year}`;
    const count = selection.lines.length;
    const totalFormatted = formatBirr(selection.totalNet);
    const amountWords = birrAmountInWords(selection.totalNet);

    const text = (value: string, opts: { bold?: boolean; underline?: boolean } = {}): TextRun =>
      new TextRun({
        text: value,
        font: FONT,
        size: BODY_SIZE,
        bold: opts.bold,
        underline: opts.underline ? {} : undefined,
      });

    const para = (
      children: TextRun[],
      opts: {
        after?: number;
        alignment?: (typeof AlignmentType)[keyof typeof AlignmentType];
      } = {},
    ): Paragraph =>
      new Paragraph({
        children,
        alignment: opts.alignment,
        spacing: { after: opts.after ?? 160, line: 276 },
      });

    const accountNo = settings.companyAccountNumber.trim() || '__________';
    const bodyParagraph =
      `As you may know, CCECC Ethiopian Branch–FZY has opened current account in your branch. ` +
      `Therefore, we would like to transfer an amount of birr ${totalFormatted} Birr ` +
      `(${amountWords}) from our account No-${accountNo} to attached ` +
      `${integerInWords(count)} (${count}) company employees according to the corresponding ` +
      `given net salary for ${monthName} Month, ${run.year}. ` +
      `Please deduct the service charge from our account.`;

    const refLine = new Paragraph({
      tabStops: [
        {
          type: TabStopType.RIGHT,
          position: convertMillimetersToTwip(CONTENT_WIDTH_MM),
        },
      ],
      spacing: { after: 240 },
      children: [
        text(`Ref No: ${refNo}`, { bold: true }),
        new TextRun({
          text: `\tDate: ${formatLetterDate(letterDate)}`,
          font: FONT,
          size: BODY_SIZE,
          bold: true,
        }),
      ],
    });

    const body: Paragraph[] = [
      refLine,
      para([text(`To-${settings.salaryBankName}`)], { after: 0 }),
      para([text(settings.bankBranch)], { after: 240 }),
      para(
        [
          text('Subject: Transfer payment of salary for local employees', {
            bold: true,
            underline: true,
          }),
        ],
        { after: 240 },
      ),
      para([text(bodyParagraph)], {
        alignment: AlignmentType.JUSTIFIED,
        after: 240,
      }),
      para(
        [text(`${periodLabel} Month Salary`, { bold: true })],
        { after: 120 },
      ),
    ];

    const table = this.buildSalaryTable(selection, totalFormatted);

    return new Document({
      creator: 'CCECC PWF ERP',
      title: `Bank letter ${refNo}`,
      sections: [
        {
          properties: {
            page: {
              size: { width: A4_WIDTH_TWIPS, height: A4_HEIGHT_TWIPS },
              margin: {
                top: convertMillimetersToTwip(MARGIN_TOP_MM),
                right: convertMillimetersToTwip(MARGIN_SIDE_MM),
                bottom: convertMillimetersToTwip(MARGIN_BOTTOM_MM),
                left: convertMillimetersToTwip(MARGIN_SIDE_MM),
              },
            },
          },
          children: [...body, table],
        },
      ],
    });
  }

  private buildSalaryTable(
    selection: LetterSelection,
    totalFormatted: string,
  ): Table {
    const border = { style: BorderStyle.SINGLE, size: 4, color: '000000' };
    const borders = {
      top: border,
      bottom: border,
      left: border,
      right: border,
    };

    const cell = (
      value: string,
      pct: number,
      opts: {
        bold?: boolean;
        align?: (typeof AlignmentType)[keyof typeof AlignmentType];
        shade?: boolean;
        columnSpan?: number;
      } = {},
    ): TableCell =>
      new TableCell({
        width: { size: pct, type: WidthType.PERCENTAGE },
        borders,
        verticalAlign: VerticalAlign.CENTER,
        columnSpan: opts.columnSpan,
        shading: opts.shade ? { fill: 'F2F2F2' } : undefined,
        margins: { top: 60, bottom: 60, left: 100, right: 100 },
        children: [
          new Paragraph({
            alignment: opts.align ?? AlignmentType.LEFT,
            children: [
              new TextRun({
                text: value,
                font: FONT,
                size: BODY_SIZE - 2,
                bold: opts.bold,
              }),
            ],
          }),
        ],
      });

    const header = new TableRow({
      tableHeader: true,
      cantSplit: true,
      children: [
        cell('No', COL_PCT.no, { bold: true, shade: true, align: AlignmentType.CENTER }),
        cell('Name', COL_PCT.name, { bold: true, shade: true }),
        cell('Account', COL_PCT.account, { bold: true, shade: true }),
        cell('Payment', COL_PCT.amount, {
          bold: true,
          shade: true,
          align: AlignmentType.RIGHT,
        }),
      ],
    });

    const rows = selection.lines.map(
      (line, index) =>
        new TableRow({
          cantSplit: true,
          children: [
            cell(String(index + 1), COL_PCT.no, { align: AlignmentType.CENTER }),
            cell(line.name, COL_PCT.name),
            cell(line.accountNumber, COL_PCT.account),
            cell(formatBirr(line.netPay), COL_PCT.amount, {
              align: AlignmentType.RIGHT,
            }),
          ],
        }),
    );

    const totalRow = new TableRow({
      cantSplit: true,
      children: [
        cell('TOTAL', COL_PCT.no + COL_PCT.name + COL_PCT.account, {
          bold: true,
          shade: true,
          columnSpan: 3,
          align: AlignmentType.RIGHT,
        }),
        cell(totalFormatted, COL_PCT.amount, {
          bold: true,
          shade: true,
          align: AlignmentType.RIGHT,
        }),
      ],
    });

    return new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      rows: [header, ...rows, totalRow],
    });
  }
}

function formatBirr(value: number): string {
  return new Intl.NumberFormat('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

/** Export date as "October 6, 2026". */
function formatLetterDate(date: Date): string {
  return new Intl.DateTimeFormat('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  }).format(date);
}
