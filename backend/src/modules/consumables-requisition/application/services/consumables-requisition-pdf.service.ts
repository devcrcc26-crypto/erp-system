import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../../shared/prisma/prisma.service';
import { activeOnly } from '../../../../shared/prisma/soft-delete.util';
import {
  bilingualTitle,
  dash,
  fmtDate,
  fmtGeneratedDate,
  fullName,
  renderPayslipPdf,
} from '../../../../shared/pdf/payslip-style-pdf';

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
          select: {
            itemName: true,
            itemCode: true,
            modelSpec: true,
            description: true,
            quantity: true,
            unit: true,
          },
        },
      },
    });
    if (!req) throw new NotFoundException('Consumables requisition not found');

    const generatedAt = new Date();
    const requestNumber = String(
      (req as { requestNumber?: string }).requestNumber ?? id,
    );

    const buffer = await renderPayslipPdf(
      { title: 'Consumables Requisition' },
      (p) => {
        p.brand(bilingualTitle('Consumables Requisition', '耗材申请'));
        p.subtitleRight(requestNumber);
        p.rule();

        p.section('OVERVIEW');
        p.fields([
          ['Request Number', requestNumber],
          ['Status', req.status],
          ['Employee', fullName(req.employee)],
          ['Title', dash((req as { title?: string }).title)],
          ['Purpose', dash((req as { purpose?: string }).purpose)],
          ['Department', dash((req as { department?: string }).department)],
          [
            'Required By',
            fmtDate((req as { requiredByDate?: Date }).requiredByDate),
          ],
          [
            'Item Count',
            String(
              (req as { itemCount?: number }).itemCount ?? req.items.length,
            ),
          ],
          [
            'Submitted At',
            (req as { submittedAt?: Date }).submittedAt
              ? fmtDate((req as { submittedAt?: Date }).submittedAt)
              : '-',
          ],
          ['Created At', fmtDate(req.createdAt)],
        ]);

        p.rule();
        p.section('ITEMS', 'Qty');
        if (req.items.length === 0) {
          p.line('No items recorded', { indent: 1, color: '#333333' });
        } else {
          for (const item of req.items) {
            p.field(
              dash(item.itemName),
              `${item.quantity} ${dash(item.unit)}`,
              1,
            );
            p.wrapped(
              [dash(item.itemCode), dash(item.modelSpec), dash(item.description)]
                .filter((part) => part !== '-')
                .join(' · ') || '-',
              { indent: 24, size: 8 },
            );
          }
        }

        p.footerNotes([
          `Generated ${fmtGeneratedDate(generatedAt)}`,
          'This consumables requisition is system-generated.',
        ]);
      },
    );

    const safe = requestNumber.replace(/[^a-zA-Z0-9-_]/g, '_');
    const dateStamp = generatedAt.toISOString().slice(0, 10);
    return {
      buffer,
      mimeType: 'application/pdf',
      filename: `consumables-requisition_${safe}_${dateStamp}.pdf`,
    };
  }
}
