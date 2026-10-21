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

const etb = (v: number | null | undefined): string =>
  v == null ? '-' : `${v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ETB`;

@Injectable()
export class VehicleRefuelingPdfService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly hrDocPdf: HrDocumentPdfService,
  ) {}

  async getPdf(
    id: string,
    companyId: string,
  ): Promise<{ buffer: Buffer; mimeType: string; filename: string }> {
    const record = await this.prisma.vehicleRefueling.findFirst({
      where: activeOnly({ id, companyId }),
      include: {
        employee: { select: { firstName: true, lastName: true, email: true } },
        driver: { select: { firstName: true, lastName: true } },
        vehicle: { select: { plateNumber: true, make: true, model: true } },
        receiptDocument: { select: { name: true } },
      },
    });
    if (!record) throw new NotFoundException('Vehicle refueling request not found');

    const vehicleLabel = record.vehicle
      ? `${record.vehicle.plateNumber} - ${record.vehicle.make} ${record.vehicle.model}`.trim()
      : '-';

    const subtitle = record.vehicle
      ? `${record.vehicle.plateNumber} - ${d(record.fuelStation)}`
      : d(record.fuelStation);

    const input: HrDocumentPdfInput = {
      documentTitle: 'Vehicle Refueling Request',
      subtitle,
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
            ['Driver', fullName(record.driver)],
          ],
        },
        {
          title: 'Vehicle',
          rows: [
            ['Vehicle', vehicleLabel],
            ['Fuel Date', record.fuelDate ? new Date(record.fuelDate).toISOString().slice(0, 10) : '-'],
            ['Fuel Station', d(record.fuelStation)],
            ['Notes', d(record.notes)],
          ],
        },
        {
          title: 'Record',
          rows: [
            ['Created', record.createdAt ? new Date(record.createdAt).toISOString().slice(0, 10) : '-'],
            ['Submitted', record.submittedAt ? new Date(record.submittedAt).toISOString().slice(0, 10) : '-'],
            ['Completed', record.completedAt ? new Date(record.completedAt).toISOString().slice(0, 10) : '-'],
            ['Receipt', d(record.receiptDocument?.name) === '-' ? 'Not attached' : d(record.receiptDocument?.name)],
          ],
        },
      ],
      itemsTable: {
        title: 'Fuel Details',
        headers: ['Detail', 'Value', 'Unit'],
        rows: [
          ['Fuel Type', d(record.fuelType), ''],
          ['Current Mileage', record.currentMileage.toNumber().toString(), 'km'],
          ['Requested Litres', record.requestedLitres.toNumber().toString(), 'L'],
          ['Unit Price', etb(record.unitPriceEtb?.toNumber() ?? null), 'ETB/L'],
          ['Total Cost', etb(record.totalCostEtb?.toNumber() ?? null), 'ETB'],
        ],
        colWidths: [CW * 0.5, CW * 0.3, CW * 0.2],
      },
    };

    const buffer = await this.hrDocPdf.render(input);
    const safe = record.requestNumber.replace(/[^a-zA-Z0-9-_]/g, '_');
    const dateStamp = new Date().toISOString().slice(0, 10);
    return {
      buffer,
      mimeType: 'application/pdf',
      filename: `vehicle-refueling_${safe}_${dateStamp}.pdf`,
    };
  }
}
