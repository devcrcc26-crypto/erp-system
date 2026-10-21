import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../../shared/prisma/prisma.service';
import { activeOnly } from '../../../../shared/prisma/soft-delete.util';
import { CW, fullName } from '../../../../shared/pdf/hr-pdf-renderer';
import {
  HrDocumentPdfService,
  HrDocumentPdfInput,
} from '../../../hr-shared/application/services/hr-document-pdf.service';

const d = (v: string | number | null | undefined): string =>
  v == null || v === '' ? '-' : String(v);

function monthsDiff(from: Date, to: Date): number {
  return (to.getFullYear() - from.getFullYear()) * 12 + (to.getMonth() - from.getMonth());
}

@Injectable()
export class CompanyAssetPdfService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly hrDocPdf: HrDocumentPdfService,
  ) {}

  async getPdf(
    id: string,
    companyId: string,
  ): Promise<{ buffer: Buffer; mimeType: string; filename: string }> {
    const record = await this.prisma.companyAsset.findFirst({
      where: activeOnly({ id, companyId }),
      include: {
        assetAssignments: {
          where: { returnedAt: null, deletedAt: null },
          include: {
            employee: { select: { firstName: true, lastName: true } },
          },
          take: 1,
          orderBy: { assignedAt: 'desc' },
        },
      },
    });
    if (!record) throw new NotFoundException('Company asset not found');

    const activeAssignment = record.assetAssignments[0] ?? null;
    const assignedTo = activeAssignment?.employee ?? null;
    const assignedAt = activeAssignment?.assignedAt ?? null;

    const subtitle = d(record.assetName) !== '-'
      ? d(record.assetName)
      : `${d(record.brand)} ${d(record.model)}`.trim();

    const requestNumber = (record.assetCode || record.serialNumber) ?? record.id;

    // Compute simple depreciation from stored fields
    const now = new Date();
    const originalValue = record.originalValue?.toNumber() ?? null;
    const usefulLifeMonths = record.usefulLifeMonths ?? null;
    const startUseDate = record.startUseDate;
    const monthsDepreciated = startUseDate ? Math.max(0, monthsDiff(startUseDate, now)) : null;
    const monthlyDepreciation =
      originalValue != null && usefulLifeMonths && usefulLifeMonths > 0
        ? originalValue / usefulLifeMonths
        : null;
    const accumulated =
      monthlyDepreciation != null && monthsDepreciated != null
        ? Math.min(monthlyDepreciation * monthsDepreciated, originalValue ?? 0)
        : null;
    const netValue =
      originalValue != null && accumulated != null ? originalValue - accumulated : null;
    const depreciationPct =
      originalValue != null && originalValue > 0 && accumulated != null
        ? (accumulated / originalValue) * 100
        : null;

    const etb = (v: number | null): string =>
      v == null
        ? '-'
        : `${v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ETB`;

    const input: HrDocumentPdfInput = {
      documentTitle: 'Company Asset Card',
      subtitle,
      requestNumber,
      preparedBy: 'HR Department',
      sections: [
        {
          title: 'Identification',
          rows: [
            ['Serial Number', d(record.serialNumber)],
            ['Asset Code', d(record.assetCode)],
            ['Card Number', d(record.cardNumber)],
            ['Asset Name', d(record.assetName)],
            ['Status', d(record.status)],
            ['Type', d(record.type)],
            ['Asset Category', d(record.assetCategory)],
          ],
        },
        {
          title: 'Specification',
          rows: [
            ['Brand', d(record.brand)],
            ['Model', d(record.model)],
            ['Year', d(record.year)],
            ['Color', d(record.color)],
            ['Specifications', d(record.specifications)],
            ['Description', d(record.description)],
          ],
        },
        {
          title: 'Custody',
          rows: [
            ['Assigned To', fullName(assignedTo) || 'Unassigned'],
            ['Assigned At', assignedAt ? new Date(assignedAt).toISOString().slice(0, 10) : '-'],
            ['Managing Department', d(record.managingDepartment)],
            ['Storage Location', d(record.storageLocation)],
          ],
        },
      ],
      itemsTable: {
        title: 'Ledger & Depreciation (ETB)',
        headers: ['Measure', 'Value'],
        rows: [
          ['Start Use Date', startUseDate ? new Date(startUseDate).toISOString().slice(0, 10) : '-'],
          ['Useful Life (Months)', d(usefulLifeMonths)],
          ['Original Value', etb(originalValue)],
          ['Months Depreciated', d(monthsDepreciated)],
          ['Monthly Depreciation', etb(monthlyDepreciation)],
          ['Accumulated Depreciation', etb(accumulated)],
          ['Net Value', etb(netValue)],
          ['Depreciation %', depreciationPct != null ? `${depreciationPct.toFixed(1)}%` : '-'],
        ],
        colWidths: [CW * 0.6, CW * 0.4],
      },
    };

    const buffer = await this.hrDocPdf.render(input);
    const safe = requestNumber.replace(/[^a-zA-Z0-9-_]/g, '_');
    const dateStamp = now.toISOString().slice(0, 10);
    return {
      buffer,
      mimeType: 'application/pdf',
      filename: `company-asset_${safe}_${dateStamp}.pdf`,
    };
  }
}
