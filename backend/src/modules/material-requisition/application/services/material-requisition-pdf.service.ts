import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../../shared/prisma/prisma.service';
import { activeOnly } from '../../../../shared/prisma/soft-delete.util';
import {
  CW,
  createDoc,
  dash,
  docToBuffer,
  drawItemsTable,
  drawKvTable,
  drawMeta,
  drawPageHeader,
  drawSectionTitle,
  ensureSpace,
  fmtDate,
  fmtTs,
  fullName,
  resolveFontPath,
} from '../../../../shared/pdf/hr-pdf-renderer';

const COMPANY_NAME = 'CRCC International Consulting';

@Injectable()
export class MaterialRequisitionPdfService {
  constructor(private readonly prisma: PrismaService) {}

  async getPdf(
    id: string,
    companyId: string,
  ): Promise<{ buffer: Buffer; mimeType: string; filename: string }> {
    const req = await this.prisma.materialRequisition.findFirst({
      where: activeOnly({ id, companyId }),
      include: {
        employee: { select: { firstName: true, lastName: true } },
        project: { select: { projectCode: true, name: true } },
        items: {
          orderBy: { createdAt: 'asc' },
          select: { itemName: true, itemCode: true, description: true, quantity: true, unit: true },
        },
        attachmentFolder: { include: { documents: { select: { name: true } } } },
      },
    });
    if (!req) throw new NotFoundException('Material requisition not found');

    const fontPath = resolveFontPath();
    const generatedAt = new Date();
    const doc = createDoc('Material Requisition');
    const footerLeft = `${COMPANY_NAME} — Material Requisition ${(req as any).requestNumber}`;

    const buffer = await docToBuffer(doc, fontPath, (d) => {
      let y = drawPageHeader(d, COMPANY_NAME, 'Material Requisition');
      y = drawMeta(d, y, fmtTs(generatedAt), fullName(req.employee));
      y += 6;

      const projectLabel = req.project
        ? [req.project.projectCode, req.project.name].filter(Boolean).join(' – ')
        : '-';

      y = ensureSpace(d, y, 40);
      y = drawSectionTitle(d, 'Overview', y);
      y = drawKvTable(d, [
        ['Request Number', (req as any).requestNumber],
        ['Status', req.status],
        ['Employee', fullName(req.employee)],
        ['Title', dash((req as any).title)],
        ['Purpose', dash((req as any).purpose)],
        ['Warehouse Location', dash((req as any).warehouseLocation)],
        ['Required By', fmtDate((req as any).requiredByDate)],
        ['Project', projectLabel],
        ['Item Count', String((req as any).itemCount ?? req.items.length)],
        ['Submitted At', (req as any).submittedAt ? fmtDate((req as any).submittedAt) : '-'],
        ['Created At', fmtDate(req.createdAt)],
      ], y);
      y += 8;

      y = ensureSpace(d, y, 40);
      y = drawSectionTitle(d, 'Items', y);
      const itemRows = req.items.map((item) => [
        dash(item.itemName),
        dash(item.itemCode),
        dash(item.description),
        String(item.quantity),
        dash(item.unit),
      ]);
      const colW = [CW * 0.25, CW * 0.2, CW * 0.3, CW * 0.12, CW * 0.13];
      y = drawItemsTable(d, ['Item Name', 'Item Code', 'Description', 'Qty', 'Unit'], itemRows, colW, y);
      y += 8;

      const docs = req.attachmentFolder?.documents ?? [];
      if (docs.length > 0) {
        y = ensureSpace(d, y, 30);
        y = drawSectionTitle(d, 'Documents', y);
        y = drawItemsTable(d, ['Document Name'], docs.map((doc) => [doc.name]), [CW], y);
      }
    }, footerLeft);

    const safe = ((req as any).requestNumber as string).replace(/[^a-zA-Z0-9-_]/g, '_');
    const dateStamp = generatedAt.toISOString().slice(0, 10);
    return {
      buffer,
      mimeType: 'application/pdf',
      filename: `material-requisition_${safe}_${dateStamp}.pdf`,
    };
  }
}
