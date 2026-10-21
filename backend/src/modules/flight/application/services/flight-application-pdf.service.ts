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
export class FlightApplicationPdfService {
  constructor(private readonly prisma: PrismaService) {}

  async getPdf(
    id: string,
    companyId: string,
  ): Promise<{ buffer: Buffer; mimeType: string; filename: string }> {
    const app = await this.prisma.flightApplication.findFirst({
      where: activeOnly({ id, companyId }),
      include: {
        submitter: { select: { firstName: true, lastName: true } },
        passengers: {
          include: { employee: { select: { firstName: true, lastName: true, email: true } } },
        },
        attachmentFolder: { include: { documents: { select: { name: true } } } },
      },
    });
    if (!app) throw new NotFoundException('Flight application not found');

    const fontPath = resolveFontPath();
    const generatedAt = new Date();
    const doc = createDoc('Flight Application');
    const footerLeft = `${COMPANY_NAME} — Flight Application ${(app as any).applicationNumber}`;

    const buffer = await docToBuffer(doc, fontPath, (d) => {
      let y = drawPageHeader(d, COMPANY_NAME, 'Flight Application');
      y = drawMeta(d, y, fmtTs(generatedAt), fullName((app as any).submitter));
      y += 6;

      y = ensureSpace(d, y, 40);
      y = drawSectionTitle(d, 'Application Overview', y);
      y = drawKvTable(d, [
        ['Application Number', (app as any).applicationNumber],
        ['Status', app.status],
        ['Submitted By', fullName((app as any).submitter)],
        ['Trip Type', (app as any).tripType ?? '-'],
        ['International', (app as any).isInternational ? 'Yes' : 'No'],
        ['Ticket Class', (app as any).ticketClass ?? '-'],
      ], y);
      y += 8;

      y = ensureSpace(d, y, 40);
      y = drawSectionTitle(d, 'Travel Details', y);
      y = drawKvTable(d, [
        ['Origin', `${dash((app as any).originCity)}, ${dash((app as any).originCountry)}`],
        ['Destination', dash((app as any).destination)],
        ['Departure', fmtDate((app as any).departureDate)],
        ['Return', fmtDate((app as any).returnDate)],
        ['Purpose', dash((app as any).purpose)],
        ...(((app as any).notes?.trim()) ? [['Notes', (app as any).notes.trim()] as [string, string]] : []),
      ], y);
      y += 8;

      y = ensureSpace(d, y, 40);
      y = drawSectionTitle(d, 'Passengers', y);
      const passengers = (app as any).passengers ?? [];
      const passengerRows = passengers.length > 0
        ? passengers.map((p: any) => [
            fullName(p.employee) !== '-' ? fullName(p.employee) : (p.employeeId ?? '-'),
            p.employee?.email ?? '-',
            dash(p.passportNumber),
            p.visaRequired ? 'Required' : 'Not Required',
            dash(p.visaStatus),
          ])
        : [['No passengers', '-', '-', '-', '-']];
      const pCols = [CW * 0.22, CW * 0.26, CW * 0.18, CW * 0.16, CW * 0.18];
      y = drawItemsTable(d, ['Name', 'Email', 'Passport', 'Visa Required', 'Visa Status'], passengerRows, pCols, y);
      y += 8;

      const docs = (app as any).attachmentFolder?.documents ?? [];
      if (docs.length > 0) {
        y = ensureSpace(d, y, 30);
        y = drawSectionTitle(d, 'Documents', y);
        y = drawItemsTable(d, ['Document Name'], docs.map((doc: any) => [doc.name]), [CW], y);
      }
    }, footerLeft);

    const safe = ((app as any).applicationNumber as string).replace(/[^a-zA-Z0-9-_]/g, '_');
    const dateStamp = generatedAt.toISOString().slice(0, 10);
    return {
      buffer,
      mimeType: 'application/pdf',
      filename: `flight-application_${safe}_${dateStamp}.pdf`,
    };
  }
}
