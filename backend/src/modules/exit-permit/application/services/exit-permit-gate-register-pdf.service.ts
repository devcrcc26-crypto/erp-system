import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../shared/prisma/prisma.service';
import {
  bilingualTitle,
  dash,
  fmtDate,
  fmtGeneratedDate,
  fullName,
  renderPayslipPdf,
} from '../../../../shared/pdf/payslip-style-pdf';

@Injectable()
export class ExitPermitGateRegisterPdfService {
  constructor(private readonly prisma: PrismaService) {}

  async getPdf(
    permitDate: string,
    direction: 'ENTRANCE' | 'EXIT' | 'ALL',
    companyId: string,
  ): Promise<{ buffer: Buffer; mimeType: string; filename: string }> {
    const dateKey = permitDate.slice(0, 10);
    const dirFilter =
      direction === 'ALL'
        ? undefined
        : ({ direction } as { direction: 'ENTRANCE' | 'EXIT' });

    const permits = await this.prisma.exitPermit.findMany({
      where: {
        companyId,
        status: 'APPROVED',
        date: {
          gte: new Date(`${dateKey}T00:00:00.000Z`),
          lte: new Date(`${dateKey}T23:59:59.999Z`),
        },
        ...dirFilter,
        deletedAt: null,
      },
      include: {
        employee: { select: { firstName: true, lastName: true } },
        department: { select: { name: true } },
        items: {
          select: {
            itemName: true,
            issue: true,
            quantity: true,
            unit: true,
          },
        },
      },
      orderBy: { requestNumber: 'asc' },
    });

    const generatedAt = new Date();
    const dirLabel = direction === 'ALL' ? 'Entrance & Exit' : direction;

    const buffer = await renderPayslipPdf(
      { title: 'Gate Pass Register', layout: 'landscape' },
      (p) => {
        p.brand(bilingualTitle('Gate Pass Register', '门岗登记'));
        p.subtitleRight(`Approved ${dirLabel} — ${fmtDate(dateKey)}`);
        p.line(`${permits.length} permit(s) · Approved only`, {
          color: '#333333',
        });
        p.rule();

        const sections =
          direction === 'ALL'
            ? [
                {
                  title: 'ENTRANCE',
                  data: permits.filter((row) => row.direction === 'ENTRANCE'),
                },
                {
                  title: 'EXIT',
                  data: permits.filter((row) => row.direction === 'EXIT'),
                },
              ]
            : [{ title: direction, data: permits }];

        for (const section of sections) {
          if (direction === 'ALL') {
            p.section(`${section.title} (${section.data.length})`);
          }
          if (section.data.length === 0) {
            p.line('No approved permits for this date and direction.', {
              indent: 1,
              color: '#333333',
            });
            continue;
          }
          for (const permit of section.data) {
            const items = permit.items ?? [];
            p.field(
              `${permit.requestNumber} · ${fullName(permit.employee)}`,
              dash(permit.department?.name),
              1,
            );
            if (items.length === 0) {
              p.wrapped('No items', { indent: 24, size: 8 });
            } else {
              for (const item of items) {
                p.wrapped(
                  [
                    dash(item.itemName),
                    dash(item.issue),
                    `${item.quantity ?? '-'} ${dash(item.unit)}`,
                  ].join(' · '),
                  { indent: 24, size: 8 },
                );
              }
            }
          }
        }

        p.footerNotes([
          `Generated ${fmtGeneratedDate(generatedAt)}`,
          'This gate pass register is system-generated.',
        ]);
      },
    );

    const dirSlug = direction === 'ALL' ? 'all' : direction.toLowerCase();
    return {
      buffer,
      mimeType: 'application/pdf',
      filename: `exit-permit-gate-register_${dirSlug}_${dateKey}.pdf`,
    };
  }
}
