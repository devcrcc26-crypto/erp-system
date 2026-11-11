import { BadRequestException, Injectable } from '@nestjs/common';
import { SupportedCurrency } from '@prisma/client';
import * as ExcelJS from 'exceljs';
import { PrismaService } from '../../../../shared/prisma/prisma.service';
import { activeOnly } from '../../../../shared/prisma/soft-delete.util';
import { normalizeEmail } from '../../../../shared/utils/email.util';
import { ImportCommitResponseDto } from '../../../hr-shared/application/dtos/hr-import.dtos';
import {
  AddPurchaseRequestItemDto,
  CreatePurchaseRequestDto,
} from '../dtos/purchase-request.dtos';
import {
  PurchaseRequestImportPreviewResponseDto,
  PurchaseRequestImportRowPreviewDto,
} from '../dtos/purchase-request-import.dtos';
import { PurchaseRequestService } from './purchase-request.service';

type AuditContext = { companyId: string; userId: string };

const MAX_IMPORT_FILE_BYTES = 5 * 1024 * 1024;
const MAX_IMPORT_ROWS = 500;
const PURCHASE_REQUEST_CURRENCY = SupportedCurrency.ETB;

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
  requesttitle: 'title',
  'request title': 'title',
  request_title: 'title',
  justification: 'justification',
  vendorname: 'vendorName',
  'vendor name': 'vendorName',
  vendor_name: 'vendorName',
  vendoremail: 'vendorEmail',
  'vendor email': 'vendorEmail',
  vendor_email: 'vendorEmail',
  vendorphone: 'vendorPhone',
  'vendor phone': 'vendorPhone',
  vendor_phone: 'vendorPhone',
  vendorcontact: 'vendorContact',
  'vendor contact': 'vendorContact',
  vendor_contact: 'vendorContact',
  requiredbydate: 'requiredByDate',
  'required by date': 'requiredByDate',
  required_by_date: 'requiredByDate',
  itemname: 'itemName',
  'item name': 'itemName',
  item_name: 'itemName',
  modelspec: 'modelSpec',
  'model spec': 'modelSpec',
  model_spec: 'modelSpec',
  description: 'description',
  quantity: 'quantity',
  qty: 'quantity',
  unit: 'unit',
  unitprice: 'unitPrice',
  'unit price': 'unitPrice',
  unit_price: 'unitPrice',
  currency: 'currency',
};

interface ParsedImportRow {
  line: number;
  employeeEmail: string;
  employeeId: string;
  title: string;
  justification: string;
  vendorName: string;
  vendorEmail: string;
  vendorPhone: string;
  /** Legacy single column; mapped to email or phone when @ present */
  vendorContact: string;
  requiredByDate: string;
  itemName: string;
  modelSpec: string;
  description: string;
  quantity: string;
  unit: string;
  unitPrice: string;
  currency: string;
}

const DATE_FIELDS = new Set<keyof ParsedImportRow>(['requiredByDate']);

/**
 * Excel template / preview / commit for purchase request line items.
 */
@Injectable()
export class PurchaseRequestImportService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly purchaseRequestService: PurchaseRequestService,
  ) {}

  /**
   * Company-wide import template (request header + item columns).
   */
  async buildCompanyTemplate(): Promise<Buffer> {
    return this.buildTemplate({
      sheetName: 'Purchase Requests',
      includeEmployee: true,
      includeRequestHeader: true,
      sample: {
        employeeEmail: 'employee@company.local',
        employeeId: '',
        title: 'Site tools replenishment',
        justification: 'Replace worn hand tools for Phase 2',
        vendorName: '',
        vendorEmail: '',
        vendorPhone: '',
        vendorContact: '',
        requiredByDate: new Date().toISOString().slice(0, 10),
        itemName: 'Hammer',
        modelSpec: '',
        description: 'Claw hammer 16oz',
        quantity: '10',
        unit: 'pcs',
        unitPrice: '250',
        currency: 'ETB',
      },
      note:
        'Each row adds a line item to a DRAFT purchase request for that employee and title (request is created if needed). Item images are not imported. Requests are not auto-submitted.',
    });
  }

  /**
   * Request-scoped item import template.
   */
  async buildRequestTemplate(): Promise<Buffer> {
    return this.buildTemplate({
      sheetName: 'Request Items',
      includeEmployee: false,
      includeRequestHeader: false,
      sample: {
        employeeEmail: '',
        employeeId: '',
        title: '',
        justification: '',
        vendorName: '',
        vendorEmail: '',
        vendorPhone: '',
        vendorContact: '',
        requiredByDate: '',
        itemName: 'Hammer',
        modelSpec: '',
        description: 'Claw hammer 16oz',
        quantity: '10',
        unit: 'pcs',
        unitPrice: '250',
        currency: 'ETB',
      },
      note:
        'Each valid row adds a line item to this DRAFT or RETURNED purchase request. Item images must be uploaded in the UI.',
    });
  }

  async previewCompanyImport(
    ctx: AuditContext,
    file: Express.Multer.File,
  ): Promise<PurchaseRequestImportPreviewResponseDto> {
    const rows = await this.parseWorkbook(file, {
      requireEmployee: true,
      requireRequestHeader: true,
    });
    return this.validateRows(ctx, rows, { mode: 'company' });
  }

  async commitCompanyImport(
    ctx: AuditContext,
    file: Express.Multer.File,
  ): Promise<ImportCommitResponseDto> {
    const rows = await this.parseWorkbook(file, {
      requireEmployee: true,
      requireRequestHeader: true,
    });
    const preview = await this.validateRows(ctx, rows, { mode: 'company' });
    return this.commitValidatedRows(ctx, preview, { mode: 'company' });
  }

  async previewRequestImport(
    requestId: string,
    ctx: AuditContext,
    file: Express.Multer.File,
  ): Promise<PurchaseRequestImportPreviewResponseDto> {
    const request = await this.requireImportableRequest(requestId, ctx);
    const rows = await this.parseWorkbook(file, {
      requireEmployee: false,
      requireRequestHeader: false,
    });
    return this.validateRows(ctx, rows, {
      mode: 'request',
      requestId: request.id,
      employeeId: request.employeeId,
      title: request.title,
    });
  }

  async commitRequestImport(
    requestId: string,
    ctx: AuditContext,
    file: Express.Multer.File,
  ): Promise<ImportCommitResponseDto> {
    const request = await this.requireImportableRequest(requestId, ctx);
    const rows = await this.parseWorkbook(file, {
      requireEmployee: false,
      requireRequestHeader: false,
    });
    const preview = await this.validateRows(ctx, rows, {
      mode: 'request',
      requestId: request.id,
      employeeId: request.employeeId,
      title: request.title,
    });
    return this.commitValidatedRows(ctx, preview, {
      mode: 'request',
      requestId: request.id,
    });
  }

  private async buildTemplate(input: {
    sheetName: string;
    includeEmployee: boolean;
    includeRequestHeader: boolean;
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
    if (input.includeRequestHeader) {
      columns.push(
        { header: 'title', key: 'title', width: 28 },
        { header: 'justification', key: 'justification', width: 36 },
        { header: 'vendorName', key: 'vendorName', width: 20 },
        { header: 'vendorEmail', key: 'vendorEmail', width: 24 },
        { header: 'vendorPhone', key: 'vendorPhone', width: 18 },
        { header: 'requiredByDate', key: 'requiredByDate', width: 14 },
      );
    }
    columns.push(
      { header: 'itemName', key: 'itemName', width: 22 },
      { header: 'modelSpec', key: 'modelSpec', width: 20 },
      { header: 'description', key: 'description', width: 28 },
      { header: 'quantity', key: 'quantity', width: 10 },
      { header: 'unit', key: 'unit', width: 10 },
      { header: 'unitPrice', key: 'unitPrice', width: 12 },
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
    if (input.includeRequestHeader) {
      instructions.addRow([
        'title',
        'Yes',
        'Request title - rows with the same employee+title share one DRAFT request',
      ]);
      instructions.addRow(['justification', 'Yes', 'Business justification']);
      instructions.addRow(['vendorName', 'No', 'Optional preferred vendor']);
      instructions.addRow(['vendorEmail', 'No', 'Optional vendor email']);
      instructions.addRow(['vendorPhone', 'No', 'Optional vendor phone number']);
      instructions.addRow([
        'vendorContact',
        'Legacy',
        'Deprecated — use vendorEmail / vendorPhone',
      ]);
      instructions.addRow(['requiredByDate', 'No', 'YYYY-MM-DD']);
    }
    instructions.addRow(['itemName', 'Yes', 'Line item name']);
    instructions.addRow(['modelSpec', 'No', 'Model / specifications']);
    instructions.addRow(['description', 'No', 'Item description']);
    instructions.addRow(['quantity', 'Yes', 'Positive number']);
    instructions.addRow(['unit', 'Yes', 'e.g. pcs, kg, m']);
    instructions.addRow(['unitPrice', 'Yes', 'Positive number']);
    instructions.addRow([
      'currency',
      'No',
      `Optional; must be ${PURCHASE_REQUEST_CURRENCY} if provided (defaults to ${PURCHASE_REQUEST_CURRENCY})`,
    ]);
    instructions.addRow([]);
    instructions.addRow(['Note', '', input.note]);

    const buffer = await workbook.xlsx.writeBuffer();
    return Buffer.from(buffer);
  }

  private async requireImportableRequest(
    requestId: string,
    ctx: AuditContext,
  ): Promise<{ id: string; employeeId: string; title: string }> {
    const request = await this.prisma.purchaseRequest.findFirst({
      where: activeOnly({ id: requestId, companyId: ctx.companyId }),
      select: { id: true, employeeId: true, title: true, status: true },
    });
    if (!request) {
      throw new BadRequestException('Purchase request not found');
    }
    if (request.status !== 'DRAFT' && request.status !== 'RETURNED') {
      throw new BadRequestException(
        'Items can only be imported into DRAFT or RETURNED requests',
      );
    }
    await this.purchaseRequestService.getRequest(
      requestId,
      ctx.companyId,
      ctx.userId,
    );
    return request;
  }

  private async commitValidatedRows(
    ctx: AuditContext,
    preview: PurchaseRequestImportPreviewResponseDto,
    options: { mode: 'company' } | { mode: 'request'; requestId: string },
  ): Promise<ImportCommitResponseDto> {
    const validRows = preview.rows.filter(
      (row): row is PurchaseRequestImportRowPreviewDto & {
        status: 'ok';
        employeeId: string;
        title: string;
        justification: string;
        itemName: string;
        quantity: number;
        unit: string;
        unitPrice: number;
        currency: SupportedCurrency;
      } =>
        row.status === 'ok' &&
        Boolean(row.employeeId) &&
        Boolean(row.title) &&
        Boolean(row.justification) &&
        Boolean(row.itemName) &&
        row.quantity != null &&
        Boolean(row.unit) &&
        row.unitPrice != null &&
        Boolean(row.currency),
    );
    const skipped = preview.rows.length - validRows.length;
    const errors: ImportCommitResponseDto['errors'] = [];
    let created = 0;
    const requestCache = new Map<string, string>();

    for (const row of validRows) {
      try {
        let requestId: string;
        if (options.mode === 'request') {
          requestId = options.requestId;
        } else {
          const cacheKey = `${row.employeeId}|${row.title.trim().toLowerCase()}`;
          const cached = requestCache.get(cacheKey);
          if (cached) {
            requestId = cached;
          } else {
            const header: CreatePurchaseRequestDto = {
              title: row.title,
              justification: row.justification,
              vendorName: row.vendorName,
              vendorEmail: row.vendorEmail,
              vendorPhone: row.vendorPhone,
              requiredByDate: row.requiredByDate,
            };
            const request =
              await this.purchaseRequestService.findOrCreateDraftRequest(
                row.employeeId,
                header,
                ctx.companyId,
                ctx.userId,
                false,
              );
            requestId = request.id;
            requestCache.set(cacheKey, requestId);
          }
        }

        const dto: AddPurchaseRequestItemDto = {
          itemName: row.itemName,
          modelSpec: row.modelSpec,
          description: row.description,
          quantity: row.quantity,
          unit: row.unit,
          unitPrice: row.unitPrice,
          currency: row.currency,
        };
        await this.purchaseRequestService.addItem(
          requestId,
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
              : 'Failed to import purchase request item',
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
    options: { requireEmployee: boolean; requireRequestHeader: boolean },
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
      'itemName',
      'quantity',
      'unit',
      'unitPrice',
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
    if (options.requireRequestHeader) {
      if (!mapped.has('title')) {
        throw new BadRequestException(
          'Missing required column: title. Download the template.',
        );
      }
      if (!mapped.has('justification')) {
        throw new BadRequestException(
          'Missing required column: justification. Download the template.',
        );
      }
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
        justification: '',
        vendorName: '',
        vendorEmail: '',
        vendorPhone: '',
        vendorContact: '',
        requiredByDate: '',
        itemName: '',
        modelSpec: '',
        description: '',
        quantity: '',
        unit: '',
        unitPrice: '',
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
          mode: 'request';
          requestId: string;
          employeeId: string;
          title: string;
        },
  ): Promise<PurchaseRequestImportPreviewResponseDto> {
    const keysInFile = new Set<string>();
    const previewRows: PurchaseRequestImportRowPreviewDto[] = [];

    for (const row of rows) {
      const preview = await this.validateRow(ctx, row, keysInFile, options);
      previewRows.push(preview);
      if (
        preview.status === 'ok' &&
        preview.employeeId &&
        preview.title &&
        preview.itemName &&
        preview.quantity != null &&
        preview.unit &&
        preview.unitPrice != null &&
        preview.currency
      ) {
        keysInFile.add(
          this.rowKey(
            preview.employeeId,
            preview.title,
            preview.itemName,
            preview.quantity,
            preview.unit,
            preview.unitPrice,
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
          mode: 'request';
          requestId: string;
          employeeId: string;
          title: string;
        },
  ): Promise<PurchaseRequestImportRowPreviewDto> {
    const label =
      row.employeeEmail.trim() ||
      row.title.trim() ||
      row.itemName.trim() ||
      `Line ${row.line}`;

    const base: PurchaseRequestImportRowPreviewDto = {
      line: row.line,
      label,
      status: 'error',
      employeeEmail: row.employeeEmail.trim() || undefined,
      employeeId: row.employeeId.trim() || undefined,
      title: row.title.trim() || undefined,
      justification: row.justification.trim() || undefined,
    };

    let employeeId: string;
    let title: string;
    let justification: string;

    if (options.mode === 'request') {
      employeeId = options.employeeId;
      title = options.title;
      justification = 'n/a';
      base.employeeId = employeeId;
      base.title = title;
      base.justification = justification;
      base.label = row.itemName.trim() || title || label;
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
      if (!row.justification.trim()) {
        return {
          ...base,
          status: 'error',
          message: 'justification is required',
        };
      }
      title = row.title.trim();
      justification = row.justification.trim();
      base.title = title;
      base.justification = justification;
      base.vendorName = row.vendorName.trim() || undefined;
      const vendorFields = this.resolveVendorFields(row);
      base.vendorEmail = vendorFields.vendorEmail;
      base.vendorPhone = vendorFields.vendorPhone;

      const dateResult = this.parseImportDate(
        row.requiredByDate,
        'requiredByDate',
        false,
      );
      if (!dateResult.ok) {
        return { ...base, status: 'error', message: dateResult.message };
      }
      base.requiredByDate = dateResult.value;

    }

    if (!row.itemName.trim()) {
      return { ...base, status: 'error', message: 'itemName is required' };
    }
    if (!row.unit.trim()) {
      return { ...base, status: 'error', message: 'unit is required' };
    }

    const quantityResult = this.parsePositiveNumber(row.quantity, 'quantity');
    if (!quantityResult.ok) {
      return { ...base, status: 'error', message: quantityResult.message };
    }

    const unitPriceResult = this.parsePositiveNumber(
      row.unitPrice,
      'unitPrice',
    );
    if (!unitPriceResult.ok) {
      return { ...base, status: 'error', message: unitPriceResult.message };
    }

    const currencyResult = this.parseCurrency(row.currency);
    if (!currencyResult.ok) {
      return { ...base, status: 'error', message: currencyResult.message };
    }

    const key = this.rowKey(
      employeeId,
      title,
      row.itemName.trim(),
      quantityResult.value,
      row.unit.trim(),
      unitPriceResult.value,
      currencyResult.value,
    );
    if (keysInFile.has(key)) {
      return {
        ...base,
        status: 'duplicate_in_file',
        message: 'Duplicate purchase item in this file',
        itemName: row.itemName.trim(),
        modelSpec: row.modelSpec.trim() || undefined,
        description: row.description.trim() || undefined,
        quantity: quantityResult.value,
        unit: row.unit.trim(),
        unitPrice: unitPriceResult.value,
        currency: currencyResult.value,
      };
    }

    return {
      ...base,
      status: 'ok',
      itemName: row.itemName.trim(),
      modelSpec: row.modelSpec.trim() || undefined,
      description: row.description.trim() || undefined,
      quantity: quantityResult.value,
      unit: row.unit.trim(),
      unitPrice: unitPriceResult.value,
      currency: currencyResult.value,
    };
  }

  private rowKey(
    employeeId: string,
    title: string,
    itemName: string,
    quantity: number,
    unit: string,
    unitPrice: number,
    currency: string,
  ): string {
    return `${employeeId}|${title.trim().toLowerCase()}|${itemName}|${quantity}|${unit}|${unitPrice}|${currency}`;
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

  private resolveVendorFields(row: ParsedImportRow): {
    vendorEmail?: string;
    vendorPhone?: string;
  } {
    let vendorEmail = row.vendorEmail.trim() || undefined;
    let vendorPhone = row.vendorPhone.trim() || undefined;
    const legacy = row.vendorContact.trim();
    if (legacy) {
      if (legacy.includes('@')) {
        vendorEmail = vendorEmail ?? legacy.toLowerCase();
      } else {
        vendorPhone = vendorPhone ?? legacy;
      }
    }
    return { vendorEmail, vendorPhone };
  }

  private parsePositiveNumber(
    value: string,
    fieldLabel: string,
  ): { ok: true; value: number } | { ok: false; message: string } {
    if (!value.trim()) {
      return { ok: false, message: `${fieldLabel} is required` };
    }
    const num = Number(value);
    if (!Number.isFinite(num) || num <= 0) {
      return {
        ok: false,
        message: `${fieldLabel} must be a positive number`,
      };
    }
    return { ok: true, value: num };
  }

  private parseCurrency(
    value: string,
  ):
    | { ok: true; value: SupportedCurrency }
    | { ok: false; message: string } {
    const normalized = value.trim().toUpperCase();
    if (!normalized) {
      return { ok: true, value: PURCHASE_REQUEST_CURRENCY };
    }
    if (normalized !== PURCHASE_REQUEST_CURRENCY) {
      return {
        ok: false,
        message: `currency must be ${PURCHASE_REQUEST_CURRENCY}`,
      };
    }
    return { ok: true, value: PURCHASE_REQUEST_CURRENCY };
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
