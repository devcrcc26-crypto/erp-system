import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../../shared/prisma/prisma.service';
import { activeOnly } from '../../../../shared/prisma/soft-delete.util';
import { formatEnglishName } from '../../../../shared/utils/user-display.util';
import {
  bilingualTitle,
  dash,
  fmtDate,
  fmtEtb,
  fmtGeneratedDate,
  renderPayslipPdf,
} from '../../../../shared/pdf/payslip-style-pdf';

@Injectable()
export class PurchaseRequestPdfService {
  constructor(private readonly prisma: PrismaService) {}

  async getPdf(
    id: string,
    companyId: string,
  ): Promise<{ buffer: Buffer; mimeType: string; filename: string }> {
    const request = await this.prisma.purchaseRequest.findFirst({
      where: activeOnly({ id, companyId }),
      include: {
        employee: {
          select: {
            firstName: true,
            middleName: true,
            lastName: true,
            chineseName: true,
            employeeId: true,
          },
        },
        items: {
          orderBy: { createdAt: 'asc' },
          select: {
            itemName: true,
            description: true,
            modelSpec: true,
            quantity: true,
            unit: true,
            unitPrice: true,
            totalPriceEtb: true,
          },
        },
        attachmentFolder: {
          include: { documents: { select: { name: true } } },
        },
      },
    });
    if (!request) throw new NotFoundException('Purchase request not found');

    const generatedAt = new Date();
    const employeeName = formatEnglishName(request.employee);
    const documents = (request.attachmentFolder?.documents ?? [])
      .map((d) => d.name.trim())
      .filter((name) => name.length > 0);

    const buffer = await renderPayslipPdf({ title: 'Purchase Request' }, (p) => {
      p.brand(bilingualTitle('Purchase Request', '采购申请'));
      p.subtitleRight(request.requestNumber);
      p.rule();

      p.pair(
        `Employee / 员工:  ${employeeName}`,
        `ID / 工号: ${request.employee?.employeeId ?? '-'}`,
      );
      p.pair(
        `Status / 状态: ${request.status}`,
        `Required by / 需用日期: ${fmtDate(request.requiredByDate)}`,
      );
      p.pair(
        `Vendor / 供应商: ${dash(request.vendorName)}`,
        `Phone / 电话: ${dash(request.vendorPhone)}`,
      );
      p.pair(
        `Email / 邮箱: ${dash(request.vendorEmail)}`,
        `Submitted / 提交: ${request.submittedAt ? fmtDate(request.submittedAt) : '-'}`,
      );
      p.line(`Title / 标题: ${dash(request.title)}`);
      p.line('Justification / 事由:');
      p.wrapped(dash(request.justification));

      p.rule();
      p.section('ITEMS / 明细', 'Amount (ETB)');
      if (request.items.length === 0) {
        p.line('No items recorded / 无明细', { indent: 1, color: '#333333' });
      } else {
        for (const item of request.items) {
          const description = [item.description, item.modelSpec]
            .map((part) => part?.trim())
            .filter((part): part is string => Boolean(part))
            .join(' / ');
          p.field(dash(item.itemName), fmtEtb(item.totalPriceEtb), 1);
          p.wrapped(
            [
              description || null,
              `${formatQuantity(Number(item.quantity))} ${dash(item.unit)} × ${fmtEtb(item.unitPrice)}`,
            ]
              .filter(Boolean)
              .join(' · '),
            { indent: 24, size: 8 },
          );
        }
      }
      p.total('TOTAL / 合计', `ETB ${fmtEtb(request.totalEstimatedEtb)}`);

      if (documents.length > 0) {
        p.rule();
        p.section('DOCUMENTS / 附件');
        for (const name of documents) {
          p.line(`•  ${name}`, { indent: 1, color: '#333333' });
        }
      }

      p.footerNotes([
        `Created ${fmtDate(request.createdAt)} · Generated ${fmtGeneratedDate(generatedAt)}`,
        'This purchase request is system-generated.',
      ]);
    });

    const safe = request.requestNumber.replace(/[^a-zA-Z0-9-_]/g, '_');
    const dateStamp = generatedAt.toISOString().slice(0, 10);
    return {
      buffer,
      mimeType: 'application/pdf',
      filename: `purchase-request_${safe}_${dateStamp}.pdf`,
    };
  }
}

function formatQuantity(value: number): string {
  if (!Number.isFinite(value)) return '-';
  const rounded = Math.round(value * 100) / 100;
  if (Number.isInteger(rounded)) return String(rounded);
  return rounded.toFixed(2).replace(/\.?0+$/, '');
}
