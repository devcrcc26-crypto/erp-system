import type {
  PurchaseRequestDetail,
  PurchaseRequestItem,
  PurchaseRequestListItem,
} from '@/lib/api/purchase-request.types';
import {
  buildExportFileName,
  cell,
  downloadExcelWorkbook,
  formatExportDate,
} from '@/lib/utils/excel-export';
import { formatPurchaseRequestEmployeeName } from '@/lib/utils/purchase-request-display';

/**
 * Downloads purchase request list rows as Excel (summary table).
 */
export async function exportPurchaseRequestsExcel(input: {
  companyName: string;
  sheetName: string;
  rows: PurchaseRequestListItem[];
}): Promise<void> {
  const { rows, companyName, sheetName } = input;
  await downloadExcelWorkbook({
    sheetName,
    fileName: buildExportFileName('purchase-requests', companyName),
    columns: [
      { header: 'requestNumber', key: 'requestNumber', width: 16 },
      { header: 'employeeEmail', key: 'employeeEmail', width: 28 },
      { header: 'employeeName', key: 'employeeName', width: 22 },
      { header: 'employeeId', key: 'employeeId', width: 36 },
      { header: 'title', key: 'title', width: 28 },
      { header: 'status', key: 'status', width: 12 },
      { header: 'itemCount', key: 'itemCount', width: 10 },
      { header: 'totalEstimatedEtb', key: 'totalEstimatedEtb', width: 16 },
      { header: 'vendorName', key: 'vendorName', width: 20 },
      { header: 'requiredByDate', key: 'requiredByDate', width: 14 },
      { header: 'submittedAt', key: 'submittedAt', width: 14 },
      { header: 'createdAt', key: 'createdAt', width: 14 },
    ],
    rows: rows.map((row) => ({
      requestNumber: cell(row.requestNumber),
      employeeEmail: cell(row.employee?.email),
      employeeName: formatPurchaseRequestEmployeeName(row.employee),
      employeeId: cell(row.employeeId),
      title: cell(row.title),
      status: cell(row.status),
      itemCount: cell(row.itemCount),
      totalEstimatedEtb: cell(row.totalEstimatedEtb),
      vendorName: cell(row.vendorName),
      requiredByDate: formatExportDate(row.requiredByDate),
      submittedAt: formatExportDate(row.submittedAt),
      createdAt: formatExportDate(row.createdAt),
    })),
  });
}

/**
 * Downloads purchase request items flattened from requests (import-compatible).
 */
export async function exportPurchaseRequestItemsExcel(input: {
  companyName: string;
  sheetName: string;
  filePrefix?: string;
  requests: PurchaseRequestDetail[];
}): Promise<void> {
  const { requests, companyName, sheetName, filePrefix } = input;
  const flatRows: Array<Record<string, string | number>> = [];

  for (const request of requests) {
    for (const item of request.items ?? []) {
      flatRows.push(mapItemExportRow(request, item));
    }
  }

  await downloadExcelWorkbook({
    sheetName,
    fileName: buildExportFileName(
      filePrefix ?? 'purchase-request-items',
      companyName,
    ),
    columns: [
      { header: 'employeeEmail', key: 'employeeEmail', width: 28 },
      { header: 'employeeName', key: 'employeeName', width: 22 },
      { header: 'employeeId', key: 'employeeId', width: 36 },
      { header: 'requestNumber', key: 'requestNumber', width: 16 },
      { header: 'title', key: 'title', width: 28 },
      { header: 'justification', key: 'justification', width: 32 },
      { header: 'vendorName', key: 'vendorName', width: 20 },
      { header: 'vendorEmail', key: 'vendorEmail', width: 24 },
      { header: 'vendorPhone', key: 'vendorPhone', width: 18 },
      { header: 'requiredByDate', key: 'requiredByDate', width: 14 },
      { header: 'status', key: 'status', width: 12 },
      { header: 'itemName', key: 'itemName', width: 22 },
      { header: 'modelSpec', key: 'modelSpec', width: 20 },
      { header: 'description', key: 'description', width: 28 },
      { header: 'quantity', key: 'quantity', width: 10 },
      { header: 'unit', key: 'unit', width: 10 },
      { header: 'unitPrice', key: 'unitPrice', width: 12 },
      { header: 'currency', key: 'currency', width: 10 },
      { header: 'totalPrice', key: 'totalPrice', width: 12 },
      { header: 'totalPriceEtb', key: 'totalPriceEtb', width: 14 },
    ],
    rows: flatRows,
  });
}

/**
 * Downloads items for a single purchase request (request-scoped import columns).
 */
export async function exportPurchaseRequestDetailItemsExcel(input: {
  companyName: string;
  sheetName: string;
  request: PurchaseRequestDetail;
}): Promise<void> {
  const { request, companyName, sheetName } = input;
  await downloadExcelWorkbook({
    sheetName,
    fileName: buildExportFileName(
      `purchase-request-${request.requestNumber || request.id.slice(0, 8)}`,
      companyName,
    ),
    columns: [
      { header: 'itemName', key: 'itemName', width: 22 },
      { header: 'modelSpec', key: 'modelSpec', width: 20 },
      { header: 'description', key: 'description', width: 28 },
      { header: 'quantity', key: 'quantity', width: 10 },
      { header: 'unit', key: 'unit', width: 10 },
      { header: 'unitPrice', key: 'unitPrice', width: 12 },
      { header: 'currency', key: 'currency', width: 10 },
      { header: 'totalPrice', key: 'totalPrice', width: 12 },
      { header: 'totalPriceEtb', key: 'totalPriceEtb', width: 14 },
    ],
    rows: (request.items ?? []).map((item) => ({
      itemName: cell(item.itemName),
      modelSpec: cell(item.modelSpec),
      description: cell(item.description),
      quantity: cell(item.quantity),
      unit: cell(item.unit),
      unitPrice: cell(item.unitPrice),
      currency: cell(item.currency),
      totalPrice: cell(item.totalPrice),
      totalPriceEtb: cell(item.totalPriceEtb),
    })),
  });
}

function mapItemExportRow(
  request: PurchaseRequestDetail,
  item: PurchaseRequestItem,
): Record<string, string | number> {
  return {
    employeeEmail: cell(request.employee?.email),
    employeeName: formatPurchaseRequestEmployeeName(request.employee),
    employeeId: cell(request.employeeId),
    requestNumber: cell(request.requestNumber),
    title: cell(request.title),
    justification: cell(request.justification),
    vendorName: cell(request.vendorName),
    vendorEmail: cell(request.vendorEmail),
    vendorPhone: cell(request.vendorPhone),
    requiredByDate: formatExportDate(request.requiredByDate),
    status: cell(request.status),
    itemName: cell(item.itemName),
    modelSpec: cell(item.modelSpec),
    description: cell(item.description),
    quantity: cell(item.quantity),
    unit: cell(item.unit),
    unitPrice: cell(item.unitPrice),
    currency: cell(item.currency),
    totalPrice: cell(item.totalPrice),
    totalPriceEtb: cell(item.totalPriceEtb),
  };
}
