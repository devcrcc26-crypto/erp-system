import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
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
  OvertimeSheetStatus,
  PayrollRunStatus,
  Prisma,
} from '@prisma/client';
import { randomUUID } from 'crypto';
import { PrismaService } from '../../../../shared/prisma/prisma.service';
import {
  getTodayInTimezone,
  isDateInFuture,
} from '../../../../shared/utils/date-validation.util';
import { activeOnly } from '../../../../shared/prisma/soft-delete.util';
import {
  canViewThroughTeam,
  resolveTeamScopedEmployeeIds,
  teamScopeWhere,
} from '../../../../shared/org/team-scope.util';
import { PermissionService } from '../../../../shared/permissions/permission.service';
import { isTrueSystemAdministrator } from '../../../../shared/permissions/system-admin.util';
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
import { AuditService } from '../../../audit/application/services/audit.service';
import { HrApprovalChainService } from '../../../hr-shared/application/services/hr-approval-chain.service';
import { OnBehalfService } from '../../../on-behalf/on-behalf.service';
import { WorkScheduleService } from '../../../work-schedule/application/services/work-schedule.service';
import {
  holidayFallsOnDate,
  parseDateOnly,
} from '../../../work-schedule/application/services/work-schedule.dates';
import {
  ListOvertimeSheetsDto,
  OpenOvertimeSheetDto,
  UpsertOvertimeEntryDto,
} from '../dtos/overtime.dtos';
import {
  SAME_DAY_END_BEFORE_START_MESSAGE,
  overtimeEntrySpanMinutes,
  WITHIN_SCHEDULE_MESSAGE,
} from '../utils/overtime-hours.util';
import { PAYROLL_LOCKED_MESSAGE } from '../utils/overtime-entry-guards.util';
import {
  buildOvertimeApprovedSnapshot,
  buildOvertimeEditDiff,
  parseOvertimeApprovedSnapshot,
} from '../utils/overtime-edit-snapshot.util';
import {
  END_OF_DAY_HHMM,
  END_OF_DAY_MINUTES,
} from '../utils/overtime-selectable-windows.util';
import {
  OvertimeEntryService,
  type ClassifiedOvertimeEntry,
} from './overtime-entry.service';

const NEW_OVERNIGHT_NOT_ALLOWED_MESSAGE =
  'Overnight entries are no longer accepted. End at 24:00 and add a second entry on the next day starting at 00:00.';

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

const SHEET_DETAIL_INCLUDE = {
  employee: { select: USER_SELECT },
  creator: { select: USER_SELECT },
  entries: {
    orderBy: [{ date: 'asc' as const }, { startTime: 'asc' as const }],
    include: {
      siteAssignment: {
        select: { id: true, siteName: true, requestNumber: true },
      },
      documents: {
        where: { document: { deletedAt: null } },
        include: { document: { select: DOCUMENT_SELECT } },
        orderBy: { createdAt: 'asc' as const },
      },
    },
  },
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
};

/** Draft/returned: edit without restarting approval. */
const DRAFT_EDITABLE_STATUSES: OvertimeSheetStatus[] = [
  OvertimeSheetStatus.DRAFT,
  OvertimeSheetStatus.RETURNED,
];

/** Submitted/approved: edit allowed until payroll lock; restarts approval. */
const POST_SUBMIT_EDITABLE_STATUSES: OvertimeSheetStatus[] = [
  OvertimeSheetStatus.SUBMITTED,
  OvertimeSheetStatus.IN_REVIEW,
  OvertimeSheetStatus.APPROVED,
];

const MUTABLE_STATUSES: OvertimeSheetStatus[] = [
  ...DRAFT_EDITABLE_STATUSES,
  ...POST_SUBMIT_EDITABLE_STATUSES,
];

/** @deprecated Use DRAFT_EDITABLE_STATUSES — kept for submitSheet gate. */
const EDITABLE_STATUSES = DRAFT_EDITABLE_STATUSES;

/**
 * Monthly overtime sheet lifecycle - entries, totals, and approval submit.
 */
@Injectable()
export class OvertimeService
  implements ApprovalDecisionListener, OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(OvertimeService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly approvalsService: ApprovalsService,
    private readonly hrApprovalChain: HrApprovalChainService,
    private readonly decisionRegistry: ApprovalDecisionRegistry,
    private readonly permissionService: PermissionService,
    private readonly overtimeEntryService: OvertimeEntryService,
    private readonly workScheduleService: WorkScheduleService,
    private readonly onBehalfService: OnBehalfService,
    private readonly auditService: AuditService,
    @Inject(STORAGE_SERVICE)
    private readonly storage: IStorageService,
  ) {}

  onModuleInit(): void {
    this.decisionRegistry.register(this);
  }

  onModuleDestroy(): void {
    this.decisionRegistry.unregister(this);
  }

  /**
   * Finds the sheet for employee/month/year or creates a DRAFT sheet.
   */
  async getOrCreateSheet(
    employeeId: string,
    month: number,
    year: number,
    companyId: string,
    userId: string,
  ): Promise<unknown> {
    if (month < 1 || month > 12) {
      throw new BadRequestException('month must be between 1 and 12');
    }
    if (!(await this.canActForEmployee(employeeId, companyId, userId))) {
      throw new ForbiddenException(
        'You can only open your own overtime sheet',
      );
    }

    const existing = await this.prisma.overtimeSheet.findFirst({
      where: activeOnly({ companyId, employeeId, month, year }),
      include: SHEET_DETAIL_INCLUDE,
    });
    if (existing) {
      return this.reopenOrReturnSheet(existing, companyId, userId);
    }

    // Soft-deleted rows still hold the unique (company, employee, month, year)
    // key - restore them instead of inserting a duplicate.
    const softDeleted = await this.prisma.overtimeSheet.findFirst({
      where: {
        companyId,
        employeeId,
        month,
        year,
        deletedAt: { not: null },
      },
      include: SHEET_DETAIL_INCLUDE,
    });
    if (softDeleted) {
      return this.restoreSoftDeletedSheet(softDeleted.id, companyId, userId);
    }

    const sheetId = randomUUID();
    const sheetNumber = await this.nextSheetNumber();

    try {
      await this.prisma.overtimeSheet.create({
        data: {
          id: sheetId,
          companyId,
          sheetNumber,
          employeeId,
          month,
          year,
          status: OvertimeSheetStatus.DRAFT,
          createdBy: userId,
          updatedBy: userId,
        },
      });
    } catch (error: unknown) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        const raced = await this.prisma.overtimeSheet.findFirst({
          where: { companyId, employeeId, month, year },
          include: SHEET_DETAIL_INCLUDE,
        });
        if (raced) {
          if (raced.deletedAt) {
            return this.restoreSoftDeletedSheet(raced.id, companyId, userId);
          }
          return this.reopenOrReturnSheet(raced, companyId, userId);
        }
      }
      throw error;
    }

    return this.getSheet(sheetId, companyId, userId);
  }

  /**
   * Returns an active sheet, reopening CANCELLED ones as DRAFT.
   */
  private async reopenOrReturnSheet(
    existing: {
      id: string;
      status: OvertimeSheetStatus;
      companyId: string;
      employeeId: string;
    } & Record<string, unknown>,
    companyId: string,
    userId: string,
  ): Promise<unknown> {
    if (existing.status === OvertimeSheetStatus.CANCELLED) {
      await this.prisma.overtimeSheet.update({
        where: { id: existing.id },
        data: {
          status: OvertimeSheetStatus.DRAFT,
          approvalRequestId: null,
          submittedAt: null,
          completedAt: null,
          updatedBy: userId,
        },
      });
      return this.getSheet(existing.id, companyId, userId);
    }
    await this.assertCanViewSheet(existing, companyId, userId);
    return this.mapSheetWithHolidayNames(existing, companyId);
  }

  /**
   * Clears soft-delete and returns the sheet as a fresh DRAFT for editing.
   */
  private async restoreSoftDeletedSheet(
    sheetId: string,
    companyId: string,
    userId: string,
  ): Promise<unknown> {
    await this.prisma.overtimeSheet.update({
      where: { id: sheetId },
      data: {
        deletedAt: null,
        deletedBy: null,
        status: OvertimeSheetStatus.DRAFT,
        approvalRequestId: null,
        submittedAt: null,
        completedAt: null,
        updatedBy: userId,
      },
    });
    return this.getSheet(sheetId, companyId, userId);
  }

  /**
   * Opens or creates a month sheet for the caller or, on behalf, for an eligible employee.
   * The response carries the sheet id so the client can navigate to it.
   */
  async openSheet(
    dto: OpenOvertimeSheetDto,
    companyId: string,
    userId: string,
  ): Promise<unknown> {
    const [todayYear, todayMonth] = getTodayInTimezone()
      .split('-')
      .map(Number);
    const requestedIndex = dto.year * 12 + dto.month;
    const currentIndex = todayYear * 12 + todayMonth;
    if (requestedIndex > currentIndex) {
      throw new BadRequestException('Cannot open a sheet for a future month');
    }
    if (
      requestedIndex < currentIndex &&
      !(await this.canOpenPastMonthSheet(userId, companyId))
    ) {
      throw new BadRequestException(
        'Employees can only open an overtime sheet for the current month',
      );
    }

    const employeeId = await this.onBehalfService.resolveHrProcessSubjectId(
      userId,
      companyId,
      dto.onBehalfOfEmployeeId,
    );
    const sheet = (await this.getOrCreateSheet(
      employeeId,
      dto.month,
      dto.year,
      companyId,
      userId,
    )) as { id: string; sheetNumber?: string };
    await this.onBehalfService.recordOnBehalfCreate({
      moduleCode: 'OVERTIME_APPLICATION',
      companyId,
      actorUserId: userId,
      employeeId,
      recordId: sheet.id,
      recordReference: sheet.sheetNumber,
      autoApproveTier: dto.autoApproveTier,
    });
    return sheet;
  }

  /**
   * Opens or creates the caller's sheet for the current calendar month.
   */
  async getCurrentSheet(
    companyId: string,
    userId: string,
  ): Promise<unknown> {
    const now = new Date();
    return this.getOrCreateSheet(
      userId,
      now.getUTCMonth() + 1,
      now.getUTCFullYear(),
      companyId,
      userId,
    );
  }

  /**
   * Fetches a sheet with entries and approval tiers.
   */
  async getSheet(
    sheetId: string,
    companyId: string,
    userId: string,
    options?: { restartedApproval?: boolean },
  ): Promise<unknown> {
    const row = await this.prisma.overtimeSheet.findFirst({
      where: activeOnly({ id: sheetId, companyId }),
      include: SHEET_DETAIL_INCLUDE,
    });
    if (!row) {
      throw new NotFoundException('Overtime sheet not found');
    }
    await this.assertCanViewSheet(row, companyId, userId);
    const mapped = await this.mapSheetWithHolidayNames(row, companyId);
    const payrollLocked = await this.isPayrollLocked(
      companyId,
      row.month,
      row.year,
    );
    const snapshot = parseOvertimeApprovedSnapshot(row.lastApprovedSnapshot);
    const editDiff = buildOvertimeEditDiff(
      snapshot,
      Array.isArray(row.entries) ? row.entries : [],
    );
    const canEditEntries =
      MUTABLE_STATUSES.includes(row.status) && !payrollLocked;
    return {
      ...mapped,
      payrollLocked,
      canEditEntries,
      editedAfterApproval: Boolean(snapshot) && row.status !== OvertimeSheetStatus.APPROVED,
      editDiff,
      ...(options?.restartedApproval ? { restartedApproval: true } : {}),
    };
  }

  /**
   * Paginated sheets. hr.view → company-wide; others → own only.
   */
  async listSheets(
    filters: ListOvertimeSheetsDto,
    companyId: string,
    userId: string,
  ): Promise<PaginatedResult<unknown>> {
    const page = filters.page ?? 1;
    const limit = filters.limit ?? 20;
    const { skip, take } = buildPrismaPagination(page, limit);
    const statuses = this.normalizeStatuses(filters.status);
    const canViewAll = await this.permissionService.hasPermission(
      userId,
      companyId,
      'overtime',
      'manage',
    );

    // Supervisors (anyone with reports) see their team's sheets too.
    const teamScope = canViewAll
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
      ...(canViewAll && filters.employeeId
        ? { employeeId: filters.employeeId }
        : {}),
      ...(filters.month ? { month: filters.month } : {}),
      ...(filters.year ? { year: filters.year } : {}),
      ...(filters.search?.trim()
        ? {
            sheetNumber: {
              contains: filters.search.trim(),
              mode: 'insensitive' as const,
            },
          }
        : {}),
    });

    const [rows, total] = await Promise.all([
      this.prisma.overtimeSheet.findMany({
        where,
        skip,
        take,
        orderBy: [{ year: 'desc' }, { month: 'desc' }, { createdAt: 'desc' }],
        include: {
          employee: { select: USER_SELECT },
          approvalRequest: {
            select: { id: true, status: true, currentTier: true },
          },
        },
      }),
      this.prisma.overtimeSheet.count({ where }),
    ]);

    return buildPaginatedResult(
      rows.map((row) => this.mapSheet(row)),
      total,
      page,
      limit,
    );
  }

  /**
   * Adds an entry to a mutable sheet and recalculates totals.
   * Post-submit/approved edits restart the approval chain.
   */
  async addEntry(
    sheetId: string,
    dto: UpsertOvertimeEntryDto,
    companyId: string,
    userId: string,
    options?: { allowHolidayOverride?: boolean; allowOvernight?: boolean },
  ): Promise<unknown> {
    const sheet = await this.requireEditableSheet(sheetId, companyId, userId);
    const date = this.parseDateOnly(dto.date);
    const isHr = await this.hasHrOvertimePrivileges(userId, companyId);
    this.assertEntryInSheetMonth(date, sheet.month, sheet.year, {
      allowFutureDates: isHr,
    });

    const isOvernight = Boolean(dto.isOvernight);
    if (isOvernight && !options?.allowOvernight) {
      throw new BadRequestException(NEW_OVERNIGHT_NOT_ALLOWED_MESSAGE);
    }

    const endsAtEndOfDay = this.isEndOfDayTime(dto.endTime, dto.startTime);
    const classifiedEnd = this.classifiedEndTime(dto.endTime, endsAtEndOfDay);
    const startTime = this.parseTimeOfDay(dto.startTime);
    const endTime = this.parseTimeOfDay(
      endsAtEndOfDay ? '00:00' : dto.endTime,
    );
    const classified = await this.overtimeEntryService.classifyEntry(
      sheet.employeeId,
      companyId,
      date,
      dto.startTime,
      classifiedEnd,
      {
        holidayOverride: Boolean(options?.allowHolidayOverride && dto.isHoliday),
        isOvernight,
      },
    );
    this.assertClassifiedHasOvertimeHours(
      classified,
      dto.startTime,
      classifiedEnd,
      isOvernight,
    );

    await this.assertNoOverlap(
      sheetId,
      date,
      startTime,
      endTime,
      endsAtEndOfDay,
      isOvernight,
      undefined,
    );

    if (sheet.restartApproval) {
      await this.captureApprovedSnapshotIfNeeded(sheet);
    }

    const entryId = randomUUID();
    try {
      await this.prisma.$transaction(async (tx) => {
        await tx.overtimeEntry.create({
          data: {
            id: entryId,
            sheetId,
            date,
            startTime,
            endTime,
            isHoliday: classified.isHoliday,
            isOvernight,
            regularHours: new Prisma.Decimal(classified.regularHours),
            nightHours: new Prisma.Decimal(classified.nightHours),
            weekendHours: new Prisma.Decimal(classified.weekendHours),
            holidayHours: new Prisma.Decimal(classified.holidayHours),
            taskDescription: dto.taskDescription.trim(),
            attendanceWarning: classified.attendanceWarning,
            siteAssignmentId: classified.siteAssignmentId,
            siteWithinScheduleHours: new Prisma.Decimal(
              classified.siteWithinScheduleHours,
            ),
            siteReviewFlag: null,
            siteReviewFlaggedAt: null,
          },
        });
        await this.persistEndsAtEndOfDay(tx, entryId, endsAtEndOfDay);
        await this.recalculateSheetTotals(sheetId, tx);
        await tx.overtimeSheet.update({
          where: { id: sheetId },
          data: { updatedBy: userId },
        });
      });
    } catch (error: unknown) {
      this.rethrowEntryConflict(error);
    }

    const restarted = await this.maybeRestartApprovalAfterEdit({
      sheet,
      companyId,
      userId,
      action: 'ADD_ENTRY',
      beforeValue: null,
      afterValue: {
        entryId,
        date: dto.date,
        startTime: dto.startTime,
        endTime: dto.endTime,
        taskDescription: dto.taskDescription.trim(),
      },
    });

    return this.getSheet(sheetId, companyId, userId, { restartedApproval: restarted });
  }

  /**
   * Updates an entry on a mutable sheet and recalculates totals.
   * Post-submit/approved edits restart the approval chain.
   */
  async updateEntry(
    sheetId: string,
    entryId: string,
    dto: UpsertOvertimeEntryDto,
    companyId: string,
    userId: string,
  ): Promise<unknown> {
    const sheet = await this.requireEditableSheet(sheetId, companyId, userId);
    const entry = await this.prisma.overtimeEntry.findFirst({
      where: { id: entryId, sheetId },
    });
    if (!entry) {
      throw new NotFoundException('Overtime entry not found');
    }

    const date = this.parseDateOnly(dto.date);
    const isHr = await this.hasHrOvertimePrivileges(userId, companyId);
    this.assertEntryInSheetMonth(date, sheet.month, sheet.year, {
      allowFutureDates: isHr,
    });

    const isOvernight = Boolean(dto.isOvernight);
    if (isOvernight && !entry.isOvernight) {
      throw new BadRequestException(NEW_OVERNIGHT_NOT_ALLOWED_MESSAGE);
    }

    const endsAtEndOfDay = this.isEndOfDayTime(dto.endTime, dto.startTime);
    const classifiedEnd = this.classifiedEndTime(dto.endTime, endsAtEndOfDay);
    const startTime = this.parseTimeOfDay(dto.startTime);
    const endTime = this.parseTimeOfDay(
      endsAtEndOfDay ? '00:00' : dto.endTime,
    );
    const classified = await this.overtimeEntryService.classifyEntry(
      sheet.employeeId,
      companyId,
      date,
      dto.startTime,
      classifiedEnd,
      { isOvernight },
    );
    this.assertClassifiedHasOvertimeHours(
      classified,
      dto.startTime,
      classifiedEnd,
      isOvernight,
    );

    await this.assertNoOverlap(
      sheetId,
      date,
      startTime,
      endTime,
      endsAtEndOfDay,
      isOvernight,
      entryId,
    );

    const beforeValue = {
      entryId: entry.id,
      date: this.formatDateOnly(entry.date),
      startTime: this.formatTimeOfDay(entry.startTime),
      endTime: entry.endsAtEndOfDay
        ? END_OF_DAY_HHMM
        : this.formatTimeOfDay(entry.endTime),
      taskDescription: entry.taskDescription,
      regularHours: Number(entry.regularHours),
      nightHours: Number(entry.nightHours),
      weekendHours: Number(entry.weekendHours),
      holidayHours: Number(entry.holidayHours),
      totalHours: Number(entry.totalHours),
    };

    if (sheet.restartApproval) {
      await this.captureApprovedSnapshotIfNeeded(sheet);
    }

    try {
      await this.prisma.$transaction(async (tx) => {
        await tx.overtimeEntry.update({
          where: { id: entryId },
          data: {
            date,
            startTime,
            endTime,
            isHoliday: classified.isHoliday,
            isOvernight,
            regularHours: new Prisma.Decimal(classified.regularHours),
            nightHours: new Prisma.Decimal(classified.nightHours),
            weekendHours: new Prisma.Decimal(classified.weekendHours),
            holidayHours: new Prisma.Decimal(classified.holidayHours),
            taskDescription: dto.taskDescription.trim(),
            attendanceWarning: classified.attendanceWarning,
            siteAssignmentId: classified.siteAssignmentId,
            siteWithinScheduleHours: new Prisma.Decimal(
              classified.siteWithinScheduleHours,
            ),
            siteReviewFlag: null,
            siteReviewFlaggedAt: null,
          },
        });
        await this.persistEndsAtEndOfDay(tx, entryId, endsAtEndOfDay);
        await this.recalculateSheetTotals(sheetId, tx);
        await tx.overtimeSheet.update({
          where: { id: sheetId },
          data: { updatedBy: userId },
        });
      });
    } catch (error: unknown) {
      this.rethrowEntryConflict(error);
    }

    const afterValue = {
      entryId,
      date: dto.date,
      startTime: dto.startTime,
      endTime: dto.endTime,
      taskDescription: dto.taskDescription.trim(),
      regularHours: classified.regularHours,
      nightHours: classified.nightHours,
      weekendHours: classified.weekendHours,
      holidayHours: classified.holidayHours,
      totalHours: classified.totalHours,
    };

    const restarted = await this.maybeRestartApprovalAfterEdit({
      sheet,
      companyId,
      userId,
      action: 'UPDATE_ENTRY',
      beforeValue,
      afterValue,
    });

    return this.getSheet(sheetId, companyId, userId, { restartedApproval: restarted });
  }

  /**
   * Uploads optional attachments for an overtime entry (erp-hr).
   */
  async addEntryAttachments(
    sheetId: string,
    entryId: string,
    companyId: string,
    userId: string,
    files: UploadedFile[],
  ): Promise<unknown> {
    const sheet = await this.requireEditableSheet(sheetId, companyId, userId);
    const entry = await this.prisma.overtimeEntry.findFirst({
      where: { id: entryId, sheetId },
    });
    if (!entry) {
      throw new NotFoundException('Overtime entry not found');
    }
    if (!files?.length) {
      throw new BadRequestException('At least one file is required');
    }

    const folderId = await this.ensureOvertimeAttachmentFolder(
      {
        id: sheet.id,
        sheetNumber: sheet.sheetNumber,
        attachmentFolderId: sheet.attachmentFolderId,
      },
      companyId,
      userId,
    );

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
      const fileKey = `${companyId}/hr/overtime/${sheetId}/entries/${entryId}/${safeName}`;

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
        await tx.overtimeEntryDocument.create({
          data: {
            id: randomUUID(),
            entryId,
            documentId,
          },
        });
      });
    }

    return this.getSheet(sheetId, companyId, userId);
  }

  /**
   * Removes one attachment from an overtime entry (soft-deletes the document).
   */
  async removeEntryAttachment(
    sheetId: string,
    entryId: string,
    documentId: string,
    companyId: string,
    userId: string,
  ): Promise<unknown> {
    await this.requireEditableSheet(sheetId, companyId, userId);
    const link = await this.prisma.overtimeEntryDocument.findFirst({
      where: {
        entryId,
        documentId,
        entry: { sheetId },
        document: activeOnly({ companyId }),
      },
      select: { id: true, documentId: true },
    });
    if (!link) {
      throw new NotFoundException('Attachment not found');
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.overtimeEntryDocument.delete({ where: { id: link.id } });
      await tx.document.update({
        where: { id: link.documentId },
        data: {
          deletedAt: new Date(),
          deletedBy: userId,
        },
      });
    });

    return this.getSheet(sheetId, companyId, userId);
  }

  /**
   * Deletes an entry from a mutable sheet and recalculates totals.
   * Post-submit/approved deletes restart the approval chain.
   */
  async deleteEntry(
    sheetId: string,
    entryId: string,
    companyId: string,
    userId: string,
  ): Promise<unknown> {
    const sheet = await this.requireEditableSheet(sheetId, companyId, userId);
    const entry = await this.prisma.overtimeEntry.findFirst({
      where: { id: entryId, sheetId },
    });
    if (!entry) {
      throw new NotFoundException('Overtime entry not found');
    }

    const beforeValue = {
      entryId: entry.id,
      date: this.formatDateOnly(entry.date),
      startTime: this.formatTimeOfDay(entry.startTime),
      endTime: entry.endsAtEndOfDay
        ? END_OF_DAY_HHMM
        : this.formatTimeOfDay(entry.endTime),
      taskDescription: entry.taskDescription,
      totalHours: Number(entry.totalHours),
    };

    if (sheet.restartApproval) {
      await this.captureApprovedSnapshotIfNeeded(sheet);
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.overtimeEntry.delete({ where: { id: entryId } });
      await this.recalculateSheetTotals(sheetId, tx);
      await tx.overtimeSheet.update({
        where: { id: sheetId },
        data: { updatedBy: userId },
      });
    });

    const restarted = await this.maybeRestartApprovalAfterEdit({
      sheet,
      companyId,
      userId,
      action: 'DELETE_ENTRY',
      beforeValue,
      afterValue: null,
    });

    return this.getSheet(sheetId, companyId, userId, { restartedApproval: restarted });
  }

  /**
   * Submits a DRAFT/RETURNED sheet for approval (requires ≥1 entry).
   */
  async submitSheet(
    sheetId: string,
    companyId: string,
    userId: string,
  ): Promise<unknown> {
    const sheet = await this.prisma.overtimeSheet.findFirst({
      where: activeOnly({ id: sheetId, companyId }),
      include: { entries: true },
    });
    if (!sheet) {
      throw new NotFoundException('Overtime sheet not found');
    }
    if (!(await this.canActForEmployee(sheet.employeeId, companyId, userId))) {
      throw new ForbiddenException('Only the employee can submit this sheet');
    }
    if (!EDITABLE_STATUSES.includes(sheet.status)) {
      throw new BadRequestException(
        'Only draft or returned sheets can be submitted',
      );
    }
    if (sheet.entries.length === 0) {
      throw new BadRequestException(
        'Add at least one overtime entry before submitting',
      );
    }

    const unregisteredHolidayDates =
      await this.overtimeEntryService.collectUnregisteredHolidayDates(
        sheet.employeeId,
        companyId,
        sheet.entries,
      );

    const totalHours = sheet.entries.reduce(
      (sum, e) =>
        sum +
        Number(e.regularHours) +
        Number(e.nightHours) +
        Number(e.weekendHours) +
        Number(e.holidayHours),
      0,
    );

    const overtimeFormData = {
      sheetId: sheet.id,
      month: sheet.month,
      year: sheet.year,
      totalHours: Math.round(totalHours * 100) / 100,
      totalRegularHours: Number(sheet.totalRegularHours),
      totalNightHours: Number(sheet.totalNightHours),
      totalWeekendHours: Number(sheet.totalWeekendHours),
      totalHolidayHours: Number(sheet.totalHolidayHours),
      unregisteredHolidayDates,
    };

    // RETURNED sheets reopen the existing approval chain instead of creating a new one
    if (
      sheet.status === OvertimeSheetStatus.RETURNED &&
      sheet.approvalRequestId
    ) {
      await this.mergeApprovalFormData(
        sheet.approvalRequestId,
        overtimeFormData,
      );
      await this.approvalsService.resubmitRequest(
        sheet.approvalRequestId,
        companyId,
        userId,
        undefined,
        [],
      );
      return this.getSheet(sheetId, companyId, userId);
    }

    const resolvedTiers = await this.hrApprovalChain.buildOrgApprovalChain(
      sheet.employeeId,
      companyId,
      false,
    );

    const monthLabel = `${sheet.year}-${String(sheet.month).padStart(2, '0')}`;
    const title = `Overtime sheet - ${monthLabel} (${Math.round(totalHours * 100) / 100}h)`;

    if (resolvedTiers.length === 0) {
      const now = new Date();
      await this.prisma.overtimeSheet.update({
        where: { id: sheet.id },
        data: {
          status: OvertimeSheetStatus.APPROVED,
          submittedAt: now,
          completedAt: now,
          updatedBy: userId,
        },
      });
      this.logger.log(
        `Overtime sheet ${sheet.sheetNumber} auto-approved (no further tiers)`,
      );
      return this.getSheet(sheetId, companyId, userId);
    }

    const approval = (await this.approvalsService.submitRequest(
      {
        categoryCode: 'OVERTIME_APPLICATION',
        title,
        formData: overtimeFormData,
      },
      companyId,
      sheet.employeeId,
      {
        resolvedTiers: {
          ruleName: 'Overtime org chain',
          tiers: resolvedTiers,
        },
        createdByUserId: userId,
      },
    )) as { id: string; requestNumber: string };

    const now = new Date();

    try {
      await this.prisma.overtimeSheet.update({
        where: { id: sheet.id },
        data: {
          status: OvertimeSheetStatus.SUBMITTED,
          approvalRequestId: approval.id,
          submittedAt: now,
          completedAt: null,
          updatedBy: userId,
        },
      });
    } catch (error: unknown) {
      this.logger.error(
        `Overtime sheet submit failed after approval ${approval.id}; cancelling approval`,
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
      throw error;
    }

    await this.onBehalfService.applyAutoApprove({
      moduleCode: 'OVERTIME_APPLICATION',
      companyId,
      actorUserId: userId,
      employeeId: sheet.employeeId,
      approvalRequestId: approval.id,
      autoApproveTier: await this.onBehalfService.wasAutoApproveRequested(
        'OVERTIME_APPLICATION',
        sheet.id,
        userId,
        companyId,
      ),
    });

    return this.getSheet(sheetId, companyId, userId);
  }

  /**
   * Cancels a DRAFT or SUBMITTED sheet owned by the actor.
   */
  async cancelSheet(
    sheetId: string,
    companyId: string,
    userId: string,
  ): Promise<unknown> {
    const row = await this.prisma.overtimeSheet.findFirst({
      where: activeOnly({ id: sheetId, companyId }),
    });
    if (!row) {
      throw new NotFoundException('Overtime sheet not found');
    }
    if (row.employeeId !== userId) {
      throw new ForbiddenException('Only the employee can cancel this sheet');
    }
    if (
      row.status !== OvertimeSheetStatus.DRAFT &&
      row.status !== OvertimeSheetStatus.SUBMITTED
    ) {
      throw new BadRequestException(
        'Only draft or submitted sheets can be cancelled',
      );
    }

    const now = new Date();
    await this.prisma.$transaction(async (tx) => {
      await tx.overtimeSheet.update({
        where: { id: row.id },
        data: {
          status: OvertimeSheetStatus.CANCELLED,
          completedAt: now,
          updatedBy: userId,
        },
      });

      if (row.approvalRequestId) {
        await tx.approvalRequest.update({
          where: { id: row.approvalRequestId },
          data: {
            status: ApprovalRequestStatus.CANCELLED,
            completedAt: now,
            updatedBy: userId,
          },
        });
      }
    });

    return this.getSheet(sheetId, companyId, userId);
  }

  /**
   * Soft-deletes an overtime sheet (HR only) and cancels any linked approval.
   */
  async deleteSheet(
    sheetId: string,
    companyId: string,
    userId: string,
  ): Promise<void> {
    const row = await this.prisma.overtimeSheet.findFirst({
      where: activeOnly({ id: sheetId, companyId }),
    });
    if (!row) {
      throw new NotFoundException('Overtime sheet not found');
    }

    const roleNames = await this.permissionService.getUserRoleNames(userId, companyId);
    if (!isTrueSystemAdministrator(roleNames)) {
      const canDelete = await this.permissionService.hasPermission(
        userId,
        companyId,
        'overtime',
        'delete',
      );
      if (!canDelete) {
        throw new ForbiddenException('Only HR can delete overtime sheets');
      }
    }

    const now = new Date();
    await this.prisma.$transaction(async (tx) => {
      await tx.overtimeSheet.update({
        where: { id: row.id },
        data: {
          deletedAt: now,
          deletedBy: userId,
          updatedBy: userId,
        },
      });

      if (row.approvalRequestId) {
        await tx.approvalRequest.update({
          where: { id: row.approvalRequestId },
          data: {
            status: ApprovalRequestStatus.CANCELLED,
            completedAt: now,
            updatedBy: userId,
          },
        });
      }
    });
  }

  /**
   * Called when a linked approval request reaches a terminal decision.
   */
  async onApprovalDecision(
    approvalRequestId: string,
    decision: ApprovalFinalDecision,
  ): Promise<void> {
    const row = await this.prisma.overtimeSheet.findFirst({
      where: activeOnly({ approvalRequestId }),
      include: { entries: true },
    });
    if (!row) {
      return;
    }

    if (
      row.status === OvertimeSheetStatus.APPROVED ||
      row.status === OvertimeSheetStatus.REJECTED ||
      row.status === OvertimeSheetStatus.CANCELLED
    ) {
      return;
    }

    const now = new Date();
    let nextStatus: OvertimeSheetStatus;
    if (decision === 'APPROVED') {
      nextStatus = OvertimeSheetStatus.APPROVED;
    } else if (decision === 'REJECTED') {
      nextStatus = OvertimeSheetStatus.REJECTED;
    } else {
      nextStatus = OvertimeSheetStatus.RETURNED;
    }

    const snapshot =
      decision === 'APPROVED'
        ? buildOvertimeApprovedSnapshot(row.entries, now)
        : undefined;

    await this.prisma.overtimeSheet.update({
      where: { id: row.id },
      data: {
        status: nextStatus,
        completedAt: decision === 'RETURNED' ? null : now,
        updatedBy: row.employeeId,
        ...(snapshot
          ? {
              lastApprovedSnapshot: snapshot as unknown as Prisma.InputJsonValue,
            }
          : {}),
      },
    });
  }

  /**
   * Recalculates aggregate hour totals from entries (does not write generated totalHours).
   */
  async recalculateSheetTotals(
    sheetId: string,
    tx: Prisma.TransactionClient,
  ): Promise<void> {
    const entries = await tx.overtimeEntry.findMany({ where: { sheetId } });

    const totalRegularHours = entries.reduce(
      (s, e) => s + Number(e.regularHours),
      0,
    );
    const totalNightHours = entries.reduce(
      (s, e) => s + Number(e.nightHours),
      0,
    );
    const totalWeekendHours = entries.reduce(
      (s, e) => s + Number(e.weekendHours),
      0,
    );
    const totalHolidayHours = entries.reduce(
      (s, e) => s + Number(e.holidayHours),
      0,
    );

    await tx.overtimeSheet.update({
      where: { id: sheetId },
      data: {
        totalRegularHours: new Prisma.Decimal(
          Math.round(totalRegularHours * 100) / 100,
        ),
        totalNightHours: new Prisma.Decimal(
          Math.round(totalNightHours * 100) / 100,
        ),
        totalWeekendHours: new Prisma.Decimal(
          Math.round(totalWeekendHours * 100) / 100,
        ),
        totalHolidayHours: new Prisma.Decimal(
          Math.round(totalHolidayHours * 100) / 100,
        ),
      },
    });
  }

  /**
   * Past-month sheets are for HR / overtime managers / on-behalf filers only.
   * Plain employees are limited to the current calendar month (Addis Ababa).
   */
  private async canOpenPastMonthSheet(
    userId: string,
    companyId: string,
  ): Promise<boolean> {
    const [canManageOvertime, canViewHr] = await Promise.all([
      this.permissionService.hasPermission(
        userId,
        companyId,
        'overtime',
        'manage',
      ),
      this.permissionService.hasPermission(userId, companyId, 'hr', 'view'),
    ]);
    if (canManageOvertime || canViewHr) {
      return true;
    }
    const eligible = await this.onBehalfService.getEligibleEmployees(
      userId,
      companyId,
    );
    return eligible.length > 0;
  }

  private async assertCanViewSheet(
    row: {
      status: string;
      employeeId: string;
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
      'overtime',
      'manage',
    );
    if (isHrViewer) {
      return;
    }

    const isOwner = row.employeeId === userId;
    const isApprover =
      // Cancelled requests are hidden from the approval chain.
      row.status !== 'CANCELLED' &&
      (row.approvalRequest?.tiers?.some((tier) => tier.approverId === userId) ??
      false);

    if (
      !isOwner &&
      !isApprover &&
      !(await this.onBehalfService.isEligibleFor(userId, row.employeeId, companyId)) &&
      !(await canViewThroughTeam(this.prisma, userId, companyId, row))
    ) {
      throw new ForbiddenException(
        'You do not have access to this overtime sheet',
      );
    }
  }

  /**
   * Owner, HR (hr.view), or anyone eligible to file overtime on the employee's behalf.
   */
  private async canActForEmployee(
    employeeId: string,
    companyId: string,
    userId: string,
  ): Promise<boolean> {
    if (employeeId === userId) {
      return true;
    }
    const isHrViewer = await this.permissionService.hasPermission(
      userId,
      companyId,
      'overtime',
      'manage',
    );
    return (
      isHrViewer ||
      this.onBehalfService.isEligibleFor(userId, employeeId, companyId)
    );
  }

  private async requireEditableSheet(
    sheetId: string,
    companyId: string,
    userId: string,
  ): Promise<{
    id: string;
    month: number;
    year: number;
    employeeId: string;
    sheetNumber: string;
    attachmentFolderId: string | null;
    status: OvertimeSheetStatus;
    approvalRequestId: string | null;
    lastApprovedSnapshot: Prisma.JsonValue | null;
    restartApproval: boolean;
  }> {
    const sheet = await this.prisma.overtimeSheet.findFirst({
      where: activeOnly({ id: sheetId, companyId }),
    });
    if (!sheet) {
      throw new NotFoundException('Overtime sheet not found');
    }
    if (!(await this.canActForEmployee(sheet.employeeId, companyId, userId))) {
      throw new ForbiddenException('Only the employee can edit this sheet');
    }
    if (!MUTABLE_STATUSES.includes(sheet.status)) {
      throw new BadRequestException(
        'Entries cannot be changed on cancelled or rejected sheets',
      );
    }
    await this.assertPayrollNotLocked(companyId, sheet.month, sheet.year);
    return {
      id: sheet.id,
      month: sheet.month,
      year: sheet.year,
      employeeId: sheet.employeeId,
      sheetNumber: sheet.sheetNumber,
      attachmentFolderId: sheet.attachmentFolderId,
      status: sheet.status,
      approvalRequestId: sheet.approvalRequestId,
      lastApprovedSnapshot: sheet.lastApprovedSnapshot,
      restartApproval: POST_SUBMIT_EDITABLE_STATUSES.includes(sheet.status),
    };
  }

  private async isPayrollLocked(
    companyId: string,
    month: number,
    year: number,
  ): Promise<boolean> {
    const lockedRun = await this.prisma.payrollRun.findFirst({
      where: activeOnly({
        companyId,
        month,
        year,
        status: { in: [PayrollRunStatus.GM_APPROVED, PayrollRunStatus.PAID] },
      }),
      select: { id: true },
    });
    return Boolean(lockedRun);
  }

  private async assertPayrollNotLocked(
    companyId: string,
    month: number,
    year: number,
  ): Promise<void> {
    if (await this.isPayrollLocked(companyId, month, year)) {
      throw new BadRequestException(PAYROLL_LOCKED_MESSAGE);
    }
  }

  /**
   * When editing an APPROVED sheet, persist current entries as the last-approved
   * snapshot before mutating so approvers can see a reliable diff.
   */
  private async captureApprovedSnapshotIfNeeded(sheet: {
    id: string;
    status: OvertimeSheetStatus;
    lastApprovedSnapshot: Prisma.JsonValue | null;
  }): Promise<void> {
    if (sheet.status !== OvertimeSheetStatus.APPROVED) {
      return;
    }
    const entries = await this.prisma.overtimeEntry.findMany({
      where: { sheetId: sheet.id },
    });
    const snapshot = buildOvertimeApprovedSnapshot(entries);
    await this.prisma.overtimeSheet.update({
      where: { id: sheet.id },
      data: {
        lastApprovedSnapshot: snapshot as unknown as Prisma.InputJsonValue,
      },
    });
  }

  /**
   * Restarts approval + writes audit when a post-submit/approved sheet is edited.
   * Returns true when the approval chain was restarted.
   */
  private async maybeRestartApprovalAfterEdit(input: {
    sheet: {
      id: string;
      sheetNumber: string;
      employeeId: string;
      approvalRequestId: string | null;
      restartApproval: boolean;
      status: OvertimeSheetStatus;
    };
    companyId: string;
    userId: string;
    action: string;
    beforeValue: Prisma.InputJsonValue | null;
    afterValue: Prisma.InputJsonValue | null;
  }): Promise<boolean> {
    if (!input.sheet.restartApproval) {
      return false;
    }

    await this.auditService.create({
      userId: input.userId,
      companyId: input.companyId,
      module: 'overtime',
      action: input.action,
      recordType: 'OvertimeSheet',
      recordId: input.sheet.id,
      recordReference: input.sheet.sheetNumber,
      beforeValue: input.beforeValue ?? undefined,
      afterValue: input.afterValue ?? undefined,
    });

    if (input.sheet.approvalRequestId) {
      await this.approvalsService.restartChainAfterEdit(
        input.sheet.approvalRequestId,
        input.companyId,
        input.userId,
        'Overtime sheet edited — approval restarted from the first approver',
      );
      return true;
    }

    // Auto-approved sheets may have no approval request — open a fresh chain.
    await this.prisma.overtimeSheet.update({
      where: { id: input.sheet.id },
      data: {
        status: OvertimeSheetStatus.DRAFT,
        completedAt: null,
        updatedBy: input.userId,
      },
    });
    await this.submitSheet(input.sheet.id, input.companyId, input.userId);
    return true;
  }

  private assertClassifiedHasOvertimeHours(
    classified: ClassifiedOvertimeEntry,
    startTime: string,
    endTime: string,
    isOvernight: boolean,
  ): void {
    if (
      classified.totalHours === 0 &&
      overtimeEntrySpanMinutes(startTime, endTime, isOvernight) > 0
    ) {
      throw new BadRequestException(WITHIN_SCHEDULE_MESSAGE);
    }
  }

  private assertEntryInSheetMonth(
    date: Date,
    month: number,
    year: number,
    options?: { allowFutureDates?: boolean },
  ): void {
    if (date.getUTCMonth() + 1 !== month || date.getUTCFullYear() !== year) {
      throw new BadRequestException(
        `Entry date must fall in sheet period ${year}-${String(month).padStart(2, '0')}`,
      );
    }
    if (!options?.allowFutureDates && isDateInFuture(date)) {
      throw new BadRequestException(
        'Overtime cannot be recorded for future dates',
      );
    }
  }

  /** HR (hr.view) may enter OT on future dates within the sheet month. */
  private async hasHrOvertimePrivileges(
    userId: string,
    companyId: string,
  ): Promise<boolean> {
    return this.permissionService.hasPermission(
      userId,
      companyId,
      'hr',
      'view',
    );
  }

  private async assertNoOverlap(
    sheetId: string,
    date: Date,
    startTime: Date,
    endTime: Date,
    endsAtEndOfDay: boolean,
    isOvernight: boolean,
    excludeEntryId: string | undefined,
  ): Promise<void> {
    const existing = await this.prisma.overtimeEntry.findMany({
      where: {
        sheetId,
        date,
        ...(excludeEntryId ? { id: { not: excludeEntryId } } : {}),
      },
    });

    const newStart = this.timeToMinutes(startTime);
    const newEnd = this.resolveEndMinutes(
      endTime,
      endsAtEndOfDay,
      isOvernight,
      newStart,
    );

    for (const entry of existing) {
      const existStart = this.timeToMinutes(entry.startTime);
      const existEndsAtEndOfDay = await this.readEndsAtEndOfDay(entry.id);
      const existEnd = this.resolveEndMinutes(
        entry.endTime,
        existEndsAtEndOfDay,
        entry.isOvernight,
        existStart,
      );
      if (newStart < existEnd && newEnd > existStart) {
        const endLabel = existEndsAtEndOfDay
          ? END_OF_DAY_HHMM
          : this.formatTimeOfDay(entry.endTime);
        throw new ConflictException(
          `Overlapping overtime entry on ${this.formatDateOnly(date)} ` +
            `(${this.formatTimeOfDay(entry.startTime)}–${endLabel})`,
        );
      }
    }
  }

  private resolveEndMinutes(
    endTime: Date,
    endsAtEndOfDay: boolean,
    isOvernight: boolean,
    startMinutes: number,
  ): number {
    const endMinutes = this.timeToMinutes(endTime);
    // Same-day 24:00 is stored as 00:00 with endsAtEndOfDay (or inferred when not overnight).
    if (endsAtEndOfDay || (!isOvernight && endMinutes === 0)) {
      return END_OF_DAY_MINUTES;
    }
    if (endMinutes <= startMinutes) {
      if (!isOvernight) {
        throw new BadRequestException(SAME_DAY_END_BEFORE_START_MESSAGE);
      }
      return endMinutes + END_OF_DAY_MINUTES;
    }
    return endMinutes;
  }

  /**
   * End-of-calendar-day marker. UI may send 00:00 when start is later that day
   * (e.g. 22:00–00:00 → 2 hours); bare 24:00 is also accepted.
   */
  private isEndOfDayTime(endTime: string, startTime?: string): boolean {
    if (endTime === END_OF_DAY_HHMM || endTime === '24:00') {
      return true;
    }
    return (
      endTime === '00:00' &&
      Boolean(startTime) &&
      startTime !== '00:00' &&
      startTime !== '24:00'
    );
  }

  /** Classify/preview always use 24:00 for end-of-day, never raw 00:00. */
  private classifiedEndTime(dtoEndTime: string, endsAtEndOfDay: boolean): string {
    return endsAtEndOfDay ? END_OF_DAY_HHMM : dtoEndTime;
  }

  /**
   * Writes ends_at_end_of_day via raw SQL so the column works before prisma generate.
   */
  private async persistEndsAtEndOfDay(
    tx: Prisma.TransactionClient,
    entryId: string,
    endsAtEndOfDay: boolean,
  ): Promise<void> {
    // id is text/varchar in Postgres (Prisma String), not uuid - do not cast.
    await tx.$executeRaw`
      UPDATE overtime_entry
      SET ends_at_end_of_day = ${endsAtEndOfDay}
      WHERE id = ${entryId}
    `;
  }

  private async readEndsAtEndOfDay(entryId: string): Promise<boolean> {
    const rows = await this.prisma.$queryRaw<
      Array<{ ends_at_end_of_day: boolean }>
    >`
      SELECT ends_at_end_of_day
      FROM overtime_entry
      WHERE id = ${entryId}
    `;
    return Boolean(rows[0]?.ends_at_end_of_day);
  }

  private async hydrateEndsAtEndOfDay(
    entries: Array<Record<string, unknown>>,
  ): Promise<Array<Record<string, unknown>>> {
    const ids = entries
      .map((entry) => entry.id)
      .filter((id): id is string => typeof id === 'string');
    if (ids.length === 0) {
      return entries;
    }
    const rows = await this.prisma.$queryRaw<
      Array<{ id: string; ends_at_end_of_day: boolean }>
    >`
      SELECT id, ends_at_end_of_day
      FROM overtime_entry
      WHERE id IN (${Prisma.join(ids)})
    `;
    const flags = new Map(
      rows.map((row) => [row.id, Boolean(row.ends_at_end_of_day)]),
    );
    return entries.map((entry) => ({
      ...entry,
      endsAtEndOfDay: flags.get(String(entry.id)) ?? false,
    }));
  }

  private rethrowEntryConflict(error: unknown): never {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002'
    ) {
      throw new ConflictException(
        'An entry with the same date and start/end times already exists on this sheet',
      );
    }
    throw error;
  }

  /**
   * Returns the next sequential sheet number using the PostgreSQL sequence.
   */
  private async nextSheetNumber(): Promise<string> {
    const result = await this.prisma.$queryRaw<Array<{ nextval: bigint }>>`
      SELECT nextval('overtime_sheet_number_seq')
    `;
    const seq = Number(result[0].nextval);
    return `OT-${String(seq).padStart(4, '0')}`;
  }

  private normalizeStatuses(
    status: OvertimeSheetStatus | OvertimeSheetStatus[] | string | undefined,
  ): OvertimeSheetStatus[] | undefined {
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
        .filter(Boolean) as OvertimeSheetStatus[];
    }
    return [status as OvertimeSheetStatus];
  }

  private parseDateOnly(value: string): Date {
    const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
    if (!match) {
      throw new BadRequestException(`Invalid date: ${value}`);
    }
    return new Date(
      Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])),
    );
  }

  private parseTimeOfDay(value: string): Date {
    if (value === END_OF_DAY_HHMM || value === '24:00') {
      return new Date(Date.UTC(1970, 0, 1, 0, 0, 0));
    }
    const match = /^(\d{2}):(\d{2})$/.exec(value);
    if (!match) {
      throw new BadRequestException(`Invalid time: ${value}`);
    }
    const hours = Number(match[1]);
    const minutes = Number(match[2]);
    if (hours > 23 || minutes > 59) {
      throw new BadRequestException(`Invalid time: ${value}`);
    }
    return new Date(Date.UTC(1970, 0, 1, hours, minutes, 0));
  }

  private timeToMinutes(value: Date): number {
    return value.getUTCHours() * 60 + value.getUTCMinutes();
  }

  private formatTimeOfDay(value: Date | string): string {
    const date = value instanceof Date ? value : new Date(value);
    return `${date.getUTCHours().toString().padStart(2, '0')}:${date
      .getUTCMinutes()
      .toString()
      .padStart(2, '0')}`;
  }

  private formatDateOnly(value: Date): string {
    const y = value.getUTCFullYear();
    const m = String(value.getUTCMonth() + 1).padStart(2, '0');
    const d = String(value.getUTCDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  private decimalToNumber(value: unknown): number {
    if (value instanceof Prisma.Decimal) {
      return Number(value);
    }
    return Number(value ?? 0);
  }

  private mapEntry(row: Record<string, unknown>): Record<string, unknown> {
    const date = row.date;
    const documents = Array.isArray(row.documents)
      ? (row.documents as Array<{ document?: Record<string, unknown> }>)
          .map((link) => link.document)
          .filter((doc): doc is Record<string, unknown> => Boolean(doc))
      : [];
    return {
      ...row,
      date:
        date instanceof Date
          ? this.formatDateOnly(date)
          : typeof date === 'string'
            ? date.slice(0, 10)
            : date,
      startTime:
        row.startTime instanceof Date || typeof row.startTime === 'string'
          ? this.formatTimeOfDay(row.startTime as Date | string)
          : row.startTime,
      endTime: Boolean(row.endsAtEndOfDay)
        ? END_OF_DAY_HHMM
        : row.endTime instanceof Date || typeof row.endTime === 'string'
          ? this.formatTimeOfDay(row.endTime as Date | string)
          : row.endTime,
      endsAtEndOfDay: Boolean(row.endsAtEndOfDay),
      regularHours: this.decimalToNumber(row.regularHours),
      nightHours: this.decimalToNumber(row.nightHours),
      weekendHours: this.decimalToNumber(row.weekendHours),
      holidayHours: this.decimalToNumber(row.holidayHours),
      totalHours: this.decimalToNumber(row.totalHours),
      siteWithinScheduleHours: this.decimalToNumber(row.siteWithinScheduleHours),
      siteName:
        (row.siteAssignment as { siteName?: string } | null | undefined)
          ?.siteName ?? null,
      documents,
    };
  }

  private async ensureOvertimeAttachmentFolder(
    sheet: {
      id: string;
      sheetNumber: string;
      attachmentFolderId: string | null;
    },
    companyId: string,
    userId: string,
  ): Promise<string> {
    if (sheet.attachmentFolderId) {
      return sheet.attachmentFolderId;
    }

    const folderId = randomUUID();
    await this.prisma.$transaction(async (tx) => {
      await tx.documentFolder.create({
        data: {
          id: folderId,
          companyId,
          name: `Overtime ${sheet.sheetNumber}`,
          path: `/hr/overtime/${sheet.sheetNumber}`,
          contextType: FolderContextType.OVERTIME,
          contextId: sheet.id,
          isSystem: false,
          createdBy: userId,
          updatedBy: userId,
        },
      });
      await tx.overtimeSheet.update({
        where: { id: sheet.id },
        data: {
          attachmentFolderId: folderId,
          updatedBy: userId,
        },
      });
    });

    return folderId;
  }

  private mapSheet(row: Record<string, unknown>): Record<string, unknown> {
    const entries = Array.isArray(row.entries)
      ? (row.entries as Record<string, unknown>[]).map((e) => this.mapEntry(e))
      : undefined;

    return {
      ...row,
      totalRegularHours: this.decimalToNumber(row.totalRegularHours),
      totalNightHours: this.decimalToNumber(row.totalNightHours),
      totalWeekendHours: this.decimalToNumber(row.totalWeekendHours),
      totalHolidayHours: this.decimalToNumber(row.totalHolidayHours),
      totalHours: this.decimalToNumber(row.totalHours),
      ...(entries ? { entries } : {}),
    };
  }

  /**
   * Maps a sheet and attaches PublicHoliday names onto holiday-hour entries.
   */
  private async mapSheetWithHolidayNames(
    row: Record<string, unknown>,
    companyId: string,
  ): Promise<Record<string, unknown>> {
    const rawEntries = Array.isArray(row.entries)
      ? (row.entries as Record<string, unknown>[])
      : [];
    const hydratedEntries =
      rawEntries.length > 0
        ? await this.hydrateEndsAtEndOfDay(rawEntries)
        : rawEntries;
    const mapped = this.mapSheet({ ...row, entries: hydratedEntries });
    const entries = mapped.entries as
      | Array<Record<string, unknown>>
      | undefined;
    if (!entries || entries.length === 0) {
      return mapped;
    }

    const employeeId = String(mapped.employeeId ?? '');
    const employee = await this.prisma.user.findFirst({
      where: activeOnly({ id: employeeId, companyId }),
      select: { nationality: true },
    });

    const dates = entries
      .map((entry) =>
        typeof entry.date === 'string' ? parseDateOnly(entry.date) : null,
      )
      .filter((value): value is Date => value instanceof Date);

    if (dates.length === 0) {
      return {
        ...mapped,
        entries: entries.map((entry) => ({ ...entry, holidayName: null })),
      };
    }

    const start = dates.reduce(
      (min, date) => (date.getTime() < min.getTime() ? date : min),
      dates[0],
    );
    const end = dates.reduce(
      (max, date) => (date.getTime() > max.getTime() ? date : max),
      dates[0],
    );
    const holidays = await this.workScheduleService.getHolidaysInRange(
      companyId,
      employee?.nationality ?? null,
      start,
      end,
    );

    return {
      ...mapped,
      entries: entries.map((entry) => {
        const holidayHours = Number(entry.holidayHours ?? 0);
        if (holidayHours <= 0 || typeof entry.date !== 'string') {
          return { ...entry, holidayName: null };
        }
        const onDate = parseDateOnly(entry.date);
        const holiday = holidays.find((row) =>
          holidayFallsOnDate(row.date, row.isRecurring, onDate),
        );
        return { ...entry, holidayName: holiday?.name ?? null };
      }),
    };
  }

  /**
   * Merges overtime formData onto an existing approval request (resubmit path).
   */
  private async mergeApprovalFormData(
    approvalRequestId: string,
    patch: Record<string, unknown>,
  ): Promise<void> {
    const request = await this.prisma.approvalRequest.findFirst({
      where: { id: approvalRequestId },
      select: { formData: true },
    });
    const previous =
      request?.formData &&
      typeof request.formData === 'object' &&
      !Array.isArray(request.formData)
        ? (request.formData as Record<string, unknown>)
        : {};
    await this.prisma.approvalRequest.update({
      where: { id: approvalRequestId },
      data: {
        formData: { ...previous, ...patch } as Prisma.InputJsonValue,
      },
    });
  }
}
