import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../../shared/prisma/prisma.service';
import { activeOnly } from '../../../../shared/prisma/soft-delete.util';
import { fmtEtb } from '../../../../shared/pdf/payslip-style-pdf';
import {
  DOC_EMPLOYEE_SELECT,
  humanize,
  isoDate,
  safeFilePart,
} from '../../../../shared/pdf/document-pdf';
import { HrDocumentPdfService } from '../../../hr-shared/application/services/hr-document-pdf.service';

function monthsDiff(from: Date, to: Date): number {
  return (to.getFullYear() - from.getFullYear()) * 12 + (to.getMonth() - from.getMonth());
}

function etb(value: number | null): string {
  return value == null ? '-' : `ETB ${fmtEtb(value)}`;
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
          include: { employee: { select: DOC_EMPLOYEE_SELECT } },
          take: 1,
          orderBy: { assignedAt: 'desc' },
        },
      },
    });
    if (!record) throw new NotFoundException('Company asset not found');

    const activeAssignment = record.assetAssignments[0] ?? null;
    const holder = activeAssignment?.employee ?? null;
    const number = (record.assetCode || record.serialNumber) ?? record.id;
    const headline = record.assetName?.trim() || `${record.brand ?? ''} ${record.model ?? ''}`.trim() || 'Company asset / 公司资产';

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
    const netValue = originalValue != null && accumulated != null ? originalValue - accumulated : null;
    const depreciationPct =
      originalValue != null && originalValue > 0 && accumulated != null
        ? (accumulated / originalValue) * 100
        : null;

    const buffer = await this.hrDocPdf.render({
      title: 'Company Asset Card',
      titleZh: '公司资产卡',
      number,
      status: record.status,
      hero: {
        headline,
        caption: [humanize(record.type), humanize(record.assetCategory)]
          .filter((part) => part !== '-')
          .join('  ·  ') || null,
        dateLabel: 'In use since / 启用日期',
        date: isoDate(startUseDate),
      },
      // The asset's current holder, when it is assigned to someone.
      employee: holder
        ? {
            person: holder,
            department: holder.department?.name,
            extraRows: [['Assigned on / 领用日期', isoDate(activeAssignment?.assignedAt)]],
          }
        : undefined,
      sections: [
        {
          title: 'Identification / 识别信息',
          rows: [
            ['Serial number / 序列号', record.serialNumber],
            ['Asset code / 资产编码', record.assetCode],
            ['Card number / 卡片编号', record.cardNumber],
            ['Asset name / 资产名称', record.assetName],
            ['Type / 类型', humanize(record.type)],
            ['Category / 类别', humanize(record.assetCategory)],
            ...(holder ? [] : ([['Assigned to / 领用人', 'Unassigned / 未分配']] as const)),
          ],
        },
        {
          title: 'Specification / 规格',
          rows: [
            ['Brand / 品牌', record.brand],
            ['Model / 型号', record.model],
            ['Year / 年份', record.year],
            ['Color / 颜色', record.color],
          ],
          paragraphs: [
            ['Specifications / 规格说明', record.specifications],
            ['Description / 说明', record.description],
          ],
        },
        {
          title: 'Custody / 保管',
          rows: [
            ['Managing department / 管理部门', record.managingDepartment],
            ['Storage location / 存放地点', record.storageLocation],
          ],
        },
      ],
      tables: [
        {
          title: 'Ledger & depreciation / 账面与折旧',
          numbered: false,
          columns: [
            { header: 'Measure / 项目', weight: 3 },
            { header: 'Value / 数值', weight: 2, align: 'right' },
          ],
          rows: [
            { cells: ['Start use date / 启用日期', isoDate(startUseDate)] },
            { cells: ['Useful life (months) / 使用年限（月）', usefulLifeMonths] },
            { cells: ['Original value / 原值', etb(originalValue)] },
            { cells: ['Months depreciated / 已折旧月数', monthsDepreciated] },
            { cells: ['Monthly depreciation / 月折旧额', etb(monthlyDepreciation)] },
            { cells: ['Accumulated depreciation / 累计折旧', etb(accumulated)] },
            {
              cells: [
                'Depreciation / 折旧率',
                depreciationPct != null ? `${depreciationPct.toFixed(1)}%` : '-',
              ],
            },
          ],
          totals: [['Net value / 净值', etb(netValue)]],
        },
      ],
    });

    return {
      buffer,
      mimeType: 'application/pdf',
      filename: `company-asset_${safeFilePart(number)}_${isoDate(now)}.pdf`,
    };
  }
}
