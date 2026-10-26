import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../../shared/prisma/prisma.service';
import { activeOnly } from '../../../../shared/prisma/soft-delete.util';
import {
  DOC_APPROVAL_INCLUDE,
  DOC_EMPLOYEE_SELECT,
  humanize,
  isoDate,
  safeFilePart,
} from '../../../../shared/pdf/document-pdf';
import { HrDocumentPdfService } from '../../../hr-shared/application/services/hr-document-pdf.service';

@Injectable()
export class InspectionRepairPdfService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly hrDocPdf: HrDocumentPdfService,
  ) {}

  async getPdf(
    id: string,
    companyId: string,
  ): Promise<{ buffer: Buffer; mimeType: string; filename: string }> {
    const record = await this.prisma.inspectionRepair.findFirst({
      where: activeOnly({ id, companyId }),
      include: {
        employee: { select: DOC_EMPLOYEE_SELECT },
        asset: { select: { serialNumber: true } },
        approvalRequest: DOC_APPROVAL_INCLUDE,
      },
    });
    if (!record) throw new NotFoundException('Inspection/repair request not found');

    const buffer = await this.hrDocPdf.render({
      title: 'Inspection & Repair Request',
      titleZh: '检修申请',
      number: record.requestNumber,
      status: record.status,
      hero: {
        headline: record.deviceName || 'Equipment / 设备',
        caption: [humanize(record.inspectionType), record.location]
          .filter((part) => part && part !== '-')
          .join('  ·  ') || null,
        dateLabel: 'Urgency / 紧急程度',
        date: humanize(record.urgency),
      },
      employee: { person: record.employee, department: record.employee?.department?.name },
      sections: [
        {
          title: 'Equipment / 设备',
          rows: [
            ['Device / 设备名称', record.deviceName],
            ['Asset serial no. / 资产序列号', record.asset?.serialNumber],
            ['Make / 品牌', record.make],
            ['Model / 型号', record.model],
            ['Year / 年份', record.year],
            ['Inspection type / 检修类型', humanize(record.inspectionType)],
            ['Location / 地点', record.location],
          ],
        },
        {
          title: 'Fault & solution / 故障与方案',
          paragraphs: [
            ['Reported fault / 故障描述', record.description],
            ['Proposed solution / 解决方案', record.solution],
          ],
        },
        {
          title: 'Record / 记录',
          rows: [
            ['Created / 创建', isoDate(record.createdAt)],
            ['Submitted / 提交', isoDate(record.submittedAt)],
            ['Completed / 完成', isoDate(record.completedAt)],
          ],
        },
      ],
      approvalTiers: record.approvalRequest?.tiers ?? [],
    });

    return {
      buffer,
      mimeType: 'application/pdf',
      filename: `inspection-repair_${safeFilePart(record.requestNumber)}_${isoDate(new Date())}.pdf`,
    };
  }
}
