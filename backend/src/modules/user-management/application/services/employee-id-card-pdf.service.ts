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

/** Exact CR80: 85.6mm × 54mm (ISO/IEC 7810 ID-1). */
const MM_TO_PT = 72 / 25.4;
const CARD_WIDTH_PT = 85.6 * MM_TO_PT;
const CARD_HEIGHT_PT = 54 * MM_TO_PT;
/** Minimum inset from card edges. */
const PAD_PT = 3 * MM_TO_PT;
/** App primary green (CRCC teal). */
const BRAND_GREEN = '#1D9E75';
const INK = '#1A1A1A';
const MUTED = '#6B7280';
/** Passport photo aspect (25mm × 32mm). */
const PHOTO_ASPECT = 25 / 32;
const WATERMARK_OPACITY = 0.1;
const WATERMARK_WIDTH_RATIO = 0.65;
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
        this.drawBack(doc, card.employee, logo, company);
      }
      doc.end();
    });
  }

  private beginCardPage(doc: PDFKit.PDFDocument): void {
    doc.addPage({ size: [CARD_WIDTH_PT, CARD_HEIGHT_PT], margin: 0 });
    doc.rect(0, 0, CARD_WIDTH_PT, CARD_HEIGHT_PT).fill('#FFFFFF');
  }

  private drawCardBorder(doc: PDFKit.PDFDocument): void {
    doc
      .save()
      .lineWidth(0.8)
      .strokeColor(BRAND_GREEN)
      .rect(1.2, 1.2, CARD_WIDTH_PT - 2.4, CARD_HEIGHT_PT - 2.4)
      .stroke()
      .restore();
  }

  /**
   * Centered company logo watermark behind card content (≈65% width, 10% opacity).
   */
  private drawWatermark(doc: PDFKit.PDFDocument, logo: Buffer | null): void {
    if (!logo) return;
    const box = CARD_WIDTH_PT * WATERMARK_WIDTH_RATIO;
    const x = (CARD_WIDTH_PT - box) / 2;
    const y = (CARD_HEIGHT_PT - box) / 2;
    doc.save();
    doc.opacity(WATERMARK_OPACITY);
    try {
      doc.image(logo, x, y, {
        fit: [box, box],
        align: 'center',
        valign: 'center',
      });
    } catch {
      // Ignore invalid logo bytes.
    }
    doc.restore();
  }

  private drawFront(
    doc: PDFKit.PDFDocument,
    employee: IdCardEmployee,
    photo: Buffer | null,
    logo: Buffer | null,
    company: IdCardCompanyContext,
  ): void {
    this.beginCardPage(doc);
    this.drawWatermark(doc, logo);

    const headerH = 30;
    doc.rect(0, 0, CARD_WIDTH_PT, headerH).fill(BRAND_GREEN);

    const logoBox = 18;
    const logoX = PAD_PT;
    const logoY = (headerH - logoBox) / 2;
    if (logo) {
      try {
        doc.image(logo, logoX, logoY, {
          fit: [logoBox * 1.6, logoBox],
          valign: 'center',
        });
      } catch {
        // Ignore invalid logo bytes.
      }
    }

    const nameX = logoX + logoBox * 1.6 + 4;
    const nameW = CARD_WIDTH_PT - nameX - PAD_PT;
    this.drawHeaderCompanyName(
      doc,
      company.legalName || PAYSLIP_COMPANY,
      nameX,
      5,
      nameW,
      headerH - 8,
    );

    const bodyTop = headerH + PAD_PT * 0.7;
    const bodyBottom = CARD_HEIGHT_PT - PAD_PT;
    const bodyH = bodyBottom - bodyTop;
    const photoH = bodyH;
    const photoW = Math.min(photoH * PHOTO_ASPECT, CARD_WIDTH_PT * 0.36);
    const photoX = PAD_PT;
    const photoY = bodyTop;

    doc
      .save()
      .lineWidth(0.6)
      .strokeColor('#D1D5DB')
      .rect(photoX, photoY, photoW, photoH)
      .stroke()
      .restore();

    if (photo) {
      try {
        doc.image(photo, photoX, photoY, {
          fit: [photoW, photoH],
          align: 'center',
          valign: 'center',
        });
      } catch {
        this.drawPhotoPlaceholder(doc, photoX, photoY, photoW, photoH);
      }
    } else {
      this.drawPhotoPlaceholder(doc, photoX, photoY, photoW, photoH);
    }

    const textX = photoX + photoW + 8;
    const textW = CARD_WIDTH_PT - textX - PAD_PT;
    const fields: Array<{ label: string; value: string; valueSize: number }> = [
      { label: '', value: formatFullName(employee), valueSize: 10.5 },
      {
        label: 'Employee ID',
        value: employee.employeeId?.trim() || '—',
        valueSize: 8,
      },
      {
        label: 'Position',
        value: employee.position?.title?.trim() || '—',
        valueSize: 8,
      },
      {
        label: 'Department',
        value: employee.department?.name?.trim() || '—',
        valueSize: 8,
      },
    ];
    const slotH = bodyH / fields.length;
    fields.forEach((field, index) => {
      const slotTop = bodyTop + index * slotH;
      if (!field.label) {
        const nameY = slotTop + (slotH - 12) / 2;
        this.drawAbsoluteText(doc, field.value, textX, nameY, textW, {
          size: field.valueSize,
          color: INK,
        });
        return;
      }
      const labelY = slotTop + 2;
      const valueY = labelY + 10;
      this.drawAbsoluteText(doc, field.label, textX, labelY, textW, {
        size: 6.5,
        color: MUTED,
      });
      this.drawAbsoluteText(doc, field.value, textX, valueY, textW, {
        size: field.valueSize,
        color: INK,
      });
    });

    this.drawCardBorder(doc);
  }

  private drawBack(
    doc: PDFKit.PDFDocument,
    employee: IdCardEmployee,
    logo: Buffer | null,
    company: IdCardCompanyContext,
  ): void {
    this.beginCardPage(doc);
    this.drawWatermark(doc, logo);

    const headerH = 26;
    doc.rect(0, 0, CARD_WIDTH_PT, headerH).fill(BRAND_GREEN);
    this.drawAbsoluteText(
      doc,
      'Employee ID Card',
      PAD_PT,
      (headerH - 10) / 2,
      CARD_WIDTH_PT - PAD_PT * 2,
      { size: 9, color: '#FFFFFF', align: 'center' },
    );

    const contentTop = headerH + PAD_PT;
    const padX = PAD_PT;
    const valueW = CARD_WIDTH_PT - padX * 2;

    const returnText = `If found, please return to ${company.legalName || PAYSLIP_COMPANY}`;
    doc.font(PAYSLIP_FONT).fontSize(6);
    const returnH = Math.max(
      8,
      doc.heightOfString(returnText, { width: valueW, align: 'center' }),
    );
    const phoneH = 9;
    const footerGap = 3;
    const footerBlockH = returnH + footerGap + phoneH;
    const footerTop = CARD_HEIGHT_PT - PAD_PT - footerBlockH;

    const rowsTop = contentTop;
    const rowsBottom = footerTop - 6;
    const rows: Array<{ label: string; value: string }> = [
      {
        label: 'Employed',
        value: employee.employmentDate
          ? formatDate(employee.employmentDate)
          : '—',
      },
      {
        label: 'Blood Type',
        value: employee.bloodType?.trim() || '—',
      },
      {
        label: 'Emergency Contact',
        value: (() => {
          const emergency = firstEmergencyContact(employee.emergencyContacts);
          if (!emergency) return '—';
          return emergency.phone
            ? `${emergency.name} · ${emergency.phone}`
            : emergency.name;
        })(),
      },
    ];
    const slotH = (rowsBottom - rowsTop) / rows.length;
    rows.forEach((row, index) => {
      const slotTop = rowsTop + index * slotH;
      const labelY = slotTop + Math.max(0, (slotH - 20) / 2);
      this.drawLabeledRow(doc, padX, labelY, valueW, row.label, row.value);
    });

    this.drawAbsoluteText(doc, returnText, padX, footerTop, valueW, {
      size: 6,
      color: MUTED,
      align: 'center',
      lineBreak: true,
    });
    this.drawAbsoluteText(
      doc,
      company.officePhone,
      padX,
      footerTop + returnH + footerGap,
      valueW,
      { size: 7, color: INK, align: 'center' },
    );

    this.drawCardBorder(doc);
  }

  /**
   * Fits the company legal name into the green header (one or two lines).
   */
  private drawHeaderCompanyName(
    doc: PDFKit.PDFDocument,
    name: string,
    x: number,
    y: number,
    width: number,
    height: number,
  ): void {
    const trimmed = name.trim() || '—';
    doc.font(PAYSLIP_FONT).fillColor('#FFFFFF');

    for (const candidate of [8, 7.5, 7, 6.5, 6, 5.5]) {
      doc.fontSize(candidate);
      if (doc.widthOfString(trimmed) <= width) {
        this.drawAbsoluteText(
          doc,
          trimmed,
          x,
          y + (height - candidate) / 2,
          width,
          { size: candidate, color: '#FFFFFF', align: 'right' },
        );
        return;
      }
    }

    const lines = splitCompanyName(trimmed);
    let size = 7;
    for (const candidate of [7, 6.5, 6, 5.5, 5]) {
      size = candidate;
      doc.fontSize(candidate);
      if (lines.every((line) => doc.widthOfString(line) <= width)) break;
    }

    if (lines.length === 1) {
      this.drawAbsoluteText(doc, lines[0]!, x, y + (height - size) / 2, width, {
        size,
        color: '#FFFFFF',
        align: 'right',
      });
      return;
    }

    const lineGap = 1.5;
    const blockH = size * 2 + lineGap;
    const top = y + Math.max(0, (height - blockH) / 2);
    this.drawAbsoluteText(doc, lines[0]!, x, top, width, {
      size,
      color: '#FFFFFF',
      align: 'right',
    });
    this.drawAbsoluteText(doc, lines[1]!, x, top + size + lineGap, width, {
      size,
      color: '#FFFFFF',
      align: 'right',
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
    this.drawAbsoluteText(doc, label, x, y, width, { size: 6.5, color: MUTED });
    this.drawAbsoluteText(doc, value, x, y + 10, width, {
      size: 8,
      color: INK,
    });
  }

  private drawAbsoluteText(
    doc: PDFKit.PDFDocument,
    value: string,
    x: number,
    y: number,
    width: number,
    options: {
      size: number;
      color: string;
      align?: 'left' | 'center' | 'right';
      lineBreak?: boolean;
    },
  ): void {
    doc
      .fillColor(options.color)
      .font(PAYSLIP_FONT)
      .fontSize(options.size)
      .text(value, x, y, {
        width,
        align: options.align ?? 'left',
        lineBreak: options.lineBreak ?? false,
        ellipsis: !(options.lineBreak ?? false),
      });
  }

  private drawPhotoPlaceholder(
    doc: PDFKit.PDFDocument,
    x: number,
    y: number,
    width: number,
    height: number,
  ): void {
    doc.save().rect(x, y, width, height).fill('#F3F4F6').restore();
    this.drawAbsoluteText(
      doc,
      'No photo',
      x,
      y + height / 2 - 4,
      width,
      { size: 7, color: MUTED, align: 'center' },
    );
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

/**
 * Prefer a natural two-line company header when the legal name is long
 * (e.g. "CRCC International" / "Engineering Consulting Co. Ltd").
 */
function splitCompanyName(name: string): [string] | [string, string] {
  const trimmed = name.trim();
  if (!trimmed) return ['—'];

  const preferred =
    trimmed.match(/^(.*? International)\s+(.+)$/i) ??
    trimmed.match(/^(.*? Engineering)\s+(.+)$/i) ??
    trimmed.match(/^(.*? Consulting)\s+(.+)$/i) ??
    trimmed.match(/^(.*? Branch)\s+(.+)$/i);
  if (preferred?.[1] && preferred[2]) {
    return [preferred[1].trim(), preferred[2].trim()];
  }

  if (trimmed.length <= 28) {
    return [trimmed];
  }

  const mid = Math.floor(trimmed.length / 2);
  let best = -1;
  for (let i = 0; i < trimmed.length; i += 1) {
    if (trimmed[i] !== ' ') continue;
    if (best < 0 || Math.abs(i - mid) < Math.abs(best - mid)) {
      best = i;
    }
  }
  if (best > 0) {
    return [trimmed.slice(0, best).trim(), trimmed.slice(best + 1).trim()];
  }
  return [trimmed];
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
