import { BadRequestException, Injectable } from '@nestjs/common';
import * as ExcelJS from 'exceljs';
import { PrismaService } from '../../../../shared/prisma/prisma.service';
import { activeOnly } from '../../../../shared/prisma/soft-delete.util';
import { normalizeEmail } from '../../../../shared/utils/email.util';
import {
  findHeaderRowNumber,
  isExportFooterRow,
} from '../../../../shared/utils/excel-header-row.util';
import {
  DEFAULT_MAX_IMPORT_ROWS,
  MAX_IMPORT_FILE_BYTES,
  buildHeaderLookup,
  enumLabelFor,
  enumLabelsFor,
  normalizeLookupKey,
  type ImportColumnDef,
  type ImportColumnSchema,
} from './import-column-schema';

const ALLOWED_MIME_TYPES = new Set([
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/octet-stream',
]);

/** A cell value after coercion; `undefined` means the cell was blank. */
export type ImportCellValue = string | number | boolean | undefined;

/** One spreadsheet row after coercion and per-column validation. */
export interface ValidatedImportRow {
  /** 1-based worksheet row number, as shown to the user. */
  line: number;
  /** Raw trimmed strings, keyed by field - useful for building row labels. */
  raw: Record<string, string>;
  /** Coerced values, keyed by field. Absent when the cell was blank. */
  values: Record<string, ImportCellValue>;
  /** Per-column validation failures. Empty when the row passed. */
  errors: string[];
}

export interface ResolvedEmployee {
  id: string;
  email: string | null;
  firstName: string;
  lastName: string;
}

/**
 * Shared Excel import parser for HR modules.
 *
 * Parses an uploaded workbook against an `ImportColumnSchema`: maps headers
 * (accepting the human label, the camelCase field or any declared alias),
 * coerces cells to the declared type, applies required / enum / range rules,
 * and resolves employees by email or id. Module import services keep only the
 * mapping from validated rows to their own `createDraft*` calls.
 */
@Injectable()
export class HrExcelImportService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Reads an uploaded file into validated rows.
   *
   * Throws `BadRequestException` for file-level problems (wrong type, missing
   * required columns, no data rows); per-row problems land in `row.errors`.
   */
  async parse(
    file: Express.Multer.File,
    schema: ImportColumnSchema,
  ): Promise<ValidatedImportRow[]> {
    this.assertValidUpload(file);

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(file.buffer as never);
    const sheet = workbook.worksheets[0];
    if (!sheet) {
      throw new BadRequestException('Workbook must contain at least one sheet');
    }

    const columnByField = new Map(
      schema.columns.map((column) => [column.field, column] as const),
    );
    const headerLookup = buildHeaderLookup(schema);
    const fieldByColumnNumber = new Map<number, string>();
    const cellText = (value: ExcelJS.CellValue): string =>
      this.cellToString(value);
    // Exports put a document header above the table; find the column row.
    const headerRowNumber = findHeaderRowNumber(
      sheet,
      (text) => headerLookup.has(normalizeLookupKey(text)),
      cellText,
    );

    sheet.getRow(headerRowNumber).eachCell((cell, colNumber) => {
      const field = headerLookup.get(
        normalizeLookupKey(this.cellToString(cell.value)),
      );
      if (field && !fieldByColumnNumber.has(colNumber)) {
        fieldByColumnNumber.set(colNumber, field);
      }
    });

    const mappedFields = new Set(fieldByColumnNumber.values());
    this.assertRequiredColumnsPresent(schema, mappedFields);

    const maxRows = schema.maxRows ?? DEFAULT_MAX_IMPORT_ROWS;
    const rows: ValidatedImportRow[] = [];

    for (
      let rowNumber = headerRowNumber + 1;
      rowNumber <= sheet.rowCount;
      rowNumber += 1
    ) {
      const excelRow = sheet.getRow(rowNumber);
      if (this.isRowEmpty(excelRow) || isExportFooterRow(excelRow, cellText)) {
        continue;
      }

      const raw: Record<string, string> = {};
      for (const [colNumber, field] of fieldByColumnNumber) {
        const column = columnByField.get(field);
        const cellValue = excelRow.getCell(colNumber).value;
        raw[field] =
          column?.type === 'date' || column?.type === 'datetime'
            ? this.cellToDateString(cellValue, column.type).trim()
            : this.cellToString(cellValue).trim();
      }

      rows.push(this.validateRow(rowNumber, raw, schema));

      if (rows.length > maxRows) {
        throw new BadRequestException(
          `Import exceeds the maximum of ${maxRows} rows`,
        );
      }
    }

    if (rows.length === 0) {
      throw new BadRequestException('No data rows found in the spreadsheet');
    }
    return rows;
  }

  /**
   * Resolves an employee within the company by email (preferred) or user id.
   */
  async resolveEmployee(
    companyId: string,
    input: { email?: string; id?: string },
  ): Promise<
    { ok: true; employee: ResolvedEmployee } | { ok: false; message: string }
  > {
    const email = input.email?.trim() ?? '';
    const employeeId = input.id?.trim() ?? '';
    const select = {
      id: true,
      email: true,
      firstName: true,
      lastName: true,
    } as const;

    if (email) {
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizeEmail(email))) {
        return { ok: false, message: 'Invalid Employee Email' };
      }
      const user = await this.prisma.user.findFirst({
        where: activeOnly({ companyId, email: normalizeEmail(email) }),
        select,
      });
      if (!user) {
        return { ok: false, message: `Employee not found for email: ${email}` };
      }
      return { ok: true, employee: user };
    }

    if (!employeeId) {
      return {
        ok: false,
        message: 'Employee Email or Employee ID is required',
      };
    }
    if (!this.isUuid(employeeId)) {
      return { ok: false, message: 'Employee ID must be a valid UUID' };
    }

    const user = await this.prisma.user.findFirst({
      where: activeOnly({ companyId, id: employeeId }),
      select,
    });
    if (!user) {
      return { ok: false, message: `Employee not found for id: ${employeeId}` };
    }
    return { ok: true, employee: user };
  }

  /** Display name for an employee, falling back to email then id. */
  employeeLabel(employee: ResolvedEmployee): string {
    return (
      employee.email ||
      `${employee.firstName} ${employee.lastName}`.trim() ||
      employee.id
    );
  }

  private validateRow(
    line: number,
    raw: Record<string, string>,
    schema: ImportColumnSchema,
  ): ValidatedImportRow {
    const values: Record<string, ImportCellValue> = {};
    const errors: string[] = [];
    const satisfiedGroups = new Set<string>();

    for (const column of schema.columns) {
      const rawValue = raw[column.field] ?? '';
      if (rawValue !== '' && column.requiredGroup) {
        satisfiedGroups.add(column.requiredGroup);
      }

      if (rawValue === '') {
        if (column.required) {
          errors.push(`${column.label} is required`);
        }
        continue;
      }

      const coerced = this.coerce(column, rawValue);
      if (!coerced.ok) {
        errors.push(coerced.message);
        continue;
      }
      values[column.field] = coerced.value;
    }

    for (const group of this.requiredGroups(schema)) {
      if (satisfiedGroups.has(group.name)) {
        continue;
      }
      errors.push(`${group.labels.join(' or ')} is required`);
    }

    return { line, raw, values, errors };
  }

  private requiredGroups(
    schema: ImportColumnSchema,
  ): Array<{ name: string; labels: string[] }> {
    const groups = new Map<string, string[]>();
    for (const column of schema.columns) {
      if (!column.requiredGroup) {
        continue;
      }
      const labels = groups.get(column.requiredGroup) ?? [];
      labels.push(column.label);
      groups.set(column.requiredGroup, labels);
    }
    return [...groups].map(([name, labels]) => ({ name, labels }));
  }

  private coerce(
    column: ImportColumnDef,
    rawValue: string,
  ): { ok: true; value: ImportCellValue } | { ok: false; message: string } {
    switch (column.type) {
      case 'enum': {
        const match = (column.enumValues ?? []).find(
          (code) =>
            normalizeLookupKey(code) === normalizeLookupKey(rawValue) ||
            normalizeLookupKey(enumLabelFor(column, code)) ===
              normalizeLookupKey(rawValue),
        );
        if (!match) {
          return {
            ok: false,
            message: `${column.label} must be one of: ${enumLabelsFor(column).join(', ')}`,
          };
        }
        return { ok: true, value: match };
      }

      case 'date':
      case 'datetime': {
        const pattern =
          column.type === 'date'
            ? /^(\d{4})-(\d{2})-(\d{2})$/
            : /^(\d{4})-(\d{2})-(\d{2})([T ](\d{2}):(\d{2})(:\d{2})?)?/;
        if (!pattern.test(rawValue)) {
          return {
            ok: false,
            message:
              column.type === 'date'
                ? `${column.label} must use YYYY-MM-DD`
                : `${column.label} must use YYYY-MM-DD or YYYY-MM-DD HH:mm`,
          };
        }
        if (Number.isNaN(new Date(rawValue.replace(' ', 'T')).getTime())) {
          return { ok: false, message: `${column.label} is not a real date` };
        }
        return { ok: true, value: rawValue };
      }

      case 'number':
      case 'integer': {
        const num = Number(rawValue.replace(/,/g, ''));
        if (!Number.isFinite(num)) {
          return { ok: false, message: `${column.label} must be a number` };
        }
        if (column.type === 'integer' && !Number.isInteger(num)) {
          return {
            ok: false,
            message: `${column.label} must be a whole number`,
          };
        }
        if (column.min !== undefined && num < column.min) {
          return {
            ok: false,
            message: `${column.label} must be at least ${column.min}`,
          };
        }
        if (column.max !== undefined && num > column.max) {
          return {
            ok: false,
            message: `${column.label} must be at most ${column.max}`,
          };
        }
        return { ok: true, value: num };
      }

      case 'boolean': {
        const key = normalizeLookupKey(rawValue);
        if (['yes', 'y', 'true', '1'].includes(key)) {
          return { ok: true, value: true };
        }
        if (['no', 'n', 'false', '0'].includes(key)) {
          return { ok: true, value: false };
        }
        return { ok: false, message: `${column.label} must be Yes or No` };
      }

      case 'email': {
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizeEmail(rawValue))) {
          return {
            ok: false,
            message: `${column.label} must be a valid email address`,
          };
        }
        return { ok: true, value: rawValue };
      }

      default: {
        if (column.maxLength && rawValue.length > column.maxLength) {
          return {
            ok: false,
            message: `${column.label} must be ${column.maxLength} characters or fewer`,
          };
        }
        return { ok: true, value: rawValue };
      }
    }
  }

  private assertRequiredColumnsPresent(
    schema: ImportColumnSchema,
    mappedFields: Set<string>,
  ): void {
    const missing = schema.columns
      .filter((column) => column.required && !mappedFields.has(column.field))
      .map((column) => column.label);
    if (missing.length > 0) {
      throw new BadRequestException(
        `Missing required column${missing.length > 1 ? 's' : ''}: ${missing.join(', ')}. Download the template.`,
      );
    }

    for (const group of this.requiredGroups(schema)) {
      const groupFields = schema.columns.filter(
        (column) => column.requiredGroup === group.name,
      );
      if (!groupFields.some((column) => mappedFields.has(column.field))) {
        throw new BadRequestException(
          `Missing required column: ${group.labels.join(' or ')}. Download the template.`,
        );
      }
    }
  }

  private assertValidUpload(file: Express.Multer.File): void {
    if (!file?.buffer?.length) {
      throw new BadRequestException('File is required');
    }
    if (file.size > MAX_IMPORT_FILE_BYTES) {
      throw new BadRequestException('File exceeds the maximum size of 5 MB');
    }
    if (file.mimetype && !ALLOWED_MIME_TYPES.has(file.mimetype)) {
      throw new BadRequestException('Only .xlsx Excel files are supported');
    }
  }

  private isUuid(value: string): boolean {
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      value,
    );
  }

  private cellToString(value: ExcelJS.CellValue): string {
    if (value === null || value === undefined) {
      return '';
    }
    if (value instanceof Date) {
      return value.toISOString();
    }
    if (typeof value === 'object' && 'text' in value) {
      return String(value.text ?? '');
    }
    if (typeof value === 'object' && 'result' in value) {
      return this.cellToString(value.result as ExcelJS.CellValue);
    }
    if (typeof value === 'object' && 'richText' in value) {
      return value.richText.map((part) => part.text).join('');
    }
    return String(value);
  }

  private cellToDateString(
    value: ExcelJS.CellValue,
    type: 'date' | 'datetime',
  ): string {
    if (value === null || value === undefined) {
      return '';
    }
    if (value instanceof Date) {
      // Excel date cells arrive as UTC midnight; read them back in UTC so the
      // calendar day the user typed survives the round trip.
      const day = value.toISOString().slice(0, 10);
      if (type === 'date') {
        return day;
      }
      const time = value.toISOString().slice(11, 16);
      return time === '00:00' ? day : `${day} ${time}`;
    }
    if (typeof value === 'object' && 'result' in value) {
      return this.cellToDateString(value.result as ExcelJS.CellValue, type);
    }

    const asString = this.cellToString(value).trim();
    const isoMatch = /^(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2})/.exec(asString);
    if (isoMatch) {
      return type === 'date' ? isoMatch[1] : `${isoMatch[1]} ${isoMatch[2]}`;
    }
    const dayMatch = /^(\d{4}-\d{2}-\d{2})/.exec(asString);
    if (dayMatch) {
      return dayMatch[1];
    }
    return asString;
  }

  private isRowEmpty(row: ExcelJS.Row): boolean {
    let hasValue = false;
    row.eachCell({ includeEmpty: false }, (cell) => {
      if (this.cellToString(cell.value).trim() !== '') {
        hasValue = true;
      }
    });
    return !hasValue;
  }
}
