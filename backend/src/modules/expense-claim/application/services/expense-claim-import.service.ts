import { BadRequestException, Injectable } from '@nestjs/common';
import { SupportedCurrency } from '@prisma/client';
import * as ExcelJS from 'exceljs';
import { PrismaService } from '../../../../shared/prisma/prisma.service';
import { activeOnly } from '../../../../shared/prisma/soft-delete.util';
import { normalizeEmail } from '../../../../shared/utils/email.util';
import { ImportCommitResponseDto } from '../../../hr-shared/application/dtos/hr-import.dtos';
import { AddExpenseClaimItemDto } from '../dtos/expense-claim.dtos';
import {
  ExpenseClaimImportPreviewResponseDto,
  ExpenseClaimImportRowPreviewDto,
} from '../dtos/expense-claim-import.dtos';
import { ExpenseClaimService } from './expense-claim.service';

type AuditContext = { companyId: string; userId: string };

const MAX_IMPORT_FILE_BYTES = 5 * 1024 * 1024;
const MAX_IMPORT_ROWS = 500;
const CURRENCY_VALUES = Object.values(SupportedCurrency);

const ALLOWED_MIME_TYPES = new Set([
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/octet-stream',
]);

const HEADER_ALIASES: Record<string, keyof ParsedImportRow> = {
  employeeemail: 'employeeEmail',
  'employee email': 'employeeEmail',
  employee_email: 'employeeEmail',
  email: 'employeeEmail',
  employeeid: 'employeeId',
  'employee id': 'employeeId',
  employee_id: 'employeeId',
  title: 'title',
  claimtitle: 'title',
  'claim title': 'title',
  claim_title: 'title',
  claimdescription: 'claimDescription',
  'claim description': 'claimDescription',
  claim_description: 'claimDescription',
  category: 'category',
  description: 'description',
  itemdescription: 'description',
  'item description': 'description',
  item_description: 'description',
  expensedate: 'expenseDate',
  'expense date': 'expenseDate',
  expense_date: 'expenseDate',
  date: 'expenseDate',
  amount: 'amount',
  currency: 'currency',
};

interface ParsedImportRow {
  line: number;
  employeeEmail: string;
  employeeId: string;
  title: string;
  claimDescription: string;
  category: string;
  description: string;
  expenseDate: string;
  amount: string;
  currency: string;
}

const DATE_FIELDS = new Set<keyof ParsedImportRow>(['expenseDate']);

/**
 * Excel template / preview / commit for expense claim line items.
 */
@Injectable()
export class ExpenseClaimImportService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly expenseClaimService: ExpenseClaimService,
  ) {}

  /**
   * Company-wide import template (claim header + item columns).
   */
  async buildCompanyTemplate(): Promise<Buffer> {
    return this.buildTemplate({
      sheetName: 'Expense Claims',
      includeEmployee: true,
      includeClaimHeader: true,
      sample: {
        employeeEmail: 'employee@company.local',
        employeeId: '',
        title: 'August site expenses',
        claimDescription: '',
        category: 'Travel',
        description: 'Taxi to site',
        expenseDate: new Date().toISOString().slice(0, 10),
        amount: '250',
        currency: 'ETB',
      },
      note:
        'Each row adds a line item to a DRAFT claim for that employee and title (claim is created if needed). Receipts are not imported - upload them before submit. Claims are not auto-submitted.',
    });
  }

  /**
   * Claim-scoped item import template.
   */
  async buildClaimTemplate(): Promise<Buffer> {
    return this.buildTemplate({
      sheetName: 'Claim Items',
      includeEmployee: false,
      includeClaimHeader: false,
      sample: {
        employeeEmail: '',
        employeeId: '',
        title: '',
        claimDescription: '',
        category: 'Travel',
        description: 'Taxi to site',
        expenseDate: new Date().toISOString().slice(0, 10),
        amount: '250',
        currency: 'ETB',
      },
      note:
        'Each valid row adds a line item to this DRAFT claim. Receipts must be uploaded in the UI before submit.',
    });
  }

  async previewCompanyImport(
    ctx: AuditContext,
    file: Express.Multer.File,
  ): Promise<ExpenseClaimImportPreviewResponseDto> {
    const rows = await this.parseWorkbook(file, {
      requireEmployee: true,
      requireClaimHeader: true,
    });
    return this.validateRows(ctx, rows, { mode: 'company' });
  }

  async commitCompanyImport(
    ctx: AuditContext,
    file: Express.Multer.File,
  ): Promise<ImportCommitResponseDto> {
    const rows = await this.parseWorkbook(file, {
      requireEmployee: true,
      requireClaimHeader: true,
    });
    const preview = await this.validateRows(ctx, rows, { mode: 'company' });
    return this.commitValidatedRows(ctx, preview, { mode: 'company' });
  }

  async previewClaimImport(
    claimId: string,
    ctx: AuditContext,
    file: Express.Multer.File,
  ): Promise<ExpenseClaimImportPreviewResponseDto> {
    const claim = await this.requireImportableClaim(claimId, ctx);
    const rows = await this.parseWorkbook(file, {
      requireEmployee: false,
      requireClaimHeader: false,
    });
    return this.validateRows(ctx, rows, {
      mode: 'claim',
      claimId: claim.id,
      employeeId: claim.employeeId,
      title: claim.title,
    });
  }

  async commitClaimImport(
    claimId: string,
    ctx: AuditContext,
    file: Express.Multer.File,
  ): Promise<ImportCommitResponseDto> {
    const claim = await this.requireImportableClaim(claimId, ctx);
    const rows = await this.parseWorkbook(file, {
      requireEmployee: false,
      requireClaimHeader: false,
    });
    const preview = await this.validateRows(ctx, rows, {
      mode: 'claim',
      claimId: claim.id,
      employeeId: claim.employeeId,
      title: claim.title,
    });
    return this.commitValidatedRows(ctx, preview, {
      mode: 'claim',
      claimId: claim.id,
    });
  }

  private async buildTemplate(input: {
    sheetName: string;
    includeEmployee: boolean;
    includeClaimHeader: boolean;
    sample: Omit<ParsedImportRow, 'line'>;
    note: string;
  }): Promise<Buffer> {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet(input.sheetName);
    const columns: Array<{ header: string; key: string; width: number }> = [];

    if (input.includeEmployee) {
      columns.push(
        { header: 'employeeEmail', key: 'employeeEmail', width: 28 },
        { header: 'employeeId', key: 'employeeId', width: 36 },
      );
    }
    if (input.includeClaimHeader) {
      columns.push(
        { header: 'title', key: 'title', width: 28 },
        { header: 'claimDescription', key: 'claimDescription', width: 28 },
      );
    }
    columns.push(
      { header: 'category', key: 'category', width: 16 },
      { header: 'description', key: 'description', width: 32 },
      { header: 'expenseDate', key: 'expenseDate', width: 14 },
      { header: 'amount', key: 'amount', width: 12 },
      { header: 'currency', key: 'currency', width: 10 },
    );
    sheet.columns = columns;
    sheet.addRow(input.sample);

    const instructions = workbook.addWorksheet('Instructions');
    instructions.addRow(['Column', 'Required', 'Notes']);
    if (input.includeEmployee) {
      instructions.addRow([
        'employeeEmail',
        'Preferred',
        'Resolve employee by email (preferred over employeeId)',
      ]);
      instructions.addRow([
        'employeeId',
        'If no email',
        'User UUID - required when employeeEmail is blank',
      ]);
    }
    if (input.includeClaimHeader) {
      instructions.addRow([
        'title',
        'Yes',
        'Claim title - rows with the same employee+title share one DRAFT claim',
      ]);
      instructions.addRow(['claimDescription', 'No', 'Optional claim notes']);
    }
    instructions.addRow(['category', 'Yes', 'Expense category (free text)']);
    instructions.addRow(['description', 'Yes', 'Line item description']);
    instructions.addRow(['expenseDate', 'Yes', 'YYYY-MM-DD']);
    instructions.addRow(['amount', 'Yes', 'Positive number']);
    instructions.addRow([
      'currency',
      'Yes',
      CURRENCY_VALUES.join(' | '),
    ]);
    instructions.addRow([]);
    instructions.addRow(['Note', '', input.note]);

    const buffer = await workbook.xlsx.writeBuffer();
    return Buffer.from(buffer);
  }

  private async requireImportableClaim(
    claimId: string,
    ctx: AuditContext,
  ): Promise<{ id: string; employeeId: string; title: string }> {
    const claim = await this.prisma.expenseClaim.findFirst({
      where: activeOnly({ id: claimId, companyId: ctx.companyId }),
      select: { id: true, employeeId: true, title: true, status: true },
    });
    if (!claim) {
      throw new BadRequestException('Expense claim not found');
    }
    if (claim.status !== 'DRAFT') {
      throw new BadRequestException(
        'Items can only be imported into DRAFT claims',
      );
    }
    await this.expenseClaimService.getClaim(
      claimId,
      ctx.companyId,
      ctx.userId,
    );
    return claim;
  }

  private async commitValidatedRows(
    ctx: AuditContext,
    preview: ExpenseClaimImportPreviewResponseDto,
    options: { mode: 'company' } | { mode: 'claim'; claimId: string },
  ): Promise<ImportCommitResponseDto> {
    const validRows = preview.rows.filter(
      (row): row is ExpenseClaimImportRowPreviewDto & {
        status: 'ok';
        employeeId: string;
        title: string;
        category: string;
        description: string;
        expenseDate: string;
        amount: number;
        currency: SupportedCurrency;
      } =>
        row.status === 'ok' &&
        Boolean(row.employeeId) &&
        Boolean(row.title) &&
        Boolean(row.category) &&
        Boolean(row.description) &&
        Boolean(row.expenseDate) &&
        row.amount != null &&
        Boolean(row.currency),
    );
    const skipped = preview.rows.length - validRows.length;
    const errors: ImportCommitResponseDto['errors'] = [];
    let created = 0;
    const claimCache = new Map<string, string>();

    for (const row of validRows) {
      try {
        let claimId: string;
        if (options.mode === 'claim') {
          claimId = options.claimId;
        } else {
          const cacheKey = `${row.employeeId}|${row.title.trim().toLowerCase()}`;
          const cached = claimCache.get(cacheKey);
          if (cached) {
            claimId = cached;
          } else {
            const claim =
              await this.expenseClaimService.findOrCreateDraftClaim(
                row.employeeId,
                row.title,
                row.claimDescription,
                ctx.companyId,
                ctx.userId,
                false,
              );
            claimId = claim.id;
            claimCache.set(cacheKey, claimId);
          }
        }

        const dto: AddExpenseClaimItemDto = {
          category: row.category,
          description: row.description,
          expenseDate: row.expenseDate,
          amount: row.amount,
          currency: row.currency,
        };
        await this.expenseClaimService.addItem(
          claimId,
          dto,
          [],
          ctx.companyId,
          ctx.userId,
        );
        created += 1;
      } catch (error) {
        errors.push({
          line: row.line,
          label: row.label,
          message:
            error instanceof Error
              ? error.message
              : 'Failed to import expense claim item',
        });
      }
    }

    return {
      created,
      skipped: skipped + errors.length,
      errors,
    };
  }

  private async parseWorkbook(
    file: Express.Multer.File,
    options: { requireEmployee: boolean; requireClaimHeader: boolean },
  ): Promise<ParsedImportRow[]> {
    this.assertValidUpload(file);
    const workbook = await this.loadWorkbookFromBuffer(file.buffer);
    const sheet = workbook.worksheets[0];
    if (!sheet) {
      throw new BadRequestException('Workbook must contain at least one sheet');
    }

    const headerRow = sheet.getRow(1);
    const columnMap = new Map<number, keyof ParsedImportRow>();
    headerRow.eachCell((cell, colNumber) => {
      const header = this.normalizeHeader(this.cellToString(cell.value));
      const field = HEADER_ALIASES[header];
      if (field) {
        columnMap.set(colNumber, field);
      }
    });

    const mapped = new Set(columnMap.values());
    for (const field of [
      'category',
      'description',
      'expenseDate',
      'amount',
      'currency',
    ] as const) {
      if (!mapped.has(field)) {
        throw new BadRequestException(
          `Missing required column: ${field}. Download the template.`,
        );
      }
    }
    if (options.requireEmployee) {
      if (!mapped.has('employeeEmail') && !mapped.has('employeeId')) {
        throw new BadRequestException(
          'Missing employeeEmail or employeeId column. Download the template.',
        );
      }
    }
    if (options.requireClaimHeader && !mapped.has('title')) {
      throw new BadRequestException(
        'Missing required column: title. Download the template.',
      );
    }

    const rows: ParsedImportRow[] = [];
    for (let rowNumber = 2; rowNumber <= sheet.rowCount; rowNumber += 1) {
      const excelRow = sheet.getRow(rowNumber);
      if (this.isRowEmpty(excelRow)) {
        continue;
      }

      const parsed: ParsedImportRow = {
        line: rowNumber,
        employeeEmail: '',
        employeeId: '',
        title: '',
        claimDescription: '',
        category: '',
        description: '',
        expenseDate: '',
        amount: '',
        currency: '',
      };

      columnMap.forEach((field, colNumber) => {
        if (field === 'line') {
          return;
        }
        const cellValue = excelRow.getCell(colNumber).value;
        const value = DATE_FIELDS.has(field)
          ? this.cellToDateString(cellValue).trim()
          : this.cellToString(cellValue).trim();
        parsed[field] = value;
      });

      rows.push(parsed);
      if (rows.length > MAX_IMPORT_ROWS) {
        throw new BadRequestException(
          `Import exceeds maximum of ${MAX_IMPORT_ROWS} rows`,
        );
      }
    }

    if (rows.length === 0) {
      throw new BadRequestException('No data rows found in the spreadsheet');
    }
    return rows;
  }

  private async validateRows(
    ctx: AuditContext,
    rows: ParsedImportRow[],
    options:
      | { mode: 'company' }
      | {
          mode: 'claim';
          claimId: string;
          employeeId: string;
          title: string;
        },
  ): Promise<ExpenseClaimImportPreviewResponseDto> {
    const keysInFile = new Set<string>();
    const previewRows: ExpenseClaimImportRowPreviewDto[] = [];

    for (const row of rows) {
      const preview = await this.validateRow(ctx, row, keysInFile, options);
      previewRows.push(preview);
      if (
        preview.status === 'ok' &&
        preview.employeeId &&
        preview.title &&
        preview.category &&
        preview.description &&
        preview.expenseDate &&
        preview.amount != null &&
        preview.currency
      ) {
        keysInFile.add(
          this.rowKey(
            preview.employeeId,
            preview.title,
            preview.category,
            preview.description,
            preview.expenseDate,
            preview.amount,
            preview.currency,
          ),
        );
      }
    }

    const valid = previewRows.filter((r) => r.status === 'ok').length;
    const duplicate = previewRows.filter(
      (r) => r.status === 'duplicate' || r.status === 'duplicate_in_file',
    ).length;
    const invalid = previewRows.length - valid - duplicate;

    return { valid, invalid, duplicate, rows: previewRows };
  }

  private async validateRow(
    ctx: AuditContext,
    row: ParsedImportRow,
    keysInFile: Set<string>,
    options:
      | { mode: 'company' }
      | {
          mode: 'claim';
          claimId: string;
          employeeId: string;
          title: string;
        },
  ): Promise<ExpenseClaimImportRowPreviewDto> {
    const label =
      row.employeeEmail.trim() ||
      row.title.trim() ||
      row.description.trim() ||
      `Line ${row.line}`;

    const base: ExpenseClaimImportRowPreviewDto = {
      line: row.line,
      label,
      status: 'error',
      employeeEmail: row.employeeEmail.trim() || undefined,
      employeeId: row.employeeId.trim() || undefined,
      title: row.title.trim() || undefined,
      claimDescription: row.claimDescription.trim() || undefined,
    };

    let employeeId: string;
    let title: string;

    if (options.mode === 'claim') {
      employeeId = options.employeeId;
      title = options.title;
      base.employeeId = employeeId;
      base.title = title;
      base.label = row.description.trim() || title || label;
    } else {
      const employee = await this.resolveEmployee(ctx.companyId, row);
      if (!employee.ok) {
        return { ...base, status: 'error', message: employee.message };
      }
      employeeId = employee.id;
      base.employeeId = employee.id;
      base.employeeEmail = employee.email ?? undefined;
      base.label =
        employee.email ||
        `${employee.firstName} ${employee.lastName}`.trim() ||
        employee.id;

      if (!row.title.trim()) {
        return { ...base, status: 'error', message: 'title is required' };
      }
      title = row.title.trim();
      base.title = title;
      base.claimDescription = row.claimDescription.trim() || undefined;
    }

    if (!row.category.trim()) {
      return { ...base, status: 'error', message: 'category is required' };
    }
    if (!row.description.trim()) {
      return { ...base, status: 'error', message: 'description is required' };
    }

    const dateResult = this.parseImportDate(row.expenseDate, 'expenseDate', true);
    if (!dateResult.ok || !dateResult.value) {
      return {
        ...base,
        status: 'error',
        message: dateResult.ok ? 'expenseDate is required' : dateResult.message,
      };
    }

    const amountResult = this.parseAmount(row.amount);
    if (!amountResult.ok) {
      return { ...base, status: 'error', message: amountResult.message };
    }

    const currencyResult = this.parseCurrency(row.currency);
    if (!currencyResult.ok) {
      return { ...base, status: 'error', message: currencyResult.message };
    }

    const key = this.rowKey(
      employeeId,
      title,
      row.category.trim(),
      row.description.trim(),
      dateResult.value,
      amountResult.value,
      currencyResult.value,
    );
    if (keysInFile.has(key)) {
      return {
        ...base,
        status: 'duplicate_in_file',
        message: 'Duplicate expense item in this file',
        category: row.category.trim(),
        description: row.description.trim(),
        expenseDate: dateResult.value,
        amount: amountResult.value,
        currency: currencyResult.value,
      };
    }

    return {
      ...base,
      status: 'ok',
      category: row.category.trim(),
      description: row.description.trim(),
      expenseDate: dateResult.value,
      amount: amountResult.value,
      currency: currencyResult.value,
    };
  }

  private rowKey(
    employeeId: string,
    title: string,
    category: string,
    description: string,
    expenseDate: string,
    amount: number,
    currency: string,
  ): string {
    return `${employeeId}|${title.trim().toLowerCase()}|${category}|${description}|${expenseDate}|${amount}|${currency}`;
  }

  private async resolveEmployee(
    companyId: string,
    row: ParsedImportRow,
  ): Promise<
    | {
        ok: true;
        id: string;
        email: string | null;
        firstName: string;
        lastName: string;
      }
    | { ok: false; message: string }
  > {
    const email = row.employeeEmail.trim();
    const employeeId = row.employeeId.trim();

    if (email) {
      if (!this.isValidEmail(email)) {
        return { ok: false, message: 'Invalid employeeEmail' };
      }
      const user = await this.prisma.user.findFirst({
        where: activeOnly({
          companyId,
          email: normalizeEmail(email),
        }),
        select: {
          id: true,
          email: true,
          firstName: true,
          lastName: true,
        },
      });
      if (!user) {
        return { ok: false, message: `Employee not found for email: ${email}` };
      }
      return { ok: true, ...user };
    }

    if (!employeeId) {
      return {
        ok: false,
        message: 'employeeEmail or employeeId is required',
      };
    }
    if (!this.isUuid(employeeId)) {
      return { ok: false, message: 'employeeId must be a valid UUID' };
    }

    const user = await this.prisma.user.findFirst({
      where: activeOnly({ companyId, id: employeeId }),
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
      },
    });
    if (!user) {
      return { ok: false, message: `Employee not found for id: ${employeeId}` };
    }
    return { ok: true, ...user };
  }

  private parseAmount(
    value: string,
  ): { ok: true; value: number } | { ok: false; message: string } {
    if (!value.trim()) {
      return { ok: false, message: 'amount is required' };
    }
    const num = Number(value);
    if (!Number.isFinite(num) || num <= 0) {
      return { ok: false, message: 'amount must be a positive number' };
    }
    return { ok: true, value: num };
  }

  private parseCurrency(
    value: string,
  ):
    | { ok: true; value: SupportedCurrency }
    | { ok: false; message: string } {
    if (!value.trim()) {
      return { ok: false, message: 'currency is required' };
    }
    const normalized = value.trim().toUpperCase();
    const match = CURRENCY_VALUES.find((entry) => entry === normalized);
    if (!match) {
      return {
        ok: false,
        message: `currency must be one of: ${CURRENCY_VALUES.join(', ')}`,
      };
    }
    return { ok: true, value: match };
  }

  private parseImportDate(
    value: string,
    fieldLabel: string,
    required: boolean,
  ):
    | { ok: true; value: string | undefined }
    | { ok: false; message: string } {
    if (!value.trim()) {
      if (required) {
        return { ok: false, message: `${fieldLabel} is required` };
      }
      return { ok: true, value: undefined };
    }
    const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value.trim());
    if (!match) {
      return { ok: false, message: `Invalid ${fieldLabel}: use YYYY-MM-DD` };
    }
    return { ok: true, value: `${match[1]}-${match[2]}-${match[3]}` };
  }

  private async loadWorkbookFromBuffer(
    buffer: Buffer,
  ): Promise<ExcelJS.Workbook> {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer as never);
    return workbook;
  }

  private assertValidUpload(file: Express.Multer.File): void {
    if (!file?.buffer?.length) {
      throw new BadRequestException('File is required');
    }
    if (file.size > MAX_IMPORT_FILE_BYTES) {
      throw new BadRequestException('File exceeds maximum size of 5 MB');
    }
    if (file.mimetype && !ALLOWED_MIME_TYPES.has(file.mimetype)) {
      throw new BadRequestException('Only .xlsx Excel files are supported');
    }
  }

  private isValidEmail(email: string): boolean {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizeEmail(email));
  }

  private isUuid(value: string): boolean {
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      value,
    );
  }

  private normalizeHeader(value: string): string {
    return value.trim().toLowerCase().replace(/\s+/g, ' ');
  }

  private cellToString(value: ExcelJS.CellValue): string {
    if (value === null || value === undefined) {
      return '';
    }
    if (typeof value === 'object' && 'text' in value) {
      return String(value.text ?? '');
    }
    if (typeof value === 'object' && 'result' in value) {
      return this.cellToString(value.result as ExcelJS.CellValue);
    }
    if (value instanceof Date) {
      return value.toISOString();
    }
    return String(value);
  }

  private cellToDateString(value: ExcelJS.CellValue): string {
    if (value === null || value === undefined) {
      return '';
    }
    if (value instanceof Date) {
      const year = value.getFullYear();
      const month = String(value.getMonth() + 1).padStart(2, '0');
      const day = String(value.getDate()).padStart(2, '0');
      return `${year}-${month}-${day}`;
    }
    if (typeof value === 'object' && 'text' in value) {
      return this.cellToDateString(String(value.text ?? ''));
    }
    if (typeof value === 'object' && 'result' in value) {
      return this.cellToDateString(value.result as ExcelJS.CellValue);
    }
    const asString = String(value).trim();
    const isoMatch = /^(\d{4}-\d{2}-\d{2})/.exec(asString);
    if (isoMatch) {
      return isoMatch[1];
    }
    return asString;
  }

  private isRowEmpty(row: ExcelJS.Row): boolean {
    let hasValue = false;
    row.eachCell({ includeEmpty: false }, () => {
      hasValue = true;
    });
    return !hasValue;
  }
}
