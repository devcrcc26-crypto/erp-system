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
export class VehicleApplicationPdfService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly hrDocPdf: HrDocumentPdfService,
  ) {}

  async getPdf(
    id: string,
    companyId: string,
  ): Promise<{ buffer: Buffer; mimeType: string; filename: string }> {
    const record = await this.prisma.vehicleApplication.findFirst({
      where: activeOnly({ id, companyId }),
      include: {
        employee: { select: { firstName: true, lastName: true, email: true } },
        vehicle: { select: { plateNumber: true, make: true, model: true } },
        driver: { select: { firstName: true, lastName: true } },
        project: { select: { projectCode: true, name: true } },
        releasedByUser: { select: { firstName: true, lastName: true } },
      },
    });
    if (!record) throw new NotFoundException('Vehicle application not found');

    const passengers = record.passengerNames
      ? record.passengerNames.split(/[,;\n]/).map((n: string) => n.trim()).filter(Boolean)
      : [];

    const vehicleLabel = record.vehicle
      ? `${record.vehicle.plateNumber} - ${record.vehicle.make} ${record.vehicle.model}`.trim()
      : '-';

    const projectLabel = record.project
      ? [record.project.projectCode, record.project.name].filter(Boolean).join(' - ')
      : '-';

    const input: HrDocumentPdfInput = {
      documentTitle: 'Vehicle Application',
      subtitle: d(record.destination),
      requestNumber: record.applicationNumber,
      preparedBy: fullName(record.employee),
      sections: [
        {
          title: 'Request',
          rows: [
            ['Application Number', record.applicationNumber],
            ['Status', record.status],
            ['Employee', fullName(record.employee)],
            ['Employee Email', d(record.employee?.email)],
            ['Project', projectLabel],
          ],
        },
        {
          title: 'Trip',
          rows: [
            ['Vehicle', vehicleLabel],
            ['Drive Type', d(record.driveType)],
            ['Driver', fullName(record.driver)],
            ['Departure', record.departureDatetime ? new Date(record.departureDatetime).toISOString().replace('T', ' ').slice(0, 16) : '-'],
            ['Return', record.returnDatetime ? new Date(record.returnDatetime).toISOString().replace('T', ' ').slice(0, 16) : '-'],
            ['Destination', d(record.destination)],
            ['Purpose', d(record.purpose)],
            ['Passenger Count', d(record.passengerCount)],
            ['Notes', d(record.notes)],
          ],
        },
        {
          title: 'Record',
          rows: [
            ['Created', record.createdAt ? new Date(record.createdAt).toISOString().slice(0, 10) : '-'],
            ['Submitted', record.submittedAt ? new Date(record.submittedAt).toISOString().slice(0, 10) : '-'],
            ['Released', record.releasedAt ? new Date(record.releasedAt).toISOString().slice(0, 10) : '-'],
            ['Released By', fullName(record.releasedByUser)],
            ['Completed', record.completedAt ? new Date(record.completedAt).toISOString().slice(0, 10) : '-'],
          ],
        },
      ],
      itemsTable: passengers.length > 0 ? {
        title: 'Passengers',
        headers: ['No.', 'Passenger Name'],
        rows: passengers.map((name: string, i: number) => [i + 1, name]),
        colWidths: [CW * 0.15, CW * 0.85],
      } : undefined,
    };

    const buffer = await this.hrDocPdf.render(input);
    const safe = record.applicationNumber.replace(/[^a-zA-Z0-9-_]/g, '_');
    const dateStamp = new Date().toISOString().slice(0, 10);
    return {
      buffer,
      mimeType: 'application/pdf',
      filename: `vehicle-application_${safe}_${dateStamp}.pdf`,
    };
  }
}
