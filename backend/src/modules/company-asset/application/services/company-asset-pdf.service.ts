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

const etb = (v: number | null | undefined): string =>
  v == null ? '-' : `${v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ETB`;

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
        assignedTo: { select: { firstName: true, lastName: true } },
      },
    });
    if (!record) throw new NotFoundException('Company asset not found');

    const subtitle = d(record.assetName) !== '-'
      ? d(record.assetName)
      : `${d(record.brand)} ${d(record.model)}`.trim();

    const requestNumber = d(record.assetCode) !== '-' ? d(record.assetCode) : d(record.serialNumber);

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
            ['Assigned To', fullName(record.assignedTo) || 'Unassigned'],
            ['Assigned At', record.assignedAt ? new Date(record.assignedAt).toISOString().slice(0, 10) : '-'],
            ['Managing Department', d(record.managingDepartment)],
            ['Storage Location', d(record.storageLocation)],
          ],
        },
      ],
      itemsTable: {
        title: 'Ledger & Depreciation (ETB)',
        headers: ['Measure', 'Value'],
        rows: [
          ['Start Use Date', record.startUseDate ? new Date(record.startUseDate).toISOString().slice(0, 10) : '-'],
          ['Useful Life (Months)', d(record.usefulLifeMonths)],
          ['Original Value', etb(record.originalValue)],
          ['Months Depreciated', d(record.monthsDepreciated)],
          ['Monthly Depreciation', etb(record.monthlyDepreciation)],
          ['Accumulated Depreciation', etb(record.accumulatedDepreciation)],
          ['Net Value', etb(record.netValue)],
          ['Depreciation %', record.depreciationPercent != null ? `${record.depreciationPercent}%` : '-'],
        ],
        colWidths: [CW * 0.6, CW * 0.4],
      },
    };

    const buffer = await this.hrDocPdf.render(input);
    const safe = requestNumber.replace(/[^a-zA-Z0-9-_]/g, '_');
    const dateStamp = new Date().toISOString().slice(0, 10);
    return {
      buffer,
      mimeType: 'application/pdf',
      filename: `company-asset_${safe}_${dateStamp}.pdf`,
    };
  }
}
