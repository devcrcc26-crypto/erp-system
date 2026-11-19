import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import PDFDocument from 'pdfkit';
import { Prisma } from '@prisma/client';
import { DocumentService } from '../../../documents/application/services/document.service';
import { PrismaService } from '../../../../shared/prisma/prisma.service';
import { activeOnly } from '../../../../shared/prisma/soft-delete.util';
import {
  PAYSLIP_COMPANY,
  PAYSLIP_FONT,
  resolvePayslipFontPath,
} from '../../../../shared/pdf/payslip-style-pdf';
import { safeFilePart } from '../../../../shared/pdf/document-pdf';
type AuditContext = { companyId: string; userId: string };

/** CR80 credit-card size in PDF points (1 in = 72 pt). */
const CARD_WIDTH_PT = 3.37 * 72; // 242.64
const CARD_HEIGHT_PT = 2.125 * 72; // 153
/** App primary green (CRCC teal). */
const BRAND_GREEN = '#1D9E75';
const INK = '#1A1A1A';
const MUTED = '#6B7280';
const PHOTO_W_PT = (25 / 25.4) * 72; // ~70.87
const PHOTO_H_PT = (32 / 25.4) * 72; // ~90.71
const DEFAULT_OFFICE_PHONE = '+251-11-000-0000';
const BLOOD_TYPES = [
  'A+',
  'A−',
  'B+',
  'B−',
  'AB+',
  'AB−',
  'O+',
  'O−',
] as const;

export type BloodTypeValue = (typeof BLOOD_TYPES)[number];

export const EMPLOYEE_BLOOD_TYPES: readonly BloodTypeValue[] = BLOOD_TYPES;

interface IdCardEmployee {
  id: string;
  employeeId: string | null;
  firstName: string;
  middleName: string | null;
  lastName: string;
  bloodType: string | null;
  employmentDate: Date | null;
  emergencyContacts: Prisma.JsonValue | null;
  photoDocumentId: string | null;
  department: { name: string } | null;
  position: { title: string } | null;
}

interface IdCardCompanyContext {
  legalName: string;
  logoUrl: string | null;
  officePhone: string;
}

interface EmergencyContactLine {
  name: string;
  phone: string;
}

/**
 * Generates printable CR80 employee ID cards (front + back) with pdfkit.
 */
@Injectable()
export class EmployeeIdCardPdfService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly documentService: DocumentService,
  ) {}

  /**
   * Builds a PDF for one employee (2 pages: front then back).
   * When `requireIssued` is true (self-service), rejects unissued cards.
   */
  async getPdfForUser(
    ctx: AuditContext,
    userId: string,
    options: { requireIssued: boolean },
  ): Promise<{ buffer: Buffer; mimeType: string; filename: string }> {
    const employee = await this.loadEmployee(ctx.companyId, userId);
    if (options.requireIssued) {
      const issued = await this.prisma.user.findFirst({
        where: activeOnly({ id: userId, companyId: ctx.companyId }),
        select: { idCardIssued: true },
      });
      if (!issued?.idCardIssued) {
        throw new ForbiddenException(
          'Your ID card has not been issued yet. Contact HR.',
        );
      }
    }

    const company = await this.loadCompanyContext(ctx.companyId);
    const photo = await this.loadPhotoBuffer(ctx, employee.photoDocumentId);
    const buffer = await this.renderPdf(
      [{ employee, photo }],
      company,
    );
    const code = employee.employeeId?.trim() || employee.id.slice(0, 8);
    return {
      buffer,
      mimeType: 'application/pdf',
      filename: `${safeFilePart(code)}-id-card.pdf`,
    };
  }

  /**
   * Builds a single PDF with front+back pages for each selected employee.
   */
  async getBulkPdf(
    ctx: AuditContext,
    userIds: readonly string[],
  ): Promise<{ buffer: Buffer; mimeType: string; filename: string }> {
    const uniqueIds = [...new Set(userIds.filter(Boolean))];
    if (uniqueIds.length === 0) {
      throw new NotFoundException('No employees selected');
    }

    const company = await this.loadCompanyContext(ctx.companyId);
    const cards: Array<{ employee: IdCardEmployee; photo: Buffer | null }> = [];
    for (const id of uniqueIds) {
      const employee = await this.loadEmployee(ctx.companyId, id);
      const photo = await this.loadPhotoBuffer(ctx, employee.photoDocumentId);
      cards.push({ employee, photo });
    }

    const buffer = await this.renderPdf(cards, company);
    return {
      buffer,
      mimeType: 'application/pdf',
      filename:
        uniqueIds.length === 1
          ? `${safeFilePart(cards[0]!.employee.employeeId?.trim() || uniqueIds[0]!.slice(0, 8))}-id-card.pdf`
          : `id-cards-${uniqueIds.length}.pdf`,
    };
  }

  /**
   * Marks the company ID card as issued by the current HR user.
   */
  async issueIdCard(
    ctx: AuditContext,
    userId: string,
  ): Promise<{
    idCardIssued: true;
    idCardIssuedAt: Date;
    idCardIssuedBy: string;
    idCardIssuedByName: string;
  }> {
    await this.loadEmployee(ctx.companyId, userId);
    const now = new Date();
    await this.prisma.user.update({
      where: { id: userId },
      data: {
        idCardIssued: true,
        idCardIssuedAt: now,
        idCardIssuedBy: ctx.userId,
        updatedBy: ctx.userId,
      },
    });
    const issuer = await this.prisma.user.findFirst({
      where: { id: ctx.userId },
      select: { firstName: true, middleName: true, lastName: true },
    });
    return {
      idCardIssued: true,
      idCardIssuedAt: now,
      idCardIssuedBy: ctx.userId,
      idCardIssuedByName: formatFullName(issuer),
    };
  }

  /**
   * Revokes ID card access for the employee (hides self-service download).
   */
  async revokeIdCard(
    ctx: AuditContext,
    userId: string,
  ): Promise<{
    idCardIssued: false;
    idCardIssuedAt: null;
    idCardIssuedBy: null;
  }> {
    await this.loadEmployee(ctx.companyId, userId);
    await this.prisma.user.update({
      where: { id: userId },
      data: {
        idCardIssued: false,
        idCardIssuedAt: null,
        idCardIssuedBy: null,
        updatedBy: ctx.userId,
      },
    });
    return {
      idCardIssued: false,
      idCardIssuedAt: null,
      idCardIssuedBy: null,
    };
  }

  /**
   * Issues ID cards for multiple employees in one pass.
   */
  async issueIdCardsBulk(
    ctx: AuditContext,
    userIds: readonly string[],
  ): Promise<{ issued: number }> {
    const uniqueIds = [...new Set(userIds.filter(Boolean))];
    if (uniqueIds.length === 0) {
      return { issued: 0 };
    }
    const now = new Date();
    const result = await this.prisma.user.updateMany({
      where: activeOnly({
        companyId: ctx.companyId,
        id: { in: uniqueIds },
        idCardIssued: false,
      }),
      data: {
        idCardIssued: true,
        idCardIssuedAt: now,
        idCardIssuedBy: ctx.userId,
        updatedBy: ctx.userId,
      },
    });
    return { issued: result.count };
  }

  private async loadEmployee(
    companyId: string,
    userId: string,
  ): Promise<IdCardEmployee> {
    const employee = await this.prisma.user.findFirst({
      where: activeOnly({ id: userId, companyId }),
      select: {
        id: true,
        employeeId: true,
        firstName: true,
        middleName: true,
        lastName: true,
        bloodType: true,
        employmentDate: true,
        emergencyContacts: true,
        photoDocumentId: true,
        department: { select: { name: true } },
        position: { select: { title: true } },
      },
    });
    if (!employee) {
      throw new NotFoundException('Employee not found');
    }
    return employee;
  }

  private async loadCompanyContext(
    companyId: string,
  ): Promise<IdCardCompanyContext> {
    const company = await this.prisma.company.findFirst({
      where: activeOnly({ id: companyId }),
      select: { legalName: true, logoUrl: true },
    });
    const setting = await this.prisma.companySetting.findFirst({
      where: activeOnly({
        companyId,
        module: 'company',
        key: 'officePhone',
      }),
      select: { value: true },
    });
    let officePhone = setting?.value?.trim() || '';
    if (!officePhone) {
      const headOffice = await this.prisma.branch.findFirst({
        where: activeOnly({
          companyId,
          isHeadOffice: true,
          isActive: true,
        }),
        select: { phone: true },
      });
      officePhone = headOffice?.phone?.trim() || DEFAULT_OFFICE_PHONE;
    }
    return {
      legalName: company?.legalName?.trim() || PAYSLIP_COMPANY,
      logoUrl: company?.logoUrl ?? null,
      officePhone,
    };
  }

  private async loadPhotoBuffer(
    ctx: AuditContext,
    photoDocumentId: string | null,
  ): Promise<Buffer | null> {
    if (!photoDocumentId) {
      return null;
    }
    try {
      const { url } = await this.documentService.getDownloadUrl(
        ctx,
        photoDocumentId,
        120,
      );
      const response = await fetch(url);
      if (!response.ok) {
        return null;
      }
      const arrayBuffer = await response.arrayBuffer();
      return Buffer.from(arrayBuffer);
    } catch {
      return null;
    }
  }

  private async loadLogoBuffer(logoUrl: string | null): Promise<Buffer | null> {
    if (!logoUrl?.trim()) {
      return null;
    }
    try {
      const response = await fetch(logoUrl.trim());
      if (!response.ok) {
        return null;
      }
      const arrayBuffer = await response.arrayBuffer();
      return Buffer.from(arrayBuffer);
    } catch {
      return null;
    }
  }

  private async renderPdf(
    cards: ReadonlyArray<{ employee: IdCardEmployee; photo: Buffer | null }>,
    company: IdCardCompanyContext,
  ): Promise<Buffer> {
    const fontPath = resolvePayslipFontPath();
    const logo = await this.loadLogoBuffer(company.logoUrl);

    return new Promise<Buffer>((resolve, reject) => {
      const doc = new PDFDocument({
        size: [CARD_WIDTH_PT, CARD_HEIGHT_PT],
        margin: 0,
        autoFirstPage: false,
        info: {
          Title: 'Employee ID Card',
          Author: company.legalName,
        },
      });
      doc.registerFont(PAYSLIP_FONT, fontPath);

      const chunks: Buffer[] = [];
      doc.on('data', (chunk: Buffer) => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      for (const card of cards) {
        this.drawFront(doc, card.employee, card.photo, logo, company);
        this.drawBack(doc, card.employee, company);
      }
      doc.end();
    });
  }

  private drawFront(
    doc: PDFKit.PDFDocument,
    employee: IdCardEmployee,
    photo: Buffer | null,
    logo: Buffer | null,
    company: IdCardCompanyContext,
  ): void {
    doc.addPage({ size: [CARD_WIDTH_PT, CARD_HEIGHT_PT], margin: 0 });
    const headerH = 22;
    doc.rect(0, 0, CARD_WIDTH_PT, headerH).fill(BRAND_GREEN);

    if (logo) {
      try {
        doc.image(logo, 6, 3, { height: 16, fit: [36, 16] });
      } catch {
        // Ignore invalid logo bytes.
      }
    }

    doc
      .fillColor('#FFFFFF')
      .font(PAYSLIP_FONT)
      .fontSize(8)
      .text(company.legalName || PAYSLIP_COMPANY, 46, 7, {
        width: CARD_WIDTH_PT - 52,
        align: 'right',
        lineBreak: false,
      });

    const photoX = 8;
    const photoY = headerH + 8;
    doc
      .save()
      .lineWidth(0.6)
      .strokeColor('#D1D5DB')
      .rect(photoX, photoY, PHOTO_W_PT, PHOTO_H_PT)
      .stroke()
      .restore();

    if (photo) {
      try {
        doc.image(photo, photoX, photoY, {
          fit: [PHOTO_W_PT, PHOTO_H_PT],
          align: 'center',
          valign: 'center',
        });
      } catch {
        this.drawPhotoPlaceholder(doc, photoX, photoY);
      }
    } else {
      this.drawPhotoPlaceholder(doc, photoX, photoY);
    }

    const textX = photoX + PHOTO_W_PT + 10;
    const textW = CARD_WIDTH_PT - textX - 8;
    let y = photoY + 2;
    const name = formatFullName(employee);

    doc.fillColor(INK).font(PAYSLIP_FONT).fontSize(11);
    doc.text(name, textX, y, { width: textW, lineBreak: false });
    y += 16;

    doc.fillColor(MUTED).fontSize(7).text('Employee ID', textX, y, {
      width: textW,
      lineBreak: false,
    });
    y += 10;
    doc
      .fillColor(INK)
      .fontSize(8)
      .text(employee.employeeId?.trim() || '—', textX, y, {
        width: textW,
        lineBreak: false,
      });
    y += 14;

    doc.fillColor(MUTED).fontSize(7).text('Position', textX, y, {
      width: textW,
      lineBreak: false,
    });
    y += 10;
    doc
      .fillColor(INK)
      .fontSize(8)
      .text(employee.position?.title?.trim() || '—', textX, y, {
        width: textW,
        lineBreak: false,
      });
    y += 14;

    doc.fillColor(MUTED).fontSize(7).text('Department', textX, y, {
      width: textW,
      lineBreak: false,
    });
    y += 10;
    doc
      .fillColor(INK)
      .fontSize(8)
      .text(employee.department?.name?.trim() || '—', textX, y, {
        width: textW,
        lineBreak: false,
      });
  }

  private drawBack(
    doc: PDFKit.PDFDocument,
    employee: IdCardEmployee,
    company: IdCardCompanyContext,
  ): void {
    doc.addPage({ size: [CARD_WIDTH_PT, CARD_HEIGHT_PT], margin: 0 });
    const headerH = 22;
    doc.rect(0, 0, CARD_WIDTH_PT, headerH).fill(BRAND_GREEN);
    doc
      .fillColor('#FFFFFF')
      .font(PAYSLIP_FONT)
      .fontSize(9)
      .text('Employee ID Card', 8, 7, {
        width: CARD_WIDTH_PT - 16,
        align: 'center',
        lineBreak: false,
      });

    // Thin border around the card back.
    doc
      .save()
      .lineWidth(0.8)
      .strokeColor(BRAND_GREEN)
      .rect(1.5, 1.5, CARD_WIDTH_PT - 3, CARD_HEIGHT_PT - 3)
      .stroke()
      .restore();

    const padX = 12;
    let y = headerH + 14;
    const valueW = CARD_WIDTH_PT - padX * 2;

    const employed = employee.employmentDate
      ? formatDate(employee.employmentDate)
      : '—';
    this.drawLabeledRow(doc, padX, y, valueW, 'Employed', employed);
    y += 22;

    const blood = employee.bloodType?.trim() || '—';
    this.drawLabeledRow(doc, padX, y, valueW, 'Blood Type', blood);
    y += 22;

    const emergency = firstEmergencyContact(employee.emergencyContacts);
    this.drawLabeledRow(
      doc,
      padX,
      y,
      valueW,
      'Emergency Contact',
      emergency
        ? `${emergency.name}${emergency.phone ? ` · ${emergency.phone}` : ''}`
        : '—',
    );

    const footerY = CARD_HEIGHT_PT - 28;
    doc
      .fillColor(MUTED)
      .font(PAYSLIP_FONT)
      .fontSize(6.5)
      .text(
        `If found, please return to ${company.legalName || PAYSLIP_COMPANY}`,
        padX,
        footerY,
        { width: valueW, align: 'center' },
      );
    doc
      .fillColor(INK)
      .fontSize(7)
      .text(company.officePhone, padX, footerY + 10, {
        width: valueW,
        align: 'center',
        lineBreak: false,
      });
  }

  private drawLabeledRow(
    doc: PDFKit.PDFDocument,
    x: number,
    y: number,
    width: number,
    label: string,
    value: string,
  ): void {
    doc.fillColor(MUTED).font(PAYSLIP_FONT).fontSize(7).text(label, x, y, {
      width,
      lineBreak: false,
    });
    doc
      .fillColor(INK)
      .fontSize(8)
      .text(value, x, y + 10, { width, lineBreak: false });
  }

  private drawPhotoPlaceholder(
    doc: PDFKit.PDFDocument,
    x: number,
    y: number,
  ): void {
    doc
      .save()
      .rect(x, y, PHOTO_W_PT, PHOTO_H_PT)
      .fill('#F3F4F6')
      .restore();
    doc
      .fillColor(MUTED)
      .font(PAYSLIP_FONT)
      .fontSize(7)
      .text('No photo', x, y + PHOTO_H_PT / 2 - 4, {
        width: PHOTO_W_PT,
        align: 'center',
        lineBreak: false,
      });
  }
}

function formatFullName(
  person:
    | {
        firstName?: string | null;
        middleName?: string | null;
        lastName?: string | null;
      }
    | null
    | undefined,
): string {
  if (!person) return '—';
  return (
    [person.firstName, person.middleName, person.lastName]
      .map((part) => part?.trim())
      .filter(Boolean)
      .join(' ') || '—'
  );
}

function formatDate(value: Date): string {
  return value.toISOString().slice(0, 10);
}

function firstEmergencyContact(
  value: Prisma.JsonValue | null,
): EmergencyContactLine | null {
  if (!Array.isArray(value) || value.length === 0) {
    return null;
  }
  const entry = value[0];
  if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
    return null;
  }
  const record = entry as Record<string, unknown>;
  const text = (key: string): string => {
    const raw = record[key];
    return typeof raw === 'string' ? raw.trim() : '';
  };
  const name = [text('firstName'), text('middleName'), text('lastName')]
    .filter(Boolean)
    .join(' ');
  const phone = text('phone');
  if (!name && !phone) {
    return null;
  }
  return { name: name || '—', phone };
}
