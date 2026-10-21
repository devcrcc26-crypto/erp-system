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
export class BusinessTripPdfService {
  constructor(private readonly prisma: PrismaService) {}

  async getPdf(
    id: string,
    companyId: string,
  ): Promise<{ buffer: Buffer; mimeType: string; filename: string }> {
    const trip = await this.prisma.businessTrip.findFirst({
      where: activeOnly({ id, companyId }),
      include: {
        submitter: { select: { firstName: true, lastName: true } },
        passengers: {
          include: { employee: { select: { firstName: true, lastName: true, email: true } } },
        },
        attachmentFolder: { include: { documents: { select: { name: true } } } },
      },
    });
    if (!trip) throw new NotFoundException('Business trip not found');

    const fontPath = resolveFontPath();
    const generatedAt = new Date();
    const doc = createDoc('Business Trip');
    const footerLeft = `${COMPANY_NAME} — Business Trip ${(trip as any).tripNumber}`;

    const buffer = await docToBuffer(doc, fontPath, (d) => {
      let y = drawPageHeader(d, COMPANY_NAME, 'Business Trip');
      y = drawMeta(d, y, fmtTs(generatedAt), fullName((trip as any).submitter));
      y += 6;

      y = ensureSpace(d, y, 40);
      y = drawSectionTitle(d, 'Trip Overview', y);
      y = drawKvTable(d, [
        ['Trip Number', (trip as any).tripNumber],
        ['Status', trip.status],
        ['Submitted By', fullName((trip as any).submitter)],
        ['Trip Type', (trip as any).tripType ?? '-'],
        ['International', (trip as any).isInternational ? 'Yes' : 'No'],
      ], y);
      y += 8;

      y = ensureSpace(d, y, 40);
      y = drawSectionTitle(d, 'Travel Details', y);
      y = drawKvTable(d, [
        ['Origin', `${dash((trip as any).originCity)}, ${dash((trip as any).originCountry)}`],
        ['Destination', `${dash((trip as any).destinationCity)}, ${dash((trip as any).destinationCountry)}`],
        ['Departure', fmtDate((trip as any).departureDate)],
        ['Return', fmtDate((trip as any).returnDate)],
      ], y);
      y += 8;

      y = ensureSpace(d, y, 40);
      y = drawSectionTitle(d, 'Purpose & Host', y);
      y = drawKvTable(d, [
        ['Purpose', dash((trip as any).purpose)],
        ['Host Organization', dash((trip as any).hostOrganization)],
        ['Host Contact', dash((trip as any).hostContactName)],
        ['Host Phone', dash((trip as any).hostContactPhone)],
        ['Host Email', dash((trip as any).hostContactEmail)],
        ...(((trip as any).expectedOutcomes?.trim()) ? [['Expected Outcomes', (trip as any).expectedOutcomes.trim()] as [string, string]] : []),
        ...(((trip as any).itinerary?.trim()) ? [['Itinerary', (trip as any).itinerary.trim()] as [string, string]] : []),
        ...(((trip as any).notes?.trim()) ? [['Notes', (trip as any).notes.trim()] as [string, string]] : []),
      ], y);
      y += 8;

      y = ensureSpace(d, y, 35);
      y = drawSectionTitle(d, 'Budget Estimate', y);
      y = drawKvTable(d, [
        ['Accommodation', fmtEtb((trip as any).estimatedAccommodationCost)],
        ['Per Diem', fmtEtb((trip as any).estimatedPerDiem)],
        ['Other', fmtEtb((trip as any).estimatedOtherCost)],
        ['Total', fmtEtb((trip as any).estimatedTotalCost)],
      ], y);
      y += 8;

      y = ensureSpace(d, y, 40);
      y = drawSectionTitle(d, 'Passengers', y);
      const passengerRows = (trip as any).passengers?.length > 0
        ? (trip as any).passengers.map((p: any) => [
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

      const docs = (trip as any).attachmentFolder?.documents ?? [];
      if (docs.length > 0) {
        y = ensureSpace(d, y, 30);
        y = drawSectionTitle(d, 'Documents', y);
        y = drawItemsTable(d, ['Document Name'], docs.map((doc: any) => [doc.name]), [CW], y);
      }
    }, footerLeft);

    const safe = ((trip as any).tripNumber as string).replace(/[^a-zA-Z0-9-_]/g, '_');
    const dateStamp = generatedAt.toISOString().slice(0, 10);
    return {
      buffer,
      mimeType: 'application/pdf',
      filename: `business-trip_${safe}_${dateStamp}.pdf`,
    };
  }
}
