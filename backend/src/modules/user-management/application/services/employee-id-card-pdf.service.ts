import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
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
/** CRCC logo colours: globe blue and wordmark red. */
const BRAND_BLUE = '#1F5FAE';
const BRAND_BLUE_DARK = '#163F78';
const BRAND_RED = '#D7000F';
const BRAND_BLUE_TINT = '#EEF3FA';
const INK = '#1A1A1A';
const MUTED = '#6B7280';
const WHITE = '#FFFFFF';
const WATERMARK_OPACITY = 0.08;
const WATERMARK_HEIGHT_RATIO = 0.9;
/** HR office line printed on the back for returning a found card. */
const HR_RETURN_PHONE = '+251 94 408 9585';
/** Bundled CRCC logo used when the company has no reachable logo URL. */
const BUNDLED_LOGO_FILE = 'crcc-logo.jpg';
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
    return {
      legalName: company?.legalName?.trim() || PAYSLIP_COMPANY,
      logoUrl: company?.logoUrl ?? null,
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

  /** Company logo from its URL, falling back to the bundled CRCC logo. */
  private async loadLogoBuffer(logoUrl: string | null): Promise<Buffer | null> {
    if (logoUrl?.trim()) {
      try {
        const response = await fetch(logoUrl.trim());
        if (response.ok) {
          return Buffer.from(await response.arrayBuffer());
        }
      } catch {
        // Fall through to the bundled logo.
      }
    }
    return readBundledLogo();
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
    doc.rect(0, 0, CARD_WIDTH_PT, CARD_HEIGHT_PT).fill(WHITE);
  }

  /** Hairline cut guide around the card edge. */
  private drawCardBorder(doc: PDFKit.PDFDocument): void {
    doc
      .save()
      .lineWidth(0.5)
      .strokeColor('#D1D5DB')
      .rect(0.5, 0.5, CARD_WIDTH_PT - 1, CARD_HEIGHT_PT - 1)
      .stroke()
      .restore();
  }

  /**
   * Faint logo watermark centred in the given box, behind card content.
   */
  private drawWatermark(
    doc: PDFKit.PDFDocument,
    logo: Buffer | null,
    box: { x: number; y: number; width: number; height: number },
  ): void {
    if (!logo) return;
    const size = Math.min(box.width, box.height * WATERMARK_HEIGHT_RATIO);
    doc.save();
    doc.opacity(WATERMARK_OPACITY);
    try {
      doc.image(
        logo,
        box.x + (box.width - size) / 2,
        box.y + (box.height - size) / 2,
        { fit: [size, size], align: 'center', valign: 'center' },
      );
    } catch {
      // Ignore invalid logo bytes.
    }
    doc.restore();
  }

  /**
   * Blue header band with a red accent stripe; returns the y where the body starts.
   */
  private drawHeaderBand(doc: PDFKit.PDFDocument, height: number): number {
    const stripe = 2.5;
    doc.rect(0, 0, CARD_WIDTH_PT, height).fill(BRAND_BLUE);
    doc.rect(0, height, CARD_WIDTH_PT, stripe).fill(BRAND_RED);
    return height + stripe;
  }

  /** Logo on a white rounded badge (the logo has a white background). */
  private drawLogoBadge(
    doc: PDFKit.PDFDocument,
    logo: Buffer | null,
    x: number,
    y: number,
    size: number,
  ): void {
    if (!logo) return;
    doc.save().roundedRect(x, y, size, size, 3).fill(WHITE).restore();
    try {
      const inset = 1;
      doc.image(logo, x + inset, y + inset, {
        fit: [size - inset * 2, size - inset * 2],
        align: 'center',
        valign: 'center',
      });
    } catch {
      // Ignore invalid logo bytes.
    }
  }

  /** Square (4×4) photo, cropped to fill, with rounded blue frame. */
  private drawPhoto(
    doc: PDFKit.PDFDocument,
    photo: Buffer | null,
    x: number,
    y: number,
    size: number,
  ): void {
    const radius = 4;
    let drawn = false;
    if (photo) {
      doc.save();
      doc.roundedRect(x, y, size, size, radius).clip();
      try {
        doc.image(photo, x, y, {
          cover: [size, size],
          align: 'center',
          valign: 'center',
        });
        drawn = true;
      } catch {
        // Fall back to the placeholder.
      }
      doc.restore();
    }
    if (!drawn) {
      this.drawPhotoPlaceholder(doc, x, y, size, size);
    }
    doc
      .save()
      .lineWidth(1.2)
      .strokeColor(BRAND_BLUE)
      .roundedRect(x, y, size, size, radius)
      .stroke()
      .restore();
  }

  /** Uppercase field label in a logo colour. */
  private drawFieldLabel(
    doc: PDFKit.PDFDocument,
    label: string,
    x: number,
    y: number,
    width: number,
    color: string,
  ): void {
    this.drawAbsoluteText(doc, label.toUpperCase(), x, y, width, {
      size: 5.5,
      color,
      characterSpacing: 0.6,
    });
  }

  /** Largest font size (down to `min`) at which `value` fits on one line. */
  private fitFontSize(
    doc: PDFKit.PDFDocument,
    value: string,
    width: number,
    sizes: readonly number[],
  ): number {
    doc.font(PAYSLIP_FONT);
    for (const size of sizes) {
      doc.fontSize(size);
      if (doc.widthOfString(value) <= width) return size;
    }
    return sizes[sizes.length - 1]!;
  }

  private drawFront(
    doc: PDFKit.PDFDocument,
    employee: IdCardEmployee,
    photo: Buffer | null,
    logo: Buffer | null,
    company: IdCardCompanyContext,
  ): void {
    this.beginCardPage(doc);

    // Header: logo badge + company name on blue, red accent stripe.
    const headerH = 30;
    const headerBottom = this.drawHeaderBand(doc, headerH);
    const badge = 24;
    this.drawLogoBadge(doc, logo, PAD_PT, (headerH - badge) / 2, badge);
    const nameX = PAD_PT + (logo ? badge + 6 : 0);
    this.drawHeaderCompanyName(
      doc,
      company.legalName || PAYSLIP_COMPANY,
      nameX,
      4,
      CARD_WIDTH_PT - nameX - PAD_PT,
      headerH - 8,
    );

    // Footer band.
    const footerH = 11;
    const footerTop = CARD_HEIGHT_PT - footerH;
    doc.rect(0, footerTop, CARD_WIDTH_PT, footerH).fill(BRAND_BLUE_DARK);
    this.drawAbsoluteText(
      doc,
      'EMPLOYEE IDENTIFICATION CARD',
      PAD_PT,
      footerTop + (footerH - 5.5) / 2 - 1,
      CARD_WIDTH_PT - PAD_PT * 2,
      { size: 5.5, color: WHITE, align: 'center', characterSpacing: 1.2 },
    );

    // Body: square photo left, details right, watermark behind details.
    const bodyTop = headerBottom + 6;
    const bodyH = footerTop - 6 - bodyTop;
    const photoSize = bodyH;
    const textX = PAD_PT + photoSize + 9;
    const textW = CARD_WIDTH_PT - textX - PAD_PT;

    this.drawWatermark(doc, logo, {
      x: textX,
      y: bodyTop,
      width: textW,
      height: bodyH,
    });
    this.drawPhoto(doc, photo, PAD_PT, bodyTop, photoSize);

    const fullName = formatFullName(employee);
    const nameSize = this.fitFontSize(doc, fullName, textW, [11, 10, 9, 8, 7]);
    this.drawAbsoluteText(doc, fullName, textX, bodyTop, textW, {
      size: nameSize,
      color: BRAND_BLUE_DARK,
    });
    doc.rect(textX, bodyTop + 17, 20, 1.6).fill(BRAND_RED);

    const fields: Array<{ label: string; value: string }> = [
      { label: 'Employee ID', value: employee.employeeId?.trim() || '—' },
      { label: 'Position', value: employee.position?.title?.trim() || '—' },
      { label: 'Department', value: employee.department?.name?.trim() || '—' },
    ];
    const fieldsTop = bodyTop + 24;
    const slotH = (bodyTop + bodyH - fieldsTop) / fields.length;
    fields.forEach((field, index) => {
      const y = fieldsTop + index * slotH;
      this.drawFieldLabel(doc, field.label, textX, y, textW, BRAND_RED);
      this.drawAbsoluteText(doc, field.value, textX, y + 7.5, textW, {
        size: 8,
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

    const headerH = 24;
    const headerBottom = this.drawHeaderBand(doc, headerH);
    const badge = 18;
    this.drawLogoBadge(doc, logo, PAD_PT, (headerH - badge) / 2, badge);
    this.drawAbsoluteText(
      doc,
      'EMPLOYEE ID CARD',
      PAD_PT,
      (headerH - 9) / 2 - 1,
      CARD_WIDTH_PT - PAD_PT * 2,
      { size: 8.5, color: WHITE, align: 'center', characterSpacing: 1.2 },
    );

    const padX = PAD_PT;
    const innerW = CARD_WIDTH_PT - padX * 2;

    // "If found" panel at the bottom with the HR phone line.
    const panelH = 29;
    const panelTop = CARD_HEIGHT_PT - PAD_PT - panelH;
    const bodyTop = headerBottom + 7;

    this.drawWatermark(doc, logo, {
      x: padX,
      y: headerBottom,
      width: innerW,
      height: panelTop - headerBottom,
    });

    // Row 1: employment date | blood type.
    const colW = innerW / 2;
    this.drawFieldLabel(doc, 'Employed', padX, bodyTop, colW, BRAND_BLUE);
    this.drawAbsoluteText(
      doc,
      employee.employmentDate ? formatDate(employee.employmentDate) : '—',
      padX,
      bodyTop + 7.5,
      colW,
      { size: 8.5, color: INK },
    );
    this.drawFieldLabel(doc, 'Blood Type', padX + colW, bodyTop, colW, BRAND_BLUE);
    this.drawAbsoluteText(
      doc,
      employee.bloodType?.trim() || '—',
      padX + colW,
      bodyTop + 6.5,
      colW,
      { size: 10, color: BRAND_RED },
    );

    // Row 2: emergency contact name, then phone.
    const emergency = firstEmergencyContact(employee.emergencyContacts);
    const row2Top = bodyTop + 27;
    this.drawFieldLabel(doc, 'Emergency Contact', padX, row2Top, innerW, BRAND_BLUE);
    this.drawAbsoluteText(
      doc,
      emergency?.name || '—',
      padX,
      row2Top + 7.5,
      innerW,
      { size: 8.5, color: INK },
    );
    if (emergency?.phone) {
      this.drawAbsoluteText(doc, emergency.phone, padX, row2Top + 18, innerW, {
        size: 8,
        color: MUTED,
      });
    }

    doc
      .save()
      .roundedRect(padX, panelTop, innerW, panelH, 3)
      .fill(BRAND_BLUE_TINT)
      .restore();
    doc.rect(padX, panelTop, 2.5, panelH).fill(BRAND_RED);
    this.drawAbsoluteText(
      doc,
      `If found, please return to ${company.legalName || PAYSLIP_COMPANY} HR Office`,
      padX + 4,
      panelTop + 4,
      innerW - 8,
      { size: 6, color: MUTED, align: 'center' },
    );
    this.drawAbsoluteText(
      doc,
      `Tel: ${HR_RETURN_PHONE}`,
      padX + 4,
      panelTop + 14,
      innerW - 8,
      { size: 9, color: BRAND_BLUE_DARK, align: 'center' },
    );

    this.drawCardBorder(doc);
  }

  /**
   * Fits the company legal name into the blue header (one or two lines).
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
    doc.font(PAYSLIP_FONT).fillColor(WHITE);

    for (const candidate of [10, 9, 8, 7.5, 7, 6.5, 6]) {
      doc.fontSize(candidate);
      if (doc.widthOfString(trimmed) <= width) {
        this.drawAbsoluteText(
          doc,
          trimmed,
          x,
          y + (height - candidate) / 2,
          width,
          { size: candidate, color: WHITE, align: 'left' },
        );
        return;
      }
    }

    const lines = splitCompanyName(trimmed);
    let size = 8.5;
    for (const candidate of [8.5, 8, 7.5, 7, 6.5, 6, 5.5]) {
      size = candidate;
      doc.fontSize(candidate);
      if (lines.every((line) => doc.widthOfString(line) <= width)) break;
    }

    if (lines.length === 1) {
      this.drawAbsoluteText(doc, lines[0]!, x, y + (height - size) / 2, width, {
        size,
        color: WHITE,
        align: 'left',
      });
      return;
    }

    const lineGap = 1.5;
    const blockH = size * 2 + lineGap;
    const top = y + Math.max(0, (height - blockH) / 2);
    this.drawAbsoluteText(doc, lines[0]!, x, top, width, {
      size,
      color: WHITE,
      align: 'left',
    });
    this.drawAbsoluteText(doc, lines[1]!, x, top + size + lineGap, width, {
      size,
      color: WHITE,
      align: 'left',
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
      characterSpacing?: number;
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
        characterSpacing: options.characterSpacing ?? 0,
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
    doc
      .save()
      .roundedRect(x, y, width, height, 4)
      .fill(BRAND_BLUE_TINT)
      .restore();
    this.drawAbsoluteText(
      doc,
      'Photo 4×4',
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

let bundledLogoCache: Buffer | null | undefined;

/** Reads backend/assets/images/crcc-logo.jpg once (same lookup as the PDF font). */
function readBundledLogo(): Buffer | null {
  if (bundledLogoCache !== undefined) return bundledLogoCache;
  const candidates = [
    join(process.cwd(), 'assets', 'images', BUNDLED_LOGO_FILE),
    join(process.cwd(), 'backend', 'assets', 'images', BUNDLED_LOGO_FILE),
  ];
  const found = candidates.find((candidate) => existsSync(candidate));
  bundledLogoCache = found ? readFileSync(found) : null;
  return bundledLogoCache;
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
