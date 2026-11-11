import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../../shared/prisma/prisma.service';
import { activeOnly } from '../../../../shared/prisma/soft-delete.util';
import { fmtEtb } from '../../../../shared/pdf/payslip-style-pdf';
import {
  DOC_APPROVAL_INCLUDE,
  DOC_EMPLOYEE_SELECT,
  isoDate,
  renderDocumentPdf,
  safeFilePart,
} from '../../../../shared/pdf/document-pdf';

function formatQuantity(value: number): string {
  if (!Number.isFinite(value)) return '-';
  const rounded = Math.round(value * 100) / 100;
  if (Number.isInteger(rounded)) return String(rounded);
  return rounded.toFixed(2).replace(/\.?0+$/, '');
}

@Injectable()
export class PurchaseRequestPdfService {
  constructor(private readonly prisma: PrismaService) {}

  async getPdf(
    id: string,
    companyId: string,
  ): Promise<{ buffer: Buffer; mimeType: string; filename: string }> {
    const request = await this.prisma.purchaseRequest.findFirst({
      where: activeOnly({ id, companyId }),
      include: {
        employee: { select: DOC_EMPLOYEE_SELECT },
        items: {
          orderBy: { createdAt: 'asc' },
          select: {
            itemName: true,
            description: true,
            modelSpec: true,
            quantity: true,
            unit: true,
            unitPrice: true,
            totalPriceEtb: true,
          },
        },
        attachmentFolder: { include: { documents: { select: { name: true } } } },
        approvalRequest: DOC_APPROVAL_INCLUDE,
      },
    });
    if (!request) throw new NotFoundException('Purchase request not found');

    const buffer = await renderDocumentPdf({
      title: 'Purchase Request',
      titleZh: '采购申请',
      number: request.requestNumber,
      status: request.status,
      hero: {
        headline: request.title || 'Purchase / 采购',
        caption: request.vendorName ? `Vendor / 供应商: ${request.vendorName}` : null,
        dateLabel: 'Required by / 需用日期',
        date: isoDate(request.requiredByDate),
      },
      employee: { person: request.employee, department: request.employee?.department?.name },
      sections: [
        {
          title: 'Vendor / 供应商',
          rows: [
            ['Name / 名称', request.vendorName],
            ['Phone / 电话', request.vendorPhone],
            ['Email / 邮箱', request.vendorEmail],
          ],
        },
        {
          title: 'Request / 申请',
          rows: [
            ['Title / 标题', request.title],
            ['Required by / 需用日期', isoDate(request.requiredByDate)],
          ],
          paragraphs: [['Justification / 事由', request.justification]],
        },
      ],
      tables: [
        {
          title: 'Items / 明细',
          columns: [
            { header: 'Item / 物品', weight: 4 },
            { header: 'Qty / 数量', weight: 1.1, align: 'right' },
            { header: 'Unit / 单位', weight: 1.1 },
            { header: 'Unit price / 单价', weight: 1.6, align: 'right' },
            { header: 'Total (ETB) / 金额', weight: 1.8, align: 'right' },
          ],
          rows: request.items.map((item) => ({
            cells: [
              item.itemName,
              formatQuantity(Number(item.quantity)),
              item.unit,
              fmtEtb(item.unitPrice),
              fmtEtb(item.totalPriceEtb),
            ],
            sub: [item.description, item.modelSpec].filter((part) => part?.trim()).join(' · ') || null,
          })),
          totals: [['Total / 合计', `ETB ${fmtEtb(request.totalEstimatedEtb)}`]],
        },
      ],
      approvalTiers: request.approvalRequest?.tiers ?? [],
      documents: (request.attachmentFolder?.documents ?? []).map((doc) => doc.name),
      notes: [
        `Created ${isoDate(request.createdAt)}  ·  Submitted ${isoDate(request.submittedAt)}`,
        'This document is system-generated. / 本文件由系统生成。',
      ],
    });

    return {
      buffer,
      mimeType: 'application/pdf',
      filename: `purchase-request_${safeFilePart(request.requestNumber)}_${isoDate(new Date())}.pdf`,
    };
  }
}
