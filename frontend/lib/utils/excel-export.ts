import ExcelJS from 'exceljs';

/**
 * Shared Excel download helper for HR list exports.
 */
export async function downloadExcelWorkbook(input: {
  sheetName: string;
  fileName: string;
  columns: Array<{ header: string; key: string; width?: number }>;
  rows: Array<Record<string, string | number>>;
  generatedAt?: string;
}): Promise<void> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Construction ERP';
  workbook.created = new Date(input.generatedAt ?? new Date().toISOString());

  const sheet = workbook.addWorksheet(input.sheetName);
  sheet.columns = input.columns.map((column) => ({
    header: column.header,
    key: column.key,
    width: column.width ?? 16,
  }));

  const headerRow = sheet.getRow(1);
  headerRow.font = { bold: true };
  headerRow.alignment = { vertical: 'middle', wrapText: true };

  if (input.rows.length > 0) {
    sheet.addRows(input.rows);
  }

  sheet.views = [{ state: 'frozen', ySplit: 1 }];

  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = input.fileName;
  anchor.click();
  URL.revokeObjectURL(url);
}

export function cell(value: string | number | null | undefined): string {
  if (value === null || value === undefined || value === '') {
    return '';
  }
  return String(value);
}

export function formatExportDate(value: string | null | undefined): string {
  if (!value) {
    return '';
  }
  return value.slice(0, 10);
}

export function buildExportFileName(prefix: string, companyName: string): string {
  const safeCompany = companyName
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '') || 'company';
  const date = new Date().toISOString().slice(0, 10);
  return `${prefix}_${safeCompany}_${date}.xlsx`;
}
