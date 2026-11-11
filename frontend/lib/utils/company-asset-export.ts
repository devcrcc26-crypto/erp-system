import type {
  CompanyAssetDetail,
  CompanyAssetListItem,
} from '@/lib/api/company-asset.types';
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
import { exportHrDocumentPdf } from '@/lib/utils/hr-document-pdf';

/**
 * Excel and PDF exports for the company asset register.
 *
 * Assets have no line items, so the workbook is a single sheet; the PDF is an
 * asset card carrying the register, ledger and depreciation figures.
 */

export function buildCompanyAssetExportSheets(
  rows: CompanyAssetListItem[],
): HrExportSheet[] {
  return [
    {
      name: 'Company Assets',
      columns: [
        { header: 'Serial Number', key: 'serialNumber', width: 22 },
        { header: 'Asset Name', key: 'assetName', width: 26 },
        { header: 'Asset Code', key: 'assetCode', width: 18 },
        { header: 'Card Number', key: 'cardNumber', width: 18 },
        { header: 'Brand', key: 'brand', width: 18 },
        { header: 'Model', key: 'model', width: 20 },
        { header: 'Year', key: 'year', width: 10 },
        { header: 'Color', key: 'color', width: 14 },
        { header: 'Type', key: 'type', width: 18 },
        { header: 'Asset Category', key: 'assetCategory', width: 22 },
        { header: 'Specifications', key: 'specifications', width: 32 },
        { header: 'Status', key: 'status', width: 14 },
        { header: 'Assigned To', key: 'assignedTo', width: 24 },
        { header: 'Assigned At', key: 'assignedAt', width: 16 },
        { header: 'Managing Department', key: 'managingDepartment', width: 24 },
        { header: 'Storage Location', key: 'storageLocation', width: 24 },
        { header: 'Start Use Date', key: 'startUseDate', width: 16 },
        { header: 'Useful Life (Months)', key: 'usefulLifeMonths', width: 20 },
        { header: 'Original Value (ETB)', key: 'originalValue', width: 20 },
        { header: 'Months Depreciated', key: 'monthsDepreciated', width: 20 },
        {
          header: 'Monthly Depreciation (ETB)',
          key: 'monthlyDepreciation',
          width: 24,
        },
        {
          header: 'Accumulated Depreciation (ETB)',
          key: 'accumulatedDepreciation',
          width: 28,
        },
        { header: 'Net Value (ETB)', key: 'netValue', width: 18 },
        { header: 'Depreciation %', key: 'depreciationPercent', width: 16 },
        { header: 'Description', key: 'description', width: 32 },
        { header: 'Created At', key: 'createdAt', width: 18 },
      ],
      rows: rows.map((row) => ({
        serialNumber: exportCell(row.serialNumber),
        assetName: exportCell(row.assetName),
        assetCode: exportCell(row.assetCode),
        cardNumber: exportCell(row.cardNumber),
        brand: exportCell(row.brand),
        model: exportCell(row.model),
        year: exportNumber(row.year),
        color: exportCell(row.color),
        type: exportCell(row.type),
        assetCategory: exportCell(row.assetCategory),
        specifications: exportCell(row.specifications),
        status: exportEnumLabel(row.status),
        assignedTo: exportPersonName(row.assignedTo),
        assignedAt: exportDate(row.assignedAt),
        managingDepartment: exportCell(row.managingDepartment),
        storageLocation: exportCell(row.storageLocation),
        startUseDate: exportDate(row.startUseDate),
        usefulLifeMonths: exportNumber(row.usefulLifeMonths),
        originalValue: exportEtb(row.originalValue),
        monthsDepreciated: exportNumber(row.monthsDepreciated),
        monthlyDepreciation: exportEtb(row.monthlyDepreciation),
        accumulatedDepreciation: exportEtb(row.accumulatedDepreciation),
        netValue: exportEtb(row.netValue),
        depreciationPercent: exportNumber(row.depreciationPercent),
        description: exportCell(row.description),
        createdAt: exportDateTime(row.createdAt),
      })),
    },
  ];
}

/**
 * Renders a single asset as a printable asset card PDF.
 */
export async function exportCompanyAssetPdf(input: {
  asset: CompanyAssetDetail;
  companyName?: string;
  preparedBy: string;
}): Promise<void> {
  const { asset, companyName, preparedBy } = input;

  await exportHrDocumentPdf({
    documentTitle: 'Company Asset Card',
    subtitle: asset.assetName ?? `${asset.brand} ${asset.model}`.trim(),
    requestNumber: asset.assetCode || asset.serialNumber,
    companyName,
    preparedBy,
    fileNamePrefix: 'company-asset',
    sections: [
      {
        title: 'Identification',
        fields: [
          { label: 'Serial Number', value: asset.serialNumber },
          { label: 'Asset Code', value: asset.assetCode },
          { label: 'Card Number', value: asset.cardNumber },
          { label: 'Asset Name', value: asset.assetName },
          { label: 'Status', value: exportEnumLabel(asset.status) },
          { label: 'Type', value: asset.type },
          { label: 'Asset Category', value: asset.assetCategory },
        ],
      },
      {
        title: 'Specification',
        fields: [
          { label: 'Brand', value: asset.brand },
          { label: 'Model', value: asset.model },
          { label: 'Year', value: asset.year },
          { label: 'Color', value: asset.color },
          { label: 'Specifications', value: asset.specifications },
          { label: 'Description', value: asset.description },
        ],
      },
      {
        title: 'Custody',
        fields: [
          {
            label: 'Assigned To',
            value: exportPersonName(asset.assignedTo) || 'Unassigned',
          },
          { label: 'Assigned At', value: exportDate(asset.assignedAt) },
          { label: 'Managing Department', value: asset.managingDepartment },
          { label: 'Storage Location', value: asset.storageLocation },
        ],
      },
    ],
    itemsTable: {
      title: 'Ledger & Depreciation (ETB)',
      head: ['Measure', 'Value'],
      rows: [
        ['Start Use Date', exportDate(asset.startUseDate)],
        ['Useful Life (Months)', exportNumber(asset.usefulLifeMonths)],
        ['Original Value', exportEtb(asset.originalValue)],
        ['Months Depreciated', exportNumber(asset.monthsDepreciated)],
        ['Monthly Depreciation', exportEtb(asset.monthlyDepreciation)],
        ['Accumulated Depreciation', exportEtb(asset.accumulatedDepreciation)],
        ['Net Value', exportEtb(asset.netValue)],
        ['Depreciation %', exportNumber(asset.depreciationPercent)],
      ],
      numericColumns: [1],
    },
    footerNote:
      'All monetary values are in ETB. Depreciation is calculated straight-line from the start use date.',
  });
}
