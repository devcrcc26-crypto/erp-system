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
export class ConsumablesRequisitionPdfService {
  constructor(private readonly prisma: PrismaService) {}

  async getPdf(
    id: string,
    companyId: string,
  ): Promise<{ buffer: Buffer; mimeType: string; filename: string }> {
    const req = await this.prisma.consumablesRequisition.findFirst({
      where: activeOnly({ id, companyId }),
      include: {
        employee: { select: { firstName: true, lastName: true } },
        items: {
          orderBy: { createdAt: 'asc' },
          select: { itemName: true, itemCode: true, modelSpec: true, description: true, quantity: true, unit: true },
        },
      },
    });
    if (!req) throw new NotFoundException('Consumables requisition not found');

    const fontPath = resolveFontPath();
    const generatedAt = new Date();
    const doc = createDoc('Consumables Requisition');
    const footerLeft = `${COMPANY_NAME} — Consumables Requisition ${(req as any).requestNumber}`;

    const buffer = await docToBuffer(doc, fontPath, (d) => {
      let y = drawPageHeader(d, COMPANY_NAME, 'Consumables Requisition');
      y = drawMeta(d, y, fmtTs(generatedAt), fullName(req.employee));
      y += 6;

      y = ensureSpace(d, y, 40);
      y = drawSectionTitle(d, 'Overview', y);
      y = drawKvTable(d, [
        ['Request Number', (req as any).requestNumber],
        ['Status', req.status],
        ['Employee', fullName(req.employee)],
        ['Title', dash((req as any).title)],
        ['Purpose', dash((req as any).purpose)],
        ['Department', dash((req as any).department)],
        ['Required By', fmtDate((req as any).requiredByDate)],
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
        dash(item.modelSpec),
        dash(item.description),
        String(item.quantity),
        dash(item.unit),
      ]);
      const colW = [CW * 0.2, CW * 0.15, CW * 0.15, CW * 0.25, CW * 0.1, CW * 0.15];
      y = drawItemsTable(
        d,
        ['Item Name', 'Item Code', 'Model/Spec', 'Description', 'Qty', 'Unit'],
        itemRows,
        colW,
        y,
      );
    }, footerLeft);

    const safe = ((req as any).requestNumber as string).replace(/[^a-zA-Z0-9-_]/g, '_');
    const dateStamp = generatedAt.toISOString().slice(0, 10);
    return {
      buffer,
      mimeType: 'application/pdf',
      filename: `consumables-requisition_${safe}_${dateStamp}.pdf`,
    };
  }
}
