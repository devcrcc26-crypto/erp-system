import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../../shared/prisma/prisma.service';
import { activeOnly } from '../../../../shared/prisma/soft-delete.util';
import {
  DOC_APPROVAL_INCLUDE,
  DOC_EMPLOYEE_SELECT,
  DOC_PERSON_SELECT,
  humanize,
  isoDate,
  personName,
  safeFilePart,
} from '../../../../shared/pdf/document-pdf';
import { HrDocumentPdfService } from '../../../hr-shared/application/services/hr-document-pdf.service';

function dateTime(value: Date | null | undefined): string {
  return value ? new Date(value).toISOString().replace('T', ' ').slice(0, 16) : '-';
}

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
        employee: { select: DOC_EMPLOYEE_SELECT },
        vehicle: { select: { plateNumber: true, make: true, model: true } },
        driver: { select: DOC_PERSON_SELECT },
        project: { select: { projectCode: true, name: true } },
        releasedByUser: { select: DOC_PERSON_SELECT },
        approvalRequest: DOC_APPROVAL_INCLUDE,
      },
    });
    if (!record) throw new NotFoundException('Vehicle application not found');

    const passengers = record.passengerNames
      ? record.passengerNames.split(/[,;\n]/).map((n: string) => n.trim()).filter(Boolean)
      : [];
    const vehicleLabel = record.vehicle
      ? `${record.vehicle.plateNumber} · ${record.vehicle.make} ${record.vehicle.model}`.trim()
      : '-';
    const projectLabel = record.project
      ? [record.project.projectCode, record.project.name].filter(Boolean).join(' · ')
      : '-';

    const buffer = await this.hrDocPdf.render({
      title: 'Vehicle Application',
      titleZh: '用车申请',
      number: record.applicationNumber,
      status: record.status,
      hero: {
        headline: record.destination || 'Vehicle trip / 用车',
        caption: vehicleLabel !== '-' ? vehicleLabel : null,
        dateLabel: 'Departure / 出发',
        date: dateTime(record.departureDatetime),
      },
      employee: { person: record.employee, department: record.employee?.department?.name },
      sections: [
        {
          title: 'Trip / 行程',
          rows: [
            ['Project / 项目', projectLabel],
            ['Vehicle / 车辆', vehicleLabel],
            ['Drive type / 驾驶方式', humanize(record.driveType)],
            ['Driver / 司机', personName(record.driver)],
            ['Departure / 出发', dateTime(record.departureDatetime)],
            ['Return / 返回', dateTime(record.returnDatetime)],
            ['Destination / 目的地', record.destination],
            ['Passenger count / 乘车人数', record.passengerCount],
          ],
          paragraphs: [
            ['Purpose / 用途', record.purpose],
            ['Notes / 备注', record.notes],
          ],
        },
        {
          title: 'Record / 记录',
          rows: [
            ['Created / 创建', isoDate(record.createdAt)],
            ['Submitted / 提交', isoDate(record.submittedAt)],
            ['Released / 放行', isoDate(record.releasedAt)],
            ['Released by / 放行人', personName(record.releasedByUser)],
            ['Completed / 完成', isoDate(record.completedAt)],
          ],
        },
      ],
      tables: passengers.length
        ? [
            {
              title: 'Passengers / 乘车人员',
              columns: [{ header: 'Name / 姓名', weight: 1 }],
              rows: passengers.map((name) => ({ cells: [name] })),
            },
          ]
        : [],
      approvalTiers: record.approvalRequest?.tiers ?? [],
    });

    return {
      buffer,
      mimeType: 'application/pdf',
      filename: `vehicle-application_${safeFilePart(record.applicationNumber)}_${isoDate(new Date())}.pdf`,
    };
  }
}
