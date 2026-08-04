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
  FlightAcknowledgementStatus,
  BusinessTripStatus,
  FlightTripType,
  FolderContextType,
  Prisma,
} from '@prisma/client';
import { randomUUID } from 'crypto';
import { PrismaService } from '../../../../shared/prisma/prisma.service';
import { activeOnly } from '../../../../shared/prisma/soft-delete.util';
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
import { NotificationService } from '../../../notifications/application/services/notification.service';
import {
  ListBusinessTripsDto,
  SubmitBusinessTripDto,
} from '../dtos/business-trip.dtos';

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

const TRIP_DETAIL_INCLUDE = {
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
} as const;

/**
 * Business trip lifecycle ù owns trip data; delegates tier workflow to ApprovalsService.
 */
@Injectable()
export class BusinessTripService
  implements ApprovalDecisionListener, OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(BusinessTripService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly approvalsService: ApprovalsService,
    private readonly hrApprovalChain: HrApprovalChainService,
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
    return this.hrApprovalChain.getSelectablePassengers(userId, companyId);
  }

  /**
   * Submits a new business trip, opens an approval chain (or auto-approves for GM+).
   */
  async submitTrip(
    dto: SubmitBusinessTripDto,
    files: UploadedFile[],
    companyId: string,
    userId: string,
  ): Promise<unknown> {
    // --- Validation ---
    const departureDate = this.parseDateOnly(dto.departureDate);

    if (dto.tripType === FlightTripType.ROUND_TRIP) {
      if (!dto.returnDate) {
        throw new BadRequestException('ROUND_TRIP requires returnDate');
      }
      const returnDate = this.parseDateOnly(dto.returnDate);
      if (returnDate.getTime() < departureDate.getTime()) {
        throw new BadRequestException(
          'returnDate must be on or after departureDate',
        );
      }
    }

    const passengerIds = dto.passengers.map((p) => p.employeeId);
    const uniqueIds = new Set(passengerIds);
    if (uniqueIds.size !== passengerIds.length) {
      throw new BadRequestException('Duplicate passenger employeeIds are not allowed');
    }

    const selectablePassengers = await this.hrApprovalChain.getSelectablePassengers(
      userId,
      companyId,
    );
    const selectableSet = new Set(selectablePassengers.map((p) => p.id));
    const invalidIds = passengerIds.filter((id) => !selectableSet.has(id));
    if (invalidIds.length > 0) {
      throw new BadRequestException(
        `Passengers not in selectable set: ${invalidIds.join(', ')}`,
      );
    }

    // --- Resolve approval chain ---
    const resolvedTiers = await this.hrApprovalChain.buildFlightApprovalChain(
      userId,
      companyId,
    );

    // --- Direct APPROVED path (GM / MD / SysAdmin) ---
    if (resolvedTiers.length === 0) {
      const tripNumber = await this.nextTripNumber();
      const appId = randomUUID();
      const now = new Date();

      await this.prisma.$transaction(
        async (tx: Prisma.TransactionClient) => {
          await tx.businessTrip.create({
            data: {
              id: appId,
              companyId,
              tripNumber,
              submittedBy: userId,
              tripType: dto.tripType,
              originCountry: dto.originCountry.trim(),
              originCity: dto.originCity.trim(),
              destinationCountry: dto.destinationCountry.trim(),
              destinationCity: dto.destinationCity.trim(),
              departureDate,
              returnDate: dto.returnDate
                ? this.parseDateOnly(dto.returnDate)
                : null,
              purpose: dto.purpose.trim(),
              hostOrganization: dto.hostOrganization?.trim() || null,
              hostContact: dto.hostContact?.trim() || null,
              expectedOutcomes: dto.expectedOutcomes?.trim() || null,
              itinerary: dto.itinerary?.trim() || null,
              ticketClass: dto.ticketClass,
              estimatedFlightCost: dto.estimatedFlightCost ?? null,
              estimatedAccommodationCost: dto.estimatedAccommodationCost ?? null,
              estimatedPerDiem: dto.estimatedPerDiem ?? null,
              estimatedOtherCost: dto.estimatedOtherCost ?? null,
              accommodationRequired: dto.accommodationRequired ?? true,
              accommodationDetails:
                dto.accommodationDetails?.trim() || null,
              perDiemRequired: dto.perDiemRequired ?? true,
              notes: dto.notes?.trim() || null,
              status: BusinessTripStatus.APPROVED,
              submittedAt: now,
              completedAt: now,
              createdBy: userId,
              updatedBy: userId,
            },
          });

          for (const passenger of dto.passengers) {
            await tx.businessTripPassenger.create({
              data: {
                id: randomUUID(),
                tripId: appId,
                employeeId: passenger.employeeId,
                passportNumber: passenger.passportNumber ?? null,
                visaRequired: passenger.visaRequired ?? true,
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
        tripNumber,
        `${dto.originCity}, ${dto.originCountry}`,
        `${dto.destinationCity}, ${dto.destinationCountry}`,
        passengerIds,
        null,
      );
      await this.notifyHrBookTickets(
        companyId,
        appId,
        tripNumber,
        `${dto.originCity}, ${dto.originCountry}`,
        `${dto.destinationCity}, ${dto.destinationCountry}`,
      );

      return this.getTrip(appId, companyId, userId);
    }

    // --- Via approval workflow ---
    const approval = (await this.approvalsService.submitRequest(
      {
        categoryCode: 'BUSINESS_TRIP',
        title: `Business trip ${dto.originCity}, ${dto.originCountry} to ${dto.destinationCity}, ${dto.destinationCountry} - ${dto.departureDate}`,
        formData: {
          tripType: dto.tripType,
          originCountry: dto.originCountry,
          originCity: dto.originCity,
          destinationCountry: dto.destinationCountry,
          destinationCity: dto.destinationCity,
          departureDate: dto.departureDate,
          returnDate: dto.returnDate ?? null,
          purpose: dto.purpose,
          hostOrganization: dto.hostOrganization ?? null,
          ticketClass: dto.ticketClass,
          estimatedFlightCost: dto.estimatedFlightCost ?? null,
          estimatedAccommodationCost: dto.estimatedAccommodationCost ?? null,
          estimatedPerDiem: dto.estimatedPerDiem ?? null,
          estimatedOtherCost: dto.estimatedOtherCost ?? null,
          passengerCount: dto.passengers.length,
        },
      },
      companyId,
      userId,
      {
        resolvedTiers: {
          ruleName: 'Business trip org chain',
          tiers: resolvedTiers,
        },
      },
    )) as { id: string; requestNumber: string };

    const appId = randomUUID();
    const now = new Date();

    try {
      await this.prisma.$transaction(
        async (tx: Prisma.TransactionClient) => {
          await tx.businessTrip.create({
            data: {
              id: appId,
              companyId,
              tripNumber: approval.requestNumber,
              submittedBy: userId,
              tripType: dto.tripType,
              originCountry: dto.originCountry.trim(),
              originCity: dto.originCity.trim(),
              destinationCountry: dto.destinationCountry.trim(),
              destinationCity: dto.destinationCity.trim(),
              departureDate,
              returnDate: dto.returnDate
                ? this.parseDateOnly(dto.returnDate)
                : null,
              purpose: dto.purpose.trim(),
              hostOrganization: dto.hostOrganization?.trim() || null,
              hostContact: dto.hostContact?.trim() || null,
              expectedOutcomes: dto.expectedOutcomes?.trim() || null,
              itinerary: dto.itinerary?.trim() || null,
              ticketClass: dto.ticketClass,
              estimatedFlightCost: dto.estimatedFlightCost ?? null,
              estimatedAccommodationCost: dto.estimatedAccommodationCost ?? null,
              estimatedPerDiem: dto.estimatedPerDiem ?? null,
              estimatedOtherCost: dto.estimatedOtherCost ?? null,
              accommodationRequired: dto.accommodationRequired ?? true,
              accommodationDetails:
                dto.accommodationDetails?.trim() || null,
              perDiemRequired: dto.perDiemRequired ?? true,
              notes: dto.notes?.trim() || null,
              status: BusinessTripStatus.SUBMITTED,
              approvalRequestId: approval.id,
              submittedAt: now,
              createdBy: userId,
              updatedBy: userId,
            },
          });

          for (const passenger of dto.passengers) {
            await tx.businessTripPassenger.create({
              data: {
                id: randomUUID(),
                tripId: appId,
                employeeId: passenger.employeeId,
                passportNumber: passenger.passportNumber ?? null,
                visaRequired: passenger.visaRequired ?? true,
                visaStatus: passenger.visaStatus ?? null,
              },
            });
          }
        },
        { maxWait: 10_000, timeout: 30_000 },
      );
    } catch (error: unknown) {
      this.logger.error(
        `Business trip create failed after approval ${approval.id}; cancelling approval`,
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

    return this.getTrip(appId, companyId, userId);
  }

  /**
   * Paginated business trips. HR/business-trip managers see company-wide; others see own rows.
   */
  async listTrips(
    filters: ListBusinessTripsDto,
    companyId: string,
    userId: string,
  ): Promise<PaginatedResult<unknown>> {
    const page = filters.page ?? 1;
    const limit = filters.limit ?? 20;
    const { skip, take } = buildPrismaPagination(page, limit);
    const statuses = this.normalizeStatuses(filters.status);

    const [isHrViewer, isTripManager] = await Promise.all([
      this.permissionService.hasPermission(userId, companyId, 'hr', 'view'),
      this.permissionService.hasPermission(userId, companyId, 'business-trip', 'manage'),
    ]);
    const canViewAll = isHrViewer || isTripManager;

    const scopeClause: Prisma.BusinessTripWhereInput[] = canViewAll
      ? []
      : [
          {
            OR: [
              { submittedBy: userId },
              { passengers: { some: { employeeId: userId } } },
            ],
          },
        ];

    const searchClause: Prisma.BusinessTripWhereInput[] =
      filters.search?.trim()
        ? [
            {
              OR: [
                {
                  tripNumber: {
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
                  destinationCountry: {
                    contains: filters.search.trim(),
                    mode: 'insensitive' as const,
                  },
                },
                {
                  destinationCity: {
                    contains: filters.search.trim(),
                    mode: 'insensitive' as const,
                  },
                },
              ],
            },
          ]
        : [];

    const where: Prisma.BusinessTripWhereInput = {
      companyId,
      deletedAt: null,
      AND: [...scopeClause, ...searchClause],
      ...(filters.needsTicket
        ? {
            status: BusinessTripStatus.APPROVED,
            combinedTicketDocumentId: null,
            passengers: { some: { ticketDocumentId: null } },
          }
        : {
            ...(statuses ? { status: { in: statuses } } : {}),
          }),
      ...(canViewAll && filters.submittedById
        ? { submittedBy: filters.submittedById }
        : {}),
      ...(filters.destinationCountry?.trim()
        ? {
            destinationCountry: {
              contains: filters.destinationCountry.trim(),
              mode: 'insensitive' as const,
            },
          }
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
      'tripNumber',
    ] as const;
    type ValidSortField = (typeof validSortFields)[number];
    const sortField: ValidSortField = (
      validSortFields as readonly string[]
    ).includes(filters.sortBy ?? '')
      ? (filters.sortBy as ValidSortField)
      : 'createdAt';
    const sortOrder: 'asc' | 'desc' =
      filters.sortOrder === 'asc' ? 'asc' : 'desc';
    const orderBy: Prisma.BusinessTripOrderByWithRelationInput = {
      [sortField]: sortOrder,
    };

    const [rows, total] = await Promise.all([
      this.prisma.businessTrip.findMany({
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
      this.prisma.businessTrip.count({ where }),
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
          row.status === BusinessTripStatus.APPROVED &&
          row.combinedTicketDocumentId === null &&
          !allHaveTickets;

        const pendingTier = row.approvalRequest?.tiers?.[0] ?? null;
        const currentTierLabel = pendingTier?.label ?? null;

        let currentStepLabel: string | null = currentTierLabel;
        if (row.status === BusinessTripStatus.APPROVED) {
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
        } else if (row.status === BusinessTripStatus.SUBMITTED ||
          row.status === BusinessTripStatus.IN_REVIEW) {
          currentStepLabel = currentTierLabel ?? 'Under Review';
        } else if (row.status === BusinessTripStatus.RETURNED) {
          currentStepLabel = 'Returned';
        } else if (row.status === BusinessTripStatus.REJECTED) {
          currentStepLabel = 'Rejected';
        } else if (row.status === BusinessTripStatus.DRAFT) {
          currentStepLabel = 'Draft';
        } else if (row.status === BusinessTripStatus.CANCELLED) {
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

    const [hrView, flightManage] = await Promise.all([
      this.permissionService.hasPermission(userId, companyId, 'hr', 'view'),
      this.permissionService.hasPermission(
        userId,
        companyId,
        'business-trip',
        'manage',
      ),
    ]);
    if (!hrView && !flightManage) {
      return { total: 0 };
    }

    const total = await this.prisma.businessTrip.count({
      where: activeOnly({
        companyId,
        status: BusinessTripStatus.APPROVED,
        combinedTicketDocumentId: null,
        passengers: {
          some: { ticketDocumentId: null },
        },
      }),
    });

    return { total };
  }

  /**
   * Fetches a single business trip with full passenger and approval tier details.
   */
  async getTrip(
    id: string,
    companyId: string,
    userId: string,
  ): Promise<unknown> {
    const app = await this.prisma.businessTrip.findFirst({
      where: activeOnly({ id, companyId }),
      include: TRIP_DETAIL_INCLUDE,
    });
    if (!app) {
      throw new NotFoundException('Business trip not found');
    }

    await this.assertCanView(app, companyId, userId);

    const mapped = this.mapTrip(app as Record<string, unknown>);
    return this.enrichTicketDocuments(
      mapped,
      app.attachmentFolderId,
      companyId,
      id,
    );
  }

  /**
   * Cancels a DRAFT or SUBMITTED business trip. Only the submitter may cancel.
   */
  async cancelTrip(
    id: string,
    companyId: string,
    userId: string,
  ): Promise<unknown> {
    const app = await this.prisma.businessTrip.findFirst({
      where: activeOnly({ id, companyId }),
    });
    if (!app) {
      throw new NotFoundException('Business trip not found');
    }
    if (app.submittedBy !== userId) {
      throw new ForbiddenException(
        'Only the submitter can cancel this application',
      );
    }
    if (
      app.status !== BusinessTripStatus.DRAFT &&
      app.status !== BusinessTripStatus.SUBMITTED
    ) {
      throw new BadRequestException(
        'Only draft or submitted applications can be cancelled',
      );
    }

    const now = new Date();
    await this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      await tx.businessTrip.update({
        where: { id },
        data: {
          status: BusinessTripStatus.CANCELLED,
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

    return this.getTrip(id, companyId, userId);
  }

  /**
   * Attaches combined ticket document(s) (files cover all passengers).
   * Only HR viewers may call this; application must be APPROVED.
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

    const app = await this.prisma.businessTrip.findFirst({
      where: activeOnly({ id, companyId }),
      include: { passengers: { select: { employeeId: true } } },
    });
    if (!app) {
      throw new NotFoundException('Business trip not found');
    }
    if (app.status !== BusinessTripStatus.APPROVED) {
      throw new BadRequestException(
        'Tickets can only be attached to approved applications',
      );
    }

    const documentIds: string[] = [];
    for (const file of files) {
      if (!ALLOWED_UPLOAD_MIME_TYPES.has(file.mimetype)) {
        throw new BadRequestException(`File type not allowed: ${file.mimetype}`);
      }
      const safeName = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_');
      const fileKey = `${companyId}/hr/business-trips/${id}/tickets/combined/${randomUUID()}_${safeName}`;
      documentIds.push(
        await this.uploadTicketDocument(id, companyId, userId, file, fileKey),
      );
    }

    await this.prisma.businessTrip.update({
      where: { id },
      data: {
        combinedTicketDocumentId: documentIds[0],
        updatedBy: userId,
      },
    });

    for (const passenger of app.passengers) {
      await this.notifySafe(
        companyId,
        passenger.employeeId,
        'BUSINESS_TRIP_TICKET_READY',
        {
          subject: 'Your flight ticket is ready',
          body: `The combined ticket for business trip ${app.tripNumber} (${app.originCity}, ${app.originCountry} to ${app.destinationCity}, ${app.destinationCountry}) has been uploaded. Please acknowledge it.`,
          link: `/hr/business-trips/${id}`,
        },
      );
    }

    return this.getTrip(id, companyId, userId);
  }

  /**
   * Attaches individual ticket document(s) for a specific passenger.
   * Only HR viewers may call this; application must be APPROVED.
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

    const app = await this.prisma.businessTrip.findFirst({
      where: activeOnly({ id, companyId }),
      include: { passengers: { where: { id: passengerId } } },
    });
    if (!app) {
      throw new NotFoundException('Business trip not found');
    }
    if (app.status !== BusinessTripStatus.APPROVED) {
      throw new BadRequestException(
        'Tickets can only be attached to approved applications',
      );
    }

    const passenger = app.passengers[0];
    if (!passenger) {
      throw new NotFoundException('Passenger not found on this application');
    }

    const documentIds: string[] = [];
    for (const file of files) {
      if (!ALLOWED_UPLOAD_MIME_TYPES.has(file.mimetype)) {
        throw new BadRequestException(`File type not allowed: ${file.mimetype}`);
      }
      const safeName = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_');
      const fileKey = `${companyId}/hr/business-trips/${id}/tickets/${passengerId}/${randomUUID()}_${safeName}`;
      documentIds.push(
        await this.uploadTicketDocument(id, companyId, userId, file, fileKey),
      );
    }

    await this.prisma.businessTripPassenger.update({
      where: { id: passengerId },
      data: { ticketDocumentId: documentIds[0] },
    });

    await this.notifySafe(
      companyId,
      passenger.employeeId,
      'BUSINESS_TRIP_TICKET_READY',
      {
        subject: 'Your flight ticket is ready',
        body: `Your individual ticket for business trip ${app.tripNumber} (${app.originCity}, ${app.originCountry} to ${app.destinationCity}, ${app.destinationCountry}) has been uploaded. Please acknowledge it.`,
        link: `/hr/business-trips/${id}`,
      },
    );

    return this.getTrip(id, companyId, userId);
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
    const app = await this.prisma.businessTrip.findFirst({
      where: activeOnly({ id, companyId }),
      include: { passengers: true },
    });
    if (!app) {
      throw new NotFoundException('Business trip not found');
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

    await this.prisma.businessTripPassenger.update({
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
      app.tripNumber,
      displayName,
    );

    // Check if all passengers have now acknowledged
    const allPassengers = await this.prisma.businessTripPassenger.findMany({
      where: { tripId: id },
      select: { acknowledgementStatus: true },
    });

    const allAcknowledged = allPassengers.every(
      (p) => p.acknowledgementStatus === FlightAcknowledgementStatus.ACKNOWLEDGED,
    );

    if (allAcknowledged) {
      await this.notifyHrAllAcknowledged(
        companyId,
        id,
        app.tripNumber,
      );
    }

    return this.getTrip(id, companyId, userId);
  }

  /**
   * Called by the approval engine when a linked request reaches a terminal decision.
   */
  async onApprovalDecision(
    approvalRequestId: string,
    decision: ApprovalFinalDecision,
  ): Promise<void> {
    const app = await this.prisma.businessTrip.findFirst({
      where: activeOnly({ approvalRequestId }),
      include: { passengers: { select: { employeeId: true } } },
    });
    if (!app) {
      return;
    }

    if (
      app.status === BusinessTripStatus.APPROVED ||
      app.status === BusinessTripStatus.REJECTED ||
      app.status === BusinessTripStatus.CANCELLED
    ) {
      return;
    }

    const now = new Date();
    let nextStatus: BusinessTripStatus;

    if (decision === 'APPROVED') {
      nextStatus = BusinessTripStatus.APPROVED;
    } else if (decision === 'REJECTED') {
      nextStatus = BusinessTripStatus.REJECTED;
    } else {
      nextStatus = BusinessTripStatus.RETURNED;
    }

    await this.prisma.businessTrip.update({
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
        app.tripNumber,
        `${app.originCity}, ${app.originCountry}`,
        `${app.destinationCity}, ${app.destinationCountry}`,
        app.passengers.map((p) => p.employeeId),
        app.approvalRequestId,
      );
      await this.notifyHrBookTickets(
        app.companyId,
        app.id,
        app.tripNumber,
        `${app.originCity}, ${app.originCountry}`,
        `${app.destinationCity}, ${app.destinationCountry}`,
      );
    }
  }

  // ??? Private helpers ??????????????????????????????????????????????????????

  /**
   * Throws ForbiddenException if the caller may not read this trip.
   */
  private async assertCanView(
    app: {
      submittedBy: string;
      passengers: Array<{ employeeId: string }>;
      approvalRequest?: { tiers?: Array<{ approverId: string }> } | null;
    },
    companyId: string,
    userId: string,
  ): Promise<void> {
    const isHrViewer = await this.permissionService.hasPermission(
      userId,
      companyId,
      'hr',
      'view',
    );
    if (isHrViewer) return;

    const isSubmitter = app.submittedBy === userId;
    const isPassenger = app.passengers.some((p) => p.employeeId === userId);
    const isTierApprover =
      app.approvalRequest?.tiers?.some((t) => t.approverId === userId) ?? false;

    if (!isSubmitter && !isPassenger && !isTierApprover) {
      throw new ForbiddenException(
        'You do not have access to this business trip',
      );
    }
  }

  /**
   * Throws ForbiddenException unless the caller has hr.view permission.
   */
  private async assertHrManager(
    companyId: string,
    userId: string,
  ): Promise<void> {
    const isHrViewer = await this.permissionService.hasPermission(
      userId,
      companyId,
      'hr',
      'view',
    );
    if (!isHrViewer) {
      throw new ForbiddenException(
        'Only HR managers may perform this action',
      );
    }
  }

  /**
   * Uploads attachments to erp-hr and links them to the application.
   */
  private async attachFiles(
    tripId: string,
    companyId: string,
    userId: string,
    files: UploadedFile[],
  ): Promise<void> {
    const app = await this.prisma.businessTrip.findFirst({
      where: activeOnly({ id: tripId, companyId }),
      select: {
        id: true,
        tripNumber: true,
        attachmentFolderId: true,
      },
    });
    if (!app) {
      throw new NotFoundException('Business trip not found');
    }

    const folderId =
      app.attachmentFolderId ??
      (await this.ensureTripAttachmentFolder(app, companyId, userId));

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
      const fileKey = `${companyId}/hr/business-trips/${tripId}/attachments/${safeName}`;

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
        await tx.businessTripDocument.create({
          data: {
            id: randomUUID(),
            tripId,
            documentId,
          },
        });
      });
    }
  }

  /**
   * Creates or retrieves the attachment folder for a business trip.
   */
  private async ensureTripAttachmentFolder(
    app: {
      id: string;
      tripNumber: string;
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
          name: `Business Trip ${app.tripNumber}`,
          path: `/hr/business-trips/${app.tripNumber}`,
          contextType: FolderContextType.BUSINESS_TRIP,
          contextId: app.id,
          isSystem: false,
          createdBy: userId,
          updatedBy: userId,
        },
      });
      await tx.businessTrip.update({
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
    tripId: string,
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
    const appRef = await this.prisma.businessTrip.findFirst({
      where: activeOnly({ id: tripId, companyId }),
      select: {
        id: true,
        tripNumber: true,
        attachmentFolderId: true,
      },
    });
    if (!appRef) {
      throw new NotFoundException('Business trip not found');
    }
    const folderId =
      appRef.attachmentFolderId ??
      (await this.ensureTripAttachmentFolder(appRef, companyId, userId));

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
   * Notifies each passenger that their business trip has been approved.
   */
  private async notifyPassengersApproved(
    companyId: string,
    tripId: string,
    tripNumber: string,
    origin: string,
    destination: string,
    employeeIds: string[],
    approvalRequestId: string | null,
  ): Promise<void> {
    const link = approvalRequestId
      ? `/approvals/${approvalRequestId}`
      : `/hr/business-trips/${tripId}`;
    for (const employeeId of employeeIds) {
      await this.notifySafe(companyId, employeeId, 'business_trip.approved', {
        subject: 'Business Trip Approved',
        body: `Your business trip ${tripNumber} (${origin} to ${destination}) has been approved.`,
        link,
      });
    }
  }

  /**
   * Notifies every primary-role HR Officer to book and attach tickets.
   */
  private async notifyHrBookTickets(
    companyId: string,
    tripId: string,
    tripNumber: string,
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
          `No HR Officer found to notify for ticket booking on ${tripId}`,
        );
        return;
      }

      for (const officer of hrOfficers) {
        await this.notifySafe(
          companyId,
          officer.id,
          'business_trip.booking_required',
          {
            subject: 'Business Trip Booking Required',
            body: `Business trip ${tripNumber} (${origin} to ${destination}) approved. Please book and attach tickets.`,
            link: `/hr/business-trips/${tripId}`,
          },
        );
      }
    } catch (error: unknown) {
      this.logger.warn(
        `Failed to notify HR for ticket booking on ${tripId}: ${
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
    tripId: string,
    tripNumber: string,
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
          'business_trip.ticket_acknowledged',
          {
            subject: `Ticket acknowledged: ${tripNumber}`,
            body: `${passengerName} acknowledged their ticket for business trip ${tripNumber}.`,
            link: `/hr/business-trips/${tripId}`,
          },
        );
      }
    } catch (error: unknown) {
      this.logger.warn(
        `Failed to notify HR of passenger ack on ${tripId}: ${
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
    tripId: string,
    tripNumber: string,
  ): Promise<void> {
    try {
      const hrOfficer = await this.hrApprovalChain.getHROfficer(companyId);
      await this.notifySafe(
        companyId,
        hrOfficer.id,
        'BUSINESS_TRIP_ALL_TICKETS_ACKNOWLEDGED',
        {
          subject: `All tickets acknowledged: ${tripNumber}`,
          body: `All passengers for business trip ${tripNumber} have acknowledged their tickets.`,
          link: `/hr/business-trips/${tripId}`,
        },
      );
    } catch (error: unknown) {
      this.logger.warn(
        `Failed to notify HR of all-acknowledged on ${tripId}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  /**
   * Loads all ticket files from the trip folder and attaches them to the
   * mapped detail payload (combined + per-passenger).
   */
  private async enrichTicketDocuments(
    mapped: Record<string, unknown>,
    folderId: string | null,
    companyId: string,
    tripId: string,
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
          contains: `/hr/business-trips/${tripId}/tickets/`,
        },
      },
      select: {
        ...DOCUMENT_SELECT,
        fileKey: true,
      },
      orderBy: { createdAt: 'asc' },
    });

    const combinedPrefix = `/hr/business-trips/${tripId}/tickets/combined/`;
    const combinedTickets = ticketDocs
      .filter((doc) => doc.fileKey.includes(combinedPrefix))
      .map(({ fileKey: _fileKey, ...doc }) => doc);

    const passengers = Array.isArray(mapped.passengers)
      ? (mapped.passengers as Array<Record<string, unknown>>)
      : [];

    const enrichedPassengers = passengers.map((passenger) => {
      const passengerId = String(passenger.id ?? '');
      const passengerPrefix = `/hr/business-trips/${tripId}/tickets/${passengerId}/`;
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
  private mapTrip(row: Record<string, unknown>): Record<string, unknown> {
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
      status === BusinessTripStatus.APPROVED &&
      combinedTicketDocumentId === null &&
      !allHaveTickets;

    let currentStepLabel: string | null = null;
    if (status === BusinessTripStatus.APPROVED) {
      if (allAcknowledged) {
        currentStepLabel = 'Completed';
      } else if (allHaveTickets || combinedTicketDocumentId !== null) {
        currentStepLabel = 'Awaiting Acknowledgement';
      } else {
        currentStepLabel = 'Buying Ticket';
      }
    }

    return {
      ...row,
      documents,
      passengerCount:
        typeof row.passengerCount === 'number'
          ? row.passengerCount
          : passengers.length,
      needsTicketAttachment,
      currentStepLabel,
    };
  }

  /**
   * Normalises a comma-separated status string to an enum array.
   */
  private normalizeStatuses(
    status: string | undefined,
  ): BusinessTripStatus[] | undefined {
    if (!status) return undefined;
    if (status.includes(',')) {
      return status
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean) as BusinessTripStatus[];
    }
    return [status as BusinessTripStatus];
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
  private async nextTripNumber(): Promise<string> {
    const result = await this.prisma.$queryRaw<Array<{ nextval: bigint }>>`
      SELECT nextval('business_trip_number_seq')
    `;
    const seq = Number(result[0].nextval);
    return `BT-${String(seq).padStart(6, '0')}`;
  }
}
