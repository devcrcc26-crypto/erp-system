import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../../shared/prisma/prisma.service';
import { activeOnly } from '../../../../shared/prisma/soft-delete.util';
import { fmtEtb } from '../../../../shared/pdf/payslip-style-pdf';
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

function etb(value: { toNumber(): number } | number | null | undefined): string {
  if (value == null) return '-';
  return `ETB ${fmtEtb(typeof value === 'number' ? value : value.toNumber())}`;
}

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
        employee: { select: DOC_EMPLOYEE_SELECT },
        driver: { select: DOC_PERSON_SELECT },
        vehicle: { select: { plateNumber: true, make: true, model: true } },
        receiptDocument: { select: { name: true } },
        approvalRequest: DOC_APPROVAL_INCLUDE,
      },
    });
    if (!record) throw new NotFoundException('Vehicle refueling request not found');

    const vehicleLabel = record.vehicle
      ? `${record.vehicle.plateNumber} · ${record.vehicle.make} ${record.vehicle.model}`.trim()
      : '-';

    const buffer = await this.hrDocPdf.render({
      title: 'Vehicle Refueling Request',
      titleZh: '车辆加油申请',
      number: record.requestNumber,
      status: record.status,
      hero: {
        headline: record.vehicle?.plateNumber ?? 'Vehicle / 车辆',
        caption: [record.vehicle ? `${record.vehicle.make} ${record.vehicle.model}` : null, record.fuelStation]
          .filter(Boolean)
          .join('  ·  ') || null,
        dateLabel: 'Fuel date / 加油日期',
        date: isoDate(record.fuelDate),
      },
      employee: { person: record.employee, department: record.employee?.department?.name },
      sections: [
        {
          title: 'Vehicle / 车辆',
          rows: [
            ['Vehicle / 车辆', vehicleLabel],
            ['Driver / 司机', personName(record.driver)],
            ['Fuel station / 加油站', record.fuelStation],
            ['Fuel date / 加油日期', isoDate(record.fuelDate)],
          ],
          paragraphs: [['Notes / 备注', record.notes]],
        },
        {
          title: 'Record / 记录',
          rows: [
            ['Created / 创建', isoDate(record.createdAt)],
            ['Submitted / 提交', isoDate(record.submittedAt)],
            ['Completed / 完成', isoDate(record.completedAt)],
            ['Receipt / 收据', record.receiptDocument?.name ?? 'Not attached / 未上传'],
          ],
        },
      ],
      tables: [
        {
          title: 'Fuel details / 加油明细',
          numbered: false,
          columns: [
            { header: 'Detail / 项目', weight: 3 },
            { header: 'Value / 数值', weight: 2, align: 'right' },
            { header: 'Unit / 单位', weight: 1 },
          ],
          rows: [
            { cells: ['Fuel type / 燃料类型', humanize(record.fuelType), ''] },
            { cells: ['Current mileage / 当前里程', record.currentMileage.toNumber(), 'km'] },
            { cells: ['Requested litres / 申请升数', record.requestedLitres.toNumber(), 'L'] },
            { cells: ['Unit price / 单价', etb(record.unitPriceEtb), 'per L'] },
          ],
          totals: [['Total cost / 总费用', etb(record.totalCostEtb)]],
        },
      ],
      approvalTiers: record.approvalRequest?.tiers ?? [],
    });

    return {
      buffer,
      mimeType: 'application/pdf',
      filename: `vehicle-refueling_${safeFilePart(record.requestNumber)}_${isoDate(new Date())}.pdf`,
    };
  }
}
