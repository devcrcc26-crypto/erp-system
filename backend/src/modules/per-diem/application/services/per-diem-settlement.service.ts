import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import {
  ApprovalRequestStatus,
  PerDiemBalanceDirection,
  PerDiemStatus,
  Prisma,
} from '@prisma/client';
import { randomUUID } from 'crypto';
import { PrismaService } from '../../../../shared/prisma/prisma.service';
import {
  calendarDaysInclusive,
  parseLocalDateOnly,
} from '../../../../shared/utils/date-validation.util';
import { activeOnly } from '../../../../shared/prisma/soft-delete.util';
import { PermissionService } from '../../../../shared/permissions/permission.service';
import {
  buildPaginatedResult,
  buildPrismaPagination,
  PaginatedResult,
} from '../../../../shared/utils/pagination.util';
import { ApprovalDecisionRegistry } from '../../../approvals/application/services/approval-decision-registry.service';
import { ApprovalsService } from '../../../approvals/application/services/approvals.service';
import type {
  ApprovalDecisionListener,
  ApprovalFinalDecision,
} from '../../../approvals/application/ports/approval-decision.listener';
import { HrApprovalChainService } from '../../../hr-shared/application/services/hr-approval-chain.service';
import { EmployeePerDiemRateService } from './employee-per-diem-rate.service';
import {
  ListPerDiemSettlementsDto,
  RecordCashReturnedDto,
  SubmitPerDiemSettlementDto,
} from '../dtos/per-diem-settlement.dtos';

const USER_SELECT = {
  id: true,
  firstName: true,
  lastName: true,
  email: true,
} as const;

const ADVANCE_SUMMARY_SELECT = {
  id: true,
  requestNumber: true,
  pvNumber: true,
  pvDate: true,
  destination: true,
  destinationCategory: true,
  startDate: true,
  endDate: true,
  days: true,
  totalAmount: true,
  totalAmountEtb: true,
  currency: true,
  status: true,
  _count: { select: { disbursements: true } },
} as const;

const SETTLEMENT_DETAIL_INCLUDE = {
  employee: { select: USER_SELECT },
  advances: { select: ADVANCE_SUMMARY_SELECT, orderBy: { createdAt: 'asc' as const } },
  approvalRequest: {
    include: {
      tiers: {
        include: { approver: { select: USER_SELECT } },
        orderBy: { tierOrder: 'asc' as const },
      },
    },
  },
} as const;

/**
 * Per diem settlement lifecycle. Links paid approved advances and uses the
 * HR Manager / Local HR Manager single-tier approval chain.
 */
@Injectable()
export class PerDiemSettlementService
  implements ApprovalDecisionListener, OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(PerDiemSettlementService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly approvalsService: ApprovalsService,
    private readonly hrApprovalChain: HrApprovalChainService,
    private readonly decisionRegistry: ApprovalDecisionRegistry,
    private readonly permissionService: PermissionService,
    private readonly employeePerDiemRateService: EmployeePerDiemRateService,
  ) {}

  onModuleInit(): void {
    this.decisionRegistry.register(this);
  }

  onModuleDestroy(): void {
    this.decisionRegistry.unregister(this);
  }

  /**
   * Lists the caller's approved advances that are not yet on a settlement.
   * Includes undisbursed advances (for "Awaiting payment") and disbursed ones (selectable).
   */
  async listUnsettledAdvances(
    companyId: string,
    userId: string,
  ): Promise<unknown[]> {
    return this.prisma.perDiemRequest.findMany({
      where: activeOnly({
        companyId,
        employeeId: userId,
        status: { in: [PerDiemStatus.APPROVED, PerDiemStatus.ACTIVE] },
        settlementId: null,
      }),
      orderBy: { createdAt: 'desc' },
      select: ADVANCE_SUMMARY_SELECT,
    });
  }

  /**
   * Submits a settlement for the authenticated employee's own approved advances.
   */
  async submitSettlement(
    dto: SubmitPerDiemSettlementDto,
    companyId: string,
    userId: string,
  ): Promise<unknown> {
    const departureDate = this.parseDateOnly(dto.actualDepartureDate);
    const returnDate = this.parseDateOnly(dto.actualReturnDate);
    if (returnDate.getTime() < departureDate.getTime()) {
      throw new BadRequestException(
        'actualReturnDate must be on or after actualDepartureDate',
      );
    }
    const calendarSpan = calendarDaysInclusive(departureDate, returnDate);
    if (dto.actualDays > calendarSpan) {
      throw new BadRequestException(
        `actualDays must be between 1 and ${calendarSpan} (inclusive calendar days from actualDepartureDate to actualReturnDate)`,
      );
    }

    const vehicleUsed = dto.vehicleUsed === true;
    if (vehicleUsed) {
      if (dto.kmDeparture == null || dto.kmReturn == null) {
        throw new BadRequestException(
          'kmDeparture and kmReturn are required when a vehicle is used',
        );
      }
      if (dto.kmReturn < dto.kmDeparture) {
        throw new BadRequestException(
          'kmReturn must be greater than or equal to kmDeparture',
        );
      }
    }

    const advanceIds = [...new Set(dto.advanceIds)];
    const advances = await this.prisma.perDiemRequest.findMany({
      where: activeOnly({
        companyId,
        employeeId: userId,
        id: { in: advanceIds },
        status: { in: [PerDiemStatus.APPROVED, PerDiemStatus.ACTIVE] },
        settlementId: null,
        disbursements: { some: {} },
      }),
    });
    if (advances.length !== advanceIds.length) {
      throw new BadRequestException(
        'Each advance must be your own disbursed advance that is not already settled',
      );
    }

    const categories = new Set(advances.map((row) => row.destinationCategory));
    if (categories.size !== 1) {
      throw new BadRequestException(
        'Selected advances must share the same destination category',
      );
    }
    const destinationCategory = advances[0].destinationCategory;

    const resolvedRate =
      await this.employeePerDiemRateService.resolveRateForSubmission(
        companyId,
        userId,
        destinationCategory,
        userId,
      );

    // Each advance counts at its approved total (approved rate × days; the
    // standard rate when no approver override). Earnings use the advances'
    // approved rate when they share one, else the employee's current rate.
    const approvedRateOf = (row: (typeof advances)[number]): Prisma.Decimal =>
      new Prisma.Decimal((row.approvedDailyRate ?? row.dailyRate).toString());
    const advanceRates = new Set(advances.map((row) => approvedRateOf(row).toFixed(2)));
    const dailyRate =
      advanceRates.size === 1
        ? approvedRateOf(advances[0])
        : new Prisma.Decimal(resolvedRate.dailyRate);
    const perDiemEarned = dailyRate.mul(dto.actualDays);
    const totalAdvances = advances.reduce(
      (sum, row) => sum.add(approvedRateOf(row).mul(row.days)),
      new Prisma.Decimal(0),
    );
    const { balance, balanceDirection } = this.computeBalance(
      totalAdvances,
      perDiemEarned,
    );

    const resolvedTiers =
      await this.hrApprovalChain.buildPerDiemSettlementApprovalChain(
        userId,
        companyId,
      );

    const approval = (await this.approvalsService.submitRequest(
      {
        categoryCode: 'PER_DIEM_SETTLEMENT',
        title: `Per diem settlement - ${dto.destination.trim()}`,
        formData: {
          destination: dto.destination.trim(),
          destinationCategory,
          actualDepartureDate: dto.actualDepartureDate,
          actualReturnDate: dto.actualReturnDate,
          actualDays: dto.actualDays,
          totalAdvances: Number(totalAdvances),
          perDiemEarned: Number(perDiemEarned),
          balance: Number(balance),
          balanceDirection,
        },
      },
      companyId,
      userId,
      {
        resolvedTiers: {
          ruleName: 'Per diem settlement HR chain',
          tiers: resolvedTiers,
        },
      },
    )) as { id: string; requestNumber: string };

    const settlementId = randomUUID();
    const now = new Date();

    try {
      await this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
        await tx.perDiemSettlement.create({
          data: {
            id: settlementId,
            companyId,
            requestNumber: approval.requestNumber,
            employeeId: userId,
            destination: dto.destination.trim(),
            destinationCategory,
            actualDepartureDate: departureDate,
            actualDepartureTime: dto.actualDepartureTime,
            actualReturnDate: returnDate,
            actualReturnTime: dto.actualReturnTime,
            actualDays: dto.actualDays,
            dailyRate,
            perDiemEarned,
            totalAdvances,
            balance,
            balanceDirection,
            vehicleUsed,
            kmDeparture: vehicleUsed ? dto.kmDeparture ?? null : null,
            kmReturn: vehicleUsed ? dto.kmReturn ?? null : null,
            notes: dto.notes?.trim() || null,
            status: PerDiemStatus.SUBMITTED,
            approvalRequestId: approval.id,
            submittedAt: now,
            createdBy: userId,
            updatedBy: userId,
          },
        });

        const linked = await tx.perDiemRequest.updateMany({
          where: {
            id: { in: advanceIds },
            companyId,
            employeeId: userId,
            status: { in: [PerDiemStatus.APPROVED, PerDiemStatus.ACTIVE] },
            settlementId: null,
            deletedAt: null,
          },
          data: {
            settlementId,
            updatedBy: userId,
          },
        });
        if (linked.count !== advanceIds.length) {
          throw new BadRequestException(
            'One or more advances were already included in a settlement',
          );
        }
      });
    } catch (error: unknown) {
      this.logger.error(
        `Per diem settlement create failed after approval ${approval.id}; cancelling approval`,
        error instanceof Error ? error.message : String(error),
      );
      await this.prisma.approvalRequest.update({
        where: { id: approval.id },
        data: {
          status: ApprovalRequestStatus.CANCELLED,
          updatedBy: userId,
          completedAt: now,
        },
      });
      await this.unlinkAdvances(settlementId, userId);
      throw error;
    }

    return this.getSettlement(settlementId, companyId, userId);
  }

  /**
   * Returns one settlement when the caller is the employee, an approver, or HR.
   */
  async getSettlement(
    id: string,
    companyId: string,
    userId: string,
  ): Promise<unknown> {
    const settlement = await this.prisma.perDiemSettlement.findFirst({
      where: activeOnly({ id, companyId }),
      include: SETTLEMENT_DETAIL_INCLUDE,
    });
    if (!settlement) {
      throw new NotFoundException('Per diem settlement not found');
    }
    await this.assertCanView(settlement, companyId, userId);
    return settlement;
  }

  /**
   * Lists settlements. HR sees the company; everyone else sees their own.
   */
  async listSettlements(
    filters: ListPerDiemSettlementsDto,
    companyId: string,
    userId: string,
  ): Promise<PaginatedResult<unknown>> {
    const page = filters.page ?? 1;
    const limit = filters.limit ?? 20;
    const { skip, take } = buildPrismaPagination(page, limit);
    const statuses = this.normalizeStatuses(filters.status);
    const canManage = await this.permissionService.hasPermission(
      userId,
      companyId,
      'per-diem',
      'manage',
    );

    const where: Prisma.PerDiemSettlementWhereInput = {
      companyId,
      deletedAt: null,
      ...(canManage ? {} : { employeeId: userId }),
      ...(statuses ? { status: { in: statuses } } : {}),
      ...(canManage && filters.employeeId
        ? { employeeId: filters.employeeId }
        : {}),
      ...(filters.search?.trim()
        ? {
            OR: [
              {
                requestNumber: {
                  contains: filters.search.trim(),
                  mode: 'insensitive' as const,
                },
              },
              {
                destination: {
                  contains: filters.search.trim(),
                  mode: 'insensitive' as const,
                },
              },
            ],
          }
        : {}),
    };

    const [rows, total] = await Promise.all([
      this.prisma.perDiemSettlement.findMany({
        where,
        skip,
        take,
        orderBy: { createdAt: 'desc' },
        include: {
          employee: { select: USER_SELECT },
          advances: { select: { id: true, pvNumber: true, totalAmount: true } },
        },
      }),
      this.prisma.perDiemSettlement.count({ where }),
    ]);

    const data = rows.map((row) => ({
      ...row,
      settlementKind: 'BATCH' as const,
    }));

    return buildPaginatedResult(data, total, page, limit);
  }

  /**
   * Cancels a draft, submitted, or returned settlement and releases its advances.
   */
  async cancelSettlement(
    id: string,
    companyId: string,
    userId: string,
  ): Promise<unknown> {
    const settlement = await this.prisma.perDiemSettlement.findFirst({
      where: activeOnly({ id, companyId }),
    });
    if (!settlement) {
      throw new NotFoundException('Per diem settlement not found');
    }
    if (settlement.employeeId !== userId && settlement.createdBy !== userId) {
      throw new ForbiddenException(
        'Only the employee or the person who submitted on their behalf can cancel this settlement',
      );
    }
    if (
      settlement.status !== PerDiemStatus.DRAFT &&
      settlement.status !== PerDiemStatus.SUBMITTED &&
      settlement.status !== PerDiemStatus.RETURNED
    ) {
      throw new BadRequestException(
        'Only draft, submitted, or returned settlements can be cancelled',
      );
    }

    const now = new Date();
    await this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      await tx.perDiemSettlement.update({
        where: { id },
        data: {
          status: PerDiemStatus.CANCELLED,
          completedAt: now,
          updatedBy: userId,
        },
      });
      await tx.perDiemRequest.updateMany({
        where: { settlementId: id, companyId },
        data: { settlementId: null, updatedBy: userId },
      });
      if (settlement.approvalRequestId) {
        await tx.approvalRequest.update({
          where: { id: settlement.approvalRequestId },
          data: {
            status: ApprovalRequestStatus.CANCELLED,
            completedAt: now,
            updatedBy: userId,
          },
        });
      }
    });

    return this.getSettlement(id, companyId, userId);
  }

  /**
   * Records the cash-returned receipt after approval when the balance is owed to the company.
   * Restricted to hr.edit.
   */
  async recordCashReturned(
    id: string,
    dto: RecordCashReturnedDto,
    companyId: string,
    userId: string,
  ): Promise<unknown> {
    const canManage = await this.permissionService.hasPermission(
      userId,
      companyId,
      'per-diem',
      'manage',
    );
    if (!canManage) {
      throw new ForbiddenException('Missing permission: per-diem.manage');
    }

    const settlement = await this.prisma.perDiemSettlement.findFirst({
      where: activeOnly({ id, companyId }),
    });
    if (!settlement) {
      throw new NotFoundException('Per diem settlement not found');
    }
    if (settlement.status !== PerDiemStatus.APPROVED) {
      throw new BadRequestException(
        'Cash returned can be recorded only on an approved settlement',
      );
    }
    if (settlement.balanceDirection !== PerDiemBalanceDirection.TO_COMPANY) {
      throw new BadRequestException(
        'Cash returned applies only when the balance is in favor of the company',
      );
    }

    await this.prisma.perDiemSettlement.update({
      where: { id },
      data: {
        cashReturnedReceiptNo: dto.cashReturnedReceiptNo.trim(),
        cashReturnedDate: this.parseDateOnly(dto.cashReturnedDate),
        updatedBy: userId,
      },
    });

    return this.getSettlement(id, companyId, userId);
  }

  /**
   * Applies the terminal approval decision. Rejection releases the linked advances.
   */
  async onApprovalDecision(
    approvalRequestId: string,
    decision: ApprovalFinalDecision,
  ): Promise<void> {
    const settlement = await this.prisma.perDiemSettlement.findFirst({
      where: activeOnly({ approvalRequestId }),
    });
    if (!settlement) {
      return;
    }
    if (
      settlement.status === PerDiemStatus.APPROVED ||
      settlement.status === PerDiemStatus.REJECTED ||
      settlement.status === PerDiemStatus.CANCELLED
    ) {
      return;
    }

    const now = new Date();
    const nextStatus =
      decision === 'APPROVED'
        ? PerDiemStatus.APPROVED
        : decision === 'REJECTED'
          ? PerDiemStatus.REJECTED
          : PerDiemStatus.RETURNED;

    await this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      await tx.perDiemSettlement.update({
        where: { id: settlement.id },
        data: {
          status: nextStatus,
          completedAt: decision === 'RETURNED' ? null : now,
          updatedBy: settlement.employeeId,
        },
      });
      if (decision === 'REJECTED') {
        await tx.perDiemRequest.updateMany({
          where: { settlementId: settlement.id, companyId: settlement.companyId },
          data: { settlementId: null, updatedBy: settlement.employeeId },
        });
      }
    });
  }

  private computeBalance(
    totalAdvances: Prisma.Decimal,
    perDiemEarned: Prisma.Decimal,
  ): { balance: Prisma.Decimal; balanceDirection: PerDiemBalanceDirection } {
    const difference = totalAdvances.sub(perDiemEarned);
    if (difference.gt(0)) {
      return {
        balance: difference,
        balanceDirection: PerDiemBalanceDirection.TO_COMPANY,
      };
    }
    if (difference.lt(0)) {
      return {
        balance: difference.abs(),
        balanceDirection: PerDiemBalanceDirection.TO_EMPLOYEE,
      };
    }
    return {
      balance: new Prisma.Decimal(0),
      balanceDirection: PerDiemBalanceDirection.NONE,
    };
  }

  private async unlinkAdvances(
    settlementId: string,
    userId: string,
  ): Promise<void> {
    await this.prisma.perDiemRequest.updateMany({
      where: { settlementId },
      data: { settlementId: null, updatedBy: userId },
    });
  }

  private async assertCanView(
    settlement: {
      status: string;
      employeeId: string;
      createdBy: string;
      approvalRequest?: { tiers?: Array<{ approverId: string }> } | null;
    },
    companyId: string,
    userId: string,
  ): Promise<void> {
    const canManage = await this.permissionService.hasPermission(
      userId,
      companyId,
      'per-diem',
      'manage',
    );
    if (canManage) {
      return;
    }

    const isOwner =
      settlement.employeeId === userId || settlement.createdBy === userId;
    const isTierApprover =
      // Cancelled requests are hidden from the approval chain.
      settlement.status !== 'CANCELLED' &&
      (settlement.approvalRequest?.tiers?.some(
        (tier) => tier.approverId === userId,
      ) ?? false);

    if (!isOwner && !isTierApprover) {
      throw new ForbiddenException(
        'You do not have access to this per diem settlement',
      );
    }
  }

  private normalizeStatuses(
    status: string | undefined,
  ): PerDiemStatus[] | undefined {
    if (!status) {
      return undefined;
    }
    if (status.includes(',')) {
      return status
        .split(',')
        .map((value) => value.trim())
        .filter(Boolean) as PerDiemStatus[];
    }
    return [status as PerDiemStatus];
  }

  private parseDateOnly(value: string): Date {
    try {
      return parseLocalDateOnly(value);
    } catch {
      throw new BadRequestException(`Invalid date: ${value}`);
    }
  }
}
