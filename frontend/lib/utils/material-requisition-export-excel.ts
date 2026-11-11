import type {
  MaterialRequisitionDetail,
  MaterialRequisitionItem,
  MaterialRequisitionListItem,
} from '@/lib/api/material-requisition.types';
import {
  buildExportFileName,
  cell,
  downloadExcelWorkbook,
  formatExportDate,
} from '@/lib/utils/excel-export';
import { formatMaterialRequisitionEmployeeName } from '@/lib/utils/material-requisition-display';

/**
 * Downloads material requisition list rows as Excel (summary table).
 */
export async function exportMaterialRequisitionsExcel(input: {
  companyName: string;
  sheetName: string;
  rows: MaterialRequisitionListItem[];
}): Promise<void> {
  const { rows, companyName, sheetName } = input;
  await downloadExcelWorkbook({
    sheetName,
    fileName: buildExportFileName('material-requisitions', companyName),
    columns: [
      { header: 'requestNumber', key: 'requestNumber', width: 16 },
      { header: 'employeeEmail', key: 'employeeEmail', width: 28 },
      { header: 'employeeName', key: 'employeeName', width: 22 },
      { header: 'employeeId', key: 'employeeId', width: 36 },
      { header: 'title', key: 'title', width: 28 },
      { header: 'status', key: 'status', width: 12 },
      { header: 'itemCount', key: 'itemCount', width: 10 },
      { header: 'warehouseLocation', key: 'warehouseLocation', width: 18 },
      { header: 'requiredByDate', key: 'requiredByDate', width: 14 },
      { header: 'projectCode', key: 'projectCode', width: 14 },
      { header: 'submittedAt', key: 'submittedAt', width: 14 },
      { header: 'createdAt', key: 'createdAt', width: 14 },
    ],
    rows: rows.map((row) => ({
      requestNumber: cell(row.requestNumber),
      employeeEmail: cell(row.employee?.email),
      employeeName: formatMaterialRequisitionEmployeeName(row.employee),
      employeeId: cell(row.employeeId),
      title: cell(row.title),
      status: cell(row.status),
      itemCount: cell(row.itemCount),
      warehouseLocation: cell(row.warehouseLocation),
      requiredByDate: formatExportDate(row.requiredByDate),
      projectCode: cell(row.project?.projectCode),
      submittedAt: formatExportDate(row.submittedAt),
      createdAt: formatExportDate(row.createdAt),
    })),
  });
}

/**
 * Downloads material requisition items flattened (import-compatible).
 */
export async function exportMaterialRequisitionItemsExcel(input: {
  companyName: string;
  sheetName: string;
  filePrefix?: string;
  requisitions: MaterialRequisitionDetail[];
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
      filePrefix ?? 'material-requisition-items',
      companyName,
    ),
    columns: [
      { header: 'employeeEmail', key: 'employeeEmail', width: 28 },
      { header: 'employeeName', key: 'employeeName', width: 22 },
      { header: 'employeeId', key: 'employeeId', width: 36 },
      { header: 'requestNumber', key: 'requestNumber', width: 16 },
      { header: 'title', key: 'title', width: 28 },
      { header: 'purpose', key: 'purpose', width: 32 },
      { header: 'warehouseLocation', key: 'warehouseLocation', width: 18 },
      { header: 'requiredByDate', key: 'requiredByDate', width: 14 },
      { header: 'projectId', key: 'projectId', width: 36 },
      { header: 'projectCode', key: 'projectCode', width: 14 },
      { header: 'status', key: 'status', width: 12 },
      { header: 'itemName', key: 'itemName', width: 22 },
      { header: 'itemCode', key: 'itemCode', width: 14 },
      { header: 'description', key: 'description', width: 28 },
      { header: 'quantity', key: 'quantity', width: 10 },
      { header: 'unit', key: 'unit', width: 10 },
    ],
    rows: flatRows,
  });
}

/**
 * Downloads items for a single material requisition (scoped import columns).
 */
export async function exportMaterialRequisitionDetailItemsExcel(input: {
  companyName: string;
  sheetName: string;
  requisition: MaterialRequisitionDetail;
}): Promise<void> {
  const { requisition, companyName, sheetName } = input;
  await downloadExcelWorkbook({
    sheetName,
    fileName: buildExportFileName(
      `material-requisition-${requisition.requestNumber || requisition.id.slice(0, 8)}`,
      companyName,
    ),
    columns: [
      { header: 'itemName', key: 'itemName', width: 22 },
      { header: 'itemCode', key: 'itemCode', width: 14 },
      { header: 'description', key: 'description', width: 28 },
      { header: 'quantity', key: 'quantity', width: 10 },
      { header: 'unit', key: 'unit', width: 10 },
    ],
    rows: (requisition.items ?? []).map((item) => ({
      itemName: cell(item.itemName),
      itemCode: cell(item.itemCode),
      description: cell(item.description),
      quantity: cell(item.quantity),
      unit: cell(item.unit),
    })),
  });
}

function mapItemExportRow(
  requisition: MaterialRequisitionDetail,
  item: MaterialRequisitionItem,
): Record<string, string | number> {
  return {
    employeeEmail: cell(requisition.employee?.email),
    employeeName: formatMaterialRequisitionEmployeeName(requisition.employee),
    employeeId: cell(requisition.employeeId),
    requestNumber: cell(requisition.requestNumber),
    title: cell(requisition.title),
    purpose: cell(requisition.purpose),
    warehouseLocation: cell(requisition.warehouseLocation),
    requiredByDate: formatExportDate(requisition.requiredByDate),
    projectId: cell(requisition.projectId),
    projectCode: cell(requisition.project?.projectCode),
    status: cell(requisition.status),
    itemName: cell(item.itemName),
    itemCode: cell(item.itemCode),
    description: cell(item.description),
    quantity: cell(item.quantity),
    unit: cell(item.unit),
  };
}
