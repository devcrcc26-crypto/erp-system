import { BadRequestException, Injectable } from '@nestjs/common';
import * as ExcelJS from 'exceljs';
import { PrismaService } from '../../../../shared/prisma/prisma.service';
import { activeOnly } from '../../../../shared/prisma/soft-delete.util';
import { normalizeEmail } from '../../../../shared/utils/email.util';
import { ImportCommitResponseDto } from '../../../hr-shared/application/dtos/hr-import.dtos';
import {
  AddMaterialRequisitionItemDto,
  CreateMaterialRequisitionDto,
} from '../dtos/material-requisition.dtos';
import {
  MaterialRequisitionImportPreviewResponseDto,
  MaterialRequisitionImportRowPreviewDto,
} from '../dtos/material-requisition-import.dtos';
import { MaterialRequisitionService } from './material-requisition.service';

type AuditContext = { companyId: string; userId: string };

const MAX_IMPORT_FILE_BYTES = 5 * 1024 * 1024;
const MAX_IMPORT_ROWS = 500;

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
  purpose: 'purpose',
  warehouselocation: 'warehouseLocation',
  'warehouse location': 'warehouseLocation',
  warehouse_location: 'warehouseLocation',
  warehouse: 'warehouseLocation',
  requiredbydate: 'requiredByDate',
  'required by date': 'requiredByDate',
  required_by_date: 'requiredByDate',
  projectid: 'projectId',
  'project id': 'projectId',
  project_id: 'projectId',
  projectcode: 'projectCode',
  'project code': 'projectCode',
  project_code: 'projectCode',
  itemname: 'itemName',
  'item name': 'itemName',
  item_name: 'itemName',
  itemcode: 'itemCode',
  'item code': 'itemCode',
  item_code: 'itemCode',
  description: 'description',
  quantity: 'quantity',
  qty: 'quantity',
  unit: 'unit',
};

interface ParsedImportRow {
  line: number;
  employeeEmail: string;
  employeeId: string;
  title: string;
  purpose: string;
  warehouseLocation: string;
  requiredByDate: string;
  projectId: string;
  projectCode: string;
  itemName: string;
  itemCode: string;
  description: string;
  quantity: string;
  unit: string;
}

const DATE_FIELDS = new Set<keyof ParsedImportRow>(['requiredByDate']);

/**
 * Excel template / preview / commit for material requisition line items.
 */
@Injectable()
export class MaterialRequisitionImportService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly materialRequisitionService: MaterialRequisitionService,
  ) {}

  /** Company-wide import template (header + item columns). */
  async buildCompanyTemplate(): Promise<Buffer> {
    return this.buildTemplate({
      sheetName: 'Material Requisitions',
      includeEmployee: true,
      includeHeader: true,
      sample: {
        employeeEmail: 'employee@company.local',
        employeeId: '',
        title: 'Site consumables top-up',
        purpose: 'Replenish warehouse consumables for Phase 2',
        warehouseLocation: 'Main Store',
        requiredByDate: new Date().toISOString().slice(0, 10),
        projectId: '',
        projectCode: '',
        itemName: 'Safety gloves',
        itemCode: 'PPE-GLV-01',
        description: 'Cut-resistant gloves',
        quantity: '50',
        unit: 'pairs',
      },
      note:
        'Each row adds a line item to a DRAFT material requisition for that employee and title (requisition is created if needed). Requisitions are not auto-submitted.',
    });
  }

  /** Requisition-scoped item import template. */
  async buildRequisitionTemplate(): Promise<Buffer> {
    return this.buildTemplate({
      sheetName: 'Requisition Items',
      includeEmployee: false,
      includeHeader: false,
      sample: {
        employeeEmail: '',
        employeeId: '',
        title: '',
        purpose: '',
        warehouseLocation: '',
        requiredByDate: '',
        projectId: '',
        projectCode: '',
        itemName: 'Safety gloves',
        itemCode: 'PPE-GLV-01',
        description: 'Cut-resistant gloves',
        quantity: '50',
        unit: 'pairs',
      },
      note:
        'Each valid row adds a line item to this DRAFT or RETURNED material requisition.',
    });
  }

  async previewCompanyImport(
    ctx: AuditContext,
    file: Express.Multer.File,
  ): Promise<MaterialRequisitionImportPreviewResponseDto> {
    const rows = await this.parseWorkbook(file, {
      requireEmployee: true,
      requireHeader: true,
    });
    return this.validateRows(ctx, rows, { mode: 'company' });
  }

  async commitCompanyImport(
    ctx: AuditContext,
    file: Express.Multer.File,
  ): Promise<ImportCommitResponseDto> {
    const rows = await this.parseWorkbook(file, {
      requireEmployee: true,
      requireHeader: true,
    });
    const preview = await this.validateRows(ctx, rows, { mode: 'company' });
    return this.commitValidatedRows(ctx, preview, { mode: 'company' });
  }

  async previewRequisitionImport(
    requisitionId: string,
    ctx: AuditContext,
    file: Express.Multer.File,
  ): Promise<MaterialRequisitionImportPreviewResponseDto> {
    const requisition = await this.requireImportableRequisition(
      requisitionId,
      ctx,
    );
    const rows = await this.parseWorkbook(file, {
      requireEmployee: false,
      requireHeader: false,
    });
    return this.validateRows(ctx, rows, {
      mode: 'requisition',
      requisitionId: requisition.id,
      employeeId: requisition.employeeId,
      title: requisition.title,
    });
  }

  async commitRequisitionImport(
    requisitionId: string,
    ctx: AuditContext,
    file: Express.Multer.File,
  ): Promise<ImportCommitResponseDto> {
    const requisition = await this.requireImportableRequisition(
      requisitionId,
      ctx,
    );
    const rows = await this.parseWorkbook(file, {
      requireEmployee: false,
      requireHeader: false,
    });
    const preview = await this.validateRows(ctx, rows, {
      mode: 'requisition',
      requisitionId: requisition.id,
      employeeId: requisition.employeeId,
      title: requisition.title,
    });
    return this.commitValidatedRows(ctx, preview, {
      mode: 'requisition',
      requisitionId: requisition.id,
    });
  }

  private async buildTemplate(input: {
    sheetName: string;
    includeEmployee: boolean;
    includeHeader: boolean;
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
    if (input.includeHeader) {
      columns.push(
        { header: 'title', key: 'title', width: 28 },
        { header: 'purpose', key: 'purpose', width: 36 },
        { header: 'warehouseLocation', key: 'warehouseLocation', width: 20 },
        { header: 'requiredByDate', key: 'requiredByDate', width: 14 },
        { header: 'projectId', key: 'projectId', width: 36 },
        { header: 'projectCode', key: 'projectCode', width: 16 },
      );
    }
    columns.push(
      { header: 'itemName', key: 'itemName', width: 22 },
      { header: 'itemCode', key: 'itemCode', width: 14 },
      { header: 'description', key: 'description', width: 28 },
      { header: 'quantity', key: 'quantity', width: 10 },
      { header: 'unit', key: 'unit', width: 10 },
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
    if (input.includeHeader) {
      instructions.addRow([
        'title',
        'Yes',
        'Requisition title - rows with the same employee+title share one DRAFT',
      ]);
      instructions.addRow(['purpose', 'Yes', 'Business purpose']);
      instructions.addRow([
        'warehouseLocation',
        'No',
        'Optional warehouse / store location',
      ]);
      instructions.addRow(['requiredByDate', 'No', 'YYYY-MM-DD']);
      instructions.addRow(['projectId', 'No', 'Project UUID']);
      instructions.addRow([
        'projectCode',
        'No',
        'Project code - used when projectId is blank',
      ]);
    }
    instructions.addRow(['itemName', 'Yes', 'Line item name']);
    instructions.addRow(['itemCode', 'No', 'Optional stock / item code']);
    instructions.addRow(['description', 'No', 'Item description']);
    instructions.addRow(['quantity', 'Yes', 'Positive number']);
    instructions.addRow(['unit', 'Yes', 'e.g. pcs, kg, m']);
    instructions.addRow([]);
    instructions.addRow(['Note', '', input.note]);

    const buffer = await workbook.xlsx.writeBuffer();
    return Buffer.from(buffer);
  }

  private async requireImportableRequisition(
    requisitionId: string,
    ctx: AuditContext,
  ): Promise<{ id: string; employeeId: string; title: string }> {
    const requisition = await this.prisma.materialRequisition.findFirst({
      where: activeOnly({ id: requisitionId, companyId: ctx.companyId }),
      select: { id: true, employeeId: true, title: true, status: true },
    });
    if (!requisition) {
      throw new BadRequestException('Material requisition not found');
    }
    if (requisition.status !== 'DRAFT' && requisition.status !== 'RETURNED') {
      throw new BadRequestException(
        'Items can only be imported into DRAFT or RETURNED requisitions',
      );
    }
    await this.materialRequisitionService.getRequisition(
      requisitionId,
      ctx.companyId,
      ctx.userId,
    );
    return requisition;
  }

  private async commitValidatedRows(
    ctx: AuditContext,
    preview: MaterialRequisitionImportPreviewResponseDto,
    options:
      | { mode: 'company' }
      | { mode: 'requisition'; requisitionId: string },
  ): Promise<ImportCommitResponseDto> {
    const validRows = preview.rows.filter(
      (
        row,
      ): row is MaterialRequisitionImportRowPreviewDto & {
        status: 'ok';
        employeeId: string;
        title: string;
        purpose: string;
        itemName: string;
        quantity: number;
        unit: string;
      } =>
        row.status === 'ok' &&
        Boolean(row.employeeId) &&
        Boolean(row.title) &&
        Boolean(row.purpose) &&
        Boolean(row.itemName) &&
        row.quantity != null &&
        Boolean(row.unit),
    );
    const skipped = preview.rows.length - validRows.length;
    const errors: ImportCommitResponseDto['errors'] = [];
    let created = 0;
    const requisitionCache = new Map<string, string>();

    for (const row of validRows) {
      try {
        let requisitionId: string;
        if (options.mode === 'requisition') {
          requisitionId = options.requisitionId;
        } else {
          const cacheKey = `${row.employeeId}|${row.title.trim().toLowerCase()}`;
          const cached = requisitionCache.get(cacheKey);
          if (cached) {
            requisitionId = cached;
          } else {
            const header: CreateMaterialRequisitionDto = {
              title: row.title,
              purpose: row.purpose,
              warehouseLocation: row.warehouseLocation,
              requiredByDate: row.requiredByDate,
              projectId: row.projectId,
            };
            const requisition =
              await this.materialRequisitionService.findOrCreateDraftRequisition(
                row.employeeId,
                header,
                ctx.companyId,
                ctx.userId,
                false,
              );
            requisitionId = requisition.id;
            requisitionCache.set(cacheKey, requisitionId);
          }
        }

        const dto: AddMaterialRequisitionItemDto = {
          itemName: row.itemName,
          itemCode: row.itemCode,
          description: row.description,
          quantity: row.quantity,
          unit: row.unit,
        };
        await this.materialRequisitionService.addItem(
          requisitionId,
          dto,
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
              : 'Failed to import material requisition item',
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
    options: { requireEmployee: boolean; requireHeader: boolean },
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
    for (const field of ['itemName', 'quantity', 'unit'] as const) {
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
    if (options.requireHeader) {
      if (!mapped.has('title')) {
        throw new BadRequestException(
          'Missing required column: title. Download the template.',
        );
      }
      if (!mapped.has('purpose')) {
        throw new BadRequestException(
          'Missing required column: purpose. Download the template.',
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
        purpose: '',
        warehouseLocation: '',
        requiredByDate: '',
        projectId: '',
        projectCode: '',
        itemName: '',
        itemCode: '',
        description: '',
        quantity: '',
        unit: '',
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
          mode: 'requisition';
          requisitionId: string;
          employeeId: string;
          title: string;
        },
  ): Promise<MaterialRequisitionImportPreviewResponseDto> {
    const keysInFile = new Set<string>();
    const previewRows: MaterialRequisitionImportRowPreviewDto[] = [];

    for (const row of rows) {
      const preview = await this.validateRow(ctx, row, keysInFile, options);
      previewRows.push(preview);
      if (
        preview.status === 'ok' &&
        preview.employeeId &&
        preview.title &&
        preview.itemName &&
        preview.quantity != null &&
        preview.unit
      ) {
        keysInFile.add(
          this.rowKey(
            preview.employeeId,
            preview.title,
            preview.itemName,
            preview.itemCode ?? '',
            preview.quantity,
            preview.unit,
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
          mode: 'requisition';
          requisitionId: string;
          employeeId: string;
          title: string;
        },
  ): Promise<MaterialRequisitionImportRowPreviewDto> {
    const label =
      row.employeeEmail.trim() ||
      row.title.trim() ||
      row.itemName.trim() ||
      `Line ${row.line}`;

    const base: MaterialRequisitionImportRowPreviewDto = {
      line: row.line,
      label,
      status: 'error',
      employeeEmail: row.employeeEmail.trim() || undefined,
      employeeId: row.employeeId.trim() || undefined,
      title: row.title.trim() || undefined,
      purpose: row.purpose.trim() || undefined,
    };

    let employeeId: string;
    let title: string;
    let purpose: string;

    if (options.mode === 'requisition') {
      employeeId = options.employeeId;
      title = options.title;
      purpose = 'n/a';
      base.employeeId = employeeId;
      base.title = title;
      base.purpose = purpose;
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
      if (!row.purpose.trim()) {
        return { ...base, status: 'error', message: 'purpose is required' };
      }
      title = row.title.trim();
      purpose = row.purpose.trim();
      base.title = title;
      base.purpose = purpose;
      base.warehouseLocation = row.warehouseLocation.trim() || undefined;

      const dateResult = this.parseImportDate(
        row.requiredByDate,
        'requiredByDate',
        false,
      );
      if (!dateResult.ok) {
        return { ...base, status: 'error', message: dateResult.message };
      }
      base.requiredByDate = dateResult.value;

      const projectResult = await this.resolveProject(ctx.companyId, row);
      if (!projectResult.ok) {
        return { ...base, status: 'error', message: projectResult.message };
      }
      base.projectId = projectResult.id;
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

    const itemCode = row.itemCode.trim();
    const key = this.rowKey(
      employeeId,
      title,
      row.itemName.trim(),
      itemCode,
      quantityResult.value,
      row.unit.trim(),
    );
    if (keysInFile.has(key)) {
      return {
        ...base,
        status: 'duplicate_in_file',
        message: 'Duplicate material item in this file',
        itemName: row.itemName.trim(),
        itemCode: itemCode || undefined,
        description: row.description.trim() || undefined,
        quantity: quantityResult.value,
        unit: row.unit.trim(),
      };
    }

    return {
      ...base,
      status: 'ok',
      itemName: row.itemName.trim(),
      itemCode: itemCode || undefined,
      description: row.description.trim() || undefined,
      quantity: quantityResult.value,
      unit: row.unit.trim(),
    };
  }

  private rowKey(
    employeeId: string,
    title: string,
    itemName: string,
    itemCode: string,
    quantity: number,
    unit: string,
  ): string {
    return `${employeeId}|${title.trim().toLowerCase()}|${itemName}|${itemCode}|${quantity}|${unit}`;
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

  private async resolveProject(
    companyId: string,
    row: ParsedImportRow,
  ): Promise<{ ok: true; id?: string } | { ok: false; message: string }> {
    const projectId = row.projectId.trim();
    const projectCode = row.projectCode.trim();

    if (!projectId && !projectCode) {
      return { ok: true, id: undefined };
    }

    if (projectId) {
      if (!this.isUuid(projectId)) {
        return { ok: false, message: 'projectId must be a valid UUID' };
      }
      const project = await this.prisma.project.findFirst({
        where: activeOnly({ companyId, id: projectId }),
        select: { id: true },
      });
      if (!project) {
        return { ok: false, message: `Project not found for id: ${projectId}` };
      }
      return { ok: true, id: project.id };
    }

    const project = await this.prisma.project.findFirst({
      where: activeOnly({
        companyId,
        projectCode: { equals: projectCode, mode: 'insensitive' as const },
      }),
      select: { id: true },
    });
    if (!project) {
      return {
        ok: false,
        message: `Project not found for code: ${projectCode}`,
      };
    }
    return { ok: true, id: project.id };
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
