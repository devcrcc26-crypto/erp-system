import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Decimal } from '@prisma/client/runtime/library';
import type {
  PayrollAdjustmentKind,
  PayrollReconciliationDirection,
  PayrollReconciliationStatus,
  PayrollRunStatus,
} from '@prisma/client';
import { PrismaService } from '../../../../shared/prisma/prisma.service';
import { PermissionService } from '../../../../shared/permissions/permission.service';
import { AuditService } from '../../../audit/application/services/audit.service';
import { PayrollRunService } from './payroll-run.service';
import {
  adjustmentLineLabel,
  CORRECTION_LINE_TYPE_CODES,
  effectiveLineTreatment,
  deductionCap,
  exceedsDeductionCap,
  reconciliationRemaining,
  reconciliationStatusFor,
  suggestRecoveryInstalment,
  type RecoveryInstalmentSuggestion,
} from '../utils/payroll-adjustment.util';

interface ServiceContext {
  userId: string;
  companyId: string;
}

/** Runs whose adjustment lines can still change. */
const EDITABLE_RUN_STATUSES: PayrollRunStatus[] = ['DRAFT', 'REVIEWED', 'SUBMITTED'];
/** Runs whose settlement lines are not yet applied but will be on approval. */
const PENDING_SETTLEMENT_STATUSES: PayrollRunStatus[] = ['DRAFT', 'REVIEWED', 'SUBMITTED'];

export interface PayrollAdjustmentTypeDto {
  id: string;
  code: string;
  nameEn: string;
  nameZh: string | null;
  kind: PayrollAdjustmentKind;
  taxable: boolean;
  pensionable: boolean;
  active: boolean;
  systemField: string | null;
  sortOrder: number;
}

export interface PayrollAdjustmentLineDto {
  id: string;
  employeeId: string;
  employeeName: string;
  employeeCode: string | null;
  adjustmentTypeId: string;
  typeCode: string;
  typeNameEn: string;
  typeNameZh: string | null;
  /** BONUS_TOP_UP / NET_TOP_UP for the built-in bonus types (kept in the entry's bonus fields), else null. */
  systemField: string | null;
  kind: PayrollAdjustmentKind;
  taxable: boolean;
  pensionable: boolean;
  amount: number;
  note: string;
  reconciliationId: string | null;
  instalmentNumber: number | null;
  instalmentCount: number | null;
  capOverrideReason: string | null;
  /** e.g. "Recovery - October 2026 correction (1 of 3)". */
  label: string;
  /** Manual correction line (CORRECTION runs): direction and treatment were chosen on the line. */
  isCorrectionLine: boolean;
  /** Who owes whom: EARNING = owed to the employee, DEDUCTION = owed to the company. */
  direction: 'OWED_TO_EMPLOYEE' | 'OWED_TO_COMPANY';
  /** Taxable lines change tax and pension; net lines are added or taken off net pay only. */
  treatment: 'TAXABLE' | 'NET';
  createdAt: Date;
}

/** Input of a manual correction line. */
export interface CorrectionLineInput {
  employeeId: string;
  adjustmentTypeId: string;
  direction: 'OWED_TO_EMPLOYEE' | 'OWED_TO_COMPANY';
  treatment: 'TAXABLE' | 'NET';
  amount: number;
  note: string;
}

/** Receipt recorded against an item owed to the company. */
export interface PayrollReconciliationReceiptDto {
  id: string;
  amount: number;
  /** Calendar date as YYYY-MM-DD. */
  receivedOn: string;
  reference: string;
  note: string | null;
  createdAt: Date;
}

export interface ReceiptInput {
  amount: number;
  /** Calendar date as YYYY-MM-DD. */
  receivedOn: string;
  reference: string;
  note?: string | null;
}

export interface PayrollReconciliationDto {
  id: string;
  employeeId: string;
  employeeName: string;
  employeeCode: string | null;
  forMonth: number;
  forYear: number;
  correctionRunId: string;
  correctionRunNumber: string;
  direction: PayrollReconciliationDirection;
  amount: number;
  settledAmount: number;
  /** Owed after settled lines and lines waiting in unapproved runs. */
  remaining: number;
  pendingAmount: number;
  /** Correction tax / pension differences (corrected - paid). */
  incomeTaxDifference: number;
  employeePensionDifference: number;
  employerPensionDifference: number;
  /** Run whose approval declared them; null = not yet declared. */
  statutoryRunId: string | null;
  reason: string;
  status: PayrollReconciliationStatus;
  waivedReason: string | null;
  waivedAt: Date | null;
  /** Money collected outside payroll (Record receipt). */
  receipts: PayrollReconciliationReceiptDto[];
  createdAt: Date;
}

export interface SettlementSuggestionDto {
  reconciliationId: string;
  direction: PayrollReconciliationDirection;
  remaining: number;
  /** Suggested line amount for this run. */
  amount: number;
  suggestedTypeId: string | null;
  /** Owed to the company only: the one-third-of-wage check. */
  recovery: (RecoveryInstalmentSuggestion & { monthlyWage: number }) | null;
  instalmentNumber: number;
  /** The employee's row is settlement only: no one-third limit, the full balance is suggested. */
  settlementOnly: boolean;
}

/**
 * Payroll adjustment types (settings), adjustment lines on runs, and
 * reconciliation items created by approved correction runs.
 */
@Injectable()
export class PayrollAdjustmentService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly permissions: PermissionService,
    private readonly audit: AuditService,
    private readonly runs: PayrollRunService,
  ) {}

  // ── Adjustment types ────────────────────────────────────────────────────

  async listTypes(companyId: string, includeInactive = true): Promise<PayrollAdjustmentTypeDto[]> {
    const rows = await this.prisma.payrollAdjustmentType.findMany({
      where: { companyId, ...(includeInactive ? {} : { active: true }) },
      orderBy: [{ sortOrder: 'asc' }, { nameEn: 'asc' }],
    });
    return rows.map((row) => this.toTypeDto(row));
  }

  async createType(
    dto: {
      code: string;
      nameEn: string;
      nameZh?: string | null;
      kind: PayrollAdjustmentKind;
      taxable: boolean;
      pensionable: boolean;
      active?: boolean;
    },
    ctx: ServiceContext,
  ): Promise<PayrollAdjustmentTypeDto> {
    const code = dto.code.trim().toUpperCase().replace(/[^A-Z0-9_]+/g, '_');
    if (!code) {
      throw new BadRequestException('Code is required');
    }
    const exists = await this.prisma.payrollAdjustmentType.findFirst({
      where: { companyId: ctx.companyId, code },
      select: { id: true },
    });
    if (exists) {
      throw new BadRequestException(`An adjustment type with code ${code} already exists`);
    }
    const flags = this.normalizedFlags(dto.kind, dto.taxable, dto.pensionable);
    const last = await this.prisma.payrollAdjustmentType.findFirst({
      where: { companyId: ctx.companyId },
      orderBy: { sortOrder: 'desc' },
      select: { sortOrder: true },
    });
    const row = await this.prisma.payrollAdjustmentType.create({
      data: {
        companyId: ctx.companyId,
        code,
        nameEn: dto.nameEn.trim(),
        nameZh: dto.nameZh?.trim() || null,
        kind: dto.kind,
        ...flags,
        active: dto.active ?? true,
        sortOrder: (last?.sortOrder ?? 0) + 10,
        createdBy: ctx.userId,
        updatedBy: ctx.userId,
      },
    });
    await this.auditChange(ctx, 'adjustment_type_created', row.id, row.code, null, row);
    return this.toTypeDto(row);
  }

  /**
   * Edits a type. Built-in Taxable bonus / Net bonus keep their kind and flags
   * (their calculation is the existing bonus / net top-up); only the names and
   * active state change.
   */
  async updateType(
    id: string,
    dto: {
      nameEn?: string;
      nameZh?: string | null;
      kind?: PayrollAdjustmentKind;
      taxable?: boolean;
      pensionable?: boolean;
      active?: boolean;
    },
    ctx: ServiceContext,
  ): Promise<PayrollAdjustmentTypeDto> {
    const row = await this.prisma.payrollAdjustmentType.findFirst({
      where: { id, companyId: ctx.companyId },
    });
    if (!row) {
      throw new NotFoundException('Adjustment type not found');
    }
    const changesTreatment =
      (dto.kind !== undefined && dto.kind !== row.kind) ||
      (dto.taxable !== undefined && dto.taxable !== row.taxable) ||
      (dto.pensionable !== undefined && dto.pensionable !== row.pensionable);
    if (row.systemField && changesTreatment) {
      throw new BadRequestException(
        `${row.nameEn} uses the existing ${row.systemField === 'NET_TOP_UP' ? 'net bonus' : 'taxable bonus'} calculation; its kind and flags cannot change`,
      );
    }
    const kind = dto.kind ?? row.kind;
    const flags = row.systemField
      ? { taxable: row.taxable, pensionable: row.pensionable }
      : this.normalizedFlags(
          kind,
          dto.taxable ?? row.taxable,
          dto.pensionable ?? row.pensionable,
        );
    const updated = await this.prisma.payrollAdjustmentType.update({
      where: { id },
      data: {
        ...(dto.nameEn !== undefined ? { nameEn: dto.nameEn.trim() } : {}),
        ...(dto.nameZh !== undefined ? { nameZh: dto.nameZh?.trim() || null } : {}),
        kind,
        ...flags,
        ...(dto.active !== undefined ? { active: dto.active } : {}),
        updatedBy: ctx.userId,
      },
    });
    await this.auditChange(ctx, 'adjustment_type_updated', row.id, row.code, row, updated);
    return this.toTypeDto(updated);
  }

  // ── Adjustment lines ────────────────────────────────────────────────────

  async listRunLines(runId: string, companyId: string): Promise<PayrollAdjustmentLineDto[]> {
    await this.requireRun(runId, companyId);
    const rows = await this.prisma.payrollAdjustmentLine.findMany({
      where: { payrollRunId: runId, companyId },
      include: {
        adjustmentType: true,
        employee: { select: { firstName: true, lastName: true, employeeId: true } },
        reconciliation: { select: { forMonth: true, forYear: true } },
      },
      orderBy: [{ createdAt: 'asc' }],
    });
    return rows.map((row) => {
      const treatment = effectiveLineTreatment({
        typeKind: row.adjustmentType.kind,
        typeTaxable: row.adjustmentType.taxable,
        typePensionable: row.adjustmentType.pensionable,
        systemField: row.adjustmentType.systemField,
        kindOverride: row.kindOverride ?? null,
        taxableOverride: row.taxableOverride ?? null,
      });
      return {
        id: row.id,
        employeeId: row.employeeId,
        employeeName: `${row.employee.firstName} ${row.employee.lastName}`.trim(),
        employeeCode: row.employee.employeeId,
        adjustmentTypeId: row.adjustmentTypeId,
        typeCode: row.adjustmentType.code,
        typeNameEn: row.adjustmentType.nameEn,
        typeNameZh: row.adjustmentType.nameZh,
        systemField: row.adjustmentType.systemField,
        kind: treatment.kind,
        taxable: treatment.taxable,
        pensionable: treatment.pensionable,
        amount: Number(row.amount),
        note: row.note,
        reconciliationId: row.reconciliationId,
        instalmentNumber: row.instalmentNumber,
        instalmentCount: row.instalmentCount,
        capOverrideReason: row.capOverrideReason,
        label: adjustmentLineLabel({
          typeName: row.adjustmentType.nameEn,
          forMonth: row.reconciliation?.forMonth ?? null,
          forYear: row.reconciliation?.forYear ?? null,
          instalmentNumber: row.instalmentNumber,
          instalmentCount: row.instalmentCount,
        }),
        isCorrectionLine: Boolean(row.isCorrectionLine),
        direction: treatment.kind === 'DEDUCTION' ? 'OWED_TO_COMPANY' : 'OWED_TO_EMPLOYEE',
        treatment: treatment.taxable ? 'TAXABLE' : 'NET',
        createdAt: row.createdAt,
      };
    });
  }

  /**
   * Adds an adjustment line and reprices the employee's entry. A line that
   * settles a reconciliation item may not exceed what is still owed; a
   * deduction that takes the employee's deductions above one third of the
   * monthly wage needs an override reason.
   */
  async addLine(
    runId: string,
    dto: {
      employeeId: string;
      adjustmentTypeId: string;
      amount: number;
      note: string;
      reconciliationId?: string | null;
      capOverrideReason?: string | null;
    },
    ctx: ServiceContext,
  ): Promise<PayrollAdjustmentLineDto[]> {
    const run = await this.requireRun(runId, ctx.companyId);
    this.assertEditable(run.status, run.type);
    const amount = Math.round(dto.amount * 100) / 100;
    if (!(amount > 0)) {
      throw new BadRequestException('Amount must be greater than 0');
    }
    const note = dto.note?.trim() ?? '';
    if (!note) {
      throw new BadRequestException('A note is required');
    }
    const entry = await this.prisma.payrollEntry.findFirst({
      where: { runId, employeeId: dto.employeeId, companyId: ctx.companyId },
      select: { id: true, earnedSalary: true, adjustmentDeductions: true, settlementOnly: true },
    });
    if (!entry) {
      throw new BadRequestException('This employee has no entry in the payroll run');
    }
    const type = await this.prisma.payrollAdjustmentType.findFirst({
      where: { id: dto.adjustmentTypeId, companyId: ctx.companyId },
    });
    if (!type || !type.active) {
      throw new BadRequestException('Choose an active adjustment type');
    }
    if (entry.settlementOnly) {
      // No earned pay and no tax / pension of its own: only settlements of open items.
      if (!dto.reconciliationId) {
        throw new BadRequestException(
          'This is a settlement-only row: it can only hold lines that settle a reconciliation item',
        );
      }
      if (type.kind === 'EARNING' && type.taxable) {
        throw new BadRequestException(
          'A settlement-only row pays no tax or pension of its own: settle with a net (after-tax) type',
        );
      }
    }

    let instalmentNumber: number | null = null;
    let instalmentCount: number | null = null;
    if (dto.reconciliationId) {
      if (run.type === 'CORRECTION') {
        throw new BadRequestException('A correction run cannot settle reconciliation items');
      }
      const item = await this.loadReconciliation(dto.reconciliationId, ctx.companyId);
      if (item.employeeId !== dto.employeeId) {
        throw new BadRequestException('The reconciliation item is for another employee');
      }
      if (item.status === 'SETTLED' || item.status === 'WAIVED') {
        throw new BadRequestException(`This item is already ${item.status.toLowerCase()}`);
      }
      if (item.direction === 'STATUTORY_ONLY') {
        throw new BadRequestException(
          'This item is statutory only: nothing is paid or recovered. Its tax and pension differences are declared by the next approved run',
        );
      }
      const expectedKind = item.direction === 'OWED_TO_COMPANY' ? 'DEDUCTION' : 'EARNING';
      if (type.kind !== expectedKind) {
        throw new BadRequestException(
          item.direction === 'OWED_TO_COMPANY'
            ? 'Money owed to the company is settled with a deduction type'
            : 'Money owed to the employee is settled with an earning type',
        );
      }
      const remaining = item.remaining;
      if (amount > remaining + 0.005) {
        throw new BadRequestException(
          `Amount exceeds the remaining balance of ${remaining.toFixed(2)} ETB.`,
        );
      }
      instalmentNumber = item.settledLineCount + item.pendingLineCount + 1;
      const after = Math.round((remaining - amount) * 100) / 100;
      instalmentCount = instalmentNumber + (after > 0.005 ? Math.ceil(after / amount - 1e-9) : 0);
    }

    const capOverrideReason = dto.capOverrideReason?.trim() || null;
    // The one-third limit protects pay; a settlement-only row has none.
    if (type.kind === 'DEDUCTION' && !entry.settlementOnly) {
      // One third of the salary earned this month (prorated basic).
      const wage = Number(entry.earnedSalary);
      const total = Number(entry.adjustmentDeductions) + amount;
      if (exceedsDeductionCap(wage, total) && !capOverrideReason) {
        throw new BadRequestException({
          message: `Deductions would be ${total.toFixed(2)} ETB, above one third of the monthly wage (${deductionCap(wage).toFixed(2)} ETB). Give a reason to override`,
          error: 'DEDUCTION_CAP_EXCEEDED',
          details: { total, cap: deductionCap(wage) },
        });
      }
    }

    const line = await this.prisma.payrollAdjustmentLine.create({
      data: {
        companyId: ctx.companyId,
        payrollRunId: runId,
        employeeId: dto.employeeId,
        adjustmentTypeId: type.id,
        amount: new Decimal(amount),
        note: note.slice(0, 500),
        reconciliationId: dto.reconciliationId ?? null,
        instalmentNumber,
        instalmentCount,
        capOverrideReason,
        createdBy: ctx.userId,
        updatedBy: ctx.userId,
      },
    });
    await this.runs.applyAdjustmentLinesToEntry(runId, dto.employeeId, ctx);
    await this.backToDraftIfSubmitted(run, ctx);
    await this.auditChange(ctx, 'adjustment_line_added', line.id, run.runNumber, null, {
      employeeId: dto.employeeId,
      type: type.code,
      amount,
      note,
      reconciliationId: dto.reconciliationId ?? null,
      capOverrideReason,
    });
    return this.listRunLines(runId, ctx.companyId);
  }

  /**
   * Adds a manual correction line to an employee of a CORRECTION run, for a
   * missed bonus, severance pay, salary arrears or another amount.
   *
   * - Direction: owed to the employee (earning) or owed to the company (deduction).
   * - Treatment: Taxable changes gross, taxable income (and the pension base
   *   when the type is pensionable), so tax and pension are recalculated; Net
   *   only adds to / takes off net pay and leaves tax and pension unchanged.
   *
   * The line is stored as a PayrollAdjustmentLine with per-line overrides, then
   * the employee's entry, net difference and component lines are repriced.
   */
  async addCorrectionLine(
    runId: string,
    dto: CorrectionLineInput,
    ctx: ServiceContext,
  ): Promise<PayrollAdjustmentLineDto[]> {
    const run = await this.requireRun(runId, ctx.companyId);
    if (run.type !== 'CORRECTION') {
      throw new BadRequestException('Correction lines can only be added to a correction run');
    }
    this.assertEditable(run.status, run.type);
    const amount = Math.round(dto.amount * 100) / 100;
    if (!(amount > 0)) {
      throw new BadRequestException('Amount must be greater than 0');
    }
    const note = dto.note?.trim() ?? '';
    if (!note) {
      throw new BadRequestException('A note is required');
    }
    const entry = await this.prisma.payrollEntry.findFirst({
      where: { runId, employeeId: dto.employeeId, companyId: ctx.companyId },
      select: { id: true },
    });
    if (!entry) {
      throw new BadRequestException('This employee has no entry in the correction run');
    }
    const type = await this.prisma.payrollAdjustmentType.findFirst({
      where: { id: dto.adjustmentTypeId, companyId: ctx.companyId },
    });
    if (
      !type ||
      !type.active ||
      type.systemField ||
      !CORRECTION_LINE_TYPE_CODES.includes(type.code)
    ) {
      throw new BadRequestException(
        'Choose a type: Missed bonus, Severance pay, Salary arrears or Other',
      );
    }

    const kind: PayrollAdjustmentKind =
      dto.direction === 'OWED_TO_COMPANY' ? 'DEDUCTION' : 'EARNING';
    const taxable = dto.treatment === 'TAXABLE';
    const line = await this.prisma.payrollAdjustmentLine.create({
      data: {
        companyId: ctx.companyId,
        payrollRunId: runId,
        employeeId: dto.employeeId,
        adjustmentTypeId: type.id,
        amount: new Decimal(amount),
        note: note.slice(0, 500),
        kindOverride: kind,
        taxableOverride: taxable,
        isCorrectionLine: true,
        createdBy: ctx.userId,
        updatedBy: ctx.userId,
      },
    });
    await this.runs.applyAdjustmentLinesToEntry(runId, dto.employeeId, ctx);
    await this.backToDraftIfSubmitted(run, ctx);
    await this.auditChange(ctx, 'adjustment_line_added', line.id, run.runNumber, null, {
      employeeId: dto.employeeId,
      type: type.code,
      direction: dto.direction,
      treatment: dto.treatment,
      amount,
      note,
    });
    return this.listRunLines(runId, ctx.companyId);
  }

  async removeLine(
    runId: string,
    lineId: string,
    ctx: ServiceContext,
  ): Promise<PayrollAdjustmentLineDto[]> {
    const run = await this.requireRun(runId, ctx.companyId);
    this.assertEditable(run.status, run.type);
    const line = await this.prisma.payrollAdjustmentLine.findFirst({
      where: { id: lineId, payrollRunId: runId, companyId: ctx.companyId },
      include: { adjustmentType: { select: { code: true } } },
    });
    if (!line) {
      throw new NotFoundException('Adjustment line not found');
    }
    await this.prisma.payrollAdjustmentLine.delete({ where: { id: lineId } });
    await this.runs.applyAdjustmentLinesToEntry(runId, line.employeeId, ctx);
    await this.backToDraftIfSubmitted(run, ctx);
    await this.auditChange(
      ctx,
      'adjustment_line_removed',
      line.id,
      run.runNumber,
      {
        employeeId: line.employeeId,
        type: line.adjustmentType.code,
        amount: Number(line.amount),
        note: line.note,
      },
      null,
    );
    return this.listRunLines(runId, ctx.companyId);
  }

  // ── Reconciliation items ────────────────────────────────────────────────

  async listReconciliations(
    companyId: string,
    filters: { status?: 'open' | 'all'; employeeIds?: string[]; correctionRunId?: string },
  ): Promise<PayrollReconciliationDto[]> {
    const rows = await this.prisma.payrollReconciliation.findMany({
      where: {
        companyId,
        ...(filters.status === 'all'
          ? {}
          : { status: { in: ['OPEN', 'PARTIALLY_SETTLED', 'WAIVED'] } }),
        ...(filters.employeeIds ? { employeeId: { in: filters.employeeIds } } : {}),
        ...(filters.correctionRunId ? { correctionRunId: filters.correctionRunId } : {}),
      },
      include: {
        employee: { select: { firstName: true, lastName: true, employeeId: true } },
        correctionRun: { select: { runNumber: true } },
        lines: {
          select: { amount: true, payrollRun: { select: { status: true } } },
        },
        receipts: { orderBy: { receivedOn: 'asc' } },
      },
      orderBy: [{ forYear: 'asc' }, { forMonth: 'asc' }, { createdAt: 'asc' }],
    });
    return rows.map((row) => {
      const pending = row.lines
        .filter((line) => PENDING_SETTLEMENT_STATUSES.includes(line.payrollRun.status))
        .reduce((sum, line) => sum + Number(line.amount), 0);
      const amount = Number(row.amount);
      const settled = Number(row.settledAmount);
      return {
        id: row.id,
        employeeId: row.employeeId,
        employeeName: `${row.employee.firstName} ${row.employee.lastName}`.trim(),
        employeeCode: row.employee.employeeId,
        forMonth: row.forMonth,
        forYear: row.forYear,
        correctionRunId: row.correctionRunId,
        correctionRunNumber: row.correctionRun.runNumber,
        direction: row.direction,
        amount,
        settledAmount: settled,
        pendingAmount: Math.round(pending * 100) / 100,
        remaining: Math.max(0, reconciliationRemaining(amount, settled) - Math.round(pending * 100) / 100),
        incomeTaxDifference: Number(row.incomeTaxDifference),
        employeePensionDifference: Number(row.employeePensionDifference),
        employerPensionDifference: Number(row.employerPensionDifference),
        statutoryRunId: row.statutoryRunId,
        reason: row.reason,
        status: row.status,
        waivedReason: row.waivedReason,
        waivedAt: row.waivedAt,
        receipts: (row.receipts ?? []).map((receipt) => ({
          id: receipt.id,
          amount: Number(receipt.amount),
          receivedOn: receipt.receivedOn.toISOString().slice(0, 10),
          reference: receipt.reference,
          note: receipt.note,
          createdAt: receipt.createdAt,
        })),
        createdAt: row.createdAt,
      };
    });
  }

  /**
   * Records money collected from the employee outside payroll against an item
   * owed to the company (e.g. a leaver repaying a recovery). It settles the
   * item like a settlement line would, without a payroll run. The correction's
   * tax / pension differences are declared once by the next approved regular
   * run. Payroll approvers only; amount may not exceed what is still owed.
   */
  async recordReceipt(
    reconciliationId: string,
    dto: ReceiptInput,
    ctx: ServiceContext,
  ): Promise<PayrollReconciliationDto> {
    const allowed = await this.permissions.hasPermission(
      ctx.userId,
      ctx.companyId,
      'payroll',
      'approve',
    );
    if (!allowed) {
      throw new ForbiddenException('Missing permission: payroll.approve');
    }
    const amount = Math.round(dto.amount * 100) / 100;
    if (!(amount > 0)) {
      throw new BadRequestException('Amount must be greater than 0');
    }
    const reference = dto.reference?.trim() ?? '';
    if (!reference) {
      throw new BadRequestException('A receipt reference is required');
    }
    const receivedOn = new Date(`${dto.receivedOn}T00:00:00.000Z`);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dto.receivedOn) || Number.isNaN(receivedOn.getTime())) {
      throw new BadRequestException('Receipt date must be a valid date (YYYY-MM-DD)');
    }
    const item = await this.loadReconciliation(reconciliationId, ctx.companyId);
    if (item.direction !== 'OWED_TO_COMPANY') {
      throw new BadRequestException(
        'A receipt can only be recorded against money owed to the company',
      );
    }
    if (item.status === 'SETTLED' || item.status === 'WAIVED') {
      throw new BadRequestException(`This item is already ${item.status.toLowerCase()}`);
    }
    if (item.pendingLineCount > 0) {
      throw new BadRequestException(
        'A payroll run that is not yet approved settles part of this item. Remove that line first',
      );
    }
    if (amount > item.remaining + 0.005) {
      throw new BadRequestException(
        `Amount exceeds the remaining balance of ${item.remaining.toFixed(2)} ETB.`,
      );
    }

    const stored = await this.prisma.payrollReconciliation.findFirst({
      where: { id: reconciliationId, companyId: ctx.companyId },
      select: { amount: true, settledAmount: true },
    });
    if (!stored) {
      throw new NotFoundException('Reconciliation item not found');
    }
    const total = Number(stored.amount);
    const nextSettled = Math.round((Number(stored.settledAmount) + amount) * 100) / 100;
    await this.prisma.$transaction(async (tx) => {
      await tx.payrollReconciliationReceipt.create({
        data: {
          companyId: ctx.companyId,
          reconciliationId,
          amount: new Decimal(amount),
          receivedOn,
          reference: reference.slice(0, 120),
          note: dto.note?.trim() ? dto.note.trim().slice(0, 500) : null,
          createdBy: ctx.userId,
        },
      });
      await tx.payrollReconciliation.update({
        where: { id: reconciliationId },
        data: {
          settledAmount: new Decimal(nextSettled),
          status: reconciliationStatusFor(total, nextSettled),
        },
      });
    });
    await this.auditChange(
      ctx,
      'reconciliation_receipt_recorded',
      reconciliationId,
      reference,
      { settledAmount: Number(stored.settledAmount), status: item.status },
      { receipt: { amount, receivedOn: dto.receivedOn, reference }, settledAmount: nextSettled },
    );
    await this.runs.syncSettlementOnlyRows(ctx);
    return this.getReconciliationDto(reconciliationId, ctx.companyId, item.employeeId);
  }

  /**
   * Suggested settlement line for an item in a run. For money owed to the
   * company: an instalment that keeps the employee's deductions in this run
   * within one third of the monthly wage. HR can override with a reason.
   */
  async suggestSettlement(
    runId: string,
    reconciliationId: string,
    companyId: string,
  ): Promise<SettlementSuggestionDto> {
    await this.requireRun(runId, companyId);
    const item = await this.loadReconciliation(reconciliationId, companyId);
    const entry = await this.prisma.payrollEntry.findFirst({
      where: { runId, employeeId: item.employeeId, companyId },
      select: { earnedSalary: true, adjustmentDeductions: true, settlementOnly: true },
    });
    if (!entry) {
      throw new BadRequestException('This employee has no entry in the payroll run');
    }
    const settlementOnly = Boolean(entry.settlementOnly);
    const types = await this.prisma.payrollAdjustmentType.findMany({
      where: { companyId, active: true, code: { in: ['RECOVERY', 'NET_BONUS'] } },
      select: { id: true, code: true },
    });
    if (item.direction === 'STATUTORY_ONLY') {
      throw new BadRequestException('A statutory-only item has nothing to settle');
    }
    const instalmentNumber = item.settledLineCount + item.pendingLineCount + 1;
    if (item.direction === 'OWED_TO_COMPANY' && settlementOnly) {
      // No pay to protect: the whole balance, with no one-third limit.
      return {
        reconciliationId,
        direction: item.direction,
        remaining: item.remaining,
        amount: item.remaining,
        suggestedTypeId: types.find((type) => type.code === 'RECOVERY')?.id ?? null,
        recovery: null,
        instalmentNumber,
        settlementOnly,
      };
    }
    if (item.direction === 'OWED_TO_COMPANY') {
      const monthlyWage = Number(entry.earnedSalary);
      const recovery = suggestRecoveryInstalment({
        monthlyWage,
        existingDeductions: Number(entry.adjustmentDeductions),
        remaining: item.remaining,
      });
      return {
        reconciliationId,
        direction: item.direction,
        remaining: item.remaining,
        amount: recovery.amount,
        suggestedTypeId: types.find((type) => type.code === 'RECOVERY')?.id ?? null,
        recovery: { ...recovery, monthlyWage },
        instalmentNumber,
        settlementOnly,
      };
    }
    // Owed to the employee: the correction already accounts for tax, so the
    // difference is paid as a net (after-tax) amount by default.
    return {
      reconciliationId,
      direction: item.direction,
      remaining: item.remaining,
      amount: item.remaining,
      suggestedTypeId: types.find((type) => type.code === 'NET_BONUS')?.id ?? null,
      recovery: null,
      instalmentNumber,
      settlementOnly,
    };
  }

  /** Waives what is still owed on an item (payroll approvers, reason required). */
  async waive(
    reconciliationId: string,
    reason: string,
    ctx: ServiceContext,
  ): Promise<PayrollReconciliationDto> {
    const allowed = await this.permissions.hasPermission(
      ctx.userId,
      ctx.companyId,
      'payroll',
      'approve',
    );
    if (!allowed) {
      throw new ForbiddenException('Missing permission: payroll.approve');
    }
    const trimmed = reason?.trim() ?? '';
    if (trimmed.length < 5) {
      throw new BadRequestException('A reason (at least 5 characters) is required to waive');
    }
    const item = await this.loadReconciliation(reconciliationId, ctx.companyId);
    if (item.status === 'SETTLED' || item.status === 'WAIVED') {
      throw new BadRequestException(`This item is already ${item.status.toLowerCase()}`);
    }
    if (item.direction === 'STATUTORY_ONLY') {
      throw new BadRequestException(
        'A statutory-only item cannot be waived: its tax and pension differences must be declared',
      );
    }
    if (item.pendingLineCount > 0) {
      throw new BadRequestException(
        'A payroll run that is not yet approved settles part of this item. Remove that line first',
      );
    }
    await this.prisma.payrollReconciliation.update({
      where: { id: reconciliationId },
      data: {
        status: 'WAIVED',
        waivedReason: trimmed.slice(0, 500),
        waivedBy: ctx.userId,
        waivedAt: new Date(),
      },
    });
    await this.auditChange(ctx, 'reconciliation_waived', reconciliationId, null, {
      status: item.status,
    }, { status: 'WAIVED', reason: trimmed });
    // Nothing left to settle: the employee's settlement-only row (if any) goes.
    await this.runs.syncSettlementOnlyRows(ctx);
    return this.getReconciliationDto(reconciliationId, ctx.companyId, item.employeeId);
  }

  /**
   * Reopens a waived reconciliation item so it can be settled again.
   * Restores OPEN / PARTIALLY_SETTLED from settledAmount (payroll.approve).
   */
  async unwaive(
    reconciliationId: string,
    ctx: ServiceContext,
  ): Promise<PayrollReconciliationDto> {
    const allowed = await this.permissions.hasPermission(
      ctx.userId,
      ctx.companyId,
      'payroll',
      'approve',
    );
    if (!allowed) {
      throw new ForbiddenException('Missing permission: payroll.approve');
    }
    const row = await this.prisma.payrollReconciliation.findFirst({
      where: { id: reconciliationId, companyId: ctx.companyId },
    });
    if (!row) {
      throw new NotFoundException('Reconciliation item not found');
    }
    if (row.status !== 'WAIVED') {
      throw new BadRequestException('Only a waived item can be undone');
    }
    if (row.direction === 'STATUTORY_ONLY') {
      throw new BadRequestException('A statutory-only item cannot be waived or unwaived');
    }
    const amount = Number(row.amount);
    const settled = Number(row.settledAmount);
    const nextStatus = reconciliationStatusFor(amount, settled);
    await this.prisma.payrollReconciliation.update({
      where: { id: reconciliationId },
      data: {
        status: nextStatus,
        waivedReason: null,
        waivedBy: null,
        waivedAt: null,
      },
    });
    await this.auditChange(
      ctx,
      'reconciliation_unwaived',
      reconciliationId,
      null,
      { status: 'WAIVED' },
      { status: nextStatus },
    );
    // Open again: draft runs get the employee's settlement-only row back.
    await this.runs.syncSettlementOnlyRows(ctx);
    return this.getReconciliationDto(reconciliationId, ctx.companyId, row.employeeId);
  }

  // ── Helpers ─────────────────────────────────────────────────────────────

  private async getReconciliationDto(
    id: string,
    companyId: string,
    employeeId: string,
  ): Promise<PayrollReconciliationDto> {
    const rows = await this.listReconciliations(companyId, {
      status: 'all',
      employeeIds: [employeeId],
    });
    const dto = rows.find((row) => row.id === id);
    if (!dto) {
      throw new NotFoundException('Reconciliation item not found');
    }
    return dto;
  }

  private async loadReconciliation(
    id: string,
    companyId: string,
  ): Promise<{
    id: string;
    employeeId: string;
    direction: PayrollReconciliationDirection;
    status: PayrollReconciliationStatus;
    remaining: number;
    settledLineCount: number;
    pendingLineCount: number;
  }> {
    const item = await this.prisma.payrollReconciliation.findFirst({
      where: { id, companyId },
      include: {
        lines: { select: { amount: true, payrollRun: { select: { status: true } } } },
      },
    });
    if (!item) {
      throw new NotFoundException('Reconciliation item not found');
    }
    const pendingLines = item.lines.filter((line) =>
      PENDING_SETTLEMENT_STATUSES.includes(line.payrollRun.status),
    );
    const settledLines = item.lines.filter((line) =>
      ['APPROVED', 'GM_APPROVED', 'PAID'].includes(line.payrollRun.status),
    );
    const pending = pendingLines.reduce((sum, line) => sum + Number(line.amount), 0);
    const remaining = Math.max(
      0,
      reconciliationRemaining(Number(item.amount), Number(item.settledAmount)) -
        Math.round(pending * 100) / 100,
    );
    return {
      id: item.id,
      employeeId: item.employeeId,
      direction: item.direction,
      status: item.status,
      remaining: Math.round(remaining * 100) / 100,
      settledLineCount: settledLines.length,
      pendingLineCount: pendingLines.length,
    };
  }

  private async requireRun(runId: string, companyId: string) {
    const run = await this.prisma.payrollRun.findFirst({
      where: { id: runId, companyId, deletedAt: null },
    });
    if (!run) {
      throw new NotFoundException('Payroll run not found');
    }
    return run;
  }

  private assertEditable(status: PayrollRunStatus, type: string): void {
    if (!EDITABLE_RUN_STATUSES.includes(status)) {
      throw new BadRequestException(
        status === 'APPROVED' || status === 'GM_APPROVED'
          ? 'This run is approved. Reopen it to change adjustments'
          : `Adjustments cannot change on a run in ${status} status`,
      );
    }
    void type;
  }

  /** A submitted run that changes goes back to DRAFT (same rule as other edits). */
  private async backToDraftIfSubmitted(
    run: { id: string; status: PayrollRunStatus },
    ctx: ServiceContext,
  ): Promise<void> {
    if (run.status !== 'SUBMITTED') {
      return;
    }
    await this.prisma.payrollRun.update({
      where: { id: run.id },
      data: { status: 'DRAFT', submittedAt: null, submittedBy: null, updatedBy: ctx.userId },
    });
  }

  /** Deductions never enter taxable income or the pension base. */
  private normalizedFlags(
    kind: PayrollAdjustmentKind,
    taxable: boolean,
    pensionable: boolean,
  ): { taxable: boolean; pensionable: boolean } {
    if (kind === 'DEDUCTION') {
      return { taxable: false, pensionable: false };
    }
    return { taxable: Boolean(taxable), pensionable: Boolean(pensionable) };
  }

  private toTypeDto(row: {
    id: string;
    code: string;
    nameEn: string;
    nameZh: string | null;
    kind: PayrollAdjustmentKind;
    taxable: boolean;
    pensionable: boolean;
    active: boolean;
    systemField: string | null;
    sortOrder: number;
  }): PayrollAdjustmentTypeDto {
    return {
      id: row.id,
      code: row.code,
      nameEn: row.nameEn,
      nameZh: row.nameZh,
      kind: row.kind,
      taxable: row.taxable,
      pensionable: row.pensionable,
      active: row.active,
      systemField: row.systemField,
      sortOrder: row.sortOrder,
    };
  }

  private async auditChange(
    ctx: ServiceContext,
    action: string,
    recordId: string,
    reference: string | null,
    before: unknown,
    after: unknown,
  ): Promise<void> {
    await this.audit.create(
      this.audit.buildFromRequestContext({
        userId: ctx.userId,
        companyId: ctx.companyId,
        module: 'payroll',
        action,
        recordType: action.startsWith('reconciliation')
          ? 'PayrollReconciliation'
          : action.startsWith('adjustment_type')
            ? 'PayrollAdjustmentType'
            : 'PayrollAdjustmentLine',
        recordId,
        recordReference: reference ?? undefined,
        beforeValue: (before ?? undefined) as never,
        afterValue: (after ?? undefined) as never,
      }),
    );
  }
}

export { adjustmentLineLabel };
