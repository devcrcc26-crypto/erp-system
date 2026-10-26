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

@Injectable()
export class ProjectSealPdfService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly hrDocPdf: HrDocumentPdfService,
  ) {}

  async getPdf(
    id: string,
    companyId: string,
  ): Promise<{ buffer: Buffer; mimeType: string; filename: string }> {
    const record = await this.prisma.projectSeal.findFirst({
      where: activeOnly({ id, companyId }),
      include: {
        employee: { select: DOC_EMPLOYEE_SELECT },
        issuer: { select: DOC_PERSON_SELECT },
        sealedDocument: { select: { name: true } },
        attachmentFolder: { include: { documents: { select: { name: true } } } },
        approvalRequest: DOC_APPROVAL_INCLUDE,
      },
    });
    if (!record) throw new NotFoundException('Project seal request not found');

    const buffer = await this.hrDocPdf.render({
      title: 'Project Seal Usage Request',
      titleZh: '项目章使用申请',
      number: record.requestNumber,
      status: record.status,
      hero: {
        headline: record.fileName || 'Project seal / 项目章',
        caption: record.sealCategory ? humanize(record.sealCategory) : null,
        dateLabel: 'Date needed / 需用日期',
        date: isoDate(record.dateNeeded),
      },
      employee: { person: record.employee, department: record.employee?.department?.name },
      sections: [
        {
          title: 'Request / 申请',
          rows: [
            ['Urgency / 紧急程度', humanize(record.urgency)],
            ['Seal category / 印章类别', humanize(record.sealCategory)],
            ['Copies / 份数', record.copyCount],
          ],
          paragraphs: [['Description / 说明', record.description]],
        },
        {
          title: 'Issuance / 用印',
          rows: [
            ['Issued by / 用印人', personName(record.issuer)],
            ['Issued on / 用印日期', isoDate(record.issuedAt)],
            ['Sealed document / 已盖章文件', record.sealedDocument?.name ?? 'Not attached / 未上传'],
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
      documents: (record.attachmentFolder?.documents ?? []).map((doc) => doc.name),
    });

    return {
      buffer,
      mimeType: 'application/pdf',
      filename: `project-seal_${safeFilePart(record.requestNumber)}_${isoDate(new Date())}.pdf`,
    };
  }
}
