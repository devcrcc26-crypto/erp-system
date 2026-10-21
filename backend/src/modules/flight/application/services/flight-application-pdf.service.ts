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
    if (!app) throw new NotFoundException('Flight application not found');

    const generatedAt = new Date();
    const applicationNumber = String(
      (app as { applicationNumber?: string }).applicationNumber ?? id,
    );
    const docs = app.attachmentFolder?.documents ?? [];

    const buffer = await renderPayslipPdf(
      { title: 'Flight Application' },
      (p) => {
        p.brand(bilingualTitle('Flight Application', '机票申请'));
        p.subtitleRight(applicationNumber);
        p.rule();

        p.section('APPLICATION OVERVIEW');
        p.fields([
          ['Application Number', applicationNumber],
          ['Status', app.status],
          ['Submitted By', fullName(app.submitter)],
          ['Trip Type', dash((app as { tripType?: string }).tripType)],
          [
            'International',
            (app as { isInternational?: boolean }).isInternational
              ? 'Yes'
              : 'No',
          ],
          ['Ticket Class', dash((app as { ticketClass?: string }).ticketClass)],
        ]);

        p.section('TRAVEL DETAILS');
        p.fields([
          [
            'Origin',
            `${dash((app as { originCity?: string }).originCity)}, ${dash((app as { originCountry?: string }).originCountry)}`,
          ],
          ['Destination', dash((app as { destination?: string }).destination)],
          [
            'Departure',
            fmtDate((app as { departureDate?: Date }).departureDate),
          ],
          ['Return', fmtDate((app as { returnDate?: Date }).returnDate)],
          ['Purpose', dash((app as { purpose?: string }).purpose)],
        ]);
        const notes = (app as { notes?: string }).notes?.trim();
        if (notes) {
          p.line('Notes:', { indent: 1 });
          p.wrapped(notes, { indent: 24, size: 8 });
        }

        p.rule();
        p.section('PASSENGERS');
        const passengers = app.passengers ?? [];
        if (passengers.length === 0) {
          p.line('No passengers', { indent: 1, color: '#333333' });
        } else {
          for (const passenger of passengers) {
            const name =
              fullName(passenger.employee) !== '-'
                ? fullName(passenger.employee)
                : dash(passenger.employeeId);
            p.field(
              name,
              passenger.visaRequired ? 'Visa required' : 'Visa not required',
              1,
            );
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
          'This flight application is system-generated.',
        ]);
      },
    );

    const safe = applicationNumber.replace(/[^a-zA-Z0-9-_]/g, '_');
    const dateStamp = generatedAt.toISOString().slice(0, 10);
    return {
      buffer,
      mimeType: 'application/pdf',
      filename: `flight-application_${safe}_${dateStamp}.pdf`,
    };
  }
}
