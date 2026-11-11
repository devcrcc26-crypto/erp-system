import { PrismaService } from "@/shared/prisma/prisma.service";
import { isDateInPast } from "@/shared/utils/date-validation.util";
import {
  ApprovalRequestStatus,
  FolderContextType,
  Prisma,
} from "@prisma/client";
import { activeOnly } from "@/shared/prisma/soft-delete.util";
import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleDestroy,
  OnModuleInit,
} from "@nestjs/common";
import {
  SealStatus,
  SubmitOfficialSealRequestDto,
} from "../dtos/official-seal.dtos";
import { HrApprovalChainService } from "@/modules/hr-shared/application/services/hr-approval-chain.service";
import { OnBehalfService } from '../../../on-behalf/on-behalf.service';
import { ApprovalsService } from "@/modules/approvals/application/services/approvals.service";
import { ApprovalDecisionRegistry } from "@/modules/approvals/application/services/approval-decision-registry.service";
import { PermissionService } from "@/shared/permissions/permission.service";
import { IStorageService } from "@/shared/storage/storage.interface";
import {
  STORAGE_BUCKETS,
  STORAGE_SERVICE,
} from "@/shared/storage/storage.constants";
import { isAllowedUploadFile } from "@/shared/storage/upload-validation.util";
import { randomUUID } from "crypto";
import { ForbiddenException } from "@nestjs/common";
import {
  ApprovalDecisionListener,
  ApprovalFinalDecision,
} from "@/modules/approvals/application/ports/approval-decision.listener";
import { ListOfficialSealsDto } from "../dtos/official-seal.dtos";
import {
  buildPaginatedResult,
  buildPrismaPagination,
  PaginatedResult,
} from "../../../../shared/utils/pagination.util";

const USER_SELECT = {
  id: true,
  firstName: true,
  lastName: true,
  email: true,
} as const;

const DOCUMENT_SELECT = {
  id: true,
  name: true,
  fileKey: true,
  fileType: true,
  fileSizeBytes: true,
} as const;

const OFFICIAL_SEAL_INCLUDE = {
  employee: { select: USER_SELECT },
  issuer: { select: USER_SELECT },
  sealedDocument: {
    select: DOCUMENT_SELECT,
  },
  attachmentFolder: {
    include: {
      documents: {
        where: { deletedAt: null, isCurrent: true },
        select: DOCUMENT_SELECT,
      },
    },
  },
  approvalRequest: {
    include: {
      tiers: {
        include: { approver: { select: USER_SELECT } },
        orderBy: { tierOrder: "asc" as const },
      },
    },
  },
} as const;

type UploadedFile = {
  originalname: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
};

@Injectable()
export class OfficialSealService
  implements ApprovalDecisionListener, OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(OfficialSealService.name);
  constructor(
    private readonly prisma: PrismaService,
    private readonly approvalsService: ApprovalsService,
    private readonly hrApprovalChain: HrApprovalChainService,
    private readonly onBehalfService: OnBehalfService,
    private readonly decisionRegistry: ApprovalDecisionRegistry,
    private readonly permissionService: PermissionService,
    @Inject(STORAGE_SERVICE)
    private readonly storage: IStorageService,
  ) {}

  onModuleInit(): void {
    this.decisionRegistry.register(this);
  }

  onModuleDestroy(): void {
    this.decisionRegistry.unregister(this);
  }

  async submitRequest(
    dto: SubmitOfficialSealRequestDto,
    companyId: string,
    userId: string,
    files: UploadedFile[] = [],
  ): Promise<unknown> {
    const employeeId = await this.onBehalfService.resolveTargetEmployeeId(
      userId,
      companyId,
      dto.onBehalfOfEmployeeId,
    );
    const requestNumber = await this.nextRequestNumber();

    const resolvedTiers =
      await this.hrApprovalChain.buildOfficialSealApprovalChain(
        employeeId,
        companyId,
      );

    const now = new Date();
    const id = randomUUID();
    const dateNeeded = this.parseDateNeeded(dto.dateNeeded);
    const extraFields = this.sealExtraFieldsFromDto(dto);

    if (resolvedTiers.length === 0) {
      await this.prisma.officialSeal.create({
        data: {
          id,
          companyId,
          requestNumber,
          employeeId,
          fileName: dto.fileName,
          description: dto.description,
          ...extraFields,
          urgency: dto.urgency,
          dateNeeded,
          status: SealStatus.APPROVED,
          submittedAt: now,
          completedAt: now,
          createdBy: userId,
          updatedBy: userId,
        },
      });
      if (files.length > 0) {
        await this.attachSubmissionFiles(id, companyId, userId, files);
      }
      this.logger.log(
        `Official seal ${requestNumber} auto-approved (GM+ submitter)`,
      );
      await this.onBehalfService.recordOnBehalfCreate({
        moduleCode: 'OFFICIAL_SEAL_USAGE',
        companyId,
        actorUserId: userId,
        employeeId,
        recordId: id,
        recordReference: requestNumber,
        autoApproveTier: dto.autoApproveTier,
      });
      return this.getOfficialSeal(id, companyId, userId);
    }

    const approval = (await this.approvalsService.submitRequest(
      {
        categoryCode: "OFFICIAL_SEAL_USAGE",
        title: `Official Seal - ${dto.fileName}`,
        formData: {
          fileName: dto.fileName,
          description: dto.description,
          sealCategory: dto.sealCategory,
          copyCount: dto.copyCount,
          urgency: dto.urgency,
          dateNeeded: dto.dateNeeded,
        },
      },
      companyId,
      employeeId,
      {
        resolvedTiers: {
          ruleName: "Official Seal HR → GM chain",
          tiers: resolvedTiers,
        },
        createdByUserId: userId,
      },
    )) as { id: string; requestNumber: string };

    try {
      await this.prisma.officialSeal.create({
        data: {
          id,
          companyId,
          requestNumber,
          employeeId,
          fileName: dto.fileName,
          description: dto.description,
          ...extraFields,
          urgency: dto.urgency,
          dateNeeded: dateNeeded,
          status: SealStatus.SUBMITTED,
          approvalRequestId: approval.id,
          submittedAt: now,
          createdBy: userId,
          updatedBy: userId,
        },
      });
      if (files.length > 0) {
        await this.attachSubmissionFiles(id, companyId, userId, files);
      }
    } catch (error: unknown) {
      this.logger.error(
        `Official seal create failed after approval ${approval.id}; cancelling approval`,
        error instanceof Error ? error.message : String(error),
      );
      await this.prisma.approvalRequest.update({
        where: { id: approval.id },
        data: {
          status: ApprovalRequestStatus.CANCELLED,
          updatedBy: userId,
        },
      });
      throw error;
    }
    await this.onBehalfService.recordOnBehalfCreate({
      moduleCode: 'OFFICIAL_SEAL_USAGE',
      companyId,
      actorUserId: userId,
      employeeId,
      recordId: id,
      recordReference: requestNumber,
      autoApproveTier: dto.autoApproveTier,
    });
    await this.onBehalfService.applyAutoApprove({
      moduleCode: 'OFFICIAL_SEAL_USAGE',
      companyId,
      actorUserId: userId,
      employeeId,
      approvalRequestId: approval.id,
      autoApproveTier: dto.autoApproveTier === true,
    });
    return this.getOfficialSeal(id, companyId, userId);
  }

  /**
   * Creates a DRAFT official seal request for an employee without touching the
   * approval workflow. Used by the Excel importer.
   */
  async createDraftFromImport(
    employeeId: string,
    dto: SubmitOfficialSealRequestDto,
    companyId: string,
    actorUserId: string,
  ): Promise<{ id: string; requestNumber: string }> {
    if (employeeId !== actorUserId) {
      const canFileOnBehalf = await this.hrApprovalChain.isHrOrFullAccessActor(
        actorUserId,
        companyId,
      );
      if (!canFileOnBehalf) {
        throw new ForbiddenException(
          "Only HR or a full-access role can import official seal requests for another employee",
        );
      }
    }

    const employee = await this.prisma.user.findFirst({
      where: activeOnly({ id: employeeId, companyId }),
      select: { id: true },
    });
    if (!employee) {
      throw new NotFoundException("Employee not found");
    }

    return this.prisma.officialSeal.create({
      data: {
        id: randomUUID(),
        companyId,
        requestNumber: await this.nextRequestNumber(),
        employeeId,
        fileName: dto.fileName.trim(),
        description: dto.description.trim(),
        ...this.sealExtraFieldsFromDto(dto),
        urgency: dto.urgency,
        dateNeeded: this.parseDateNeeded(dto.dateNeeded),
        status: SealStatus.DRAFT,
        createdBy: actorUserId,
        updatedBy: actorUserId,
      },
      select: { id: true, requestNumber: true },
    });
  }

  async listOfficialSeals(
    filters: ListOfficialSealsDto,
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
      "official-seal",
      "manage",
    );

    const where: Prisma.OfficialSealWhereInput = {
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
                  mode: "insensitive" as const,
                },
              },
              {
                fileName: {
                  contains: filters.search.trim(),
                  mode: "insensitive" as const,
                },
              },
            ],
          }
        : {}),
    };

    const [rows, total] = await Promise.all([
      this.prisma.officialSeal.findMany({
        where,
        skip,
        take,
        orderBy: { createdAt: "desc" },
        include: {
          employee: { select: USER_SELECT },
          approvalRequest: {
            include: {
              tiers: {
                where: { decision: "PENDING" },
                take: 1,
                select: { tierOrder: true, label: true },
              },
            },
          },
        },
      }),
      this.prisma.officialSeal.count({ where }),
    ]);
    return buildPaginatedResult(
      rows.map((row) => {
        const { approvalRequest, ...rest } = row;
        const pendingTier = approvalRequest?.tiers[0];
        return {
          ...rest,
          approvalRequest,
          currentTierLabel: pendingTier?.label ?? null,
          directApproved:
            rest.status === SealStatus.APPROVED && !rest.approvalRequestId,
        };
      }),
      total,
      page,
      limit,
    );
  }

  async getOfficialSeal(
    id: string,
    companyId: string,
    userId: string,
  ): Promise<unknown> {
    const officialSeal = await this.prisma.officialSeal.findFirst({
      where: activeOnly({ id, companyId }),
      include: OFFICIAL_SEAL_INCLUDE,
    });
    if (!officialSeal) {
      throw new NotFoundException("Official seal not found");
    }
    await this.assertCanView(officialSeal, companyId, userId);

    return this.mapOfficialSealDetail(officialSeal);
  }

  async onApprovalDecision(
    approvalRequestId: string,
    decision: ApprovalFinalDecision,
  ): Promise<void> {
    const officialSeal = await this.prisma.officialSeal.findFirst({
      where: activeOnly({ approvalRequestId }),
    });
    if (!officialSeal) {
      return;
    }
    if (
      officialSeal.status === SealStatus.APPROVED ||
      officialSeal.status === SealStatus.REJECTED ||
      officialSeal.status === SealStatus.CANCELLED
    ) {
      return;
    }

    const now = new Date();
    const nextStatus =
      decision === "APPROVED"
        ? SealStatus.APPROVED
        : decision === "REJECTED"
          ? SealStatus.REJECTED
          : SealStatus.RETURNED;

    await this.prisma.officialSeal.update({
      where: { id: officialSeal.id },
      data: {
        status: nextStatus,
        completedAt: decision === "RETURNED" ? null : now,
        updatedBy: officialSeal.employeeId,
      },
    });
  }

  async cancelOfficialSeal(
    id: string,
    companyId: string,
    userId: string,
  ): Promise<unknown> {
    const officialSeal = await this.prisma.officialSeal.findFirst({
      where: activeOnly({ id, companyId }),
    });
    if (!officialSeal) {
      throw new NotFoundException("Official seal not found");
    }
    if (officialSeal.employeeId !== userId) {
      throw new ForbiddenException("Only the request owner can cancel it");
    }
    if (
      officialSeal.status !== SealStatus.DRAFT &&
      officialSeal.status !== SealStatus.SUBMITTED
    ) {
      throw new BadRequestException(
        "Only draft or submitted requests can be cancelled",
      );
    }

    const now = new Date();
    await this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      await tx.officialSeal.update({
        where: { id },
        data: {
          status: SealStatus.CANCELLED,
          completedAt: now,
          updatedBy: userId,
        },
      });
      if (officialSeal.approvalRequestId) {
        await tx.approvalRequest.update({
          where: { id: officialSeal.approvalRequestId },
          data: {
            status: ApprovalRequestStatus.CANCELLED,
            completedAt: now,
            updatedBy: userId,
          },
        });
      }
    });
    return this.getOfficialSeal(id, companyId, userId);
  }

  async issueSeal(
    id: string,
    companyId: string,
    userId: string,
    file?: UploadedFile,
  ): Promise<unknown> {
    const officialSeal = await this.prisma.officialSeal.findFirst({
      where: activeOnly({ id, companyId }),
    });
    if (!officialSeal) {
      throw new NotFoundException("Official seal not found");
    }

    const canIssue = await this.permissionService.hasPermission(
      userId,
      companyId,
      "official-seal",
      "manage",
    );
    if (!canIssue) {
      throw new ForbiddenException("Only HR can issue the seal");
    }

    if (officialSeal.status === SealStatus.SEAL_ISSUED) {
      throw new BadRequestException("Seal has already been issued");
    }
    if (officialSeal.status !== SealStatus.APPROVED) {
      throw new BadRequestException("Only approved requests can be issued.");
    }

    const now = new Date();

    if (file?.buffer?.length) {
      if (!isAllowedUploadFile(file)) {
        throw new BadRequestException(
          `File type not allowed: ${file.mimetype || "unknown"} (${file.originalname})`,
        );
      }

      const folderId = await this.ensureOfficialSealFolder(
        officialSeal,
        userId,
      );
      const documentId = randomUUID();
      const safeName = file.originalname.replace(/[^a-zA-Z0-9._-]/g, "_");
      const fileKey = `${companyId}/official-seal/${officialSeal.requestNumber}/sealed/${safeName}`;

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
        await tx.officialSeal.update({
          where: { id },
          data: {
            sealedDocumentId: documentId,
            status: SealStatus.SEAL_ISSUED,
            issuedAt: new Date(),
            issuedBy: userId,
            completedAt: new Date(),
            updatedBy: userId,
          },
        });
      });
      return this.getOfficialSeal(id, companyId, userId);
    }

    await this.prisma.officialSeal.update({
      where: { id },
      data: {
        status: SealStatus.SEAL_ISSUED,
        issuedAt: now,
        issuedBy: userId,
        completedAt: now,
        updatedBy: userId,
      },
    });

    return this.getOfficialSeal(id, companyId, userId);
  }

  private async assertCanView(
    officialSeal: {
      status: string;
      employeeId: string;
      createdBy?: string;
      approvalRequest?: { tiers?: Array<{ approverId: string }> } | null;
    },
    companyId: string,
    userId: string,
  ): Promise<void> {
    const canManage = await this.permissionService.hasPermission(
      userId,
      companyId,
      "official-seal",
      "manage",
    );
    if (canManage) return;

    const isOwner = officialSeal.employeeId === userId || officialSeal.createdBy === userId;
    const isTierApprover =
      // Cancelled requests are hidden from the approval chain.
      officialSeal.status !== 'CANCELLED' &&
      (officialSeal.approvalRequest?.tiers?.some(
        (t) => t.approverId === userId,
      ) ?? false);

    if (!isOwner && !isTierApprover) {
      throw new ForbiddenException(
        "You do not have access to this official seal request",
      );
    }
  }

  private normalizeStatuses(
    status: string | undefined,
  ): SealStatus[] | undefined {
    if (!status) return undefined;
    if (status.includes(",")) {
      return status
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean) as SealStatus[];
    }
    return [status as SealStatus];
  }

  private sealExtraFieldsFromDto(dto: SubmitOfficialSealRequestDto): {
    sealCategory: string | null;
    copyCount: number | null;
  } {
    return {
      sealCategory: dto.sealCategory?.trim() || null,
      copyCount: dto.copyCount ?? null,
    };
  }

  /** Seals are requested for upcoming documents: today or later (company timezone). */
  private parseDateNeeded(value: string): Date {
    const date = this.parseDateOnly(value);
    if (isDateInPast(date)) {
      throw new BadRequestException(
        'Date needed must be today or a future date',
      );
    }
    return date;
  }

  private parseDateOnly(value: string): Date {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
    if (!match) {
      throw new BadRequestException("Invalid date format");
    }
    return new Date(
      Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])),
    );
  }

  private async ensureOfficialSealFolder(
    officialSeal: {
      id: string;
      companyId: string;
      requestNumber: string;
      attachmentFolderId: string | null;
    },
    userId: string,
  ): Promise<string> {
    if (officialSeal.attachmentFolderId) {
      return officialSeal.attachmentFolderId;
    }

    const folderId = randomUUID();
    const path = `/official-seal/${officialSeal.requestNumber}`;

    await this.prisma.$transaction(async (tx) => {
      await tx.documentFolder.create({
        data: {
          id: folderId,
          companyId: officialSeal.companyId,
          name: `Official Seal ${officialSeal.requestNumber}`,
          path,
          contextType: FolderContextType.OFFICIAL_SEAL,
          contextId: officialSeal.id,
          isSystem: false,
          createdBy: userId,
          updatedBy: userId,
        },
      });
      await tx.officialSeal.update({
        where: { id: officialSeal.id },
        data: {
          attachmentFolderId: folderId,
          updatedBy: userId,
        },
      });
    });

    return folderId;
  }

  /**
   * Uploads optional document(s) submitted with the request (document to be sealed).
   */
  private async attachSubmissionFiles(
    officialSealId: string,
    companyId: string,
    userId: string,
    files: UploadedFile[],
  ): Promise<void> {
    const officialSeal = await this.prisma.officialSeal.findFirst({
      where: activeOnly({ id: officialSealId, companyId }),
      select: {
        id: true,
        companyId: true,
        requestNumber: true,
        attachmentFolderId: true,
      },
    });
    if (!officialSeal) {
      throw new NotFoundException("Official seal not found");
    }

    const folderId = await this.ensureOfficialSealFolder(officialSeal, userId);

    for (const file of files) {
      if (!file?.buffer?.length) {
        continue;
      }
      if (!isAllowedUploadFile(file)) {
        throw new BadRequestException(
          `File type not allowed: ${file.mimetype || "unknown"} (${file.originalname})`,
        );
      }

      const documentId = randomUUID();
      const safeName = file.originalname.replace(/[^a-zA-Z0-9._-]/g, "_");
      const fileKey = `${companyId}/official-seal/${officialSeal.requestNumber}/attachments/${safeName}`;

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
      });
    }
  }

  private mapOfficialSealDetail(
    officialSeal: {
      status: SealStatus;
      approvalRequestId: string | null;
      sealedDocumentId: string | null;
      approvalRequest?: {
        currentTier: number;
        tiers: Array<{
          tierOrder: number;
          label: string;
          decision: string;
        }>;
      } | null;
      attachmentFolder?: {
        id: string;
        documents: Array<{
          id: string;
          name: string;
          fileKey: string;
          fileType: string;
          fileSizeBytes: number;
        }>;
      } | null;
    } & Record<string, unknown>,
  ): Record<string, unknown> {
    const { attachmentFolder, ...rest } = officialSeal;
    const folderDocuments = attachmentFolder?.documents ?? [];
    const documents = folderDocuments.filter(
      (doc) => doc.id !== officialSeal.sealedDocumentId,
    );
    const pendingTier = officialSeal.approvalRequest?.tiers.find(
      (tier) =>
        tier.tierOrder === officialSeal.approvalRequest?.currentTier &&
        tier.decision === "PENDING",
    );

    return {
      ...rest,
      documents,
      attachmentFolderId:
        attachmentFolder?.id ?? rest.attachmentFolderId ?? null,
      currentTierLabel: pendingTier?.label ?? null,
      directApproved:
        officialSeal.status === SealStatus.APPROVED &&
        !officialSeal.approvalRequestId,
    };
  }

  private async nextRequestNumber(): Promise<string> {
    const result = await this.prisma.$queryRaw<Array<{ nextval: bigint }>>`
        SELECT nextval('official_seal_number_seq')
    `;
    const seq = Number(result[0].nextval);
    return `OSR-${String(seq).padStart(4, "0")}`;
  }
}
