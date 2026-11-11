import { BadRequestException, Injectable } from '@nestjs/common';
import { LeaveType } from '@prisma/client';
import * as ExcelJS from 'exceljs';
import { PrismaService } from '../../../../shared/prisma/prisma.service';
import { activeOnly } from '../../../../shared/prisma/soft-delete.util';
import { normalizeEmail } from '../../../../shared/utils/email.util';
import { ImportCommitResponseDto } from '../../../hr-shared/application/dtos/hr-import.dtos';
import { SubmitLeaveRequestDto } from '../dtos/leave.dtos';
import {
  LeaveRequestImportPreviewResponseDto,
  LeaveRequestImportRowPreviewDto,
} from '../dtos/leave-request-import.dtos';
import { LeaveService } from './leave.service';

type AuditContext = { companyId: string; userId: string };

const MAX_IMPORT_FILE_BYTES = 5 * 1024 * 1024;
const MAX_IMPORT_ROWS = 500;

const ALLOWED_MIME_TYPES = new Set([
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/octet-stream',
]);

const LEAVE_TYPE_VALUES = Object.values(LeaveType);

const HEADER_ALIASES: Record<string, keyof ParsedImportRow> = {
  employeeemail: 'employeeEmail',
  'employee email': 'employeeEmail',
  employee_email: 'employeeEmail',
  email: 'employeeEmail',
  employeeid: 'employeeId',
  'employee id': 'employeeId',
  employee_id: 'employeeId',
  leavetype: 'leaveType',
  'leave type': 'leaveType',
  leave_type: 'leaveType',
  startdate: 'startDate',
  'start date': 'startDate',
  start_date: 'startDate',
  enddate: 'endDate',
  'end date': 'endDate',
  end_date: 'endDate',
  days: 'days',
  reason: 'reason',
};

interface ParsedImportRow {
  line: number;
  employeeEmail: string;
  employeeId: string;
  leaveType: string;
  startDate: string;
  endDate: string;
  days: string;
  reason: string;
}

const DATE_FIELDS = new Set<keyof ParsedImportRow>(['startDate', 'endDate']);

/**
 * Excel template / preview / commit for leave requests (on behalf of employees).
 */
@Injectable()
export class LeaveRequestImportService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly leaveService: LeaveService,
  ) {}

  /**
   * Builds a downloadable Excel template for leave request import.
   */
  async buildTemplate(): Promise<Buffer> {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Leave Requests');

    sheet.columns = [
      { header: 'employeeEmail', key: 'employeeEmail', width: 28 },
      { header: 'employeeId', key: 'employeeId', width: 36 },
      { header: 'leaveType', key: 'leaveType', width: 14 },
      { header: 'startDate', key: 'startDate', width: 12 },
      { header: 'endDate', key: 'endDate', width: 12 },
      { header: 'days', key: 'days', width: 8 },
      { header: 'reason', key: 'reason', width: 32 },
    ];

    sheet.addRow({
      employeeEmail: 'employee@company.local',
      employeeId: '',
      leaveType: 'ANNUAL',
      startDate: '2026-06-01',
      endDate: '2026-06-05',
      days: 5,
      reason: 'Family vacation',
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
    instructions.addRow([
      'leaveType',
      'Yes',
      LEAVE_TYPE_VALUES.join(' | '),
    ]);
    instructions.addRow(['startDate', 'Yes', 'YYYY-MM-DD']);
    instructions.addRow(['endDate', 'Yes', 'YYYY-MM-DD']);
    instructions.addRow([
      'days',
      'Yes',
      'Working/calendar days (supports half-days, min 0.5)',
    ]);
    instructions.addRow(['reason', 'No', 'Optional reason']);
    instructions.addRow([]);
    instructions.addRow([
      'Note',
      '',
      'Each valid row is submitted on behalf of the employee and enters the approval workflow.',
    ]);

    const buffer = await workbook.xlsx.writeBuffer();
    return Buffer.from(buffer);
  }

  /**
   * Parses and validates an upload without creating leave requests.
   */
  async previewImport(
    ctx: AuditContext,
    file: Express.Multer.File,
  ): Promise<LeaveRequestImportPreviewResponseDto> {
    const rows = await this.parseWorkbook(file);
    return this.validateRows(ctx, rows);
  }

  /**
   * Submits leave requests on behalf of employees for valid rows.
   */
  async commitImport(
    ctx: AuditContext,
    file: Express.Multer.File,
  ): Promise<ImportCommitResponseDto> {
    const rows = await this.parseWorkbook(file);
    const preview = await this.validateRows(ctx, rows);

    const validRows = preview.rows.filter(
      (row): row is LeaveRequestImportRowPreviewDto & {
        status: 'ok';
        employeeId: string;
        leaveType: LeaveType;
        startDate: string;
        endDate: string;
        days: number;
      } =>
        row.status === 'ok' &&
        Boolean(row.employeeId) &&
        Boolean(row.leaveType) &&
        row.days != null,
    );
    const skipped = preview.rows.length - validRows.length;
    const errors: ImportCommitResponseDto['errors'] = [];
    let created = 0;

    for (const row of validRows) {
      try {
        const dto: SubmitLeaveRequestDto = {
          leaveType: row.leaveType,
          periods: [
            { startDate: row.startDate, endDate: row.endDate },
          ],
          reason: row.reason,
        };
        await this.leaveService.submitOnBehalf(
          row.employeeId,
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
              : 'Failed to submit leave request',
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
    for (const field of ['leaveType', 'startDate', 'endDate', 'days'] as const) {
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
        leaveType: '',
        startDate: '',
        endDate: '',
        days: '',
        reason: '',
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
  ): Promise<LeaveRequestImportPreviewResponseDto> {
    const keysInFile = new Set<string>();
    const previewRows: LeaveRequestImportRowPreviewDto[] = [];

    for (const row of rows) {
      const preview = await this.validateRow(ctx, row, keysInFile);
      previewRows.push(preview);
      if (preview.status === 'ok' && preview.employeeId) {
        keysInFile.add(
          this.rowKey(
            preview.employeeId,
            preview.leaveType ?? '',
            preview.startDate ?? '',
            preview.endDate ?? '',
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
  ): Promise<LeaveRequestImportRowPreviewDto> {
    const label =
      row.employeeEmail.trim() ||
      row.employeeId.trim() ||
      `Line ${row.line}`;

    const base: LeaveRequestImportRowPreviewDto = {
      line: row.line,
      label,
      status: 'error',
      employeeEmail: row.employeeEmail.trim() || undefined,
      employeeId: row.employeeId.trim() || undefined,
      reason: row.reason.trim() || undefined,
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

    const leaveTypeResult = this.parseEnumField(
      row.leaveType,
      LEAVE_TYPE_VALUES,
      'leaveType',
    );
    if (!leaveTypeResult.ok) {
      return { ...base, status: 'error', message: leaveTypeResult.message };
    }

    const startDateResult = this.parseImportDate(row.startDate, 'startDate', true);
    if (!startDateResult.ok) {
      return { ...base, status: 'error', message: startDateResult.message };
    }

    const endDateResult = this.parseImportDate(row.endDate, 'endDate', true);
    if (!endDateResult.ok) {
      return { ...base, status: 'error', message: endDateResult.message };
    }

    if (
      startDateResult.value &&
      endDateResult.value &&
      endDateResult.value < startDateResult.value
    ) {
      return {
        ...base,
        status: 'error',
        message: 'endDate must be on or after startDate',
      };
    }

    const daysResult = this.parseDays(row.days);
    if (!daysResult.ok) {
      return { ...base, status: 'error', message: daysResult.message };
    }

    const key = this.rowKey(
      employee.id,
      leaveTypeResult.value,
      startDateResult.value ?? '',
      endDateResult.value ?? '',
    );
    if (keysInFile.has(key)) {
      return {
        ...base,
        status: 'duplicate_in_file',
        message: 'Duplicate leave request in this file',
        leaveType: leaveTypeResult.value,
        startDate: startDateResult.value,
        endDate: endDateResult.value,
        days: daysResult.value,
      };
    }

    return {
      ...base,
      status: 'ok',
      leaveType: leaveTypeResult.value,
      startDate: startDateResult.value,
      endDate: endDateResult.value,
      days: daysResult.value,
      reason: row.reason.trim() || undefined,
    };
  }

  private rowKey(
    employeeId: string,
    leaveType: string,
    startDate: string,
    endDate: string,
  ): string {
    return `${employeeId}|${leaveType}|${startDate}|${endDate}`;
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

  private parseEnumField<T extends string>(
    value: string,
    allowed: readonly T[],
    fieldLabel: string,
  ):
    | { ok: true; value: T }
    | { ok: false; message: string } {
    if (!value.trim()) {
      return { ok: false, message: `${fieldLabel} is required` };
    }
    const normalized = value.trim().toUpperCase();
    const match = allowed.find((entry) => entry === normalized);
    if (!match) {
      return { ok: false, message: `Unknown ${fieldLabel}: ${value}` };
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

  private parseDays(
    value: string,
  ):
    | { ok: true; value: number }
    | { ok: false; message: string } {
    if (!value.trim()) {
      return { ok: false, message: 'days is required' };
    }
    const num = Number(value);
    if (!Number.isFinite(num) || num < 0.5 || num > 365) {
      return {
        ok: false,
        message: 'days must be a number between 0.5 and 365',
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
