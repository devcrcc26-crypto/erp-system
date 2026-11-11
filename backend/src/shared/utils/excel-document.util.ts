import type * as ExcelJS from 'exceljs';

/*
 * Monochrome "document" layout for Excel exports - the same layout as the
 * frontend HR exports (frontend/lib/utils/hr-export-excel.ts), after the PDF
 * documents:
 *
 *   COMPANY NAME                          (small, grey)
 *   Title                                 (large, bold)
 *   Generated  …   Prepared by  …   Records  …
 *   ─────────────────────────────────────  (solid black rule)
 *
 *   HEADER     HEADER         HEADER       (bold, rule beneath; 1+ rows)
 *   row ………………………………………………………………     (hairline dividers, no grid)
 *
 * Usage: `startDocumentSheet` → add the data rows with `sheet.addRow` →
 * `finishDocumentSheet`.
 */

const FONT = 'Arial';
const INK = 'FF111111';
const BODY = 'FF262626';
const MUTED = 'FF6B6B6B';
const HAIRLINE = 'FFD9D9D9';

const RULE_STRONG: Partial<ExcelJS.Border> = { style: 'medium', color: { argb: INK } };
const RULE_THIN: Partial<ExcelJS.Border> = { style: 'thin', color: { argb: INK } };
const RULE_HAIR: Partial<ExcelJS.Border> = { style: 'hair', color: { argb: HAIRLINE } };

/**
 * The document palette, for exports that cannot use `startDocumentSheet` /
 * `finishDocumentSheet` (e.g. streamed workbooks whose rows are committed as
 * they are written) but must look the same.
 */
export const DOCUMENT_STYLE = {
  font: FONT,
  ink: INK,
  body: BODY,
  muted: MUTED,
  ruleStrong: RULE_STRONG,
  ruleThin: RULE_THIN,
  ruleHair: RULE_HAIR,
} as const;

/** Page footer used by document sheets: `Company - Title … Page x of y`. */
export function documentFooter(companyName: string, title: string): string {
  return `&L&"${FONT}"&8&K6B6B6B${footerText(`${companyName} - ${title}`)}&R&"${FONT}"&8&K6B6B6BPage &P of &N`;
}

/** Metadata line (`Generated … Records …`) as rich text, muted labels / bold values. */
export function documentMetaRichText(
  parts: Array<[string, string]>,
): ExcelJS.CellRichTextValue {
  return {
    richText: parts.flatMap(([label, value], index) => [
      {
        text: `${index > 0 ? '      ' : ''}${label}  `,
        font: { name: FONT, size: 8, color: { argb: MUTED } },
      },
      { text: value, font: { name: FONT, size: 8, bold: true, color: { argb: INK } } },
    ]),
  };
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** Row of the first table header row (company, title, metadata, spacer above). */
export const DOCUMENT_TABLE_START_ROW = 5;

export interface DocumentSheetMeta {
  companyName: string;
  title: string;
  generatedAt?: Date;
  preparedBy?: string | null;
  /** Extra label/value pairs for the metadata line (e.g. `Read`, `12`). */
  details?: Array<[string, string]>;
}

export interface DocumentSheetLayout {
  columnCount: number;
  headerStartRow: number;
  headerEndRow: number;
  meta: DocumentSheetMeta;
}

/** `26 Oct 2026, 09:05` */
export function formatGeneratedAt(date: Date): string {
  const pad = (part: number): string => String(part).padStart(2, '0');
  return `${date.getDate()} ${MONTHS[date.getMonth()]} ${date.getFullYear()}, ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/** Excel header/footer codes start with `&`, so literal ampersands are doubled. */
function footerText(value: string): string {
  return value.replace(/&/g, '&&');
}

/**
 * Writes the document header and the table header row(s). `headerRows` holds
 * one array of labels per header row (e.g. Chinese then English); `widths`
 * sets the column widths. Data rows added afterwards with `sheet.addRow`
 * land directly under the header.
 */
export function startDocumentSheet(
  sheet: ExcelJS.Worksheet,
  meta: DocumentSheetMeta,
  headerRows: string[][],
  widths: number[],
): DocumentSheetLayout {
  const columnCount = Math.max(1, ...headerRows.map((row) => row.length));
  widths.forEach((width, index) => {
    sheet.getColumn(index + 1).width = width;
  });

  const companyCell = sheet.getCell(1, 1);
  companyCell.value = meta.companyName.toUpperCase();
  companyCell.font = { name: FONT, size: 8, bold: true, color: { argb: MUTED } };

  sheet.getRow(2).height = 28;
  const titleCell = sheet.getCell(2, 1);
  titleCell.value = meta.title;
  titleCell.font = { name: FONT, size: 16, bold: true, color: { argb: INK } };
  titleCell.alignment = { vertical: 'middle' };

  sheet.getRow(3).height = 22;
  // Records are filled in by finishDocumentSheet once the rows exist.
  for (let column = 1; column <= columnCount; column += 1) {
    sheet.getCell(3, column).border = { bottom: RULE_STRONG };
  }
  sheet.getRow(4).height = 12;

  const headerStartRow = DOCUMENT_TABLE_START_ROW;
  headerRows.forEach((labels, offset) => {
    const row = sheet.getRow(headerStartRow + offset);
    row.height = 24;
    const isLast = offset === headerRows.length - 1;
    for (let column = 1; column <= columnCount; column += 1) {
      const cell = row.getCell(column);
      cell.value = labels[column - 1] ?? '';
      cell.font = {
        name: FONT,
        size: 9,
        bold: true,
        // Earlier header rows (e.g. Chinese labels) read as a quieter line.
        color: { argb: isLast ? INK : MUTED },
      };
      cell.alignment = { vertical: 'middle', wrapText: true };
      if (isLast) {
        cell.border = { bottom: RULE_THIN };
      }
    }
  });
  const headerEndRow = headerStartRow + headerRows.length - 1;

  return { columnCount, headerStartRow, headerEndRow, meta };
}

/**
 * Styles the data rows, fills in the metadata line and sets up freezing,
 * filtering, gridlines and printing. Call after every row has been added.
 */
export function finishDocumentSheet(
  sheet: ExcelJS.Worksheet,
  layout: DocumentSheetLayout,
): void {
  const { columnCount, headerStartRow, headerEndRow, meta } = layout;
  const firstBodyRow = headerEndRow + 1;
  const lastBodyRow = Math.max(sheet.rowCount, headerEndRow);
  const recordCount = lastBodyRow - headerEndRow;

  // Metadata line: muted labels, dark values.
  const metaParts: Array<[string, string]> = [
    ['Generated', formatGeneratedAt(meta.generatedAt ?? new Date())],
    ...(meta.preparedBy?.trim()
      ? ([['Prepared by', meta.preparedBy.trim()]] as Array<[string, string]>)
      : []),
    ['Records', recordCount.toLocaleString('en-US')],
    ...(meta.details ?? []),
  ];
  const metaCell = sheet.getCell(3, 1);
  metaCell.value = documentMetaRichText(metaParts);
  metaCell.alignment = { vertical: 'top' };

  if (recordCount === 0) {
    const cell = sheet.getCell(firstBodyRow, 1);
    cell.value = 'No records';
    cell.font = { name: FONT, size: 9, italic: true, color: { argb: MUTED } };
    for (let column = 1; column <= columnCount; column += 1) {
      sheet.getCell(firstBodyRow, column).border = { bottom: RULE_HAIR };
    }
  }

  for (let rowNumber = firstBodyRow; rowNumber <= lastBodyRow; rowNumber += 1) {
    const row = sheet.getRow(rowNumber);
    for (let column = 1; column <= columnCount; column += 1) {
      const cell = row.getCell(column);
      const value = cell.value;
      cell.font = { name: FONT, size: 9, color: { argb: BODY } };
      cell.border = { bottom: RULE_HAIR };
      if (typeof value === 'number') {
        cell.numFmt = Number.isInteger(value) ? '#,##0' : '#,##0.0#';
      }
      const width = sheet.getColumn(column).width ?? 10;
      cell.alignment = {
        vertical: 'top',
        horizontal: typeof value === 'number' ? 'right' : 'left',
        wrapText: typeof value === 'string' && value.length > width,
      };
    }
  }

  sheet.views = [
    {
      state: 'frozen',
      ySplit: headerEndRow,
      activeCell: `A${firstBodyRow}`,
      showGridLines: false,
    },
  ];
  sheet.autoFilter = {
    from: { row: headerEndRow, column: 1 },
    to: { row: headerEndRow, column: columnCount },
  };
  sheet.pageSetup = {
    ...sheet.pageSetup,
    paperSize: 9, // A4
    orientation: columnCount > 6 ? 'landscape' : 'portrait',
    fitToPage: true,
    fitToWidth: 1,
    fitToHeight: 0,
    horizontalCentered: true,
    margins: { left: 0.5, right: 0.5, top: 0.6, bottom: 0.75, header: 0.3, footer: 0.3 },
    printTitlesRow: `${headerStartRow}:${headerEndRow}`,
  };
  sheet.headerFooter = {
    ...sheet.headerFooter,
    oddFooter: documentFooter(meta.companyName, meta.title),
  };
}
