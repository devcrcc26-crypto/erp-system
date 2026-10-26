import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../../shared/prisma/prisma.service';
import { activeOnly } from '../../../../shared/prisma/soft-delete.util';
import {
  DOC_APPROVAL_INCLUDE,
  DOC_EMPLOYEE_SELECT,
  humanize,
  isoDate,
  personEmployeeId,
  personName,
  renderDocumentPdf,
  safeFilePart,
  yesNo,
} from '../../../../shared/pdf/document-pdf';

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
        submitter: { select: DOC_EMPLOYEE_SELECT },
        passengers: {
          orderBy: { createdAt: 'asc' },
          include: { employee: { select: DOC_EMPLOYEE_SELECT } },
        },
        attachmentFolder: { include: { documents: { select: { name: true } } } },
        approvalRequest: DOC_APPROVAL_INCLUDE,
      },
    });
    if (!app) throw new NotFoundException('Flight application not found');

    const route = `${app.originCity}, ${app.originCountry}  →  ${app.destination}`;

    const buffer = await renderDocumentPdf({
      title: 'Flight Application',
      titleZh: '机票申请',
      number: app.applicationNumber,
      status: app.status,
      hero: {
        headline: route,
        caption: `${humanize(app.tripType)}  ·  ${humanize(app.ticketClass)}`,
        dateLabel: 'Departure / 出发',
        date: isoDate(app.departureDate),
      },
      // Flights have passengers rather than one employee; the block shows who filed it.
      employee: {
        person: app.submitter,
        department: app.submitter?.department?.name,
        extraRows: [['Role / 角色', 'Submitted by / 提交人']],
      },
      sections: [
        {
          title: 'Travel / 行程',
          rows: [
            ['Trip type / 行程类型', humanize(app.tripType)],
            ['International / 国际', yesNo(app.isInternational)],
            ['Ticket class / 舱位', humanize(app.ticketClass)],
            ['Origin / 出发地', `${app.originCity}, ${app.originCountry}`],
            ['Destination / 目的地', app.destination],
            ['Departure / 出发', isoDate(app.departureDate)],
            ['Return / 返回', isoDate(app.returnDate)],
          ],
          paragraphs: [
            ['Purpose / 事由', app.purpose],
            ['Notes / 备注', app.notes],
          ],
        },
      ],
      tables: [
        {
          title: 'Passengers / 乘客',
          columns: [
            { header: 'Name / 姓名', weight: 3.4 },
            { header: 'Employee ID / 工号', weight: 1.6 },
            { header: 'Passport / 护照', weight: 1.6 },
            { header: 'Visa / 签证', weight: 1.8 },
          ],
          rows: app.passengers.map((passenger) => ({
            cells: [
              personName(passenger.employee),
              personEmployeeId(passenger.employee),
              passenger.passportNumber,
              passenger.visaRequired
                ? `Required · ${humanize(passenger.visaStatus)}`
                : 'Not required',
            ],
            sub: passenger.employee?.email ?? null,
          })),
          emptyText: 'No passengers / 无乘客',
        },
      ],
      approvalTiers: app.approvalRequest?.tiers ?? [],
      documents: (app.attachmentFolder?.documents ?? []).map((doc) => doc.name),
      notes: [
        `Created ${isoDate(app.createdAt)}  ·  Submitted ${isoDate(app.submittedAt)}  ·  Completed ${isoDate(app.completedAt)}`,
        'This document is system-generated. / 本文件由系统生成。',
      ],
    });

    return {
      buffer,
      mimeType: 'application/pdf',
      filename: `flight-application_${safeFilePart(app.applicationNumber)}_${isoDate(new Date())}.pdf`,
    };
  }
}
