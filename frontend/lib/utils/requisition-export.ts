import type {
  ConsumablesRequisitionDetail,
  ConsumablesRequisitionListItem,
} from '@/lib/api/consumables-requisition.types';
import type {
  MaterialRequisitionDetail,
  MaterialRequisitionListItem,
} from '@/lib/api/material-requisition.types';
import type {
  PurchaseRequestDetail,
  PurchaseRequestListItem,
} from '@/lib/api/purchase-request.types';
import type { HrExportSheet } from '@/lib/utils/hr-export-excel';
import {
  exportCell,
  exportDate,
  exportDateTime,
  exportEnumLabel,
  exportEtb,
  exportNumber,
  exportPersonName,
} from '@/lib/utils/hr-export-excel';

/**
 * Excel exports for the three requisition-shaped modules - purchase requests,
 * material requisitions and consumables requisitions. Each produces a header
 * sheet plus an `Items` sheet keyed by request number.
 */

export function buildPurchaseRequestExportSheets(
  rows: PurchaseRequestListItem[],
  details?: PurchaseRequestDetail[],
): HrExportSheet[] {
  const byId = new Map((details ?? []).map((d) => [d.id, d] as const));

  return [
    {
      name: 'Purchase Requests',
      columns: [
        { header: 'Request Number', key: 'requestNumber', width: 18 },
        { header: 'Employee', key: 'employee', width: 24 },
        { header: 'Employee Email', key: 'employeeEmail', width: 28 },
        { header: 'Title', key: 'title', width: 30 },
        { header: 'Items', key: 'itemCount', width: 10 },
        {
          header: 'Total Estimated (ETB)',
          key: 'totalEstimatedEtb',
          width: 22,
        },
        { header: 'Vendor', key: 'vendorName', width: 24 },
        { header: 'Required By', key: 'requiredByDate', width: 16 },
        { header: 'Project Code', key: 'projectCode', width: 16 },
        { header: 'Status', key: 'status', width: 14 },
        { header: 'Current Tier', key: 'currentTier', width: 20 },
        { header: 'Submitted At', key: 'submittedAt', width: 18 },
        { header: 'Created At', key: 'createdAt', width: 18 },
      ],
      rows: rows.map((row) => ({
        requestNumber: exportCell(row.requestNumber),
        employee: exportPersonName(row.employee),
        employeeEmail: exportCell(row.employee?.email),
        title: exportCell(row.title),
        itemCount: exportNumber(row.itemCount),
        totalEstimatedEtb: exportEtb(row.totalEstimatedEtb),
        vendorName: exportCell(row.vendorName),
        requiredByDate: exportDate(row.requiredByDate),
        projectCode: exportCell(row.project?.projectCode),
        status: exportEnumLabel(row.status),
        currentTier: exportCell(row.currentTierLabel),
        submittedAt: exportDateTime(row.submittedAt),
        createdAt: exportDateTime(row.createdAt),
      })),
    },
    {
      name: 'Items',
      columns: [
        { header: 'Request Number', key: 'requestNumber', width: 18 },
        { header: 'Employee', key: 'employee', width: 24 },
        { header: 'Item Name', key: 'itemName', width: 26 },
        { header: 'Model / Specification', key: 'modelSpec', width: 24 },
        { header: 'Description', key: 'description', width: 34 },
        { header: 'Quantity', key: 'quantity', width: 12 },
        { header: 'Unit', key: 'unit', width: 12 },
        { header: 'Unit Price', key: 'unitPrice', width: 14 },
        { header: 'Currency', key: 'currency', width: 12 },
        { header: 'Line Total', key: 'totalPrice', width: 16 },
        { header: 'Line Total (ETB)', key: 'totalPriceEtb', width: 18 },
      ],
      rows: rows.flatMap((row) =>
        (byId.get(row.id)?.items ?? []).map((item) => ({
          requestNumber: exportCell(row.requestNumber),
          employee: exportPersonName(row.employee),
          itemName: exportCell(item.itemName),
          modelSpec: exportCell(item.modelSpec),
          description: exportCell(item.description),
          quantity: exportNumber(item.quantity),
          unit: exportCell(item.unit),
          unitPrice: exportNumber(item.unitPrice),
          currency: exportCell(item.currency),
          totalPrice: exportNumber(item.totalPrice),
          totalPriceEtb: exportEtb(item.totalPriceEtb),
        })),
      ),
    },
  ];
}

export function buildMaterialRequisitionExportSheets(
  rows: MaterialRequisitionListItem[],
  details?: MaterialRequisitionDetail[],
): HrExportSheet[] {
  const byId = new Map((details ?? []).map((d) => [d.id, d] as const));

  return [
    {
      name: 'Material Requisitions',
      columns: [
        { header: 'Request Number', key: 'requestNumber', width: 18 },
        { header: 'Employee', key: 'employee', width: 24 },
        { header: 'Employee Email', key: 'employeeEmail', width: 28 },
        { header: 'Title', key: 'title', width: 30 },
        { header: 'Items', key: 'itemCount', width: 10 },
        { header: 'Warehouse Location', key: 'warehouseLocation', width: 24 },
        { header: 'Required By', key: 'requiredByDate', width: 16 },
        { header: 'Project Code', key: 'projectCode', width: 16 },
        { header: 'Status', key: 'status', width: 14 },
        { header: 'Current Tier', key: 'currentTier', width: 20 },
        { header: 'Submitted At', key: 'submittedAt', width: 18 },
        { header: 'Created At', key: 'createdAt', width: 18 },
      ],
      rows: rows.map((row) => ({
        requestNumber: exportCell(row.requestNumber),
        employee: exportPersonName(row.employee),
        employeeEmail: exportCell(row.employee?.email),
        title: exportCell(row.title),
        itemCount: exportNumber(row.itemCount),
        warehouseLocation: exportCell(row.warehouseLocation),
        requiredByDate: exportDate(row.requiredByDate),
        projectCode: exportCell(row.project?.projectCode),
        status: exportEnumLabel(row.status),
        currentTier: exportCell(row.currentTierLabel),
        submittedAt: exportDateTime(row.submittedAt),
        createdAt: exportDateTime(row.createdAt),
      })),
    },
    {
      name: 'Items',
      columns: [
        { header: 'Request Number', key: 'requestNumber', width: 18 },
        { header: 'Employee', key: 'employee', width: 24 },
        { header: 'Item Name', key: 'itemName', width: 26 },
        { header: 'Item Code', key: 'itemCode', width: 16 },
        { header: 'Description', key: 'description', width: 34 },
        { header: 'Quantity', key: 'quantity', width: 12 },
        { header: 'Unit', key: 'unit', width: 12 },
      ],
      rows: rows.flatMap((row) =>
        (byId.get(row.id)?.items ?? []).map((item) => ({
          requestNumber: exportCell(row.requestNumber),
          employee: exportPersonName(row.employee),
          itemName: exportCell(item.itemName),
          itemCode: exportCell(item.itemCode),
          description: exportCell(item.description),
          quantity: exportNumber(item.quantity),
          unit: exportCell(item.unit),
        })),
      ),
    },
  ];
}

export function buildConsumablesRequisitionExportSheets(
  rows: ConsumablesRequisitionListItem[],
  details?: ConsumablesRequisitionDetail[],
): HrExportSheet[] {
  const byId = new Map((details ?? []).map((d) => [d.id, d] as const));

  return [
    {
      name: 'Consumables Requisitions',
      columns: [
        { header: 'Request Number', key: 'requestNumber', width: 18 },
        { header: 'Employee', key: 'employee', width: 24 },
        { header: 'Employee Email', key: 'employeeEmail', width: 28 },
        { header: 'Title', key: 'title', width: 30 },
        { header: 'Items', key: 'itemCount', width: 10 },
        { header: 'Department', key: 'department', width: 22 },
        { header: 'Required By', key: 'requiredByDate', width: 16 },
        { header: 'Status', key: 'status', width: 14 },
        { header: 'Current Tier', key: 'currentTier', width: 20 },
        { header: 'Submitted At', key: 'submittedAt', width: 18 },
        { header: 'Created At', key: 'createdAt', width: 18 },
      ],
      rows: rows.map((row) => ({
        requestNumber: exportCell(row.requestNumber),
        employee: exportPersonName(row.employee),
        employeeEmail: exportCell(row.employee?.email),
        title: exportCell(row.title),
        itemCount: exportNumber(row.itemCount),
        department: exportCell(row.department),
        requiredByDate: exportDate(row.requiredByDate),
        status: exportEnumLabel(row.status),
        currentTier: exportCell(row.currentTierLabel),
        submittedAt: exportDateTime(row.submittedAt),
        createdAt: exportDateTime(row.createdAt),
      })),
    },
    {
      name: 'Items',
      columns: [
        { header: 'Request Number', key: 'requestNumber', width: 18 },
        { header: 'Employee', key: 'employee', width: 24 },
        { header: 'Item Name', key: 'itemName', width: 26 },
        { header: 'Item Code', key: 'itemCode', width: 16 },
        { header: 'Model / Specification', key: 'modelSpec', width: 24 },
        { header: 'Description', key: 'description', width: 34 },
        { header: 'Quantity', key: 'quantity', width: 12 },
        { header: 'Unit', key: 'unit', width: 12 },
      ],
      rows: rows.flatMap((row) =>
        (byId.get(row.id)?.items ?? []).map((item) => ({
          requestNumber: exportCell(row.requestNumber),
          employee: exportPersonName(row.employee),
          itemName: exportCell(item.itemName),
          itemCode: exportCell(item.itemCode),
          modelSpec: exportCell(item.modelSpec),
          description: exportCell(item.description),
          quantity: exportNumber(item.quantity),
          unit: exportCell(item.unit),
        })),
      ),
    },
  ];
}
