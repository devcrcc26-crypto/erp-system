import {
  BadRequestException,
  ForbiddenException,
  forwardRef,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import {
  ApprovalRequestStatus,
  FolderContextType,
  Gender,
  LeaveRequestStatus,
  LeaveType,
  Prisma,
} from '@prisma/client';
import { randomUUID } from 'crypto';
import { PrismaService } from '../../../../shared/prisma/prisma.service';
import { activeOnly } from '../../../../shared/prisma/soft-delete.util';
import {
  canViewThroughTeam,
  resolveTeamScopedEmployeeIds,
  teamScopeWhere,
} from '../../../../shared/org/team-scope.util';
import { assertWithinEmploymentWindow, datesInRange } from '../../../../shared/employment/employment-guard.util';
import { PermissionService } from '../../../../shared/permissions/permission.service';
import {
  ALLOWED_UPLOAD_MIME_TYPES,
  STORAGE_BUCKETS,
  STORAGE_SERVICE,
} from '../../../../shared/storage/storage.constants';
import type { IStorageService } from '../../../../shared/storage/storage.interface';
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
import { OnBehalfService } from '../../../on-behalf/on-behalf.service';
import { DayCoverageService } from '../../../hr-shared/application/services/day-coverage.service';
import {
  dateKey as coverDateKey,
  eachDay,
} from '../../../hr-shared/application/utils/day-coverage.util';
import { AttendanceService } from '../../../attendance/application/services/attendance.service';
import { monthsTouchedByRange } from '../../../site-assignment/application/utils/site-assignment.util';
import { WorkScheduleService } from '../../../work-schedule/application/services/work-schedule.service';
import { formatDateOnly } from '../../../work-schedule/application/services/work-schedule.dates';
import {
  LeavePeriodInputDto,
  ListLeaveRequestsDto,
  SubmitLeaveRequestDto,
  UpdateLeaveRequestDto,
} from '../dtos/leave.dtos';
import { LeaveBalanceService } from './leave-balance.service';
import { LeaveLedgerService } from '../../../leave-policy/application/services/leave-ledger.service';
import {
  leaveTypeAffectsBalance,
  resolveBalanceLeaveType,
} from './leave-balance-rules';

export {
  DEDUCTS_FROM_ANNUAL,
  leaveTypeAffectsBalance,
  resolveBalanceLeaveType,
} from './leave-balance-rules';

type UploadedFile = {
  originalname: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
};

const USER_SELECT = {
  id: true,
  firstName: true,
  middleName: true,
  lastName: true,
  email: true,
  chineseName: true,
} as const;

const DOCUMENT_SELECT = {
  id: true,
  name: true,
  fileType: true,
  fileSizeBytes: true,
  createdAt: true,
} as const;

const LEAVE_DETAIL_INCLUDE = {
  employee: { select: USER_SELECT },
  creator: { select: USER_SELECT },
  documents: {
    include: { document: { select: DOCUMENT_SELECT } },
    orderBy: { createdAt: 'asc' as const },
  },
  periods: { orderBy: { startDate: 'asc' as const } },
  approvalRequest: {
    include: {
      category: {
        select: { id: true, code: true, name: true, icon: true },
      },
      tiers: {
        include: { approver: { select: USER_SELECT } },
        orderBy: { tierOrder: 'asc' as const },
      },
    },
  },
} as const;

/**
 * Leave request lifecycle - owns leave data; delegates tier workflow to ApprovalsService.
 * Leave day counts come from WorkScheduleService - the canonical source of
 * working days, half days, weekends, and public holidays. Do not hardcode
 * those rules in this service.
 */
@Injectable()
export class LeaveService
  implements ApprovalDecisionListener, OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(LeaveService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly approvalsService: ApprovalsService,
    private readonly leaveBalanceService: LeaveBalanceService,
    private readonly hrApprovalChain: HrApprovalChainService,
    private readonly decisionRegistry: ApprovalDecisionRegistry,
    private readonly permissionService: PermissionService,
    private readonly workScheduleService: WorkScheduleService,
    private readonly onBehalfService: OnBehalfService,
    @Inject(forwardRef(() => AttendanceService))
    private readonly attendanceService: AttendanceService,
    @Inject(STORAGE_SERVICE)
    private readonly storage: IStorageService,
    private readonly dayCoverage: DayCoverageService,
    private readonly leaveLedger: LeaveLedgerService,
  ) {}
   
  onModuleInit(): void {
    this.decisionRegistry.register(this);
  }

  onModuleDestroy(): void {
    this.decisionRegistry.unregister(this);
  }

  /**
   * Creates a leave request, reserves balance, and opens an approval workflow.
   * Heavy reads (org chain, balance) run before any transaction / approval write.
   */
  async submitRequest(
    dto: SubmitLeaveRequestDto,
    companyId: string,
    userId: string,
    files: UploadedFile[] = [],
  ): Promise<unknown> {
    const employeeId = await this.onBehalfService.resolveHrProcessSubjectId(
      userId,
      companyId,
      dto.onBehalfOfEmployeeId,
    );
    return this.submitLeaveForEmployee(
      employeeId,
      dto,
      companyId,
      userId,
      files,
    );
  }

  /**
   * Submits a leave request on behalf of an employee (HR import / proxy).
   * Uses employeeId for ownership and approval-chain subject; actorUserId for audit fields.
   */
  async submitOnBehalf(
    employeeId: string,
    dto: SubmitLeaveRequestDto,
    companyId: string,
    actorUserId: string,
  ): Promise<unknown> {
    const employee = await this.prisma.user.findFirst({
      where: activeOnly({ id: employeeId, companyId }),
      select: { id: true },
    });
    if (!employee) {
      throw new NotFoundException('Employee not found');
    }
    return this.submitLeaveForEmployee(
      employeeId,
      dto,
      companyId,
      actorUserId,
      [],
    );
  }

  /**
   * Shared leave submit path for self-service and on-behalf flows.
   */
  private async submitLeaveForEmployee(
    employeeId: string,
    dto: SubmitLeaveRequestDto,
    companyId: string,
    actorUserId: string,
    files: UploadedFile[] = [],
  ): Promise<unknown> {
    await this.assertOnBehalfLeaveSubmitScope(
      actorUserId,
      employeeId,
      companyId,
    );

    if (dto.leaveType === LeaveType.MATERNITY) {
      const employee = await this.prisma.user.findFirst({
        where: { id: employeeId, companyId, deletedAt: null },
        select: { gender: true },
      });
      if (!employee) {
        throw new NotFoundException('Employee not found in this company');
      }
      if (employee.gender !== Gender.FEMALE) {
        throw new BadRequestException(
          'Maternity leave is only available for female employees',
        );
      }
    }

    const resolved = await this.workScheduleService.calculateLeaveDays(
      employeeId,
      companyId,
      this.resolvePeriodInputs(dto),
    );
    const startDate = resolved.startDate;
    const endDate = resolved.endDate;
    const days = resolved.days;
    await assertWithinEmploymentWindow(this.prisma, employeeId, datesInRange(startDate, endDate));
    // Charge each working day to the leave year that contains it (split on anniversary).
    const yearCharges = await this.leaveBalanceService.chargeDaysByLeaveYear(
      employeeId,
      companyId,
      resolved.breakdown,
    );

    // A leave day must not already be covered by leave, a site assignment,
    // work from home, a field movement or attendance scans (approved or requested).
    // Half-day leave: the other half may be another half-day leave or scans.
    const halfDayKeys = new Set<string>();
    for (const period of resolved.periodRows) {
      if (period.dayPortion !== 'FULL') {
        for (const day of eachDay(period.startDate, period.endDate)) {
          halfDayKeys.add(coverDateKey(day.date));
        }
      }
    }
    const leaveDays = resolved.breakdown
      .filter((day) => day.weight > 0)
      .map((day) => ({ date: day.date, halfDay: halfDayKeys.has(coverDateKey(day.date)) }));
    // Attendance is imported after month-end — never hard-block leave create on scans.
    await this.dayCoverage.assertUncovered(
      companyId,
      employeeId,
      leaveDays.filter((day) => !day.halfDay),
      ['LEAVE', 'SITE_ASSIGNMENT', 'WORK_FROM_HOME', 'FIELD_MOVEMENT'],
    );
    await this.dayCoverage.assertUncovered(
      companyId,
      employeeId,
      leaveDays.filter((day) => day.halfDay),
      ['SITE_ASSIGNMENT', 'WORK_FROM_HOME', 'FIELD_MOVEMENT'],
    );

    // Step 1 - resolve chain for the leave owner (not necessarily the actor)
    // Leave: Reports to → HR Manager (no General Manager tier)
    const resolvedTiers = await this.hrApprovalChain.buildOrgApprovalChain(
      employeeId,
      companyId,
      false,
    );

    // Step 2–3 - balance ensure + check (skipped for unpaid leave)
    if (leaveTypeAffectsBalance(dto.leaveType)) {
      for (const charge of yearCharges) {
        await this.leaveBalanceService.ensureBalance(
          employeeId,
          charge.year.label,
          companyId,
        );
      }
      await this.leaveBalanceService.assertSufficientBalanceForCharges(
        employeeId,
        companyId,
        dto.leaveType,
        yearCharges,
      );
    }

    const title = `${this.formatLeaveType(dto.leaveType)} leave - ${formatDateOnly(startDate)} to ${formatDateOnly(endDate)}`;
    const now = new Date();
    const leaveId = randomUUID();

    // HR+ / Discipline Lead with no remaining tiers - auto-approve (no self-approval).
    if (resolvedTiers.length === 0) {
      const requestNumber = await this.nextLeaveRequestNumber();
      await this.prisma.leaveRequest.create({
        data: {
          id: leaveId,
          companyId,
          requestNumber,
          employeeId,
          leaveType: dto.leaveType,
          startDate,
          endDate,
          days: new Prisma.Decimal(days),
          reason: dto.reason?.trim() || null,
          status: LeaveRequestStatus.APPROVED,
          submittedAt: now,
          completedAt: now,
          createdBy: actorUserId,
          updatedBy: actorUserId,
          periods: {
            create: resolved.periodRows.map((period) => ({
              id: randomUUID(),
              startDate: period.startDate,
              endDate: period.endDate,
              days: new Prisma.Decimal(period.days),
              dayPortion: period.dayPortion,
            })),
          },
        },
      });

      if (files.length > 0) {
        await this.attachFiles(leaveId, companyId, actorUserId, files);
      }

      await this.leaveLedger.recordLeaveUsed(leaveId);

      this.logger.log(
        `Leave request ${requestNumber} auto-approved (no further tiers)`,
      );

      await this.onBehalfService.recordOnBehalfCreate({
        moduleCode: 'LEAVE_REQUEST',
        companyId,
        actorUserId,
        employeeId,
        recordId: leaveId,
        recordReference: requestNumber,
        autoApproveTier: dto.autoApproveTier,
      });

      // Mirror site-assignment auto-approve: sync attendance daily logs to LEAVE.
      await this.recalculateAttendanceForLeavePeriods(
        companyId,
        employeeId,
        resolved.periodRows,
      );

      return this.fetchLeaveDetail(leaveId, companyId);
    }

    // Step 4 - approval write only (requestedBy = leave owner / chain subject)
    const approval = (await this.approvalsService.submitRequest(
      {
        categoryCode: 'LEAVE_REQUEST',
        title,
        formData: {
          leaveType: dto.leaveType,
          startDate: formatDateOnly(startDate),
          endDate: formatDateOnly(endDate),
          days,
          periods: resolved.periodRows.map((period) => ({
            startDate: formatDateOnly(period.startDate),
            endDate: formatDateOnly(period.endDate),
            days: period.days,
            dayPortion: period.dayPortion,
          })),
          reason: dto.reason ?? null,
        },
      },
      companyId,
      employeeId,
      {
        resolvedTiers: {
          ruleName: 'Leave org chain',
          tiers: resolvedTiers,
        },
        createdByUserId: actorUserId,
      },
    )) as { id: string; requestNumber: string };

    try {
      await this.prisma.$transaction(
        async (tx: Prisma.TransactionClient) => {
          await tx.leaveRequest.create({
            data: {
              id: leaveId,
              companyId,
              requestNumber: approval.requestNumber,
              employeeId,
              leaveType: dto.leaveType,
              startDate,
              endDate,
              days: new Prisma.Decimal(days),
              reason: dto.reason?.trim() || null,
              status: LeaveRequestStatus.SUBMITTED,
              approvalRequestId: approval.id,
              submittedAt: now,
              createdBy: actorUserId,
              updatedBy: actorUserId,
              periods: {
                create: resolved.periodRows.map((period) => ({
                  id: randomUUID(),
                  startDate: period.startDate,
                  endDate: period.endDate,
                  days: new Prisma.Decimal(period.days),
                  dayPortion: period.dayPortion,
                })),
              },
            },
          });
        },
        { maxWait: 10_000, timeout: 30_000 },
      );

      if (files.length > 0) {
        await this.attachFiles(leaveId, companyId, actorUserId, files);
      }

      for (const charge of yearCharges) {
        await this.leaveBalanceService.adjustBalance(
          employeeId,
          dto.leaveType,
          charge.year.label,
          'pending',
          charge.days,
          companyId,
        );
      }
    } catch (error: unknown) {
      this.logger.error(
        `Leave create failed after approval ${approval.id}; cancelling approval`,
        error instanceof Error ? error.message : String(error),
      );
      await this.prisma.approvalRequest.update({
        where: { id: approval.id },
        data: {
          status: ApprovalRequestStatus.CANCELLED,
          updatedBy: actorUserId,
          completedAt: now,
        },
      });
      throw error;
    }

    await this.onBehalfService.recordOnBehalfCreate({
      moduleCode: 'LEAVE_REQUEST',
      companyId,
      actorUserId,
      employeeId,
      recordId: leaveId,
      recordReference: approval.requestNumber,
      autoApproveTier: dto.autoApproveTier,
    });
    await this.onBehalfService.applyAutoApprove({
      moduleCode: 'LEAVE_REQUEST',
      companyId,
      actorUserId,
      employeeId,
      approvalRequestId: approval.id,
      autoApproveTier: dto.autoApproveTier === true,
    });

    return this.fetchLeaveDetail(leaveId, companyId);
  }

  /**
   * Cancels a DRAFT, SUBMITTED, or IN_REVIEW leave request (owner or HR), or
   * an APPROVED one (HR only - reverses its USED ledger entry and recalculates
   * attendance).
   */
  async cancelRequest(
    id: string,
    companyId: string,
    userId: string,
  ): Promise<unknown> {
    const leave = await this.prisma.leaveRequest.findFirst({
      where: activeOnly({ id, companyId }),
      include: {
        periods: {
          select: { startDate: true, endDate: true, days: true },
          orderBy: { startDate: 'asc' },
        },
      },
    });
    if (!leave) {
      throw new NotFoundException('Leave request not found');
    }
    await this.assertCanManageLeaveRequest(leave.employeeId, companyId, userId);
    const isApproved = leave.status === LeaveRequestStatus.APPROVED;
    if (isApproved) {
      const isHr = await this.permissionService.hasPermission(
        userId,
        companyId,
        'leave',
        'manage',
      );
      if (!isHr) {
        throw new ForbiddenException(
          'Only HR can cancel an approved leave request',
        );
      }
    } else if (
      leave.status !== LeaveRequestStatus.DRAFT &&
      leave.status !== LeaveRequestStatus.SUBMITTED &&
      leave.status !== LeaveRequestStatus.IN_REVIEW
    ) {
      throw new BadRequestException(
        'Only draft, submitted, in-review or approved leave requests can be cancelled',
      );
    }

    const previousStatus = leave.status;
    const now = new Date();
    await this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      await tx.leaveRequest.update({
        where: { id: leave.id },
        data: {
          status: LeaveRequestStatus.CANCELLED,
          completedAt: now,
          updatedBy: userId,
        },
      });

      if (leave.approvalRequestId) {
        await tx.approvalRequest.update({
          where: { id: leave.approvalRequestId },
          data: {
            status: ApprovalRequestStatus.CANCELLED,
            completedAt: now,
            updatedBy: userId,
          },
        });
      }
    });

    if (
      previousStatus === LeaveRequestStatus.SUBMITTED ||
      previousStatus === LeaveRequestStatus.IN_REVIEW
    ) {
      await this.leaveBalanceService.adjustPendingForLeavePeriods(
        leave.employeeId,
        companyId,
        leave.leaveType,
        leave.periods.map((period) => ({
          startDate: period.startDate,
          endDate: period.endDate,
          days: Number(period.days),
        })),
        -1,
        leave.startDate ?? now,
        Number(leave.days ?? 0),
      );
    }
    if (isApproved) {
      await this.leaveLedger.reverseLeaveUsed(leave.id, userId);
      await this.recalculateAttendanceForLeavePeriods(
        companyId,
        leave.employeeId,
        leave.periods,
      );
    }

    return this.getRequest(id, companyId, userId);
  }

  /**
   * Updates a DRAFT or RETURNED leave request.
   * Owner or HR (hr.view) may edit.
   */
  async updateRequest(
    id: string,
    dto: UpdateLeaveRequestDto,
    companyId: string,
    userId: string,
  ): Promise<unknown> {
    const leave = await this.prisma.leaveRequest.findFirst({
      where: activeOnly({ id, companyId }),
    });
    if (!leave) {
      throw new NotFoundException('Leave request not found');
    }
    await this.assertCanManageLeaveRequest(leave.employeeId, companyId, userId);
    if (
      leave.status !== LeaveRequestStatus.DRAFT &&
      leave.status !== LeaveRequestStatus.RETURNED
    ) {
      throw new ForbiddenException('This request can no longer be edited.');
    }

    const leaveType = dto.leaveType ?? leave.leaveType;
    const periodInputs = this.resolvePeriodInputs(dto, leave);
    const resolved = await this.workScheduleService.calculateLeaveDays(
      leave.employeeId,
      companyId,
      periodInputs,
    );

    const reason =
      dto.reason !== undefined ? dto.reason.trim() || null : leave.reason;

    await this.prisma.$transaction(async (tx) => {
      await tx.leaveRequestPeriod.deleteMany({
        where: { leaveRequestId: leave.id },
      });
      await tx.leaveRequest.update({
        where: { id: leave.id },
        data: {
          leaveType,
          startDate: resolved.startDate,
          endDate: resolved.endDate,
          days: new Prisma.Decimal(resolved.days),
          reason,
          updatedBy: userId,
          periods: {
            create: resolved.periodRows.map((period) => ({
              id: randomUUID(),
              startDate: period.startDate,
              endDate: period.endDate,
              days: new Prisma.Decimal(period.days),
              dayPortion: period.dayPortion,
            })),
          },
        },
      });
      if (leave.approvalRequestId) {
        // Keep the approval card in step with the edited leave.
        await tx.approvalRequest.update({
          where: { id: leave.approvalRequestId },
          data: {
            title: `${this.formatLeaveType(leaveType)} leave - ${formatDateOnly(resolved.startDate)} to ${formatDateOnly(resolved.endDate)}`,
            formData: {
              leaveType,
              startDate: formatDateOnly(resolved.startDate),
              endDate: formatDateOnly(resolved.endDate),
              days: resolved.days,
              periods: resolved.periodRows.map((period) => ({
                startDate: formatDateOnly(period.startDate),
                endDate: formatDateOnly(period.endDate),
                days: period.days,
                dayPortion: period.dayPortion,
              })),
              reason,
            },
            updatedBy: userId,
          },
        });
      }
    });

    return this.getRequest(id, companyId, userId);
  }

  /**
   * Soft-deletes a leave request (HR / full access only) and reverses balance impact.
   */
  async deleteRequest(
    id: string,
    companyId: string,
    userId: string,
  ): Promise<void> {
    const leave = await this.prisma.leaveRequest.findFirst({
      where: activeOnly({ id, companyId }),
      include: {
        periods: {
          select: { startDate: true, endDate: true, days: true },
          orderBy: { startDate: 'asc' },
        },
      },
    });
    if (!leave) {
      throw new NotFoundException('Leave request not found');
    }

    const isHrViewer = await this.permissionService.hasPermission(
      userId,
      companyId,
      'leave',
      'manage',
    );
    if (!isHrViewer) {
      throw new ForbiddenException(
        'Only HR can delete leave requests',
      );
    }

    const days = Number(leave.days ?? 0);
    const now = new Date();

    await this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      await tx.leaveRequest.update({
        where: { id: leave.id },
        data: {
          deletedAt: now,
          deletedBy: userId,
          updatedBy: userId,
        },
      });

      if (leave.approvalRequestId) {
        await tx.approvalRequest.update({
          where: { id: leave.approvalRequestId },
          data: {
            status: ApprovalRequestStatus.CANCELLED,
            completedAt: now,
            updatedBy: userId,
          },
        });
      }
    });

    if (
      leave.status === LeaveRequestStatus.SUBMITTED ||
      leave.status === LeaveRequestStatus.IN_REVIEW
    ) {
      await this.leaveBalanceService.adjustPendingForLeavePeriods(
        leave.employeeId,
        companyId,
        leave.leaveType,
        leave.periods.map((period) => ({
          startDate: period.startDate,
          endDate: period.endDate,
          days: Number(period.days),
        })),
        -1,
        leave.startDate ?? now,
        days,
      );
    } else if (leave.status === LeaveRequestStatus.APPROVED) {
      await this.leaveLedger.reverseLeaveUsed(leave.id, userId);
      await this.recalculateAttendanceForLeavePeriods(
        companyId,
        leave.employeeId,
        leave.periods,
      );
    }
  }

  /**
   * Tightens on-behalf leave submit scope for department / discipline leaders
   * after eligibility checks (full-access roles bypass).
   */
  private async assertOnBehalfLeaveSubmitScope(
    actorUserId: string,
    employeeId: string,
    companyId: string,
  ): Promise<void> {
    if (actorUserId === employeeId) {
      return;
    }

    const primaryRole = await this.hrApprovalChain.getPrimaryRoleName(
      actorUserId,
      companyId,
    );
    const fullAccessRoles = new Set([
      'General Manager',
      'Managing Director',
      'HR Manager',
      'System Administrator',
    ]);
    if (primaryRole !== null && fullAccessRoles.has(primaryRole)) {
      return;
    }

    if (primaryRole === 'Department Head') {
      const users = await this.prisma.user.findMany({
        where: {
          id: { in: [actorUserId, employeeId] },
          companyId,
          deletedAt: null,
        },
        select: { id: true, departmentId: true },
      });
      const initiator = users.find((user) => user.id === actorUserId);
      const target = users.find((user) => user.id === employeeId);
      if (
        !initiator?.departmentId ||
        !target?.departmentId ||
        initiator.departmentId !== target.departmentId
      ) {
        throw new ForbiddenException(
          'You may only submit leave on behalf of employees in your department',
        );
      }
      return;
    }

    if (primaryRole === 'Discipline Lead') {
      const ledDisciplines = await this.prisma.discipline.findMany({
        where: activeOnly({
          companyId,
          OR: [{ leaderId: actorUserId }, { localLeaderId: actorUserId }],
        }),
        select: { id: true },
      });
      const disciplineIds = ledDisciplines.map((discipline) => discipline.id);
      const target = await this.prisma.user.findFirst({
        where: activeOnly({ id: employeeId, companyId }),
        select: { engineeringDisciplineId: true },
      });
      if (
        !target?.engineeringDisciplineId ||
        !disciplineIds.includes(target.engineeringDisciplineId)
      ) {
        throw new ForbiddenException(
          'You may only submit leave on behalf of employees in your discipline',
        );
      }
    }
  }

  /**
   * Owner or HR may mutate a leave request (edit / cancel).
   */
  private async assertCanManageLeaveRequest(
    employeeId: string,
    companyId: string,
    userId: string,
  ): Promise<void> {
    if (employeeId === userId) {
      return;
    }
    const isHrViewer = await this.permissionService.hasPermission(
      userId,
      companyId,
      'leave',
      'manage',
    );
    if (!isHrViewer) {
      throw new ForbiddenException(
        'You do not have permission to modify this leave request',
      );
    }
  }

  /**
   * Fetches a leave request with employee and approval tier details.
   * HR viewers see any company request; others must be the employee or a tier approver.
   */
  async getRequest(
    id: string,
    companyId: string,
    userId: string,
  ): Promise<unknown> {
    const leave = await this.prisma.leaveRequest.findFirst({
      where: activeOnly({ id, companyId }),
      include: LEAVE_DETAIL_INCLUDE,
    });
    if (!leave) {
      throw new NotFoundException('Leave request not found');
    }

    await this.assertCanViewLeaveRequest(leave, companyId, userId);
    return this.mapLeaveWithBalance(leave, companyId);
  }

  /**
   * Loads leave detail + balance without permission checks (post-create return path).
   */
  private async fetchLeaveDetail(
    id: string,
    companyId: string,
  ): Promise<unknown> {
    const leave = await this.prisma.leaveRequest.findFirst({
      where: activeOnly({ id, companyId }),
      include: LEAVE_DETAIL_INCLUDE,
    });
    if (!leave) {
      throw new NotFoundException('Leave request not found');
    }
    return this.mapLeaveWithBalance(leave, companyId);
  }

  private async mapLeaveWithBalance(
    leave: {
      employeeId: string;
      leaveType: LeaveType;
      startDate: Date | null;
    } & Record<string, unknown>,
    companyId: string,
  ): Promise<Record<string, unknown>> {
    const mapped = this.mapLeave(leave);
    const year = await this.leaveBalanceService.yearLabelForDate(
      leave.employeeId,
      companyId,
      leave.startDate ?? new Date(),
    );
    const balances = (await this.leaveBalanceService.getBalance(
      leave.employeeId,
      year,
      companyId,
    )) as Array<Record<string, unknown>>;
    const balance = leaveTypeAffectsBalance(leave.leaveType)
      ? (balances.find(
          (row) =>
            row.leaveType === resolveBalanceLeaveType(leave.leaveType),
        ) ?? null)
      : null;

    const periodRows = Array.isArray(leave.periods)
      ? (leave.periods as Array<{ startDate: Date; endDate: Date }>)
      : [];
    const breakdown: Array<{
      date: string;
      type: string;
      holidayName?: string;
      weight: number;
    }> = [];
    for (const period of periodRows) {
      const result = await this.workScheduleService.calculateWorkingDays(
        leave.employeeId,
        companyId,
        period.startDate,
        period.endDate,
      );
      for (const row of result.breakdown) {
        breakdown.push({
          date: formatDateOnly(row.date),
          type: row.type,
          holidayName: row.holidayName,
          weight: row.weight,
        });
      }
    }

    return {
      ...mapped,
      balance,
      breakdown,
    };
  }

  /**
   * Paginated leave requests. HR viewers see company-wide; others see own rows only.
   */
  async listRequests(
    filters: ListLeaveRequestsDto,
    companyId: string,
    userId: string,
  ): Promise<PaginatedResult<unknown>> {
    const page = filters.page ?? 1;
    const limit = filters.limit ?? 20;
    const { skip, take } = buildPrismaPagination(page, limit);
    const statuses = this.normalizeStatuses(filters.status);
    const isHrViewer = await this.permissionService.hasPermission(
      userId,
      companyId,
      'leave',
      'manage',
    );

    // Supervisors (anyone with reports) see their team's requests too.
    const teamScope = isHrViewer
      ? null
      : teamScopeWhere(
          userId,
          await resolveTeamScopedEmployeeIds(this.prisma, userId, companyId),
          filters.employeeId,
        );

    const where = activeOnly({
      companyId,
      ...(teamScope ? { AND: [teamScope] } : {}),
      ...(statuses ? { status: { in: statuses } } : {}),
      ...(filters.leaveType ? { leaveType: filters.leaveType } : {}),
      ...(isHrViewer && filters.employeeId
        ? { employeeId: filters.employeeId }
        : {}),
      ...(filters.dateFrom || filters.dateTo
        ? {
            startDate: {
              ...(filters.dateFrom
                ? { gte: this.parseDateOnly(filters.dateFrom) }
                : {}),
              ...(filters.dateTo
                ? { lte: this.parseDateOnly(filters.dateTo) }
                : {}),
            },
          }
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
                reason: {
                  contains: filters.search.trim(),
                  mode: 'insensitive' as const,
                },
              },
            ],
          }
        : {}),
    });

    const [rows, total] = await Promise.all([
      this.prisma.leaveRequest.findMany({
        where,
        skip,
        take,
        orderBy: { createdAt: 'desc' },
        include: {
          employee: { select: USER_SELECT },
          // Period segments are required so profile history can show days
          // charged inside a selected contract window (anniversary splits).
          periods: { orderBy: { startDate: 'asc' as const } },
          approvalRequest: {
            select: { id: true, status: true, currentTier: true },
          },
        },
      }),
      this.prisma.leaveRequest.count({ where }),
    ]);

    return buildPaginatedResult(
      rows.map((row) => this.mapLeave(row)),
      total,
      page,
      limit,
    );
  }

  /**
   * Leave requests for the authenticated employee (always employee-scoped).
   */
  async getMyRequests(
    userId: string,
    companyId: string,
    filters: ListLeaveRequestsDto,
  ): Promise<PaginatedResult<unknown>> {
    return this.listRequests(
      { ...filters, employeeId: userId },
      companyId,
      userId,
    );
  }

  /**
   * Ensures the caller may read this leave request.
   */
  private async assertCanViewLeaveRequest(
    leave: {
      status: string;
      employeeId: string;
      createdBy?: string;
      approvalRequest?: {
        tiers?: Array<{ approverId: string }>;
      } | null;
    },
    companyId: string,
    userId: string,
  ): Promise<void> {
    const isHrViewer = await this.permissionService.hasPermission(
      userId,
      companyId,
      'leave',
      'manage',
    );
    if (isHrViewer) {
      return;
    }

    const isOwner = leave.employeeId === userId || leave.createdBy === userId;
    const isApprover =
      // Cancelled requests are hidden from the approval chain.
      leave.status !== 'CANCELLED' &&
      (leave.approvalRequest?.tiers?.some((tier) => tier.approverId === userId) ??
      false);

    if (
      !isOwner &&
      !isApprover &&
      !(await canViewThroughTeam(this.prisma, userId, companyId, leave))
    ) {
      throw new ForbiddenException(
        'You do not have access to this leave request',
      );
    }
  }

  /**
   * Called by the approval engine when a linked request reaches a terminal decision.
   */
  async onApprovalDecision(
    approvalRequestId: string,
    decision: ApprovalFinalDecision,
  ): Promise<void> {
    const leave = await this.prisma.leaveRequest.findFirst({
      where: activeOnly({ approvalRequestId }),
      include: {
        periods: {
          select: { startDate: true, endDate: true, days: true },
          orderBy: { startDate: 'asc' },
        },
      },
    });
    if (!leave) {
      return;
    }

    if (
      leave.status === LeaveRequestStatus.APPROVED ||
      leave.status === LeaveRequestStatus.REJECTED ||
      leave.status === LeaveRequestStatus.CANCELLED
    ) {
      return;
    }

    const days = Number(leave.days ?? 0);
    const now = new Date();

    let nextStatus: LeaveRequestStatus;
    if (decision === 'APPROVED') {
      nextStatus = LeaveRequestStatus.APPROVED;
    } else if (decision === 'REJECTED') {
      nextStatus = LeaveRequestStatus.REJECTED;
    } else {
      nextStatus = LeaveRequestStatus.RETURNED;
    }

    await this.prisma.leaveRequest.update({
      where: { id: leave.id },
      data: {
        status: nextStatus,
        completedAt:
          decision === 'RETURNED' ? null : now,
        updatedBy: leave.employeeId,
      },
    });

    // Record USED first so a pending-release failure cannot leave approved
    // leave without ledger usage (anniversary-split requests were affected).
    if (decision === 'APPROVED') {
      await this.leaveLedger.recordLeaveUsed(leave.id);
    }

    // Release pending by leave-year segments (same split used when reserving).
    await this.leaveBalanceService.adjustPendingForLeavePeriods(
      leave.employeeId,
      leave.companyId,
      leave.leaveType,
      leave.periods.map((period) => ({
        startDate: period.startDate,
        endDate: period.endDate,
        days: Number(period.days),
      })),
      -1,
      leave.startDate ?? now,
      days,
    );

    await this.recalculateAttendanceForLeavePeriods(
      leave.companyId,
      leave.employeeId,
      leave.periods,
    );
  }

  /**
   * Recomputes imported attendance months touched by leave periods.
   */
  private async recalculateAttendanceForLeavePeriods(
    companyId: string,
    employeeId: string,
    periods: ReadonlyArray<{ startDate: Date; endDate: Date }>,
  ): Promise<void> {
    const seen = new Set<string>();
    for (const period of periods) {
      const months = monthsTouchedByRange(period.startDate, period.endDate);
      for (const { month, year } of months) {
        const key = `${year}-${month}`;
        if (seen.has(key)) {
          continue;
        }
        seen.add(key);
        await this.attendanceService.recalculateCompanyAttendanceMonth(
          companyId,
          month,
          year,
          employeeId,
        );
      }
    }
  }

  private async nextLeaveRequestNumber(): Promise<string> {
    const result = await this.prisma.$queryRawUnsafe<
      Array<{ nextval: bigint | number }>
    >(`SELECT nextval('leave_request_number_seq') as nextval`);
    const next = Number(result[0]?.nextval ?? 1);
    return `LR-${String(next).padStart(4, '0')}`;
  }

  private normalizeStatuses(
    status: LeaveRequestStatus | LeaveRequestStatus[] | string | undefined,
  ): LeaveRequestStatus[] | undefined {
    if (!status) {
      return undefined;
    }
    if (Array.isArray(status)) {
      return status.length > 0 ? status : undefined;
    }
    if (typeof status === 'string' && status.includes(',')) {
      return status
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean) as LeaveRequestStatus[];
    }
    return [status as LeaveRequestStatus];
  }

  private resolvePeriodInputs(
    dto: {
      periods?: LeavePeriodInputDto[];
      startDate?: string;
      endDate?: string;
    },
    existing?: { startDate: Date | null; endDate: Date | null },
  ): Array<{
    startDate: string;
    endDate: string;
    dayPortion?: 'FULL' | 'MORNING' | 'AFTERNOON';
  }> {
    if (dto.periods && dto.periods.length > 0) {
      return dto.periods.map((period) => ({
        startDate: period.startDate,
        endDate: period.endDate,
        dayPortion: period.dayPortion ?? 'FULL',
      }));
    }
    if (dto.startDate && dto.endDate) {
      return [{ startDate: dto.startDate, endDate: dto.endDate, dayPortion: 'FULL' }];
    }
    if (existing?.startDate && existing.endDate) {
      return [
        {
          startDate: formatDateOnly(existing.startDate),
          endDate: formatDateOnly(existing.endDate),
          dayPortion: 'FULL',
        },
      ];
    }
    throw new BadRequestException(
      'Provide periods, or startDate and endDate',
    );
  }

  private parseDateOnly(value: string): Date {
    const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
    if (!match) {
      throw new BadRequestException(`Invalid date: ${value}`);
    }
    const year = Number(match[1]);
    const month = Number(match[2]);
    const day = Number(match[3]);
    return new Date(Date.UTC(year, month - 1, day));
  }

  private formatLeaveType(leaveType: LeaveType): string {
    return leaveType
      .split('_')
      .map((part) => part.charAt(0) + part.slice(1).toLowerCase())
      .join(' ');
  }

  private mapLeave(row: Record<string, unknown>): Record<string, unknown> {
    const days = row.days;
    const documents = Array.isArray(row.documents)
      ? (row.documents as Array<{ document?: Record<string, unknown> }>)
          .map((link) => link.document)
          .filter((doc): doc is Record<string, unknown> => Boolean(doc))
      : [];
    const periods = Array.isArray(row.periods)
      ? (row.periods as Array<Record<string, unknown>>).map((period) => ({
          ...period,
          days:
            period.days instanceof Prisma.Decimal
              ? Number(period.days)
              : Number(period.days),
        }))
      : [];
    return {
      ...row,
      days: days instanceof Prisma.Decimal ? Number(days) : Number(days ?? 0),
      documents,
      periods,
    };
  }

  /**
   * Creates attachment folder (if needed) and uploads files to erp-hr.
   */
  private async attachFiles(
    leaveRequestId: string,
    companyId: string,
    userId: string,
    files: UploadedFile[],
  ): Promise<void> {
    const leave = await this.prisma.leaveRequest.findFirst({
      where: activeOnly({ id: leaveRequestId, companyId }),
      select: {
        id: true,
        requestNumber: true,
        attachmentFolderId: true,
      },
    });
    if (!leave) {
      throw new NotFoundException('Leave request not found');
    }

    const folderId =
      leave.attachmentFolderId ??
      (await this.ensureLeaveAttachmentFolder(leave, companyId, userId));

    for (const file of files) {
      if (!file?.buffer?.length) {
        continue;
      }
      if (!ALLOWED_UPLOAD_MIME_TYPES.has(file.mimetype)) {
        throw new BadRequestException(
          `File type not allowed: ${file.mimetype}`,
        );
      }

      const documentId = randomUUID();
      const safeName = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_');
      const fileKey = `${companyId}/hr/leave/${leaveRequestId}/attachments/${safeName}`;

      await this.storage.upload({
        bucket: STORAGE_BUCKETS.HR,
        key: fileKey,
        body: file.buffer,
        contentType: file.mimetype,
        contentLength: file.size,
      });

      await this.prisma.$transaction(async (tx) => {
        await tx.document.create({
          data: {
            id: documentId,
            companyId,
            folderId,
            name: file.originalname,
            fileKey,
            fileType: file.mimetype,
            fileSizeBytes: file.size,
            version: 1,
            isCurrent: true,
            createdBy: userId,
            updatedBy: userId,
          },
        });
        await tx.documentVersion.create({
          data: {
            documentId,
            uploadedBy: userId,
            versionNumber: 1,
            fileKey,
            fileSizeBytes: file.size,
          },
        });
        await tx.leaveRequestDocument.create({
          data: {
            id: randomUUID(),
            leaveRequestId,
            documentId,
          },
        });
      });
    }
  }

  private async ensureLeaveAttachmentFolder(
    leave: { id: string; requestNumber: string; attachmentFolderId: string | null },
    companyId: string,
    userId: string,
  ): Promise<string> {
    if (leave.attachmentFolderId) {
      return leave.attachmentFolderId;
    }

    const folderId = randomUUID();
    await this.prisma.$transaction(async (tx) => {
      await tx.documentFolder.create({
        data: {
          id: folderId,
          companyId,
          name: `Leave ${leave.requestNumber}`,
          path: `/hr/leave/${leave.requestNumber}`,
          contextType: FolderContextType.LEAVE,
          contextId: leave.id,
          isSystem: false,
          createdBy: userId,
          updatedBy: userId,
        },
      });
      await tx.leaveRequest.update({
        where: { id: leave.id },
        data: {
          attachmentFolderId: folderId,
          updatedBy: userId,
        },
      });
    });

    return folderId;
  }
}
