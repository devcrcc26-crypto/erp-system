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
export class InspectionRepairPdfService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly hrDocPdf: HrDocumentPdfService,
  ) {}

  async getPdf(
    id: string,
    companyId: string,
  ): Promise<{ buffer: Buffer; mimeType: string; filename: string }> {
    const record = await this.prisma.inspectionRepair.findFirst({
      where: activeOnly({ id, companyId }),
      include: {
        employee: { select: { firstName: true, lastName: true, email: true } },
        asset: { select: { serialNumber: true } },
      },
    });
    if (!record) throw new NotFoundException('Inspection/repair request not found');

    const input: HrDocumentPdfInput = {
      documentTitle: 'Inspection & Repair Request',
      subtitle: d(record.deviceName),
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
            ['Inspection Type', d(record.inspectionType)],
            ['Urgency', d(record.urgency)],
            ['Location', d(record.location)],
          ],
        },
        {
          title: 'Equipment',
          rows: [
            ['Device Name', d(record.deviceName)],
            ['Asset Serial Number', d(record.asset?.serialNumber)],
            ['Make', d(record.make)],
            ['Model', d(record.model)],
            ['Year', d(record.year)],
          ],
        },
        {
          title: 'Record',
          rows: [
            ['Created', record.createdAt ? new Date(record.createdAt).toISOString().slice(0, 10) : '-'],
            ['Submitted', record.submittedAt ? new Date(record.submittedAt).toISOString().slice(0, 10) : '-'],
            ['Completed', record.completedAt ? new Date(record.completedAt).toISOString().slice(0, 10) : '-'],
          ],
        },
      ],
      itemsTable: {
        title: 'Fault & Solution',
        headers: ['Section', 'Detail'],
        rows: [
          ['Reported Fault', d(record.description)],
          ['Proposed Solution', d(record.solution)],
        ],
        colWidths: [CW * 0.3, CW * 0.7],
      },
    };

    const buffer = await this.hrDocPdf.render(input);
    const safe = record.requestNumber.replace(/[^a-zA-Z0-9-_]/g, '_');
    const dateStamp = new Date().toISOString().slice(0, 10);
    return {
      buffer,
      mimeType: 'application/pdf',
      filename: `inspection-repair_${safe}_${dateStamp}.pdf`,
    };
  }
}
