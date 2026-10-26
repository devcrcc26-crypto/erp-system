import ExcelJS from 'exceljs';

/**
 * Client-side mirror of the backend import column schema.
 *
 * The modal parses the chosen workbook in the browser first, so obvious
 * problems - a missing column, a blank required cell, an unrecognised status
 * label - are reported before anything is uploaded. The server still validates
 * authoritatively (employees, referenced records, duplicates against the
 * database) once the file passes these checks.
 */

export type HrImportFieldType =
  | 'string'
  | 'number'
  | 'integer'
  | 'date'
  | 'datetime'
  | 'enum'
  | 'email';

export interface HrImportColumn {
  field: string;
  label: string;
  type: HrImportFieldType;
  required?: boolean;
  /** At least one column sharing this group name must have a value. */
  requiredGroup?: string;
  /** Enum member codes; the human labels are derived from them. */
  enumValues?: readonly string[];
  min?: number;
  max?: number;
  aliases?: readonly string[];
}

export interface HrImportModuleSchema {
  /** Path prefix of the module's import endpoints, e.g. `/hr/exit-permits`. */
  endpoint: string;
  /** Template download file name. */
  templateFileName: string;
  columns: readonly HrImportColumn[];
}

export interface HrClientParsedRow {
  line: number;
  /** Recognisable name for the row, from the first populated column. */
  label: string;
  cells: Record<string, string>;
  errors: string[];
}

export interface HrClientParseResult {
  /** Populated when the file cannot be read at all. */
  fatalError?: string;
  rows: HrClientParsedRow[];
  validCount: number;
  invalidCount: number;
}

/** `SEAL_ISSUED` → `Seal Issued`. */
export function humanizeEnumValue(code: string): string {
  return code
    .split('_')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(' ');
}

/** Every label a user may type for an enum column, in schema order. */
export function enumLabelsFor(column: HrImportColumn): string[] {
  return (column.enumValues ?? []).map(humanizeEnumValue);
}

function normalizeKey(value: string): string {
  return value.trim().toLowerCase().replace(/[\s_-]+/g, '');
}

function requiredGroupsOf(
  schema: HrImportModuleSchema,
): Array<{ name: string; labels: string[]; fields: string[] }> {
  const groups = new Map<string, { labels: string[]; fields: string[] }>();
  for (const column of schema.columns) {
    if (!column.requiredGroup) {
      continue;
    }
    const group = groups.get(column.requiredGroup) ?? { labels: [], fields: [] };
    group.labels.push(column.label);
    group.fields.push(column.field);
    groups.set(column.requiredGroup, group);
  }
  return [...groups].map(([name, group]) => ({ name, ...group }));
}

/** Rows scanned for the column header (exports put a title block above it). */
const HEADER_SCAN_ROWS = 15;
/** Rows the exporter adds under the table that are not data. */
const EXPORT_FOOTER_LABELS = new Set(['total', 'no records']);

/**
 * Parses and validates an uploaded workbook in the browser.
 *
 * Never throws - file-level problems come back as `fatalError`, row-level ones
 * as `errors` on the row, so the modal can show both without a round trip.
 */
export async function parseHrImportFile(
  file: File,
  schema: HrImportModuleSchema,
): Promise<HrClientParseResult> {
  let sheet: ExcelJS.Worksheet | undefined;
  try {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(await file.arrayBuffer());
    sheet = workbook.worksheets[0];
  } catch {
    return {
      fatalError: 'That file could not be read. Use the .xlsx template.',
      rows: [],
      validCount: 0,
      invalidCount: 0,
    };
  }

  if (!sheet) {
    return {
      fatalError: 'The workbook has no sheets.',
      rows: [],
      validCount: 0,
      invalidCount: 0,
    };
  }

  const headerLookup = new Map<string, string>();
  for (const column of schema.columns) {
    for (const header of [column.label, column.field, ...(column.aliases ?? [])]) {
      headerLookup.set(normalizeKey(header), column.field);
    }
  }

  // Exports put a document header (company, title, generated line) above the
  // table, so the column row is the best-matching one among the first rows.
  let headerRowNumber = 1;
  let bestMatches = 0;
  for (
    let rowNumber = 1;
    rowNumber <= Math.min(sheet.rowCount, HEADER_SCAN_ROWS);
    rowNumber += 1
  ) {
    let matches = 0;
    sheet.getRow(rowNumber).eachCell((cell) => {
      if (headerLookup.has(normalizeKey(cellText(cell.value)))) {
        matches += 1;
      }
    });
    if (matches > bestMatches) {
      bestMatches = matches;
      headerRowNumber = rowNumber;
    }
  }

  const fieldByColumn = new Map<number, string>();
  sheet.getRow(headerRowNumber).eachCell((cell, colNumber) => {
    const field = headerLookup.get(normalizeKey(cellText(cell.value)));
    if (field && !fieldByColumn.has(colNumber)) {
      fieldByColumn.set(colNumber, field);
    }
  });

  const mapped = new Set(fieldByColumn.values());
  const missing = schema.columns
    .filter((column) => column.required && !mapped.has(column.field))
    .map((column) => column.label);
  for (const group of requiredGroupsOf(schema)) {
    if (!group.fields.some((field) => mapped.has(field))) {
      missing.push(group.labels.join(' or '));
    }
  }
  if (missing.length > 0) {
    return {
      fatalError: `Missing column${missing.length > 1 ? 's' : ''}: ${missing.join(', ')}. Download the template.`,
      rows: [],
      validCount: 0,
      invalidCount: 0,
    };
  }

  const columnByField = new Map(
    schema.columns.map((column) => [column.field, column] as const),
  );
  const rows: HrClientParsedRow[] = [];

  for (
    let rowNumber = headerRowNumber + 1;
    rowNumber <= sheet.rowCount;
    rowNumber += 1
  ) {
    const excelRow = sheet.getRow(rowNumber);
    // Skip the exporter's own "Total" / "No records" row under the table.
    if (
      EXPORT_FOOTER_LABELS.has(cellText(excelRow.getCell(1).value).trim().toLowerCase())
    ) {
      continue;
    }
    const cells: Record<string, string> = {};
    let hasValue = false;

    for (const [colNumber, field] of fieldByColumn) {
      const column = columnByField.get(field);
      const raw = excelRow.getCell(colNumber).value;
      const text =
        column?.type === 'date' || column?.type === 'datetime'
          ? cellDateText(raw, column.type)
          : cellText(raw);
      cells[field] = text.trim();
      if (cells[field] !== '') {
        hasValue = true;
      }
    }

    if (!hasValue) {
      continue;
    }

    rows.push({
      line: rowNumber,
      label: firstPopulated(cells, schema) || `Line ${rowNumber}`,
      cells,
      errors: validateRow(cells, schema),
    });
  }

  if (rows.length === 0) {
    return {
      fatalError: 'No data rows found in the spreadsheet.',
      rows: [],
      validCount: 0,
      invalidCount: 0,
    };
  }

  const invalidCount = rows.filter((row) => row.errors.length > 0).length;
  return {
    rows,
    validCount: rows.length - invalidCount,
    invalidCount,
  };
}

function validateRow(
  cells: Record<string, string>,
  schema: HrImportModuleSchema,
): string[] {
  const errors: string[] = [];

  for (const column of schema.columns) {
    const value = cells[column.field] ?? '';
    if (value === '') {
      if (column.required) {
        errors.push(`${column.label} is required`);
      }
      continue;
    }

    switch (column.type) {
      case 'enum': {
        const matched = (column.enumValues ?? []).some(
          (code) =>
            normalizeKey(code) === normalizeKey(value) ||
            normalizeKey(humanizeEnumValue(code)) === normalizeKey(value),
        );
        if (!matched) {
          errors.push(
            `${column.label} must be one of: ${enumLabelsFor(column).join(', ')}`,
          );
        }
        break;
      }
      case 'date':
        if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
          errors.push(`${column.label} must use YYYY-MM-DD`);
        }
        break;
      case 'datetime':
        if (!/^\d{4}-\d{2}-\d{2}([T ]\d{2}:\d{2}(:\d{2})?)?$/.test(value)) {
          errors.push(
            `${column.label} must use YYYY-MM-DD or YYYY-MM-DD HH:mm`,
          );
        }
        break;
      case 'number':
      case 'integer': {
        const num = Number(value.replace(/,/g, ''));
        if (!Number.isFinite(num)) {
          errors.push(`${column.label} must be a number`);
        } else if (column.type === 'integer' && !Number.isInteger(num)) {
          errors.push(`${column.label} must be a whole number`);
        } else if (column.min !== undefined && num < column.min) {
          errors.push(`${column.label} must be at least ${column.min}`);
        } else if (column.max !== undefined && num > column.max) {
          errors.push(`${column.label} must be at most ${column.max}`);
        }
        break;
      }
      case 'email':
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
          errors.push(`${column.label} must be a valid email address`);
        }
        break;
      default:
        break;
    }
  }

  for (const group of requiredGroupsOf(schema)) {
    if (!group.fields.some((field) => (cells[field] ?? '') !== '')) {
      errors.push(`${group.labels.join(' or ')} is required`);
    }
  }

  return errors;
}

function firstPopulated(
  cells: Record<string, string>,
  schema: HrImportModuleSchema,
): string {
  for (const column of schema.columns) {
    const value = cells[column.field]?.trim();
    if (value) {
      return value;
    }
  }
  return '';
}

function cellText(value: ExcelJS.CellValue): string {
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
    return cellText(value.result as ExcelJS.CellValue);
  }
  if (typeof value === 'object' && 'richText' in value) {
    return value.richText.map((part) => part.text).join('');
  }
  return String(value);
}

function cellDateText(
  value: ExcelJS.CellValue,
  type: 'date' | 'datetime',
): string {
  if (value instanceof Date) {
    const day = value.toISOString().slice(0, 10);
    if (type === 'date') {
      return day;
    }
    const time = value.toISOString().slice(11, 16);
    return time === '00:00' ? day : `${day} ${time}`;
  }
  const text = cellText(value).trim();
  const withTime = /^(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2})/.exec(text);
  if (withTime) {
    return type === 'date' ? withTime[1] : `${withTime[1]} ${withTime[2]}`;
  }
  const dayOnly = /^(\d{4}-\d{2}-\d{2})/.exec(text);
  return dayOnly ? dayOnly[1] : text;
}
