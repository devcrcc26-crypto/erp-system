import { downloadHrExcelWorkbook } from '@/lib/utils/hr-export-excel';

/**
 * Shared single-sheet Excel download for HR exports. Uses the same
 * PDF-style document layout as the multi-sheet HR builder.
 */
export async function downloadExcelWorkbook(input: {
  sheetName: string;
  fileName: string;
  columns: Array<{ header: string; key: string; width?: number }>;
  rows: Array<Record<string, string | number>>;
  generatedAt?: string;
  companyName?: string;
  preparedBy?: string | null;
}): Promise<void> {
  await downloadHrExcelWorkbook({
    fileName: input.fileName,
    generatedAt: input.generatedAt,
    companyName: input.companyName,
    preparedBy: input.preparedBy,
    sheets: [
      {
        name: input.sheetName,
        columns: input.columns.map((column) => ({
          ...column,
          width: column.width ?? 16,
        })),
        rows: input.rows,
      },
    ],
  });
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
