import * as ExcelJS from 'exceljs';
import {
  enumLabelsFor,
  type ImportColumnSchema,
} from './import-column-schema';

/**
 * Base Excel builder: turns column definitions + row data into a workbook.
 *
 * Used by the import-template endpoints; the same signature is deliberately
 * generic so any future server-side export can reuse it.
 */
export async function buildExcelWorkbook(input: {
  sheets: Array<{
    name: string;
    columns: Array<{ header: string; key: string; width?: number }>;
    rows: Array<Record<string, string | number | null | undefined>>;
  }>;
}): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'CRCC International Consulting';
  workbook.created = new Date();

  for (const sheetDef of input.sheets) {
    const sheet = workbook.addWorksheet(sheetDef.name);
    sheet.columns = sheetDef.columns.map((column) => ({
      header: column.header,
      key: column.key,
      width: column.width ?? 18,
    }));
    const headerRow = sheet.getRow(1);
    headerRow.font = { bold: true };
    headerRow.alignment = { vertical: 'middle', wrapText: true };
    if (sheetDef.rows.length > 0) {
      sheet.addRows(sheetDef.rows);
    }
    sheet.views = [{ state: 'frozen', ySplit: 1 }];
  }

  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}

/**
 * Builds the downloadable import template for a schema: a data sheet with
 * human-readable headers and one example row, plus an Instructions sheet
 * listing every column, whether it is required, and the accepted values.
 */
export async function buildImportTemplate(
  schema: ImportColumnSchema,
): Promise<Buffer> {
  const exampleRow: Record<string, string> = {};
  for (const column of schema.columns) {
    exampleRow[column.field] = column.example ?? '';
  }

  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'CRCC International Consulting';
  workbook.created = new Date();

  const sheet = workbook.addWorksheet(schema.sheetName);
  sheet.columns = schema.columns.map((column) => ({
    header: column.label,
    key: column.field,
    width: column.width ?? Math.max(14, column.label.length + 4),
  }));
  const headerRow = sheet.getRow(1);
  headerRow.font = { bold: true };
  headerRow.alignment = { vertical: 'middle', wrapText: true };
  sheet.addRow(exampleRow);
  sheet.views = [{ state: 'frozen', ySplit: 1 }];

  const instructions = workbook.addWorksheet('Instructions');
  instructions.columns = [
    { header: 'Column', key: 'column', width: 26 },
    { header: 'Required', key: 'required', width: 14 },
    { header: 'Accepted values', key: 'accepted', width: 44 },
    { header: 'Notes', key: 'notes', width: 60 },
  ];
  instructions.getRow(1).font = { bold: true };

  for (const column of schema.columns) {
    instructions.addRow({
      column: column.label,
      required: column.required
        ? 'Yes'
        : column.requiredGroup
          ? 'One of group'
          : 'No',
      accepted: describeAcceptedValues(schema, column),
      notes: column.notes ?? '',
    });
  }

  instructions.addRow({});
  instructions.addRow({ column: 'Note', notes: schema.note });
  instructions.addRow({
    column: 'Dates',
    notes: 'Use YYYY-MM-DD. Real Excel date cells are accepted too.',
  });
  instructions.addRow({
    column: 'Money',
    notes: 'All monetary values are in ETB. Enter numbers only, no currency symbol.',
  });
  instructions.addRow({
    column: 'Status',
    notes: 'Imported records are always created as DRAFT - nothing is submitted or approved.',
  });

  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}

function describeAcceptedValues(
  schema: ImportColumnSchema,
  column: ImportColumnSchema['columns'][number],
): string {
  if (column.type === 'enum') {
    return enumLabelsFor(column).join(', ');
  }
  if (column.type === 'date') {
    return 'YYYY-MM-DD';
  }
  if (column.type === 'datetime') {
    return 'YYYY-MM-DD or YYYY-MM-DD HH:mm';
  }
  if (column.type === 'boolean') {
    return 'Yes, No';
  }
  if (column.type === 'email') {
    return 'Email address';
  }
  if (column.type === 'integer' || column.type === 'number') {
    const bounds: string[] = [];
    if (column.min !== undefined) {
      bounds.push(`min ${column.min}`);
    }
    if (column.max !== undefined) {
      bounds.push(`max ${column.max}`);
    }
    return bounds.length > 0 ? `Number (${bounds.join(', ')})` : 'Number';
  }
  if (column.requiredGroup) {
    const siblings = schema.columns
      .filter(
        (other) =>
          other.requiredGroup === column.requiredGroup &&
          other.field !== column.field,
      )
      .map((other) => other.label);
    return siblings.length > 0
      ? `Text - supply this or ${siblings.join(' / ')}`
      : 'Text';
  }
  return column.maxLength ? `Text (max ${column.maxLength})` : 'Text';
}
