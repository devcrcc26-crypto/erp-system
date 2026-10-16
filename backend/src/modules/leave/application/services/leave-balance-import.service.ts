import { BadRequestException, Injectable } from '@nestjs/common';
import { LeaveType } from '@prisma/client';
import * as ExcelJS from 'exceljs';
import { PrismaService } from '../../../../shared/prisma/prisma.service';
import { activeOnly } from '../../../../shared/prisma/soft-delete.util';
import { normalizeEmail } from '../../../../shared/utils/email.util';
import { ImportCommitResponseDto } from '../../../hr-shared/application/dtos/hr-import.dtos';
import { OWN_BALANCE_LEAVE_TYPES } from './leave-balance-rules';
import {
  LeaveBalanceImportPreviewResponseDto,
  LeaveBalanceImportRowPreviewDto,
} from '../dtos/leave-balance-import.dtos';
import { LeaveBalanceService } from './leave-balance.service';

type AuditContext = { companyId: string; userId: string };

const MAX_IMPORT_FILE_BYTES = 5 * 1024 * 1024;
const MAX_IMPORT_ROWS = 500;

const ALLOWED_MIME_TYPES = new Set([
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/octet-stream',
]);

const BALANCE_LEAVE_TYPES = OWN_BALANCE_LEAVE_TYPES;

const HEADER_ALIASES: Record<string, keyof ParsedImportRow> = {
  employeeemail: 'employeeEmail',
  'employee email': 'employeeEmail',
  employee_email: 'employeeEmail',
  email: 'employeeEmail',
  employeeid: 'employeeId',
  'employee id': 'employeeId',
  employee_id: 'employeeId',
  year: 'year',
  leavetype: 'leaveType',
  'leave type': 'leaveType',
  leave_type: 'leaveType',
  entitled: 'entitled',
  broughtforward: 'broughtForward',
  'brought forward': 'broughtForward',
  brought_forward: 'broughtForward',
};

interface ParsedImportRow {
  line: number;
  employeeEmail: string;
  employeeId: string;
  year: string;
  leaveType: string;
  entitled: string;
  broughtForward: string;
}

/**
 * Excel template / preview / commit for leave balance entitlements.
 */
@Injectable()
export class LeaveBalanceImportService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly leaveBalanceService: LeaveBalanceService,
  ) {}

  /**
   * Builds a downloadable Excel template for leave balance import.
   */
  async buildTemplate(): Promise<Buffer> {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Leave Balances');

    sheet.columns = [
      { header: 'employeeEmail', key: 'employeeEmail', width: 28 },
      { header: 'employeeId', key: 'employeeId', width: 36 },
      { header: 'year', key: 'year', width: 8 },
      { header: 'leaveType', key: 'leaveType', width: 12 },
      { header: 'entitled', key: 'entitled', width: 10 },
      { header: 'broughtForward', key: 'broughtForward', width: 14 },
    ];

    sheet.addRow({
      employeeEmail: 'employee@company.local',
      employeeId: '',
      year: new Date().getFullYear(),
      leaveType: 'ANNUAL',
      entitled: 20,
      broughtForward: 2,
    });

    const instructions = workbook.addWorksheet('Instructions');
    instructions.addRow(['Column', 'Required', 'Notes']);
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
    instructions.addRow(['year', 'Yes', 'Calendar year (e.g. 2026)']);
    instructions.addRow([
      'leaveType',
      'Yes',
      `${BALANCE_LEAVE_TYPES.join(' | ')} only`,
    ]);
    instructions.addRow(['entitled', 'Yes', 'Days entitled for the year']);
    instructions.addRow([
      'broughtForward',
      'No',
      'Days carried from prior year (default 0)',
    ]);
    instructions.addRow([]);
    instructions.addRow([
      'Note',
      '',
      'Existing balances are upserted. Remaining = entitled + broughtForward - used - pending.',
    ]);

    const buffer = await workbook.xlsx.writeBuffer();
    return Buffer.from(buffer);
  }

  /**
   * Parses and validates an upload without writing balances.
   */
  async previewImport(
    ctx: AuditContext,
    file: Express.Multer.File,
  ): Promise<LeaveBalanceImportPreviewResponseDto> {
    const rows = await this.parseWorkbook(file);
    return this.validateRows(ctx, rows);
  }

  /**
   * Upserts leave balance entitlements for valid rows.
   */
  async commitImport(
    ctx: AuditContext,
    file: Express.Multer.File,
  ): Promise<ImportCommitResponseDto> {
    const rows = await this.parseWorkbook(file);
    const preview = await this.validateRows(ctx, rows);

    const validRows = preview.rows.filter(
      (row): row is LeaveBalanceImportRowPreviewDto & {
        status: 'ok';
        employeeId: string;
        year: number;
        leaveType: LeaveType;
        entitled: number;
        broughtForward: number;
      } =>
        row.status === 'ok' &&
        Boolean(row.employeeId) &&
        row.year != null &&
        Boolean(row.leaveType) &&
        row.entitled != null,
    );
    const skipped = preview.rows.length - validRows.length;
    const errors: ImportCommitResponseDto['errors'] = [];
    let created = 0;
    let updated = 0;

    for (const row of validRows) {
      try {
        const result = await this.leaveBalanceService.upsertEntitlement(
          row.employeeId,
          row.leaveType,
          row.year,
          row.entitled,
          row.broughtForward ?? 0,
          ctx.companyId,
          ctx.userId,
        );
        if (result.created) {
          created += 1;
        } else {
          updated += 1;
        }
      } catch (error) {
        errors.push({
          line: row.line,
          label: row.label,
          message:
            error instanceof Error
              ? error.message
              : 'Failed to upsert leave balance',
        });
      }
    }

    return {
      created,
      updated,
      skipped: skipped + errors.length,
      errors,
    };
  }

  private async parseWorkbook(
    file: Express.Multer.File,
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
    for (const field of ['year', 'leaveType', 'entitled'] as const) {
      if (!mapped.has(field)) {
        throw new BadRequestException(
          `Missing required column: ${field}. Download the template.`,
        );
      }
    }
    if (!mapped.has('employeeEmail') && !mapped.has('employeeId')) {
      throw new BadRequestException(
        'Missing employeeEmail or employeeId column. Download the template.',
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
        year: '',
        leaveType: '',
        entitled: '',
        broughtForward: '',
      };

      columnMap.forEach((field, colNumber) => {
        if (field === 'line') {
          return;
        }
        parsed[field] = this.cellToString(
          excelRow.getCell(colNumber).value,
        ).trim();
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
  ): Promise<LeaveBalanceImportPreviewResponseDto> {
    const keysInFile = new Set<string>();
    const previewRows: LeaveBalanceImportRowPreviewDto[] = [];

    for (const row of rows) {
      const preview = await this.validateRow(ctx, row, keysInFile);
      previewRows.push(preview);
      if (preview.status === 'ok' && preview.employeeId) {
        keysInFile.add(
          this.rowKey(
            preview.employeeId,
            preview.year ?? 0,
            preview.leaveType ?? '',
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
  ): Promise<LeaveBalanceImportRowPreviewDto> {
    const label =
      row.employeeEmail.trim() ||
      row.employeeId.trim() ||
      `Line ${row.line}`;

    const base: LeaveBalanceImportRowPreviewDto = {
      line: row.line,
      label,
      status: 'error',
      employeeEmail: row.employeeEmail.trim() || undefined,
      employeeId: row.employeeId.trim() || undefined,
    };

    const employee = await this.resolveEmployee(ctx.companyId, row);
    if (!employee.ok) {
      return { ...base, status: 'error', message: employee.message };
    }

    base.label =
      employee.email ||
      `${employee.firstName} ${employee.lastName}`.trim() ||
      employee.id;
    base.employeeId = employee.id;
    base.employeeEmail = employee.email ?? undefined;

    const yearResult = this.parseYear(row.year);
    if (!yearResult.ok) {
      return { ...base, status: 'error', message: yearResult.message };
    }

    const leaveTypeRaw = row.leaveType.trim().toUpperCase();
    if (!leaveTypeRaw) {
      return { ...base, status: 'error', message: 'leaveType is required' };
    }
    const leaveType = BALANCE_LEAVE_TYPES.find((t) => t === leaveTypeRaw);
    if (!leaveType) {
      return {
        ...base,
        status: 'error',
        message: `leaveType must be one of: ${BALANCE_LEAVE_TYPES.join(', ')}`,
      };
    }

    const entitledResult = this.parseNonNegativeNumber(row.entitled, 'entitled', true);
    if (!entitledResult.ok) {
      return { ...base, status: 'error', message: entitledResult.message };
    }

    const broughtForwardResult = this.parseNonNegativeNumber(
      row.broughtForward || '0',
      'broughtForward',
      false,
    );
    if (!broughtForwardResult.ok) {
      return {
        ...base,
        status: 'error',
        message: broughtForwardResult.message,
      };
    }

    const key = this.rowKey(employee.id, yearResult.value, leaveType);
    if (keysInFile.has(key)) {
      return {
        ...base,
        status: 'duplicate_in_file',
        message: 'Duplicate employee/year/leaveType in this file',
        year: yearResult.value,
        leaveType,
        entitled: entitledResult.value,
        broughtForward: broughtForwardResult.value ?? 0,
      };
    }

    const existing = await this.prisma.leaveBalance.findUnique({
      where: {
        companyId_employeeId_year_leaveType: {
          companyId: ctx.companyId,
          employeeId: employee.id,
          year: yearResult.value,
          leaveType,
        },
      },
      select: { id: true },
    });

    return {
      ...base,
      status: 'ok',
      year: yearResult.value,
      leaveType,
      entitled: entitledResult.value,
      broughtForward: broughtForwardResult.value ?? 0,
      message: existing
        ? 'Will update existing balance'
        : 'Will create balance entitlement',
    };
  }

  private rowKey(
    employeeId: string,
    year: number,
    leaveType: string,
  ): string {
    return `${employeeId}|${year}|${leaveType}`;
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

  private parseYear(
    value: string,
  ):
    | { ok: true; value: number }
    | { ok: false; message: string } {
    if (!value.trim()) {
      return { ok: false, message: 'year is required' };
    }
    const year = Number(value);
    if (!Number.isInteger(year) || year < 2000 || year > 2100) {
      return {
        ok: false,
        message: 'year must be an integer between 2000 and 2100',
      };
    }
    return { ok: true, value: year };
  }

  private parseNonNegativeNumber(
    value: string,
    fieldLabel: string,
    required: boolean,
  ):
    | { ok: true; value: number | undefined }
    | { ok: false; message: string } {
    if (!value.trim()) {
      if (required) {
        return { ok: false, message: `${fieldLabel} is required` };
      }
      return { ok: true, value: 0 };
    }
    const num = Number(value);
    if (!Number.isFinite(num) || num < 0) {
      return {
        ok: false,
        message: `${fieldLabel} must be a number zero or greater`,
      };
    }
    return { ok: true, value: num };
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

  private isRowEmpty(row: ExcelJS.Row): boolean {
    let hasValue = false;
    row.eachCell({ includeEmpty: false }, () => {
      hasValue = true;
    });
    return !hasValue;
  }
}
