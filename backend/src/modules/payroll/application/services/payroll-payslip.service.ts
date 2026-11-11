import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { createRequire } from 'module';
import type { EmployeeType } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';
import type { Archiver } from 'archiver';
import { PassThrough } from 'stream';
import { NotificationService } from '../../../notifications/application/services/notification.service';
import { PermissionService } from '../../../../shared/permissions/permission.service';
import { PrismaService } from '../../../../shared/prisma/prisma.service';
import {
  formatEmployeeName,
  formatPayslipMonth,
  maskAccountLast4,
  payslipPdfFileName,
  type PayslipPdfModel,
} from './payroll-payslip-pdf.layout';
import { PayrollPayslipPdfService } from './payroll-payslip-pdf.service';

interface ServiceContext {
  userId: string;
  companyId: string;
}

export interface PayslipGenerateResult {
  created: number;
  updated: number;
  skipped: number;
  total: number;
}

export interface PayslipReleaseResult {
  released: number;
  alreadyReleased: number;
  notified: number;
}

export interface PayslipFile {
  buffer: Buffer;
  filename: string;
  mimeType: string;
}

export interface PayslipListItem {
  id: string;
  runId: string;
  runNumber: string;
  month: number;
  year: number;
  netPay: number;
  releasedAt: Date | null;
  downloadedAt: Date | null;
  downloaded: boolean;
  released: boolean;
  employeeName: string;
  employeeCode: string | null;
  department: string | null;
  discipline: string | null;
  bankName: string | null;
  bankAccountMasked: string | null;
  paidDays: number;
  basicSalary: number;
  earnedSalary: number;
  normalOtHours: number;
  eveningOtHours: number;
  sundayOtHours: number;
  holidayOtHours: number;
  normalOtPay: number;
  eveningOtPay: number;
  sundayOtPay: number;
  holidayOtPay: number;
  transportAllowance: number;
  monthlyBonus: number;
  bonusTopUp: number;
  bonusTopUpReason: string | null;
  contractNetBonus: number;
  netTopUp: number;
  netTopUpReason: string | null;
  grossIncome: number;
  pensionApplicable: boolean;
  pensionEmployee: number;
  pensionEmployer: number;
  incomeTax: number;
  totalDeductions: number;
}

const nodeRequire = createRequire(__filename);

interface ZipFactory {
  (format: 'zip', options: { zlib: { level: number } }): Archiver;
}

const RELEASABLE_STATUSES = ['GM_APPROVED', 'PAID'] as const;

type PayslipWithRelations = {
  id: string;
  employeeId: string;
  generatedAt: Date | null;
  releasedAt: Date | null;
  downloadedAt: Date | null;
  run: {
    id: string;
    runNumber: string;
    month: number;
    year: number;
    type: string;
    notes: string | null;
  };
  employee: {
    firstName: string;
    lastName: string;
    chineseName: string | null;
    employeeId: string | null;
    department: { name: string } | null;
    engineeringDiscipline: { name: string } | null;
  };
  entry: {
    payrollDays: Decimal;
    basicSalary: Decimal;
    earnedSalary: Decimal;
    normalOtHours: Decimal;
    eveningOtHours: Decimal;
    sundayOtHours: Decimal;
    holidayOtHours: Decimal;
    normalOtPay: Decimal;
    eveningOtPay: Decimal;
    sundayOtPay: Decimal;
    holidayOtPay: Decimal;
    transportAllowance: Decimal;
    monthlyBonus: Decimal;
    bonusTopUp: Decimal;
    bonusTopUpReason: string | null;
    contractNetBonus: Decimal;
    netTopUp: Decimal;
    netTopUpReason: string | null;
    grossIncome: Decimal;
    employeeCategory: EmployeeType | null;
    pensionEmployee: Decimal;
    pensionEmployer: Decimal;
    incomeTax: Decimal;
    totalDeductions: Decimal;
    netPay: Decimal;
    originalAmount: Decimal | null;
    correctedAmount: Decimal | null;
    deltaAmount: Decimal | null;
    bankName: string | null;
    bankAccountNumber: string | null;
    contract: { pensionApplicable: boolean } | null;
  };
};

/**
 * Generates, releases, and serves payslips built from locked payroll entries.
 */
@Injectable()
export class PayrollPayslipService {
  private readonly logger = new Logger(PayrollPayslipService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly pdf: PayrollPayslipPdfService,
    private readonly notifications: NotificationService,
    private readonly permissions: PermissionService,
  ) {}

  /**
   * Upserts one payslip per payable entry. Allowed only for GM_APPROVED or PAID runs.
   * Entries with zero paid days and zero net pay are skipped. Re-running does not duplicate rows.
   */
  async generate(
    runId: string,
    ctx: ServiceContext,
  ): Promise<PayslipGenerateResult> {
    const run = await this.requireRun(runId, ctx.companyId);
    this.assertReleasableStatus(run.status, 'generate payslips');

    const entries = await this.prisma.payrollEntry.findMany({
      where: { runId, companyId: ctx.companyId },
      select: {
        id: true,
        employeeId: true,
        payrollDays: true,
        netPay: true,
        deltaAmount: true,
      },
    });

    const eligible = entries.filter((entry) => {
      if (
        this.toNumber(entry.payrollDays) === 0 &&
        this.toNumber(entry.netPay) === 0
      ) {
        return false;
      }
      // Correction payslips only for employees whose amount changed.
      if (run.type === 'CORRECTION' && this.toNumber(entry.deltaAmount) === 0) {
        return false;
      }
      return true;
    });
    const skipped = entries.length - eligible.length;
    if (eligible.length === 0) {
      return { created: 0, updated: 0, skipped, total: 0 };
    }

    const existing = await this.prisma.payrollPayslip.findMany({
      where: { runId, companyId: ctx.companyId, entryId: { in: eligible.map((e) => e.id) } },
      select: { entryId: true },
    });
    const existingIds = new Set(existing.map((row) => row.entryId));
    const now = new Date();
    const toCreate = eligible.filter((entry) => !existingIds.has(entry.id));
    const toUpdate = eligible.filter((entry) => existingIds.has(entry.id));

    if (toUpdate.length > 0) {
      await this.prisma.payrollPayslip.updateMany({
        where: {
          companyId: ctx.companyId,
          entryId: { in: toUpdate.map((entry) => entry.id) },
        },
        data: {
          generatedAt: now,
          generatedBy: ctx.userId,
          updatedBy: ctx.userId,
        },
      });
    }

    if (toCreate.length > 0) {
      await this.prisma.payrollPayslip.createMany({
        data: toCreate.map((entry) => ({
          companyId: ctx.companyId,
          entryId: entry.id,
          employeeId: entry.employeeId,
          runId,
          generatedAt: now,
          generatedBy: ctx.userId,
          createdBy: ctx.userId,
          updatedBy: ctx.userId,
        })),
      });
    }

    return {
      created: toCreate.length,
      updated: toUpdate.length,
      skipped,
      total: toCreate.length + toUpdate.length,
    };
  }

  /**
   * Releases every generated payslip on the run and notifies each newly released employee.
   * Already-released payslips stay released and are not notified again.
   */
  async release(runId: string, ctx: ServiceContext): Promise<PayslipReleaseResult> {
    const run = await this.requireRun(runId, ctx.companyId);
    this.assertReleasableStatus(run.status, 'release payslips');

    const payslips = await this.prisma.payrollPayslip.findMany({
      where: { runId, companyId: ctx.companyId, generatedAt: { not: null } },
      select: { id: true, employeeId: true, releasedAt: true },
    });

    const pending = payslips.filter((payslip) => payslip.releasedAt == null);
    const alreadyReleased = payslips.length - pending.length;
    if (pending.length === 0) {
      return { released: 0, alreadyReleased, notified: 0 };
    }

    const now = new Date();
    await this.prisma.payrollPayslip.updateMany({
      where: { id: { in: pending.map((payslip) => payslip.id) }, companyId: ctx.companyId },
      data: {
        releasedAt: now,
        releasedBy: ctx.userId,
        updatedBy: ctx.userId,
      },
    });

    const monthLabel = formatPayslipMonth(run.month, run.year);
    const message = `Your payslip for ${monthLabel} is available.`;
    let notified = 0;
    for (const payslip of pending) {
      try {
        await this.notifications.send(
          { companyId: ctx.companyId, userId: ctx.userId },
          {
            recipientId: payslip.employeeId,
            eventType: 'payroll.payslip_released',
            channel: 'IN_APP',
            subject: message,
            body: message,
            link: '/profile?tab=payroll',
          },
        );
        notified += 1;
      } catch (error: unknown) {
        this.logger.warn(
          `Failed to notify ${payslip.employeeId} of payslip release: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
    }

    return { released: pending.length, alreadyReleased, notified };
  }

  /**
   * Released payslips for the signed-in employee, newest period first.
   */
  async listMine(ctx: ServiceContext): Promise<PayslipListItem[]> {
    return this.listForEmployee(ctx.userId, ctx.companyId, true);
  }

  /**
   * Generated payslips for one employee, including ones HR has not released yet.
   */
  async listForHr(
    employeeId: string,
    ctx: ServiceContext,
  ): Promise<PayslipListItem[]> {
    const employee = await this.prisma.user.findFirst({
      where: { id: employeeId, companyId: ctx.companyId, deletedAt: null },
      select: { id: true },
    });
    if (!employee) {
      throw new NotFoundException('Employee not found');
    }
    return this.listForEmployee(employeeId, ctx.companyId, false);
  }

  /**
   * Builds the payslip PDF. The employee may download only after release.
   * payroll.create or payroll.approve may download any generated payslip.
   * The first download by the employee sets downloadedAt.
   */
  async getPdf(payslipId: string, ctx: ServiceContext): Promise<PayslipFile> {
    const payslip = await this.loadPayslip(payslipId, ctx.companyId);
    if (!payslip.generatedAt) {
      throw new NotFoundException('Payslip has not been generated');
    }

    const isOwner = payslip.employeeId === ctx.userId;
    const privileged = await this.hasPayrollStaffAccess(ctx);
    if (!privileged && !(isOwner && payslip.releasedAt)) {
      throw new ForbiddenException('You cannot access this payslip');
    }

    const model = this.toPdfModel(payslip);
    const buffer = await this.pdf.render(model);
    if (isOwner && !payslip.downloadedAt) {
      await this.prisma.payrollPayslip.update({
        where: { id: payslip.id },
        data: { downloadedAt: new Date(), updatedBy: ctx.userId },
      });
    }

    return {
      buffer,
      filename: payslipPdfFileName({
        year: payslip.run.year,
        month: payslip.run.month,
        employeeCode: payslip.employee.employeeId,
        employeeName: formatEmployeeName(payslip.employee),
      }),
      mimeType: 'application/pdf',
    };
  }

  /**
   * ZIP of every generated payslip PDF in the run.
   */
  async getZip(runId: string, ctx: ServiceContext): Promise<PayslipFile> {
    const run = await this.requireRun(runId, ctx.companyId);
    const payslips = await this.prisma.payrollPayslip.findMany({
      where: { runId, companyId: ctx.companyId, generatedAt: { not: null } },
      include: this.payslipInclude(),
      orderBy: { employee: { firstName: 'asc' } },
    });
    if (payslips.length === 0) {
      throw new BadRequestException('No payslips have been generated for this run');
    }

    const createZip = nodeRequire('archiver') as ZipFactory;
    const archive = createZip('zip', { zlib: { level: 6 } });
    const stream = new PassThrough();
    const chunks: Buffer[] = [];
    const finished = new Promise<Buffer>((resolve, reject) => {
      stream.on('data', (chunk: Buffer) => chunks.push(chunk));
      stream.on('end', () => resolve(Buffer.concat(chunks)));
      stream.on('error', reject);
      archive.on('error', reject);
    });
    archive.pipe(stream);

    for (const payslip of payslips) {
      const model = this.toPdfModel(payslip);
      const pdf = await this.pdf.render(model);
      const name = payslipPdfFileName({
        year: run.year,
        month: run.month,
        employeeCode: payslip.employee.employeeId,
        employeeName: formatEmployeeName(payslip.employee),
      });
      archive.append(pdf, { name });
    }
    await archive.finalize();
    const buffer = await finished;
    const mm = String(run.month).padStart(2, '0');
    const safeRun = run.runNumber.replace(/[^\w.-]+/g, '_');
    return {
      buffer,
      filename: `Payslips_${run.year}_${mm}_${safeRun}.zip`,
      mimeType: 'application/zip',
    };
  }

  private async listForEmployee(
    employeeId: string,
    companyId: string,
    releasedOnly: boolean,
  ): Promise<PayslipListItem[]> {
    const payslips = await this.prisma.payrollPayslip.findMany({
      where: {
        companyId,
        employeeId,
        generatedAt: { not: null },
        ...(releasedOnly ? { releasedAt: { not: null } } : {}),
      },
      include: this.payslipInclude(),
      orderBy: [{ run: { year: 'desc' } }, { run: { month: 'desc' } }],
    });
    return payslips.map((payslip) => this.toListItem(payslip));
  }

  private payslipInclude() {
    return {
      run: {
        select: {
          id: true,
          runNumber: true,
          month: true,
          year: true,
          type: true,
          notes: true,
        },
      },
      employee: {
        select: {
          firstName: true,
          middleName: true,
          lastName: true,
          chineseName: true,
          employeeId: true,
          department: { select: { name: true } },
          engineeringDiscipline: { select: { name: true } },
        },
      },
      entry: {
        include: {
          contract: { select: { pensionApplicable: true } },
        },
      },
    } as const;
  }

  private async loadPayslip(
    payslipId: string,
    companyId: string,
  ): Promise<PayslipWithRelations> {
    const payslip = await this.prisma.payrollPayslip.findFirst({
      where: { id: payslipId, companyId },
      include: this.payslipInclude(),
    });
    if (!payslip) {
      throw new NotFoundException('Payslip not found');
    }
    return payslip;
  }

  private toListItem(payslip: PayslipWithRelations): PayslipListItem {
    const entry = payslip.entry;
    return {
      id: payslip.id,
      runId: payslip.run.id,
      runNumber: payslip.run.runNumber,
      month: payslip.run.month,
      year: payslip.run.year,
      netPay: this.toNumber(entry.netPay),
      releasedAt: payslip.releasedAt,
      downloadedAt: payslip.downloadedAt,
      downloaded: payslip.downloadedAt != null,
      released: payslip.releasedAt != null,
      employeeName: formatEmployeeName(payslip.employee),
      employeeCode: payslip.employee.employeeId,
      department: payslip.employee.department?.name ?? null,
      discipline: payslip.employee.engineeringDiscipline?.name ?? null,
      bankName: entry.bankName,
      bankAccountMasked: maskAccountLast4(entry.bankAccountNumber),
      paidDays: this.toNumber(entry.payrollDays),
      basicSalary: this.toNumber(entry.basicSalary),
      earnedSalary: this.toNumber(entry.earnedSalary),
      normalOtHours: this.toNumber(entry.normalOtHours),
      eveningOtHours: this.toNumber(entry.eveningOtHours),
      sundayOtHours: this.toNumber(entry.sundayOtHours),
      holidayOtHours: this.toNumber(entry.holidayOtHours),
      normalOtPay: this.toNumber(entry.normalOtPay),
      eveningOtPay: this.toNumber(entry.eveningOtPay),
      sundayOtPay: this.toNumber(entry.sundayOtPay),
      holidayOtPay: this.toNumber(entry.holidayOtPay),
      transportAllowance: this.toNumber(entry.transportAllowance),
      monthlyBonus: this.toNumber(entry.monthlyBonus),
      bonusTopUp: this.toNumber(entry.bonusTopUp),
      bonusTopUpReason: entry.bonusTopUpReason,
      contractNetBonus: this.toNumber(entry.contractNetBonus),
      netTopUp: this.toNumber(entry.netTopUp),
      netTopUpReason: entry.netTopUpReason,
      grossIncome: this.toNumber(entry.grossIncome),
      // Freelancers always pay pension.
      pensionApplicable:
        entry.employeeCategory === 'FREELANCER' ||
        (entry.contract?.pensionApplicable ?? true),
      pensionEmployee: this.toNumber(entry.pensionEmployee),
      pensionEmployer: this.toNumber(entry.pensionEmployer),
      incomeTax: this.toNumber(entry.incomeTax),
      totalDeductions: this.toNumber(entry.totalDeductions),
    };
  }

  private toPdfModel(payslip: PayslipWithRelations): PayslipPdfModel {
    const item = this.toListItem(payslip);
    const entry = payslip.entry;
    const isCorrection = payslip.run.type === 'CORRECTION';
    const correction =
      isCorrection &&
      entry.originalAmount != null &&
      entry.correctedAmount != null &&
      entry.deltaAmount != null
        ? {
            originalAmount: this.toNumber(entry.originalAmount),
            correctedAmount: this.toNumber(entry.correctedAmount),
            deltaAmount: this.toNumber(entry.deltaAmount),
            note: payslip.run.notes,
          }
        : null;
    return {
      month: item.month,
      year: item.year,
      runNumber: item.runNumber,
      generatedAt: payslip.generatedAt ?? new Date(),
      employeeName: item.employeeName,
      employeeCode: item.employeeCode ?? '',
      department: item.department ?? '',
      discipline: item.discipline ?? '',
      bankName: item.bankName ?? '',
      bankAccountMasked: item.bankAccountMasked ?? '',
      paidDays: item.paidDays,
      basicSalary: item.basicSalary,
      earnedSalary: item.earnedSalary,
      normalOtHours: item.normalOtHours,
      eveningOtHours: item.eveningOtHours,
      sundayOtHours: item.sundayOtHours,
      holidayOtHours: item.holidayOtHours,
      normalOtPay: item.normalOtPay,
      eveningOtPay: item.eveningOtPay,
      sundayOtPay: item.sundayOtPay,
      holidayOtPay: item.holidayOtPay,
      transportAllowance: item.transportAllowance,
      monthlyBonus: item.monthlyBonus,
      bonusTopUp: item.bonusTopUp,
      bonusTopUpReason: item.bonusTopUpReason,
      contractNetBonus: item.contractNetBonus,
      netTopUp: item.netTopUp,
      netTopUpReason: item.netTopUpReason,
      grossIncome: item.grossIncome,
      pensionApplicable: item.pensionApplicable,
      pensionEmployee: item.pensionEmployee,
      pensionEmployer: item.pensionEmployer,
      incomeTax: item.incomeTax,
      totalDeductions: item.totalDeductions,
      netPay: item.netPay,
      correction,
    };
  }

  private async hasPayrollStaffAccess(ctx: ServiceContext): Promise<boolean> {
    const [canCreate, canApprove] = await Promise.all([
      this.permissions.hasPermission(ctx.userId, ctx.companyId, 'payroll', 'create'),
      this.permissions.hasPermission(ctx.userId, ctx.companyId, 'payroll', 'approve'),
    ]);
    return canCreate || canApprove;
  }

  private assertReleasableStatus(status: string, action: string): void {
    if (!RELEASABLE_STATUSES.includes(status as (typeof RELEASABLE_STATUSES)[number])) {
      throw new BadRequestException(
        `Cannot ${action} unless the run is GM_APPROVED or PAID`,
      );
    }
  }

  private async requireRun(
    runId: string,
    companyId: string,
  ): Promise<{
    id: string;
    status: string;
    month: number;
    year: number;
    runNumber: string;
    type: string;
  }> {
    const run = await this.prisma.payrollRun.findFirst({
      where: { id: runId, companyId, deletedAt: null },
      select: {
        id: true,
        status: true,
        month: true,
        year: true,
        runNumber: true,
        type: true,
      },
    });
    if (!run) {
      throw new NotFoundException('Payroll run not found');
    }
    return run;
  }

  private toNumber(value: Decimal | number | null | undefined): number {
    if (value == null) {
      return 0;
    }
    return Number(value);
  }
}
