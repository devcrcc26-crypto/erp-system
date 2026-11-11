import type {
  ConsumablesRequisitionDetail,
  ConsumablesRequisitionItem,
  ConsumablesRequisitionListItem,
} from '@/lib/api/consumables-requisition.types';
import {
  buildExportFileName,
  cell,
  downloadExcelWorkbook,
  formatExportDate,
} from '@/lib/utils/excel-export';
import { formatConsumablesRequisitionEmployeeName } from '@/lib/utils/consumables-requisition-display';

/**
 * Downloads consumables requisition list rows as Excel (summary table).
 */
export async function exportConsumablesRequisitionsExcel(input: {
  companyName: string;
  sheetName: string;
  rows: ConsumablesRequisitionListItem[];
}): Promise<void> {
  const { rows, companyName, sheetName } = input;
  await downloadExcelWorkbook({
    sheetName,
    fileName: buildExportFileName('consumables-requisitions', companyName),
    columns: [
      { header: 'requestNumber', key: 'requestNumber', width: 16 },
      { header: 'employeeEmail', key: 'employeeEmail', width: 28 },
      { header: 'employeeName', key: 'employeeName', width: 22 },
      { header: 'employeeId', key: 'employeeId', width: 36 },
      { header: 'title', key: 'title', width: 28 },
      { header: 'status', key: 'status', width: 12 },
      { header: 'itemCount', key: 'itemCount', width: 10 },
      { header: 'department', key: 'department', width: 18 },
      { header: 'requiredByDate', key: 'requiredByDate', width: 14 },
      { header: 'submittedAt', key: 'submittedAt', width: 14 },
      { header: 'createdAt', key: 'createdAt', width: 14 },
    ],
    rows: rows.map((row) => ({
      requestNumber: cell(row.requestNumber),
      employeeEmail: cell(row.employee?.email),
      employeeName: formatConsumablesRequisitionEmployeeName(row.employee),
      employeeId: cell(row.employeeId),
      title: cell(row.title),
      status: cell(row.status),
      itemCount: cell(row.itemCount),
      department: cell(row.department),
      requiredByDate: formatExportDate(row.requiredByDate),
      submittedAt: formatExportDate(row.submittedAt),
      createdAt: formatExportDate(row.createdAt),
    })),
  });
}

/**
 * Downloads consumables requisition items flattened (import-compatible).
 */
export async function exportConsumablesRequisitionItemsExcel(input: {
  companyName: string;
  sheetName: string;
  filePrefix?: string;
  requisitions: ConsumablesRequisitionDetail[];
}): Promise<void> {
  const { requisitions, companyName, sheetName, filePrefix } = input;
  const flatRows: Array<Record<string, string | number>> = [];

  for (const requisition of requisitions) {
    for (const item of requisition.items ?? []) {
      flatRows.push(mapItemExportRow(requisition, item));
    }
  }

  await downloadExcelWorkbook({
    sheetName,
    fileName: buildExportFileName(
      filePrefix ?? 'consumables-requisition-items',
      companyName,
    ),
    columns: [
      { header: 'employeeEmail', key: 'employeeEmail', width: 28 },
      { header: 'employeeName', key: 'employeeName', width: 22 },
      { header: 'employeeId', key: 'employeeId', width: 36 },
      { header: 'requestNumber', key: 'requestNumber', width: 16 },
      { header: 'title', key: 'title', width: 28 },
      { header: 'purpose', key: 'purpose', width: 32 },
      { header: 'department', key: 'department', width: 18 },
      { header: 'requiredByDate', key: 'requiredByDate', width: 14 },
      { header: 'status', key: 'status', width: 12 },
      { header: 'itemName', key: 'itemName', width: 22 },
      { header: 'itemCode', key: 'itemCode', width: 14 },
      { header: 'modelSpec', key: 'modelSpec', width: 18 },
      { header: 'description', key: 'description', width: 28 },
      { header: 'quantity', key: 'quantity', width: 10 },
      { header: 'unit', key: 'unit', width: 10 },
    ],
    rows: flatRows,
  });
}

/**
 * Downloads items for a single consumables requisition (scoped import columns).
 */
export async function exportConsumablesRequisitionDetailItemsExcel(input: {
  companyName: string;
  sheetName: string;
  requisition: ConsumablesRequisitionDetail;
}): Promise<void> {
  const { requisition, companyName, sheetName } = input;
  await downloadExcelWorkbook({
    sheetName,
    fileName: buildExportFileName(
      `consumables-requisition-${requisition.requestNumber || requisition.id.slice(0, 8)}`,
      companyName,
    ),
    columns: [
      { header: 'itemName', key: 'itemName', width: 22 },
      { header: 'itemCode', key: 'itemCode', width: 14 },
      { header: 'modelSpec', key: 'modelSpec', width: 18 },
      { header: 'description', key: 'description', width: 28 },
      { header: 'quantity', key: 'quantity', width: 10 },
      { header: 'unit', key: 'unit', width: 10 },
    ],
    rows: (requisition.items ?? []).map((item) => ({
      itemName: cell(item.itemName),
      itemCode: cell(item.itemCode),
      modelSpec: cell(item.modelSpec),
      description: cell(item.description),
      quantity: cell(item.quantity),
      unit: cell(item.unit),
    })),
  });
}

function mapItemExportRow(
  requisition: ConsumablesRequisitionDetail,
  item: ConsumablesRequisitionItem,
): Record<string, string | number> {
  return {
    employeeEmail: cell(requisition.employee?.email),
    employeeName: formatConsumablesRequisitionEmployeeName(requisition.employee),
    employeeId: cell(requisition.employeeId),
    requestNumber: cell(requisition.requestNumber),
    title: cell(requisition.title),
    purpose: cell(requisition.purpose),
    department: cell(requisition.department),
    requiredByDate: formatExportDate(requisition.requiredByDate),
    status: cell(requisition.status),
    itemName: cell(item.itemName),
    itemCode: cell(item.itemCode),
    modelSpec: cell(item.modelSpec),
    description: cell(item.description),
    quantity: cell(item.quantity),
    unit: cell(item.unit),
  };
}
