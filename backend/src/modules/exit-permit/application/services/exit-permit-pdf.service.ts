import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../../shared/prisma/prisma.service';
import { activeOnly } from '../../../../shared/prisma/soft-delete.util';
import { fullName } from '../../../../shared/pdf/hr-pdf-renderer';
import {
  HrDocumentPdfService,
  HrDocumentPdfInput,
} from '../../../hr-shared/application/services/hr-document-pdf.service';

const d = (v: string | number | null | undefined): string =>
  v == null || v === '' ? '-' : String(v);

@Injectable()
export class ExitPermitPdfService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly hrDocPdf: HrDocumentPdfService,
  ) {}

  async getPdf(
    id: string,
    companyId: string,
  ): Promise<{ buffer: Buffer; mimeType: string; filename: string }> {
    const record = await this.prisma.exitPermit.findFirst({
      where: activeOnly({ id, companyId }),
      include: {
        employee: { select: { firstName: true, lastName: true, email: true } },
        creator: { select: { firstName: true, lastName: true } },
        submitter: { select: { firstName: true, lastName: true } },
        department: { select: { name: true } },
        items: { orderBy: { createdAt: 'asc' } },
      },
    });
    if (!record) throw new NotFoundException('Exit permit not found');

    const isApproved = record.status === 'APPROVED';
    const documentTitle = isApproved
      ? 'Approved Gate Pass — Equipment & Materials'
      : 'Equipment & Materials Exit Permit';

    const direction = record.direction ?? '';
    const date = record.date
      ? new Date(record.date).toISOString().slice(0, 10)
      : '-';
    const subtitle = `${direction} - ${date}`;

    const input: HrDocumentPdfInput = {
      documentTitle,
      subtitle,
      requestNumber: record.requestNumber,
      preparedBy: fullName(record.employee) || 'HR Department',
      sections: [
        {
          title: 'Permit',
          rows: [
            ['Request Number', d(record.requestNumber)],
            ['Status', d(record.status)],
            ['Direction', direction || '-'],
            ['Date', date],
            ['Employee', fullName(record.employee) || '-'],
            ['Employee Email', d(record.employee?.email)],
            ['Department', d(record.department?.name)],
          ],
        },
        {
          title: 'Record',
          rows: [
            ['Filed On Behalf', record.isOnBehalf ? 'Yes' : 'No'],
            ['Created By', fullName(record.creator) || '-'],
            ['Created', record.createdAt ? new Date(record.createdAt).toISOString().slice(0, 10) : '-'],
            ['Submitted By', fullName(record.submitter) || '-'],
            ['Submitted', record.submittedAt ? new Date(record.submittedAt).toISOString().slice(0, 10) : '-'],
            ['Completed', record.completedAt ? new Date(record.completedAt).toISOString().slice(0, 10) : '-'],
          ],
        },
      ],
      itemsTable: {
        title: 'Items',
        headers: ['No.', 'Item Name', 'Issue', 'Quantity', 'Unit'],
        rows: (record.items ?? []).map((item, index) => [
          String(index + 1),
          d(item.itemName),
          d(item.issue),
          item.quantity != null ? String(item.quantity) : '-',
          d(item.unit),
        ]),
      },
    };

    const buffer = await this.hrDocPdf.render(input);
    const safe = record.requestNumber.replace(/[^a-zA-Z0-9-_]/g, '_');
    const dateStamp = new Date().toISOString().slice(0, 10);
    return {
      buffer,
      mimeType: 'application/pdf',
      filename: `exit-permit_${safe}_${dateStamp}.pdf`,
    };
  }
}
