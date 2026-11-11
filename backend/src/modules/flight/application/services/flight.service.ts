import {
  BadRequestException,
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
  ApprovalTierDecision,
  BusinessTripStatus,
  FlightAcknowledgementStatus,
  FlightApplicationStatus,
  FlightTripType,
  FolderContextType,
  Prisma,
  RequestInitiatorType,
  SiteAssignmentStatus,
} from '@prisma/client';
import { randomUUID } from 'crypto';
import { PrismaService } from '../../../../shared/prisma/prisma.service';
import {
  canViewAnyThroughTeam,
  OWNER_ONLY_STATUSES,
  resolveTeamMemberIds,
} from '../../../../shared/org/team-scope.util';
import { activeOnly } from '../../../../shared/prisma/soft-delete.util';
import { PermissionService } from '../../../../shared/permissions/permission.service';
import { isInstantOnPastDay } from '../../../../shared/utils/date-validation.util';
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
import { assertNoTravelPassengerConflicts } from '../../../hr-shared/application/utils/travel-passenger-conflict.util';
import { assertRoundTripTravelDates } from '../../../hr-shared/application/utils/travel-trip-dates.util';
import { OnBehalfService } from '../../../on-behalf/on-behalf.service';
import { NotificationService } from '../../../notifications/application/services/notification.service';
import {
  CreateFlightDraftDto,
  FlightPassengerDto,
  ListFlightApplicationsDto,
  SubmitFlightApplicationDto,
  UpdateFlightApplicationDto,
} from '../dtos/flight.dtos';

type UploadedFile = {
  originalname: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
};

const USER_SELECT = {
  id: true,
  firstName: true,
  lastName: true,
  email: true,
} as const;

const DOCUMENT_SELECT = {
  id: true,
  name: true,
  fileType: true,
  fileSizeBytes: true,
} as const;

const FLIGHT_DETAIL_INCLUDE = {
  submitter: { select: USER_SELECT },
  passengers: {
    include: {
      employee: { select: USER_SELECT },
      ticket: { select: DOCUMENT_SELECT },
    },
    orderBy: { createdAt: 'asc' as const },
  },
  documents: {
    include: { document: { select: DOCUMENT_SELECT } },
    orderBy: { createdAt: 'asc' as const },
  },
  combinedTicket: { select: DOCUMENT_SELECT },
  approvalRequest: {
    include: {
      tiers: {
        include: { approver: { select: USER_SELECT } },
        orderBy: { tierOrder: 'asc' as const },
      },
    },
  },
  linkedBusinessTrip: { select: { id: true, tripNumber: true } },
  siteAssignment: { select: { id: true, requestNumber: true } },
} as const;

/**
 * Flight application lifecycle - owns flight data; delegates tier workflow to ApprovalsService.
 */
@Injectable()
export class FlightService
  implements ApprovalDecisionListener, OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(FlightService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly approvalsService: ApprovalsService,
    private readonly hrApprovalChain: HrApprovalChainService,
    private readonly onBehalfService: OnBehalfService,
    private readonly decisionRegistry: ApprovalDecisionRegistry,
    private readonly permissionService: PermissionService,
    private readonly notificationService: NotificationService,
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
   * Returns employees the submitter is permitted to include as passengers.
   */
  async getSelectablePassengers(
    companyId: string,
    userId: string,
  ): Promise<unknown> {
    return this.onBehalfService.getSelectablePassengers(
        userId,
        companyId,
        'FLIGHT_APPLICATION',
      );
  }

  /**
   * Submits a new flight application, opens an approval chain (or auto-approves for GM+).
   */
  async submitApplication(
    dto: SubmitFlightApplicationDto,
    files: UploadedFile[],
    companyId: string,
    userId: string,
  ): Promise<unknown> {
    // On-behalf: the request belongs to employeeId (submittedBy); userId stays the creator.
    // Passengers are chosen independently - the target is not added automatically.
    const { employeeId, initiatedAs } = await this.onBehalfService.resolveInitiation(
      userId,
      companyId,
      'FLIGHT_APPLICATION',
      dto.onBehalfOfEmployeeId,
    );

    const {
      departureDate,
      returnDate,
      passengerIds,
      linkedBusinessTripId,
      siteAssignmentId,
    } = await this.validateApplicationInput(dto, employeeId, companyId, userId);

    // --- Resolve approval chain ---
    let resolvedTiers = await this.hrApprovalChain.buildFlightApprovalChain(
      employeeId,
      companyId,
    );
    if (initiatedAs === RequestInitiatorType.SUPERVISOR) {
      // Supervisor filing: the chain starts above the supervisor, never with them.
      resolvedTiers = await this.hrApprovalChain.startChainAboveSubmitter(
        resolvedTiers,
        userId,
        companyId,
      );
    }

    // --- Direct APPROVED path (GM / MD / SysAdmin) ---
    if (resolvedTiers.length === 0) {
      const applicationNumber = await this.nextApplicationNumber();
      const appId = randomUUID();
      const now = new Date();

      await this.prisma.$transaction(
        async (tx: Prisma.TransactionClient) => {
          await tx.flightApplication.create({
            data: {
              id: appId,
              companyId,
              applicationNumber,
              submittedBy: employeeId,
              tripType: dto.tripType,
              isInternational: dto.isInternational,
              originCountry: dto.originCountry.trim(),
              originCity: dto.originCity.trim(),
              destination: dto.destination.trim(),
              departureDate,
              returnDate,
              purpose: dto.purpose.trim(),
              ticketClass: dto.ticketClass,
              notes: dto.notes?.trim() || null,
              linkedBusinessTripId,
              siteAssignmentId,
              status: FlightApplicationStatus.APPROVED,
              submittedAt: now,
              completedAt: now,
              createdBy: userId,
              updatedBy: userId,
            },
          });

          for (const passenger of dto.passengers) {
            await tx.flightPassenger.create({
              data: {
                id: randomUUID(),
                applicationId: appId,
                employeeId: passenger.employeeId,
                passportNumber: passenger.passportNumber ?? null,
                visaRequired: passenger.visaRequired ?? false,
                visaStatus: passenger.visaStatus ?? null,
              },
            });
          }
        },
        { maxWait: 10_000, timeout: 30_000 },
      );

      if (files.length > 0) {
        await this.attachFiles(appId, companyId, userId, files);
      }

      await this.notifyPassengersApproved(
        companyId,
        appId,
        applicationNumber,
        `${dto.originCity}, ${dto.originCountry}`,
        dto.destination,
        passengerIds,
        null,
      );
      await this.notifyHrBookTickets(
        companyId,
        appId,
        applicationNumber,
        `${dto.originCity}, ${dto.originCountry}`,
        dto.destination,
      );

      await this.onBehalfService.recordOnBehalfCreate({
        moduleCode: 'FLIGHT_APPLICATION',
        companyId,
        actorUserId: userId,
        employeeId,
        recordId: appId,
        recordReference: applicationNumber,
        autoApproveTier: dto.autoApproveTier,
      });

      return this.getApplication(appId, companyId, userId);
    }

    // --- Via approval workflow ---
    const approval = (await this.approvalsService.submitRequest(
      {
        categoryCode: 'FLIGHT_APPLICATION',
        ...this.approvalSnapshot(dto),
      },
      companyId,
      employeeId,
      {
        resolvedTiers: {
          ruleName: 'Flight org chain',
          tiers: resolvedTiers,
        },
        createdByUserId: userId,
        initiatedAs,
      },
    )) as { id: string; requestNumber: string };

    const appId = randomUUID();
    const now = new Date();

    try {
      await this.prisma.$transaction(
        async (tx: Prisma.TransactionClient) => {
          await tx.flightApplication.create({
            data: {
              id: appId,
              companyId,
              applicationNumber: approval.requestNumber,
              submittedBy: employeeId,
              tripType: dto.tripType,
              isInternational: dto.isInternational,
              originCountry: dto.originCountry.trim(),
              originCity: dto.originCity.trim(),
              destination: dto.destination.trim(),
              departureDate,
              returnDate,
              purpose: dto.purpose.trim(),
              ticketClass: dto.ticketClass,
              notes: dto.notes?.trim() || null,
              linkedBusinessTripId,
              siteAssignmentId,
              status: FlightApplicationStatus.SUBMITTED,
              approvalRequestId: approval.id,
              submittedAt: now,
              createdBy: userId,
              updatedBy: userId,
            },
          });

          for (const passenger of dto.passengers) {
            await tx.flightPassenger.create({
              data: {
                id: randomUUID(),
                applicationId: appId,
                employeeId: passenger.employeeId,
                passportNumber: passenger.passportNumber ?? null,
                visaRequired: passenger.visaRequired ?? false,
                visaStatus: passenger.visaStatus ?? null,
              },
            });
          }
        },
        { maxWait: 10_000, timeout: 30_000 },
      );
    } catch (error: unknown) {
      this.logger.error(
        `Flight application create failed after approval ${approval.id}; cancelling approval`,
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

    if (files.length > 0) {
      await this.attachFiles(appId, companyId, userId, files);
    }

    await this.onBehalfService.recordOnBehalfCreate({
      moduleCode: 'FLIGHT_APPLICATION',
      companyId,
      actorUserId: userId,
      employeeId,
      recordId: appId,
      recordReference: approval.requestNumber,
      autoApproveTier: dto.autoApproveTier,
    });
    await this.onBehalfService.applyAutoApprove({
      moduleCode: 'FLIGHT_APPLICATION',
      companyId,
      actorUserId: userId,
      employeeId,
      approvalRequestId: approval.id,
      autoApproveTier: dto.autoApproveTier === true,
    });

    return this.getApplication(appId, companyId, userId);
  }

  /**
   * Employee edits their own DRAFT or RETURNED flight application. Same
   * validation as submit; passengers are replaced.
   * Saves only: status is unchanged; a
   * RETURNED request is resubmitted separately from Approvals.
   */
  async updateApplication(
    id: string,
    dto: UpdateFlightApplicationDto,
    companyId: string,
    userId: string,
  ): Promise<unknown> {
    const app = await this.prisma.flightApplication.findFirst({
      where: activeOnly({ id, companyId }),
    });
    if (!app) {
      throw new NotFoundException('Flight application not found');
    }
    if (app.submittedBy !== userId) {
      throw new ForbiddenException('You can only edit your own requests.');
    }
    if (
      app.status !== FlightApplicationStatus.DRAFT &&
      app.status !== FlightApplicationStatus.RETURNED
    ) {
      throw new ForbiddenException('This request can no longer be edited.');
    }

    const { departureDate, returnDate, linkedBusinessTripId, siteAssignmentId } =
      await this.validateApplicationInput(dto, app.submittedBy, companyId, userId, id);

    await this.prisma.$transaction(
      async (tx: Prisma.TransactionClient) => {
        await tx.flightApplication.update({
          where: { id },
          data: {
            tripType: dto.tripType,
            isInternational: dto.isInternational,
            originCountry: dto.originCountry.trim(),
            originCity: dto.originCity.trim(),
            destination: dto.destination.trim(),
            departureDate,
            returnDate,
            purpose: dto.purpose.trim(),
            ticketClass: dto.ticketClass,
            notes: dto.notes?.trim() || null,
            linkedBusinessTripId,
            siteAssignmentId,
            updatedBy: userId,
          },
        });
        await tx.flightPassenger.deleteMany({ where: { applicationId: id } });
        for (const passenger of dto.passengers) {
          await tx.flightPassenger.create({
            data: {
              id: randomUUID(),
              applicationId: id,
              employeeId: passenger.employeeId,
              passportNumber: passenger.passportNumber ?? null,
              visaRequired: passenger.visaRequired ?? false,
              visaStatus: passenger.visaStatus ?? null,
            },
          });
        }
        if (app.approvalRequestId) {
          await tx.approvalRequest.update({
            where: { id: app.approvalRequestId },
            data: { ...this.approvalSnapshot(dto), updatedBy: userId },
          });
        }
      },
      { maxWait: 10_000, timeout: 30_000 },
    );

    return this.getApplication(id, companyId, userId);
  }

  /**
   * Validates dates, passengers, travel conflicts and optional links.
   * Shared by submit and edit; `excludeApplicationId` skips the edited row in
   * the passenger conflict check.
   */
  private async validateApplicationInput(
    dto: UpdateFlightApplicationDto,
    employeeId: string,
    companyId: string,
    userId: string,
    excludeApplicationId?: string,
  ) {
    const departureDate = this.parseDateTime(dto.departureDate);
    const returnDate = dto.returnDate
      ? this.parseDateTime(dto.returnDate)
      : null;
    await this.assertDepartureNotBackdated(departureDate, companyId, userId);

    assertRoundTripTravelDates(dto.tripType, departureDate, returnDate);

    const passengerIds = dto.passengers.map((p) => p.employeeId);
    const uniqueIds = new Set(passengerIds);
    if (uniqueIds.size !== passengerIds.length) {
      throw new BadRequestException('Duplicate passenger employeeIds are not allowed');
    }

    const selectablePassengers = await this.onBehalfService.getSelectablePassengers(
        userId,
        companyId,
        'FLIGHT_APPLICATION',
      );
    const selectableSet = new Set(selectablePassengers.map((p) => p.id));
    const invalidIds = passengerIds.filter((id) => !selectableSet.has(id));
    if (invalidIds.length > 0) {
      throw new BadRequestException(
        `Passengers not in selectable set: ${invalidIds.join(', ')}`,
      );
    }

    await assertNoTravelPassengerConflicts(this.prisma, companyId, {
      employeeIds: [...new Set([employeeId, ...passengerIds])],
      departureDate,
      returnDate,
      skipBusinessTripConflicts: true,
      excludeFlightApplicationId: excludeApplicationId,
    });

    const { linkedBusinessTripId, siteAssignmentId } =
      await this.resolveOptionalFlightLinks(dto, companyId, employeeId);

    return {
      departureDate,
      returnDate,
      passengerIds,
      linkedBusinessTripId,
      siteAssignmentId,
    };
  }

  /** Approval title + formData mirrored from the flight application. */
  private approvalSnapshot(dto: UpdateFlightApplicationDto) {
    return {
      title: `Flight ${dto.originCity}, ${dto.originCountry} to ${dto.destination} - ${dto.departureDate}`,
      formData: {
        tripType: dto.tripType,
        isInternational: dto.isInternational,
        originCountry: dto.originCountry,
        originCity: dto.originCity,
        destination: dto.destination,
        departureDate: dto.departureDate,
        returnDate: dto.returnDate ?? null,
        purpose: dto.purpose,
        ticketClass: dto.ticketClass,
        passengerCount: dto.passengers.length,
      },
    };
  }

  /**
   * Paginated flight applications. HR/flight managers see company-wide; others see own rows.
   */
  async listApplications(
    filters: ListFlightApplicationsDto,
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
      'flight',
      'manage',
    );

    // Supervisors also see their team's (submitted by or travelling), never
    // the team's drafts or cancelled ones.
    const teamIds = canViewAll
      ? []
      : await resolveTeamMemberIds(this.prisma, userId, companyId);
    const scopeClause: Prisma.FlightApplicationWhereInput[] = canViewAll
      ? []
      : [
          {
            OR: [
              { submittedBy: userId },
              { passengers: { some: { employeeId: userId } } },
              ...(teamIds.length > 0
                ? [
                    {
                      status: { notIn: [...OWNER_ONLY_STATUSES] },
                      OR: [
                        { submittedBy: { in: teamIds } },
                        { passengers: { some: { employeeId: { in: teamIds } } } },
                      ],
                    },
                  ]
                : []),
            ],
          },
        ];

    const searchClause: Prisma.FlightApplicationWhereInput[] =
      filters.search?.trim()
        ? [
            {
              OR: [
                {
                  applicationNumber: {
                    contains: filters.search.trim(),
                    mode: 'insensitive' as const,
                  },
                },
                {
                  originCountry: {
                    contains: filters.search.trim(),
                    mode: 'insensitive' as const,
                  },
                },
                {
                  originCity: {
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
            },
          ]
        : [];

    const where: Prisma.FlightApplicationWhereInput = {
      companyId,
      deletedAt: null,
      AND: [...scopeClause, ...searchClause],
      ...(filters.needsTicket
        ? {
            status: FlightApplicationStatus.APPROVED,
            combinedTicketDocumentId: null,
            passengers: { some: { ticketDocumentId: null } },
          }
        : {
            ...(statuses ? { status: { in: statuses } } : {}),
          }),
      ...(canViewAll && filters.submittedById
        ? { submittedBy: filters.submittedById }
        : {}),
      ...(filters.isInternational !== undefined
        ? { isInternational: filters.isInternational }
        : {}),
      ...(filters.dateFrom || filters.dateTo
        ? {
            departureDate: {
              ...(filters.dateFrom
                ? { gte: this.parseDateOnly(filters.dateFrom) }
                : {}),
              ...(filters.dateTo
                ? { lte: this.parseDateOnly(filters.dateTo) }
                : {}),
            },
          }
        : {}),
    };

    const validSortFields = [
      'createdAt',
      'departureDate',
      'applicationNumber',
    ] as const;
    type ValidSortField = (typeof validSortFields)[number];
    const sortField: ValidSortField = (
      validSortFields as readonly string[]
    ).includes(filters.sortBy ?? '')
      ? (filters.sortBy as ValidSortField)
      : 'createdAt';
    const sortOrder: 'asc' | 'desc' =
      filters.sortOrder === 'asc' ? 'asc' : 'desc';
    const orderBy: Prisma.FlightApplicationOrderByWithRelationInput = {
      [sortField]: sortOrder,
    };

    const [rows, total] = await Promise.all([
      this.prisma.flightApplication.findMany({
        where,
        skip,
        take,
        orderBy,
        include: {
          submitter: { select: USER_SELECT },
          _count: { select: { passengers: true } },
          passengers: {
            select: {
              ticketDocumentId: true,
              acknowledgementStatus: true,
            },
          },
          approvalRequest: {
            select: {
              id: true,
              status: true,
              currentTier: true,
              tiers: {
                where: { decision: ApprovalTierDecision.PENDING },
                take: 1,
                select: { tierOrder: true, label: true },
              },
            },
          },
        },
      }),
      this.prisma.flightApplication.count({ where }),
    ]);

    return buildPaginatedResult(
      rows.map((row) => {
        const passengerCount = row._count.passengers;
        const allHaveTickets = row.passengers.every(
          (p) => p.ticketDocumentId !== null,
        );
        const allAcknowledged = row.passengers.every(
          (p) => p.acknowledgementStatus === 'ACKNOWLEDGED',
        );
        const needsTicketAttachment =
          row.status === FlightApplicationStatus.APPROVED &&
          row.combinedTicketDocumentId === null &&
          !allHaveTickets;

        const pendingTier = row.approvalRequest?.tiers?.[0] ?? null;
        const currentTierLabel = pendingTier?.label ?? null;

        let currentStepLabel: string | null = currentTierLabel;
        if (row.status === FlightApplicationStatus.APPROVED) {
          if (allAcknowledged && row.passengers.length > 0) {
            currentStepLabel = 'Completed';
          } else if (
            allHaveTickets ||
            row.combinedTicketDocumentId !== null
          ) {
            currentStepLabel = 'Awaiting Acknowledgement';
          } else {
            currentStepLabel = 'Buying Ticket';
          }
        } else if (row.status === FlightApplicationStatus.SUBMITTED ||
          row.status === FlightApplicationStatus.IN_REVIEW) {
          currentStepLabel = currentTierLabel ?? 'Under Review';
        } else if (row.status === FlightApplicationStatus.RETURNED) {
          currentStepLabel = 'Returned';
        } else if (row.status === FlightApplicationStatus.REJECTED) {
          currentStepLabel = 'Rejected';
        } else if (row.status === FlightApplicationStatus.DRAFT) {
          currentStepLabel = 'Draft';
        } else if (row.status === FlightApplicationStatus.CANCELLED) {
          currentStepLabel = 'Cancelled';
        }

        const { _count, passengers, ...rest } = row;
        void _count;
        void passengers;
        return {
          ...rest,
          passengerCount,
          currentTierLabel,
          currentStepLabel,
          needsTicketAttachment,
        };
      }),
      total,
      page,
      limit,
    );
  }

  /**
   * Counts APPROVED applications still needing ticket attachment (HR badge).
   * Non-HR callers receive total 0.
   */
  async countNeedsTicket(
    companyId: string,
    userId: string,
    needsTicket: boolean,
  ): Promise<{ total: number }> {
    if (!needsTicket) {
      return { total: 0 };
    }

    const flightManage = await this.permissionService.hasPermission(
      userId,
      companyId,
      'flight',
      'manage',
    );
    if (!flightManage) {
      return { total: 0 };
    }

    const total = await this.prisma.flightApplication.count({
      where: activeOnly({
        companyId,
        status: FlightApplicationStatus.APPROVED,
        combinedTicketDocumentId: null,
        passengers: {
          some: { ticketDocumentId: null },
        },
      }),
    });

    return { total };
  }

  /**
   * Fetches a single flight application with full passenger and approval tier details.
   */
  async getApplication(
    id: string,
    companyId: string,
    userId: string,
  ): Promise<unknown> {
    const app = await this.prisma.flightApplication.findFirst({
      where: activeOnly({ id, companyId }),
      include: FLIGHT_DETAIL_INCLUDE,
    });
    if (!app) {
      throw new NotFoundException('Flight application not found');
    }

    await this.assertCanView(app, companyId, userId);

    const mapped = this.mapApplication(app as Record<string, unknown>);
    return this.enrichTicketDocuments(
      mapped,
      app.attachmentFolderId,
      companyId,
      id,
    );
  }

  /**
   * Finds a DRAFT application matching submitter + trip identity, or creates one.
   * HR (hr.view) may create drafts on behalf of another submitter.
   */
  async findOrCreateDraftApplication(
    submitterId: string,
    dto: CreateFlightDraftDto,
    companyId: string,
    actorUserId: string,
    forceCreate = false,
  ): Promise<{ id: string }> {
    await this.assertCanManageApplication(submitterId, companyId, actorUserId);

    const departureDate = this.parseFlexibleDate(dto.departureDate);
    const returnDate = dto.returnDate
      ? this.parseFlexibleDate(dto.returnDate)
      : null;

    this.assertTripDates(dto.tripType, departureDate, returnDate);
    await this.assertDepartureNotBackdated(
      departureDate,
      companyId,
      actorUserId,
    );

    const purpose = dto.purpose.trim();
    const originCountry = dto.originCountry.trim();
    const originCity = dto.originCity.trim();
    const destination = dto.destination.trim();

    if (!forceCreate) {
      const departureEnd = new Date(departureDate);
      departureEnd.setUTCDate(departureEnd.getUTCDate() + 1);

      const existing = await this.prisma.flightApplication.findFirst({
        where: activeOnly({
          companyId,
          submittedBy: submitterId,
          status: FlightApplicationStatus.DRAFT,
          tripType: dto.tripType,
          originCity: { equals: originCity, mode: 'insensitive' as const },
          destination: { equals: destination, mode: 'insensitive' as const },
          purpose: { equals: purpose, mode: 'insensitive' as const },
          departureDate: { gte: departureDate, lt: departureEnd },
        }),
        select: { id: true },
        orderBy: { createdAt: 'desc' },
      });
      if (existing) {
        if (
          dto.linkedBusinessTripId !== undefined ||
          dto.siteAssignmentId !== undefined
        ) {
          const links = await this.resolveOptionalFlightLinks(
            dto,
            companyId,
            submitterId,
          );
          await this.prisma.flightApplication.update({
            where: { id: existing.id },
            data: {
              linkedBusinessTripId: links.linkedBusinessTripId,
              siteAssignmentId: links.siteAssignmentId,
              updatedBy: actorUserId,
            },
          });
        }
        return existing;
      }
    }

    const { linkedBusinessTripId, siteAssignmentId } =
      await this.resolveOptionalFlightLinks(dto, companyId, submitterId);

    const applicationNumber = await this.nextApplicationNumber();
    const app = await this.prisma.flightApplication.create({
      data: {
        id: randomUUID(),
        companyId,
        applicationNumber,
        submittedBy: submitterId,
        tripType: dto.tripType,
        isInternational: dto.isInternational,
        originCountry,
        originCity,
        destination,
        departureDate,
        returnDate,
        purpose,
        ticketClass: dto.ticketClass,
        notes: dto.notes?.trim() || null,
        linkedBusinessTripId,
        siteAssignmentId,
        status: FlightApplicationStatus.DRAFT,
        createdBy: actorUserId,
        updatedBy: actorUserId,
      },
      select: { id: true },
    });
    return app;
  }

  /**
   * Adds a passenger to a DRAFT flight application (submitter or HR).
   */
  async addPassenger(
    applicationId: string,
    dto: FlightPassengerDto,
    companyId: string,
    userId: string,
  ): Promise<unknown> {
    const app = await this.assertDraftOwner(applicationId, companyId, userId);

    const selectablePassengers =
      await this.onBehalfService.getSelectablePassengers(
        userId,
        companyId,
        'FLIGHT_APPLICATION',
      );
    const selectableSet = new Set(selectablePassengers.map((p) => p.id));
    if (!selectableSet.has(dto.employeeId)) {
      throw new BadRequestException(
        `Passenger not in selectable set: ${dto.employeeId}`,
      );
    }

    const existing = await this.prisma.flightPassenger.findFirst({
      where: {
        applicationId,
        employeeId: dto.employeeId,
      },
      select: { id: true },
    });
    if (existing) {
      throw new BadRequestException(
        'This employee is already a passenger on the application',
      );
    }

    await assertNoTravelPassengerConflicts(this.prisma, companyId, {
      employeeIds: [dto.employeeId],
      departureDate: app.departureDate,
      returnDate: app.returnDate,
      excludeFlightApplicationId: applicationId,
      skipBusinessTripConflicts: true,
    });

    await this.prisma.flightPassenger.create({
      data: {
        id: randomUUID(),
        applicationId,
        employeeId: dto.employeeId,
        passportNumber: dto.passportNumber?.trim() || null,
        visaRequired: dto.visaRequired ?? false,
        visaStatus: dto.visaStatus ?? null,
      },
    });

    await this.prisma.flightApplication.update({
      where: { id: applicationId },
      data: { updatedBy: userId },
    });

    return this.getApplication(applicationId, companyId, userId);
  }

  /**
   * Cancels a DRAFT or SUBMITTED flight application. Only the submitter may cancel.
   */
  async cancelApplication(
    id: string,
    companyId: string,
    userId: string,
  ): Promise<unknown> {
    const app = await this.prisma.flightApplication.findFirst({
      where: activeOnly({ id, companyId }),
    });
    if (!app) {
      throw new NotFoundException('Flight application not found');
    }
    if (app.submittedBy !== userId) {
      throw new ForbiddenException(
        'Only the submitter can cancel this application',
      );
    }
    if (
      app.status !== FlightApplicationStatus.DRAFT &&
      app.status !== FlightApplicationStatus.SUBMITTED
    ) {
      throw new BadRequestException(
        'Only draft or submitted applications can be cancelled',
      );
    }

    const now = new Date();
    await this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      await tx.flightApplication.update({
        where: { id },
        data: {
          status: FlightApplicationStatus.CANCELLED,
          completedAt: now,
          updatedBy: userId,
        },
      });

      if (app.approvalRequestId) {
        await tx.approvalRequest.update({
          where: { id: app.approvalRequestId },
          data: {
            status: ApprovalRequestStatus.CANCELLED,
            completedAt: now,
            updatedBy: userId,
          },
        });
      }
    });

    return this.getApplication(id, companyId, userId);
  }

  /**
   * Attaches combined ticket document(s) (files cover all passengers).
   * Only HR viewers may call this; application must be APPROVED.
   * Replacing an existing ticket resets all passenger acknowledgements.
   */
  async attachCombinedTicket(
    id: string,
    files: UploadedFile[],
    companyId: string,
    userId: string,
  ): Promise<unknown> {
    await this.assertHrManager(companyId, userId);

    if (!files.length) {
      throw new BadRequestException('At least one ticket file is required');
    }

    const app = await this.prisma.flightApplication.findFirst({
      where: activeOnly({ id, companyId }),
      include: {
        passengers: { select: { employeeId: true } },
      },
    });
    if (!app) {
      throw new NotFoundException('Flight application not found');
    }
    if (app.status !== FlightApplicationStatus.APPROVED) {
      throw new BadRequestException(
        'Tickets can only be attached to approved applications',
      );
    }

    const isReplace = app.combinedTicketDocumentId != null;
    if (app.attachmentFolderId) {
      await this.softDeleteTicketDocuments(
        companyId,
        app.attachmentFolderId,
        `/hr/flight/${id}/tickets/combined/`,
        userId,
      );
    }

    const documentIds: string[] = [];
    for (const file of files) {
      if (!ALLOWED_UPLOAD_MIME_TYPES.has(file.mimetype)) {
        throw new BadRequestException(`File type not allowed: ${file.mimetype}`);
      }
      const safeName = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_');
      const fileKey = `${companyId}/hr/flight/${id}/tickets/combined/${randomUUID()}_${safeName}`;
      documentIds.push(
        await this.uploadTicketDocument(id, companyId, userId, file, fileKey),
      );
    }

    await this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      await tx.flightPassenger.updateMany({
        where: { applicationId: id },
        data: {
          acknowledgementStatus: FlightAcknowledgementStatus.PENDING,
          acknowledgedAt: null,
        },
      });
      await tx.flightApplication.update({
        where: { id },
        data: {
          combinedTicketDocumentId: documentIds[0],
          updatedBy: userId,
        },
      });
    });

    const link = app.approvalRequestId
      ? `/approvals/${app.approvalRequestId}`
      : `/hr/flight-applications/${id}`;
    for (const passenger of app.passengers) {
      await this.notifySafe(
        companyId,
        passenger.employeeId,
        isReplace ? 'flight.ticket_updated' : 'FLIGHT_TICKET_READY',
        {
          subject: isReplace
            ? 'Your ticket has been updated'
            : 'Your flight ticket is ready',
          body: isReplace
            ? `The ticket for flight application ${app.applicationNumber} has been updated. Please re-acknowledge.`
            : `The combined ticket for flight application ${app.applicationNumber} (${app.originCity}, ${app.originCountry} to ${app.destination}) has been uploaded. Please acknowledge it.`,
          link,
        },
      );
    }

    return this.getApplication(id, companyId, userId);
  }

  /**
   * Attaches individual ticket document(s) for a specific passenger.
   * Only HR viewers may call this; application must be APPROVED.
   * Replacing an existing ticket resets that passenger's acknowledgement.
   */
  async attachPassengerTicket(
    id: string,
    passengerId: string,
    files: UploadedFile[],
    companyId: string,
    userId: string,
  ): Promise<unknown> {
    await this.assertHrManager(companyId, userId);

    if (!files.length) {
      throw new BadRequestException('At least one ticket file is required');
    }

    const app = await this.prisma.flightApplication.findFirst({
      where: activeOnly({ id, companyId }),
      include: { passengers: { where: { id: passengerId } } },
    });
    if (!app) {
      throw new NotFoundException('Flight application not found');
    }
    if (app.status !== FlightApplicationStatus.APPROVED) {
      throw new BadRequestException(
        'Tickets can only be attached to approved applications',
      );
    }

    const passenger = app.passengers[0];
    if (!passenger) {
      throw new NotFoundException('Passenger not found on this application');
    }

    const isReplace = passenger.ticketDocumentId != null;
    if (app.attachmentFolderId) {
      await this.softDeleteTicketDocuments(
        companyId,
        app.attachmentFolderId,
        `/hr/flight/${id}/tickets/${passengerId}/`,
        userId,
      );
    }

    const documentIds: string[] = [];
    for (const file of files) {
      if (!ALLOWED_UPLOAD_MIME_TYPES.has(file.mimetype)) {
        throw new BadRequestException(`File type not allowed: ${file.mimetype}`);
      }
      const safeName = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_');
      const fileKey = `${companyId}/hr/flight/${id}/tickets/${passengerId}/${randomUUID()}_${safeName}`;
      documentIds.push(
        await this.uploadTicketDocument(id, companyId, userId, file, fileKey),
      );
    }

    await this.prisma.flightPassenger.update({
      where: { id: passengerId },
      data: {
        ticketDocumentId: documentIds[0],
        acknowledgementStatus: FlightAcknowledgementStatus.PENDING,
        acknowledgedAt: null,
      },
    });

    const link = app.approvalRequestId
      ? `/approvals/${app.approvalRequestId}`
      : `/hr/flight-applications/${id}`;
    await this.notifySafe(
      companyId,
      passenger.employeeId,
      isReplace ? 'flight.ticket_updated' : 'FLIGHT_TICKET_READY',
      {
        subject: isReplace
          ? 'Your ticket has been updated'
          : 'Your flight ticket is ready',
        body: isReplace
          ? `The ticket for flight application ${app.applicationNumber} has been updated. Please re-acknowledge.`
          : `Your individual ticket for flight application ${app.applicationNumber} (${app.originCity}, ${app.originCountry} to ${app.destination}) has been uploaded. Please acknowledge it.`,
        link,
      },
    );

    return this.getApplication(id, companyId, userId);
  }

  /**
   * Removes the combined ticket and resets all passenger acknowledgements.
   */
  async removeCombinedTicket(
    id: string,
    companyId: string,
    userId: string,
  ): Promise<unknown> {
    await this.assertHrManager(companyId, userId);

    const app = await this.prisma.flightApplication.findFirst({
      where: activeOnly({ id, companyId }),
      include: { passengers: { select: { employeeId: true } } },
    });
    if (!app) {
      throw new NotFoundException('Flight application not found');
    }
    if (app.status !== FlightApplicationStatus.APPROVED) {
      throw new BadRequestException(
        'Tickets can only be managed on approved applications',
      );
    }
    if (!app.combinedTicketDocumentId) {
      throw new BadRequestException('No combined ticket is attached');
    }

    if (app.attachmentFolderId) {
      await this.softDeleteTicketDocuments(
        companyId,
        app.attachmentFolderId,
        `/hr/flight/${id}/tickets/combined/`,
        userId,
      );
    }

    await this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      await tx.flightPassenger.updateMany({
        where: { applicationId: id },
        data: {
          acknowledgementStatus: FlightAcknowledgementStatus.PENDING,
          acknowledgedAt: null,
        },
      });
      await tx.flightApplication.update({
        where: { id },
        data: {
          combinedTicketDocumentId: null,
          updatedBy: userId,
        },
      });
    });

    const link = app.approvalRequestId
      ? `/approvals/${app.approvalRequestId}`
      : `/hr/flight-applications/${id}`;
    for (const passenger of app.passengers) {
      await this.notifySafe(
        companyId,
        passenger.employeeId,
        'flight.ticket_updated',
        {
          subject: 'Your ticket has been updated',
          body: `The ticket for flight application ${app.applicationNumber} has been updated. Please re-acknowledge.`,
          link,
        },
      );
    }

    return this.getApplication(id, companyId, userId);
  }

  /**
   * Removes an individual passenger ticket and resets that passenger's acknowledgement.
   */
  async removePassengerTicket(
    id: string,
    passengerId: string,
    companyId: string,
    userId: string,
  ): Promise<unknown> {
    await this.assertHrManager(companyId, userId);

    const app = await this.prisma.flightApplication.findFirst({
      where: activeOnly({ id, companyId }),
      include: { passengers: { where: { id: passengerId } } },
    });
    if (!app) {
      throw new NotFoundException('Flight application not found');
    }
    if (app.status !== FlightApplicationStatus.APPROVED) {
      throw new BadRequestException(
        'Tickets can only be managed on approved applications',
      );
    }

    const passenger = app.passengers[0];
    if (!passenger) {
      throw new NotFoundException('Passenger not found on this application');
    }
    if (!passenger.ticketDocumentId) {
      throw new BadRequestException('No passenger ticket is attached');
    }

    if (app.attachmentFolderId) {
      await this.softDeleteTicketDocuments(
        companyId,
        app.attachmentFolderId,
        `/hr/flight/${id}/tickets/${passengerId}/`,
        userId,
      );
    }

    await this.prisma.flightPassenger.update({
      where: { id: passengerId },
      data: {
        ticketDocumentId: null,
        acknowledgementStatus: FlightAcknowledgementStatus.PENDING,
        acknowledgedAt: null,
      },
    });

    const link = app.approvalRequestId
      ? `/approvals/${app.approvalRequestId}`
      : `/hr/flight-applications/${id}`;
    await this.notifySafe(
      companyId,
      passenger.employeeId,
      'flight.ticket_updated',
      {
        subject: 'Your ticket has been updated',
        body: `The ticket for flight application ${app.applicationNumber} has been updated. Please re-acknowledge.`,
        link,
      },
    );

    return this.getApplication(id, companyId, userId);
  }

  /**
   * Soft-deletes ticket documents under a file-key prefix so they no longer appear.
   */
  private async softDeleteTicketDocuments(
    companyId: string,
    folderId: string,
    fileKeyContains: string,
    userId: string,
  ): Promise<void> {
    await this.prisma.document.updateMany({
      where: {
        companyId,
        folderId,
        deletedAt: null,
        fileKey: { contains: fileKeyContains },
      },
      data: {
        deletedAt: new Date(),
        deletedBy: userId,
        updatedBy: userId,
      },
    });
  }

  /**
   * Passenger acknowledges receipt of their ticket (own or combined).
   * Notifies HR once all passengers have acknowledged.
   */
  async acknowledgeTicket(
    id: string,
    passengerId: string,
    companyId: string,
    userId: string,
  ): Promise<unknown> {
    const app = await this.prisma.flightApplication.findFirst({
      where: activeOnly({ id, companyId }),
      include: { passengers: true },
    });
    if (!app) {
      throw new NotFoundException('Flight application not found');
    }

    const passenger = app.passengers.find((p) => p.id === passengerId);
    if (!passenger) {
      throw new NotFoundException('Passenger not found on this application');
    }
    if (passenger.employeeId !== userId) {
      throw new ForbiddenException('You can only acknowledge your own ticket');
    }

    const hasTicket =
      !!passenger.ticketDocumentId || !!app.combinedTicketDocumentId;
    if (!hasTicket) {
      throw new BadRequestException('No ticket has been attached yet');
    }

    await this.prisma.flightPassenger.update({
      where: { id: passengerId },
      data: {
        acknowledgementStatus: FlightAcknowledgementStatus.ACKNOWLEDGED,
        acknowledgedAt: new Date(),
      },
    });

    const passengerName = await this.prisma.user.findFirst({
      where: { id: userId },
      select: { firstName: true, lastName: true },
    });
    const displayName = passengerName
      ? `${passengerName.firstName} ${passengerName.lastName}`.trim()
      : 'A passenger';

    await this.notifyHrPassengerAcknowledged(
      companyId,
      id,
      app.applicationNumber,
      displayName,
    );

    // Check if all passengers have now acknowledged
    const allPassengers = await this.prisma.flightPassenger.findMany({
      where: { applicationId: id },
      select: { acknowledgementStatus: true },
    });

    const allAcknowledged = allPassengers.every(
      (p) => p.acknowledgementStatus === FlightAcknowledgementStatus.ACKNOWLEDGED,
    );

    if (allAcknowledged) {
      await this.notifyHrAllAcknowledged(
        companyId,
        id,
        app.applicationNumber,
      );
    }

    return this.getApplication(id, companyId, userId);
  }

  /**
   * Called by the approval engine when a linked request reaches a terminal decision.
   */
  async onApprovalDecision(
    approvalRequestId: string,
    decision: ApprovalFinalDecision,
  ): Promise<void> {
    const app = await this.prisma.flightApplication.findFirst({
      where: activeOnly({ approvalRequestId }),
      include: { passengers: { select: { employeeId: true } } },
    });
    if (!app) {
      return;
    }

    if (
      app.status === FlightApplicationStatus.APPROVED ||
      app.status === FlightApplicationStatus.REJECTED ||
      app.status === FlightApplicationStatus.CANCELLED
    ) {
      return;
    }

    const now = new Date();
    let nextStatus: FlightApplicationStatus;

    if (decision === 'APPROVED') {
      nextStatus = FlightApplicationStatus.APPROVED;
    } else if (decision === 'REJECTED') {
      nextStatus = FlightApplicationStatus.REJECTED;
    } else {
      nextStatus = FlightApplicationStatus.RETURNED;
    }

    await this.prisma.flightApplication.update({
      where: { id: app.id },
      data: {
        status: nextStatus,
        completedAt: decision === 'RETURNED' ? null : now,
        updatedBy: app.submittedBy,
      },
    });

    if (decision === 'APPROVED') {
      await this.notifyPassengersApproved(
        app.companyId,
        app.id,
        app.applicationNumber,
        `${app.originCity}, ${app.originCountry}`,
        app.destination,
        app.passengers.map((p) => p.employeeId),
        app.approvalRequestId,
      );
      await this.notifyHrBookTickets(
        app.companyId,
        app.id,
        app.applicationNumber,
        `${app.originCity}, ${app.originCountry}`,
        app.destination,
      );
    }
  }

  // ─── Private helpers ──────────────────────────────────────────────────────

  /**
   * Throws ForbiddenException unless caller is the submitter or has flight.manage.
   */
  private async assertCanManageApplication(
    submitterId: string,
    companyId: string,
    userId: string,
  ): Promise<void> {
    if (submitterId === userId) {
      return;
    }
    const canManage = await this.permissionService.hasPermission(
      userId,
      companyId,
      'flight',
      'manage',
    );
    if (!canManage) {
      throw new ForbiddenException(
        'You do not have permission to modify this flight application',
      );
    }
  }

  /**
   * Ensures the application exists, is DRAFT, and the caller may edit it.
   */
  private async assertDraftOwner(
    applicationId: string,
    companyId: string,
    userId: string,
  ): Promise<{
    id: string;
    submittedBy: string;
    departureDate: Date;
    returnDate: Date | null;
  }> {
    const app = await this.prisma.flightApplication.findFirst({
      where: activeOnly({ id: applicationId, companyId }),
      select: {
        id: true,
        submittedBy: true,
        status: true,
        departureDate: true,
        returnDate: true,
      },
    });
    if (!app) {
      throw new NotFoundException('Flight application not found');
    }
    await this.assertCanManageApplication(app.submittedBy, companyId, userId);
    if (app.status !== FlightApplicationStatus.DRAFT) {
      throw new BadRequestException(
        'Only draft flight applications can be edited',
      );
    }
    return app;
  }

/**
   * Past departure days may only be recorded by HR / full-access users
   * (backdated trips already taken). Compared in the company timezone.
   */
  private async assertDepartureNotBackdated(
    departureDate: Date,
    companyId: string,
    userId: string,
  ): Promise<void> {
    if (!isInstantOnPastDay(departureDate)) {
      return;
    }
    const canBackdate =
      (await this.permissionService.hasPermission(
        userId,
        companyId,
        'flight',
        'manage',
      )) ||
      (await this.hrApprovalChain.isHrOrFullAccessActor(userId, companyId));
    if (!canBackdate) {
      throw new BadRequestException(
        'Past departure dates can only be set by HR officers',
      );
    }
  }

  /**
   * Validates trip type vs return date ordering.
   */
  private assertTripDates(
    tripType: FlightTripType,
    departureDate: Date,
    returnDate: Date | null,
  ): void {
    assertRoundTripTravelDates(tripType, departureDate, returnDate);
  }

  /**
   * Parses YYYY-MM-DD or ISO datetime into a Date.
   */
  private parseFlexibleDate(value: string): Date {
    const trimmed = value.trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
      return this.parseDateOnly(trimmed);
    }
    return this.parseDateTime(trimmed);
  }

  /**
   * Throws ForbiddenException if the caller may not read this application.
   */
  private async assertCanView(
    app: {
      status: string;
      submittedBy: string;
      createdBy?: string;
      passengers: Array<{ employeeId: string }>;
      approvalRequest?: { tiers?: Array<{ approverId: string }> } | null;
    },
    companyId: string,
    userId: string,
  ): Promise<void> {
    const canManage = await this.permissionService.hasPermission(
      userId,
      companyId,
      'flight',
      'manage',
    );
    if (canManage) return;

    const isSubmitter =
      app.submittedBy === userId || app.createdBy === userId;
    const isPassenger = app.passengers.some((p) => p.employeeId === userId);
    const isTierApprover =
      // Cancelled requests are hidden from the approval chain.
      app.status !== 'CANCELLED' &&
      (app.approvalRequest?.tiers?.some((t) => t.approverId === userId) ?? false);

    if (
      !isSubmitter &&
      !isPassenger &&
      !isTierApprover &&
      !(await canViewAnyThroughTeam(this.prisma, userId, companyId, {
        employeeIds: [app.submittedBy, ...app.passengers.map((p) => p.employeeId)],
        status: app.status,
      }))
    ) {
      throw new ForbiddenException(
        'You do not have access to this flight application',
      );
    }
  }

  /**
   * Throws ForbiddenException unless the caller has flight.manage permission.
   */
  private async assertHrManager(
    companyId: string,
    userId: string,
  ): Promise<void> {
    const canManage = await this.permissionService.hasPermission(
      userId,
      companyId,
      'flight',
      'manage',
    );
    if (!canManage) {
      throw new ForbiddenException(
        'Only HR managers may perform this action',
      );
    }
  }

  /**
   * Uploads attachments to erp-hr and links them to the application.
   */
  private async attachFiles(
    applicationId: string,
    companyId: string,
    userId: string,
    files: UploadedFile[],
  ): Promise<void> {
    const app = await this.prisma.flightApplication.findFirst({
      where: activeOnly({ id: applicationId, companyId }),
      select: {
        id: true,
        applicationNumber: true,
        attachmentFolderId: true,
      },
    });
    if (!app) {
      throw new NotFoundException('Flight application not found');
    }

    const folderId =
      app.attachmentFolderId ??
      (await this.ensureFlightAttachmentFolder(app, companyId, userId));

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
      const fileKey = `${companyId}/hr/flight/${applicationId}/attachments/${safeName}`;

      await this.storage.upload({
        bucket: STORAGE_BUCKETS.HR,
        key: fileKey,
        body: file.buffer,
        contentType: file.mimetype,
        contentLength: file.size,
      });

      await this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
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
        await tx.flightApplicationDocument.create({
          data: {
            id: randomUUID(),
            applicationId,
            documentId,
          },
        });
      });
    }
  }

  /**
   * Creates or retrieves the attachment folder for a flight application.
   */
  private async ensureFlightAttachmentFolder(
    app: {
      id: string;
      applicationNumber: string;
      attachmentFolderId: string | null;
    },
    companyId: string,
    userId: string,
  ): Promise<string> {
    if (app.attachmentFolderId) {
      return app.attachmentFolderId;
    }

    const folderId = randomUUID();
    await this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      await tx.documentFolder.create({
        data: {
          id: folderId,
          companyId,
          name: `Flight ${app.applicationNumber}`,
          path: `/hr/flight/${app.applicationNumber}`,
          contextType: FolderContextType.FLIGHT,
          contextId: app.id,
          isSystem: false,
          createdBy: userId,
          updatedBy: userId,
        },
      });
      await tx.flightApplication.update({
        where: { id: app.id },
        data: { attachmentFolderId: folderId, updatedBy: userId },
      });
    });

    return folderId;
  }

  /**
   * Uploads a ticket file to storage and creates the Document + DocumentVersion records.
   * Returns the new document ID.
   */
  private async uploadTicketDocument(
    applicationId: string,
    companyId: string,
    userId: string,
    file: UploadedFile,
    fileKey: string,
  ): Promise<string> {
    await this.storage.upload({
      bucket: STORAGE_BUCKETS.HR,
      key: fileKey,
      body: file.buffer,
      contentType: file.mimetype,
      contentLength: file.size,
    });

    // Ensure folder exists
    const appRef = await this.prisma.flightApplication.findFirst({
      where: activeOnly({ id: applicationId, companyId }),
      select: {
        id: true,
        applicationNumber: true,
        attachmentFolderId: true,
      },
    });
    if (!appRef) {
      throw new NotFoundException('Flight application not found');
    }
    const folderId =
      appRef.attachmentFolderId ??
      (await this.ensureFlightAttachmentFolder(appRef, companyId, userId));

    const documentId = randomUUID();
    await this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
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
    });

    return documentId;
  }

  /**
   * Sends a notification, swallowing errors to avoid failing the main operation.
   */
  private async notifySafe(
    companyId: string,
    recipientId: string,
    eventType: string,
    content: { subject: string; body: string; link?: string },
  ): Promise<void> {
    try {
      await this.notificationService.send(
        { companyId, userId: recipientId },
        {
          recipientId,
          eventType,
          channel: 'IN_APP',
          subject: content.subject,
          body: content.body,
          link: content.link,
        },
      );
    } catch (error: unknown) {
      this.logger.warn(
        `Failed to send ${eventType} to ${recipientId}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  /**
   * Notifies each passenger that their flight application has been approved.
   */
  private async notifyPassengersApproved(
    companyId: string,
    applicationId: string,
    applicationNumber: string,
    origin: string,
    destination: string,
    employeeIds: string[],
    approvalRequestId: string | null,
  ): Promise<void> {
    const link = approvalRequestId
      ? `/approvals/${approvalRequestId}`
      : `/hr/flight-applications/${applicationId}`;
    for (const employeeId of employeeIds) {
      await this.notifySafe(companyId, employeeId, 'flight.approved', {
        subject: 'Flight Application Approved',
        body: `Your flight application ${applicationNumber} (${origin} to ${destination}) has been approved.`,
        link,
      });
    }
  }

  /**
   * Notifies every primary-role HR Officer to book and attach tickets.
   */
  private async notifyHrBookTickets(
    companyId: string,
    applicationId: string,
    applicationNumber: string,
    origin: string,
    destination: string,
  ): Promise<void> {
    try {
      const hrOfficers =
        await this.hrApprovalChain.findActiveUsersByPrimaryRoleName(
          companyId,
          'HR Officer',
        );
      if (hrOfficers.length === 0) {
        this.logger.warn(
          `No HR Officer found to notify for ticket booking on ${applicationId}`,
        );
        return;
      }

      for (const officer of hrOfficers) {
        await this.notifySafe(
          companyId,
          officer.id,
          'flight.booking_required',
          {
            subject: 'Flight Booking Required',
            body: `Flight application ${applicationNumber} (${origin} to ${destination}) approved. Please book and attach tickets.`,
            link: `/hr/flight-applications/${applicationId}`,
          },
        );
      }
    } catch (error: unknown) {
      this.logger.warn(
        `Failed to notify HR for ticket booking on ${applicationId}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  /**
   * Notifies HR Officers that a passenger acknowledged their ticket.
   */
  private async notifyHrPassengerAcknowledged(
    companyId: string,
    applicationId: string,
    applicationNumber: string,
    passengerName: string,
  ): Promise<void> {
    try {
      const hrOfficers =
        await this.hrApprovalChain.findActiveUsersByPrimaryRoleName(
          companyId,
          'HR Officer',
        );
      for (const officer of hrOfficers) {
        await this.notifySafe(
          companyId,
          officer.id,
          'flight.ticket_acknowledged',
          {
            subject: `Ticket acknowledged: ${applicationNumber}`,
            body: `${passengerName} acknowledged their ticket for flight application ${applicationNumber}.`,
            link: `/hr/flight-applications/${applicationId}`,
          },
        );
      }
    } catch (error: unknown) {
      this.logger.warn(
        `Failed to notify HR of passenger ack on ${applicationId}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  /**
   * Notifies the HR Officer once all passengers have acknowledged their tickets.
   */
  private async notifyHrAllAcknowledged(
    companyId: string,
    applicationId: string,
    applicationNumber: string,
  ): Promise<void> {
    try {
      const hrOfficer = await this.hrApprovalChain.getHROfficer(companyId);
      await this.notifySafe(
        companyId,
        hrOfficer.id,
        'FLIGHT_ALL_TICKETS_ACKNOWLEDGED',
        {
          subject: `All tickets acknowledged: ${applicationNumber}`,
          body: `All passengers for flight application ${applicationNumber} have acknowledged their tickets.`,
          link: `/hr/flight-applications/${applicationId}`,
        },
      );
    } catch (error: unknown) {
      this.logger.warn(
        `Failed to notify HR of all-acknowledged on ${applicationId}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  /**
   * Loads all ticket files from the application folder and attaches them to the
   * mapped detail payload (combined + per-passenger).
   */
  private async enrichTicketDocuments(
    mapped: Record<string, unknown>,
    folderId: string | null,
    companyId: string,
    applicationId: string,
  ): Promise<Record<string, unknown>> {
    if (!folderId) {
      return {
        ...mapped,
        combinedTickets: mapped.combinedTicket
          ? [mapped.combinedTicket]
          : [],
      };
    }

    const ticketDocs = await this.prisma.document.findMany({
      where: {
        companyId,
        folderId,
        deletedAt: null,
        fileKey: {
          contains: `/hr/flight/${applicationId}/tickets/`,
        },
      },
      select: {
        ...DOCUMENT_SELECT,
        fileKey: true,
      },
      orderBy: { createdAt: 'asc' },
    });

    const combinedPrefix = `/hr/flight/${applicationId}/tickets/combined/`;
    const combinedTickets = ticketDocs
      .filter((doc) => doc.fileKey.includes(combinedPrefix))
      .map(({ fileKey: _fileKey, ...doc }) => doc);

    const passengers = Array.isArray(mapped.passengers)
      ? (mapped.passengers as Array<Record<string, unknown>>)
      : [];

    const enrichedPassengers = passengers.map((passenger) => {
      const passengerId = String(passenger.id ?? '');
      const passengerPrefix = `/hr/flight/${applicationId}/tickets/${passengerId}/`;
      const tickets = ticketDocs
        .filter((doc) => doc.fileKey.includes(passengerPrefix))
        .map(({ fileKey: _fileKey, ...doc }) => doc);
      const fallback =
        tickets.length === 0 && passenger.ticket
          ? [passenger.ticket]
          : tickets;
      return {
        ...passenger,
        tickets: fallback,
        ticket: fallback[0] ?? passenger.ticket ?? null,
      };
    });

    return {
      ...mapped,
      combinedTickets:
        combinedTickets.length > 0
          ? combinedTickets
          : mapped.combinedTicket
            ? [mapped.combinedTicket]
            : [],
      combinedTicket:
        combinedTickets[0] ?? mapped.combinedTicket ?? null,
      passengers: enrichedPassengers,
    };
  }

  /**
   * Flattens document link rows so consumers receive Document objects directly.
   */
  private mapApplication(row: Record<string, unknown>): Record<string, unknown> {
    const documents = Array.isArray(row.documents)
      ? (
          row.documents as Array<{
            document?: Record<string, unknown>;
          }>
        )
          .map((link) => link.document)
          .filter((doc): doc is Record<string, unknown> => Boolean(doc))
      : [];

    const passengers = Array.isArray(row.passengers)
      ? (row.passengers as Array<{
          ticketDocumentId?: string | null;
          acknowledgementStatus?: string | null;
        }>)
      : [];
    const status = row.status as string | undefined;
    const combinedTicketDocumentId =
      (row.combinedTicketDocumentId as string | null | undefined) ?? null;
    const allHaveTickets =
      passengers.length > 0 &&
      passengers.every((p) => p.ticketDocumentId != null);
    const allAcknowledged =
      passengers.length > 0 &&
      passengers.every((p) => p.acknowledgementStatus === 'ACKNOWLEDGED');
    const needsTicketAttachment =
      status === FlightApplicationStatus.APPROVED &&
      combinedTicketDocumentId === null &&
      !allHaveTickets;

    let currentStepLabel: string | null = null;
    if (status === FlightApplicationStatus.APPROVED) {
      if (allAcknowledged) {
        currentStepLabel = 'Completed';
      } else if (allHaveTickets || combinedTicketDocumentId !== null) {
        currentStepLabel = 'Awaiting Acknowledgement';
      } else {
        currentStepLabel = 'Buying Ticket';
      }
    }

    const linkedBusinessTrip = row.linkedBusinessTrip as
      | { id: string; tripNumber: string }
      | null
      | undefined;
    const siteAssignment = row.siteAssignment as
      | { id: string; requestNumber: string }
      | null
      | undefined;

    const {
      linkedBusinessTrip: _linkedTrip,
      siteAssignment: _siteAssignment,
      ...rest
    } = row;

    return {
      ...rest,
      documents,
      linkedBusinessTripId:
        (row.linkedBusinessTripId as string | null | undefined) ?? null,
      linkedBusinessTripNumber: linkedBusinessTrip?.tripNumber ?? null,
      siteAssignmentId:
        (row.siteAssignmentId as string | null | undefined) ?? null,
      siteAssignmentReference: siteAssignment?.requestNumber ?? null,
      passengerCount:
        typeof row.passengerCount === 'number'
          ? row.passengerCount
          : passengers.length,
      needsTicketAttachment,
      currentStepLabel,
    };
  }

  /**
   * Validates optional business-trip / site-assignment links for the submitter.
   */
  private async resolveOptionalFlightLinks(
    dto: Pick<
      SubmitFlightApplicationDto,
      'linkedBusinessTripId' | 'siteAssignmentId'
    >,
    companyId: string,
    employeeId: string,
  ): Promise<{
    linkedBusinessTripId: string | null;
    siteAssignmentId: string | null;
  }> {
    if (dto.linkedBusinessTripId && dto.siteAssignmentId) {
      throw new BadRequestException(
        'Only one of linkedBusinessTripId or siteAssignmentId may be set',
      );
    }

    let linkedBusinessTripId: string | null = null;
    if (dto.linkedBusinessTripId) {
      const trip = await this.prisma.businessTrip.findFirst({
        where: activeOnly({
          id: dto.linkedBusinessTripId,
          companyId,
          submittedBy: employeeId,
          status: BusinessTripStatus.APPROVED,
        }),
        select: { id: true },
      });
      if (!trip) {
        throw new BadRequestException(
          'linkedBusinessTripId must reference an approved business trip for this employee',
        );
      }
      linkedBusinessTripId = trip.id;
    }

    let siteAssignmentId: string | null = null;
    if (dto.siteAssignmentId) {
      const assignment = await this.prisma.siteAssignment.findFirst({
        where: activeOnly({
          id: dto.siteAssignmentId,
          companyId,
          employeeId,
          status: SiteAssignmentStatus.APPROVED,
        }),
        select: { id: true },
      });
      if (!assignment) {
        throw new BadRequestException(
          'siteAssignmentId must reference an approved site assignment for this employee',
        );
      }
      siteAssignmentId = assignment.id;
    }

    return { linkedBusinessTripId, siteAssignmentId };
  }

  /**
   * Normalises a comma-separated status string to an enum array.
   */
  private normalizeStatuses(
    status: string | undefined,
  ): FlightApplicationStatus[] | undefined {
    if (!status) return undefined;
    if (status.includes(',')) {
      return status
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean) as FlightApplicationStatus[];
    }
    return [status as FlightApplicationStatus];
  }

  /**
   * Parses an ISO datetime string to a Date.
   */
  private parseDateTime(value: string): Date {
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) {
      throw new BadRequestException(`Invalid datetime: ${value}`);
    }
    return d;
  }

  /**
   * Parses a YYYY-MM-DD string to a UTC midnight Date.
   */
  private parseDateOnly(value: string): Date {
    const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
    if (!match) {
      throw new BadRequestException(`Invalid date: ${value}`);
    }
    return new Date(
      Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])),
    );
  }

  /**
   * Returns the next sequential application number using the PostgreSQL sequence.
   */
  private async nextApplicationNumber(): Promise<string> {
    const result = await this.prisma.$queryRaw<Array<{ nextval: bigint }>>`
      SELECT nextval('flight_application_number_seq')
    `;
    const seq = Number(result[0].nextval);
    return `FA-${String(seq).padStart(6, '0')}`;
  }
}
