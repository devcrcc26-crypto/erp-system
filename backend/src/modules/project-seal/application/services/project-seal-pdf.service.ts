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

@Injectable()
export class ProjectSealPdfService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly hrDocPdf: HrDocumentPdfService,
  ) {}

  async getPdf(
    id: string,
    companyId: string,
  ): Promise<{ buffer: Buffer; mimeType: string; filename: string }> {
    const record = await this.prisma.projectSeal.findFirst({
      where: activeOnly({ id, companyId }),
      include: {
        employee: { select: { firstName: true, lastName: true, email: true } },
        issuer: { select: { firstName: true, lastName: true } },
        sealedDocument: { select: { name: true } },
        attachmentFolder: {
          include: { documents: { select: { name: true, fileType: true } } },
        },
      },
    });
    if (!record) throw new NotFoundException('Project seal request not found');

    const attachments = record.attachmentFolder?.documents ?? [];

    const input: HrDocumentPdfInput = {
      documentTitle: 'Project Seal Usage Request',
      subtitle: d(record.fileName),
      requestNumber: record.requestNumber,
      preparedBy: fullName(record.employee),
      sections: [
        {
          title: 'Request',
          rows: [
            ['Request Number', record.requestNumber],
            ['Status', record.status],
            ['Employee', fullName(record.employee)],
            ['Employee Email', d(record.employee?.email)],
            ['Urgency', d(record.urgency)],
            ['Date Needed', record.dateNeeded ? new Date(record.dateNeeded).toISOString().slice(0, 10) : '-'],
          ],
        },
        {
          title: 'Document',
          rows: [
            ['Document Name', d(record.fileName)],
            ['Seal Category', d(record.sealCategory)],
            ['Copy Count', d(record.copyCount)],
            ['Description', d(record.description)],
          ],
        },
        {
          title: 'Issuance',
          rows: [
            ['Issued By', fullName(record.issuer)],
            ['Issued At', record.issuedAt ? new Date(record.issuedAt).toISOString().slice(0, 10) : '-'],
            ['Sealed Document', d(record.sealedDocument?.name) === '-' ? 'Not attached' : d(record.sealedDocument?.name)],
            ['Created', record.createdAt ? new Date(record.createdAt).toISOString().slice(0, 10) : '-'],
            ['Submitted', record.submittedAt ? new Date(record.submittedAt).toISOString().slice(0, 10) : '-'],
            ['Completed', record.completedAt ? new Date(record.completedAt).toISOString().slice(0, 10) : '-'],
          ],
        },
      ],
      itemsTable: {
        title: 'Attachments',
        headers: ['No.', 'File Name', 'Type'],
        rows: attachments.length > 0
          ? attachments.map((doc: { name: string; fileType: string }, i: number) => [i + 1, d(doc.name), d(doc.fileType)])
          : [['—', 'No attachments', '']],
        colWidths: [CW * 0.1, CW * 0.6, CW * 0.3],
      },
    };

    const buffer = await this.hrDocPdf.render(input);
    const safe = record.requestNumber.replace(/[^a-zA-Z0-9-_]/g, '_');
    const dateStamp = new Date().toISOString().slice(0, 10);
    return {
      buffer,
      mimeType: 'application/pdf',
      filename: `project-seal_${safe}_${dateStamp}.pdf`,
    };
  }
}
