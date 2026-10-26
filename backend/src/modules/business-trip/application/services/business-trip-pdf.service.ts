import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../../shared/prisma/prisma.service';
import { activeOnly } from '../../../../shared/prisma/soft-delete.util';
import { fmtEtb } from '../../../../shared/pdf/payslip-style-pdf';
import {
  DOC_APPROVAL_INCLUDE,
  DOC_EMPLOYEE_SELECT,
  humanize,
  isoDate,
  personEmployeeId,
  personName,
  renderDocumentPdf,
  safeFilePart,
} from '../../../../shared/pdf/document-pdf';

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
        submitter: { select: DOC_EMPLOYEE_SELECT },
        passengers: {
          orderBy: { createdAt: 'asc' },
          include: { employee: { select: DOC_EMPLOYEE_SELECT } },
        },
        attachmentFolder: { include: { documents: { select: { name: true } } } },
        approvalRequest: DOC_APPROVAL_INCLUDE,
      },
    });
    if (!trip) throw new NotFoundException('Business trip not found');

    const origin = `${trip.originCity}, ${trip.originCountry}`;
    const destination = `${trip.destinationCity}, ${trip.destinationCountry}`;

    const buffer = await renderDocumentPdf({
      title: 'Business Trip',
      titleZh: '出差申请',
      number: trip.tripNumber,
      status: trip.status,
      hero: {
        headline: `${trip.originCity}  →  ${trip.destinationCity}`,
        caption: `${humanize(trip.tripType)}  ·  return ${isoDate(trip.returnDate)}`,
        dateLabel: 'Departure / 出发',
        date: isoDate(trip.departureDate),
      },
      // Trips have passengers rather than one employee; the block shows who filed it.
      employee: {
        person: trip.submitter,
        department: trip.submitter?.department?.name,
        extraRows: [['Role / 角色', 'Submitted by / 提交人']],
      },
      sections: [
        {
          title: 'Travel / 行程',
          rows: [
            ['Trip type / 行程类型', humanize(trip.tripType)],
            ['Origin / 出发地', origin],
            ['Destination / 目的地', destination],
            ['Departure / 出发', isoDate(trip.departureDate)],
            ['Return / 返回', isoDate(trip.returnDate)],
          ],
        },
        {
          title: 'Purpose & host / 目的与接待方',
          rows: [
            ['Host organization / 接待单位', trip.hostOrganization],
            ['Host contact / 联系人', trip.hostContactName],
            ['Host phone / 电话', trip.hostContactPhone],
            ['Host email / 邮箱', trip.hostContactEmail],
          ],
          paragraphs: [
            ['Purpose / 目的', trip.purpose],
            ['Expected outcomes / 预期成果', trip.expectedOutcomes],
            ['Itinerary / 行程安排', trip.itinerary],
            ['Notes / 备注', trip.notes],
          ],
        },
      ],
      tables: [
        {
          title: 'Budget estimate / 预算',
          numbered: false,
          columns: [
            { header: 'Item / 项目', weight: 3 },
            { header: 'Amount (ETB) / 金额', weight: 2, align: 'right' },
          ],
          rows: [
            { cells: ['Accommodation / 住宿', fmtEtb(trip.estimatedAccommodationCost)] },
            { cells: ['Per diem / 补助', fmtEtb(trip.estimatedPerDiem)] },
            { cells: ['Other / 其他', fmtEtb(trip.estimatedOtherCost)] },
          ],
          totals: [['Total / 合计', `ETB ${fmtEtb(trip.estimatedTotalCost)}`]],
        },
        {
          title: 'Passengers / 出差人员',
          columns: [
            { header: 'Name / 姓名', weight: 3.4 },
            { header: 'Employee ID / 工号', weight: 1.6 },
            { header: 'Passport / 护照', weight: 1.6 },
            { header: 'Visa / 签证', weight: 1.8 },
          ],
          rows: trip.passengers.map((passenger) => ({
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
          emptyText: 'No passengers / 无人员',
        },
      ],
      approvalTiers: trip.approvalRequest?.tiers ?? [],
      documents: (trip.attachmentFolder?.documents ?? []).map((doc) => doc.name),
      notes: [
        `Created ${isoDate(trip.createdAt)}  ·  Submitted ${isoDate(trip.submittedAt)}  ·  Completed ${isoDate(trip.completedAt)}`,
        'This document is system-generated. / 本文件由系统生成。',
      ],
    });

    return {
      buffer,
      mimeType: 'application/pdf',
      filename: `business-trip_${safeFilePart(trip.tripNumber)}_${isoDate(new Date())}.pdf`,
    };
  }
}
