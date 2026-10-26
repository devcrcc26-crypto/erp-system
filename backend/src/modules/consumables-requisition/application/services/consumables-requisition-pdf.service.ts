import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../../shared/prisma/prisma.service';
import { activeOnly } from '../../../../shared/prisma/soft-delete.util';
import {
  DOC_APPROVAL_INCLUDE,
  DOC_EMPLOYEE_SELECT,
  isoDate,
  renderDocumentPdf,
  safeFilePart,
} from '../../../../shared/pdf/document-pdf';

@Injectable()
export class ConsumablesRequisitionPdfService {
  constructor(private readonly prisma: PrismaService) {}

  async getPdf(
    id: string,
    companyId: string,
  ): Promise<{ buffer: Buffer; mimeType: string; filename: string }> {
    const req = await this.prisma.consumablesRequisition.findFirst({
      where: activeOnly({ id, companyId }),
      include: {
        employee: { select: DOC_EMPLOYEE_SELECT },
        items: {
          orderBy: { createdAt: 'asc' },
          select: {
            itemName: true,
            itemCode: true,
            modelSpec: true,
            description: true,
            quantity: true,
            unit: true,
          },
        },
        attachmentFolder: { include: { documents: { select: { name: true } } } },
        approvalRequest: DOC_APPROVAL_INCLUDE,
      },
    });
    if (!req) throw new NotFoundException('Consumables requisition not found');

    const totalQuantity = req.items.reduce((sum, item) => sum + Number(item.quantity), 0);

    const buffer = await renderDocumentPdf({
      title: 'Consumables Requisition',
      titleZh: '耗材申请',
      number: req.requestNumber,
      status: req.status,
      hero: {
        headline: req.title || 'Consumables / 耗材',
        caption: req.department ?? null,
        dateLabel: 'Required by / 需用日期',
        date: isoDate(req.requiredByDate),
      },
      employee: {
        person: req.employee,
        department: req.department ?? req.employee?.department?.name,
      },
      sections: [
        {
          title: 'Request / 申请',
          rows: [
            ['Title / 标题', req.title],
            ['Required by / 需用日期', isoDate(req.requiredByDate)],
            ['Declaration confirmed / 已确认声明', req.declarationConfirmed ? 'Yes / 是' : 'No / 否'],
          ],
          paragraphs: [['Purpose / 用途', req.purpose]],
        },
      ],
      tables: [
        {
          title: 'Items / 物品',
          columns: [
            { header: 'Item / 物品', weight: 4 },
            { header: 'Code / 编码', weight: 2 },
            { header: 'Qty / 数量', weight: 1.2, align: 'right' },
            { header: 'Unit / 单位', weight: 1.2 },
          ],
          rows: req.items.map((item) => ({
            cells: [item.itemName, item.itemCode, Number(item.quantity), item.unit],
            sub: [item.modelSpec, item.description].filter((part) => part?.trim()).join(' · ') || null,
          })),
          totals: [['Total quantity / 总数量', String(totalQuantity)]],
        },
      ],
      approvalTiers: req.approvalRequest?.tiers ?? [],
      documents: (req.attachmentFolder?.documents ?? []).map((doc) => doc.name),
      notes: [
        `Created ${isoDate(req.createdAt)}  ·  Submitted ${isoDate(req.submittedAt)}  ·  Completed ${isoDate(req.completedAt)}`,
        'This document is system-generated. / 本文件由系统生成。',
      ],
    });

    return {
      buffer,
      mimeType: 'application/pdf',
      filename: `consumables-requisition_${safeFilePart(req.requestNumber)}_${isoDate(new Date())}.pdf`,
    };
  }
}
