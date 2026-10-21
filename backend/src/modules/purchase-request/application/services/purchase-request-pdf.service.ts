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
  fmtEtb,
  fmtTs,
  fullName,
  resolveFontPath,
} from '../../../../shared/pdf/hr-pdf-renderer';

const COMPANY_NAME = 'CRCC International Consulting';

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
        employee: { select: { firstName: true, lastName: true } },
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
        attachmentFolder: {
          include: { documents: { select: { name: true } } },
        },
      },
    });
    if (!request) throw new NotFoundException('Purchase request not found');

    const fontPath = resolveFontPath();
    const generatedAt = new Date();
    const doc = createDoc('Purchase Request');
    const footerLeft = `${COMPANY_NAME} — Purchase Request ${request.requestNumber}`;

    const buffer = await docToBuffer(doc, fontPath, (d) => {
      let y = drawPageHeader(d, COMPANY_NAME, 'Purchase Request');
      y = drawMeta(d, y, fmtTs(generatedAt), fullName(request.employee));
      y += 6;

      y = ensureSpace(d, y, 40);
      y = drawSectionTitle(d, 'Overview', y);
      y = drawKvTable(d, [
        ['Request Number', request.requestNumber],
        ['Status', request.status],
        ['Employee', fullName(request.employee)],
        ['Title', dash(request.title)],
        ['Justification', dash(request.justification)],
        ['Vendor', dash(request.vendorName)],
        ['Vendor Email', dash(request.vendorEmail)],
        ['Vendor Phone', dash(request.vendorPhone)],
        ['Required By', fmtDate(request.requiredByDate)],
        ['Item Count', String((request as any).itemCount ?? request.items.length)],
        ['Estimated Total', fmtEtb(request.totalEstimatedEtb)],
        ['Submitted At', request.submittedAt ? fmtDate(request.submittedAt) : '-'],
        ['Created At', fmtDate(request.createdAt)],
      ], y);
      y += 8;

      y = ensureSpace(d, y, 40);
      y = drawSectionTitle(d, 'Items', y);
      const itemRows = request.items.map((item) => [
        dash(item.itemName),
        dash(item.description ?? (item as any).modelSpec),
        String(item.quantity),
        dash(item.unit),
        fmtEtb(item.unitPrice),
        fmtEtb(item.totalPriceEtb),
      ]);
      const itemCols = [CW * 0.22, CW * 0.28, CW * 0.08, CW * 0.1, CW * 0.16, CW * 0.16];
      y = drawItemsTable(d, ['Item', 'Description', 'Qty', 'Unit', 'Unit Price', 'Total'], itemRows, itemCols, y);
      y += 8;

      const docs = (request.attachmentFolder?.documents ?? []).map((doc) => doc.name);
      if (docs.length > 0) {
        y = ensureSpace(d, y, 30);
        y = drawSectionTitle(d, 'Documents', y);
        y = drawItemsTable(d, ['Document Name'], docs.map((n) => [n]), [CW], y);
      }
    }, footerLeft);

    const safe = request.requestNumber.replace(/[^a-zA-Z0-9-_]/g, '_');
    const dateStamp = generatedAt.toISOString().slice(0, 10);
    return {
      buffer,
      mimeType: 'application/pdf',
      filename: `purchase-request_${safe}_${dateStamp}.pdf`,
    };
  }
}
