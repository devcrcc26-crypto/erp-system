import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../../shared/prisma/prisma.service';
import { activeOnly } from '../../../../shared/prisma/soft-delete.util';
import {
  bilingualTitle,
  dash,
  fmtDate,
  fmtEtb,
  fmtGeneratedDate,
  fullName,
  renderPayslipPdf,
} from '../../../../shared/pdf/payslip-style-pdf';

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
          include: {
            employee: {
              select: { firstName: true, lastName: true, email: true },
            },
          },
        },
        attachmentFolder: {
          include: { documents: { select: { name: true } } },
        },
      },
    });
    if (!trip) throw new NotFoundException('Business trip not found');

    const generatedAt = new Date();
    const tripNumber = String((trip as { tripNumber?: string }).tripNumber ?? id);
    const docs = trip.attachmentFolder?.documents ?? [];

    const buffer = await renderPayslipPdf({ title: 'Business Trip' }, (p) => {
      p.brand(bilingualTitle('Business Trip', '出差申请'));
      p.subtitleRight(tripNumber);
      p.rule();

      p.section('TRIP OVERVIEW');
      p.fields([
        ['Trip Number', tripNumber],
        ['Status', trip.status],
        ['Submitted By', fullName(trip.submitter)],
        ['Trip Type', dash((trip as { tripType?: string }).tripType)],
        [
          'International',
          (trip as { isInternational?: boolean }).isInternational ? 'Yes' : 'No',
        ],
      ]);

      p.section('TRAVEL DETAILS');
      p.fields([
        [
          'Origin',
          `${dash((trip as { originCity?: string }).originCity)}, ${dash((trip as { originCountry?: string }).originCountry)}`,
        ],
        [
          'Destination',
          `${dash((trip as { destinationCity?: string }).destinationCity)}, ${dash((trip as { destinationCountry?: string }).destinationCountry)}`,
        ],
        ['Departure', fmtDate((trip as { departureDate?: Date }).departureDate)],
        ['Return', fmtDate((trip as { returnDate?: Date }).returnDate)],
      ]);

      p.section('PURPOSE & HOST');
      p.fields([
        ['Purpose', dash((trip as { purpose?: string }).purpose)],
        [
          'Host Organization',
          dash((trip as { hostOrganization?: string }).hostOrganization),
        ],
        [
          'Host Contact',
          dash((trip as { hostContactName?: string }).hostContactName),
        ],
        [
          'Host Phone',
          dash((trip as { hostContactPhone?: string }).hostContactPhone),
        ],
        [
          'Host Email',
          dash((trip as { hostContactEmail?: string }).hostContactEmail),
        ],
      ]);
      const outcomes = (trip as { expectedOutcomes?: string }).expectedOutcomes?.trim();
      const itinerary = (trip as { itinerary?: string }).itinerary?.trim();
      const notes = (trip as { notes?: string }).notes?.trim();
      if (outcomes) {
        p.line('Expected Outcomes:', { indent: 1 });
        p.wrapped(outcomes, { indent: 24, size: 8 });
      }
      if (itinerary) {
        p.line('Itinerary:', { indent: 1 });
        p.wrapped(itinerary, { indent: 24, size: 8 });
      }
      if (notes) {
        p.line('Notes:', { indent: 1 });
        p.wrapped(notes, { indent: 24, size: 8 });
      }

      p.section('BUDGET ESTIMATE', 'Amount (ETB)');
      p.field(
        'Accommodation',
        fmtEtb((trip as { estimatedAccommodationCost?: unknown }).estimatedAccommodationCost),
        1,
      );
      p.field(
        'Per Diem',
        fmtEtb((trip as { estimatedPerDiem?: unknown }).estimatedPerDiem),
        1,
      );
      p.field(
        'Other',
        fmtEtb((trip as { estimatedOtherCost?: unknown }).estimatedOtherCost),
        1,
      );
      p.total(
        'TOTAL',
        `ETB ${fmtEtb((trip as { estimatedTotalCost?: unknown }).estimatedTotalCost)}`,
      );

      p.rule();
      p.section('PASSENGERS');
      const passengers = trip.passengers ?? [];
      if (passengers.length === 0) {
        p.line('No passengers', { indent: 1, color: '#333333' });
      } else {
        for (const passenger of passengers) {
          const name =
            fullName(passenger.employee) !== '-'
              ? fullName(passenger.employee)
              : dash(passenger.employeeId);
          p.field(name, passenger.visaRequired ? 'Visa required' : 'Visa not required', 1);
          p.wrapped(
            [
              passenger.employee?.email ?? null,
              passenger.passportNumber
                ? `Passport ${passenger.passportNumber}`
                : null,
              passenger.visaStatus ? `Status ${passenger.visaStatus}` : null,
            ]
              .filter(Boolean)
              .join(' · ') || '-',
            { indent: 24, size: 8 },
          );
        }
      }

      if (docs.length > 0) {
        p.rule();
        p.section('DOCUMENTS');
        for (const doc of docs) {
          p.line(`•  ${doc.name}`, { indent: 1, color: '#333333' });
        }
      }

      p.footerNotes([
        `Generated ${fmtGeneratedDate(generatedAt)}`,
        'This business trip application is system-generated.',
      ]);
    });

    const safe = tripNumber.replace(/[^a-zA-Z0-9-_]/g, '_');
    const dateStamp = generatedAt.toISOString().slice(0, 10);
    return {
      buffer,
      mimeType: 'application/pdf',
      filename: `business-trip_${safe}_${dateStamp}.pdf`,
    };
  }
}
