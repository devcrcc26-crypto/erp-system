import * as ExcelJS from 'exceljs';
import {
  finishDocumentSheet,
  startDocumentSheet,
  type DocumentSheetLayout,
  type DocumentSheetMeta,
} from '../../../../shared/utils/excel-document.util';
import type { BilingualColumn } from '../constants/project-export.constants';

/**
 * Writes the document header and the bilingual header rows (Chinese over
 * English) in the shared export layout. Add the data rows afterwards, then
 * call {@link finishProjectExportSheet}.
 */
export function applyBilingualHeaders(
  sheet: ExcelJS.Worksheet,
  columns: BilingualColumn[],
  meta: DocumentSheetMeta,
): DocumentSheetLayout {
  return startDocumentSheet(
    sheet,
    meta,
    [columns.map((column) => column.zh), columns.map((column) => column.en)],
    columns.map((column) => column.width),
  );
}

/** Styles the data rows and sets up freezing, filters and printing. */
export function finishProjectExportSheet(
  sheet: ExcelJS.Worksheet,
  layout: DocumentSheetLayout,
): void {
  finishDocumentSheet(sheet, layout);
}

/**
 * Serializes a workbook to an XLSX buffer.
 */
export async function workbookToBuffer(
  workbook: ExcelJS.Workbook,
): Promise<Buffer> {
  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}
