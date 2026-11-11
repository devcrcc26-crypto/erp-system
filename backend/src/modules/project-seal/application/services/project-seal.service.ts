import { ApprovalDecisionListener, ApprovalFinalDecision } from "@/modules/approvals/application/ports/approval-decision.listener";
import { PrismaService } from "@/shared/prisma/prisma.service";
import { isDateInPast } from "@/shared/utils/date-validation.util";
import { BadRequestException, ForbiddenException, Injectable, Logger, NotFoundException, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { ListProjectSealsDto, SealStatus, SubmitProjectSealRequestDto } from "../dtos/project-seal.dtos";
import { ApprovalsService } from "@/modules/approvals/application/services/approvals.service";
import { HrApprovalChainService } from "@/modules/hr-shared/application/services/hr-approval-chain.service";
import { OnBehalfService } from '../../../on-behalf/on-behalf.service';
import { ApprovalDecisionRegistry } from "@/modules/approvals/application/services/approval-decision-registry.service";
import { PermissionService } from "@/shared/permissions/permission.service";
import { IStorageService } from "@/shared/storage/storage.interface";
import { Inject } from "@nestjs/common";
import { randomUUID } from "crypto";
import { ApprovalRequestStatus, FolderContextType, Prisma } from "@prisma/client";
import { activeOnly } from "@/shared/prisma/soft-delete.util";
import { isAllowedUploadFile } from "@/shared/storage/upload-validation.util";
import { STORAGE_BUCKETS, STORAGE_SERVICE } from "@/shared/storage/storage.constants";
import { buildPaginatedResult, buildPrismaPagination } from "../../../../shared/utils/pagination.util";


type UploadedFile = {
    originalname: string;
    mimetype: string;
    size: number;
    buffer: Buffer;
}

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

const PROJECT_SEAL_INCLUDE = {
    employee: { select: USER_SELECT },
    issuer: { select: USER_SELECT },
    sealedDocument: {
        select: DOCUMENT_SELECT,
    },
    attachmentFolder: {
        include: {
            documents: {
                where: {deletedAt: null, isCurrent: true},
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

@Injectable()
export class ProjectSealService
implements ApprovalDecisionListener, OnModuleInit, OnModuleDestroy 
{
    private readonly logger = new Logger(ProjectSealService.name);
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
        dto: SubmitProjectSealRequestDto,
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
          await this.hrApprovalChain.buildProjectSealApprovalChain(
            employeeId,
            companyId,
          );

        const now = new Date();
        const id = randomUUID();
        const dateNeeded = this.parseDateNeeded(dto.dateNeeded);
        const extraFields = this.sealExtraFieldsFromDto(dto);

        if (resolvedTiers.length === 0) {
            await this.prisma.projectSeal.create({
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
                `Project seal request ${requestNumber} created by ${userId} for company ${companyId}`,
            );
            await this.onBehalfService.recordOnBehalfCreate({
              moduleCode: 'PROJECT_SEAL_USAGE',
              companyId,
              actorUserId: userId,
              employeeId,
              recordId: id,
              recordReference: requestNumber,
              autoApproveTier: dto.autoApproveTier,
            });
            return this.getProjectSeal(id, companyId, userId);
        }

        const approval = (await this.approvalsService.submitRequest(
            {
                categoryCode: 'PROJECT_SEAL_USAGE',
                title: `Project Seal - ${dto.fileName}`,
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
                    ruleName: 'Project Seal HR → GM chain',
                    tiers: resolvedTiers,
                },
                createdByUserId: userId,
            },
        )) as { id: string; requestNumber: string };

        try {
            await this.prisma.projectSeal.create({
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
        }catch(error: unknown) {
            this.logger.error(
            `Project seal create failed after approval ${approval.id}; cancelling approval`,
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
          moduleCode: 'PROJECT_SEAL_USAGE',
          companyId,
          actorUserId: userId,
          employeeId,
          recordId: id,
          recordReference: requestNumber,
          autoApproveTier: dto.autoApproveTier,
        });
        await this.onBehalfService.applyAutoApprove({
          moduleCode: 'PROJECT_SEAL_USAGE',
          companyId,
          actorUserId: userId,
          employeeId,
          approvalRequestId: approval.id,
          autoApproveTier: dto.autoApproveTier === true,
        });
        return this.getProjectSeal(id, companyId, userId);
    }

    /**
     * Creates a DRAFT project seal request for an employee without touching the
     * approval workflow. Used by the Excel importer.
     */
    async createDraftFromImport(
        employeeId: string,
        dto: SubmitProjectSealRequestDto,
        companyId: string,
        actorUserId: string,
    ): Promise<{ id: string; requestNumber: string }> {
        if (employeeId !== actorUserId) {
            const canFileOnBehalf =
                await this.hrApprovalChain.isHrOrFullAccessActor(
                    actorUserId,
                    companyId,
                );
            if (!canFileOnBehalf) {
                throw new ForbiddenException(
                    'Only HR or a full-access role can import project seal requests for another employee',
                );
            }
        }

        const employee = await this.prisma.user.findFirst({
            where: activeOnly({ id: employeeId, companyId }),
            select: { id: true },
        });
        if (!employee) {
            throw new NotFoundException('Employee not found');
        }

        return this.prisma.projectSeal.create({
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

    async getProjectSeal(id: string, companyId: string, userId: string): Promise<unknown> {
        const projectSeal = await this.prisma.projectSeal.findFirst({
            where: activeOnly({ id, companyId }),
            include: PROJECT_SEAL_INCLUDE,
        });
        if (!projectSeal) {
            throw new NotFoundException('Project seal not found');
        }
        await this.assertCanView(projectSeal, companyId, userId);
        return this.mapProjectSealDetail(projectSeal);
    }
    async listProjectSeals(
        filters: ListProjectSealsDto,
        companyId: string,
        userId: string,
    ){
        const page = filters.page ?? 1;
        const limit = filters.limit ?? 20;
        const { skip, take } = buildPrismaPagination(page, limit);
        const statuses = this.normalizeStatuses(filters.status)

        const canManage = await this.permissionService.hasPermission(
            userId,
            companyId,
            'project-seal',
            'manage',
        );

        const where: Prisma.ProjectSealWhereInput = {
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
                            fileName: {
                                contains: filters.search.trim(),
                                mode: 'insensitive' as const,
                            },
                        },
                    ],
                }
                : {}),
        };

        const [rows, total] = await Promise.all([
            this.prisma.projectSeal.findMany({
                where,
                skip,
                take,
                orderBy: { createdAt: 'desc' },
                include: {
                    employee: { select: USER_SELECT },
                    approvalRequest: {
                        include: {
                            tiers: {
                                where: { decision: 'PENDING' },
                                take: 1,
                                select: { tierOrder: true, label: true },
                            },
                        },
                    },
                },
            }),
            this.prisma.projectSeal.count({ where }),
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
                        rest.status === SealStatus.APPROVED &&
                        !rest.approvalRequestId,
                };
            }),
            total,
            page,
            limit,
        );
    }

    async onApprovalDecision(
        approvalRequestId: string,
        decision: ApprovalFinalDecision,
    ): Promise<void> {
        const projectSeal = await this.prisma.projectSeal.findFirst({
            where: activeOnly({ approvalRequestId }),
        });
        if (!projectSeal) {
            return;
        }
        if (
            projectSeal.status === SealStatus.APPROVED || 
            projectSeal.status === SealStatus.REJECTED || 
            projectSeal.status === SealStatus.CANCELLED
        ) {
            return;
        }

        const now = new Date();
        const nextStatus = 
        decision === 'APPROVED'
        ? SealStatus.APPROVED
        : decision === 'REJECTED'
        ? SealStatus.REJECTED
        : SealStatus.RETURNED;

        await this.prisma.projectSeal.update({
            where: { id: projectSeal.id },
            data: {
                status: nextStatus,
                completedAt: decision === 'RETURNED' ? null : now,
                updatedBy: projectSeal.employeeId,
            },
        });
    }

    async cancelProjectSeal(
        id: string,
        companyId: string,
        userId: string,
    ): Promise<unknown> {
        const projectSeal = await this.prisma.projectSeal.findFirst({
            where: activeOnly({ id, companyId }),
        });
        if (!projectSeal) {
            throw new NotFoundException('Project seal not found');
        }
        if (projectSeal.employeeId !== userId) {
            throw new ForbiddenException('You are not allowed to cancel this project seal request');
        }
        if (projectSeal.status !== SealStatus.DRAFT && projectSeal.status !== SealStatus.SUBMITTED) {
            throw new BadRequestException('Project seal request cannot be cancelled in this status');
        }
        const now = new Date();
        await this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
            await tx.projectSeal.update({
                where: { id },
                data: {
                    status: SealStatus.CANCELLED,
                    completedAt: now,
                    updatedBy: userId,
                },
                });

                if (projectSeal.approvalRequestId) {
                    await tx.approvalRequest.update({
                        where: { id: projectSeal.approvalRequestId },
                        data: {
                            status: ApprovalRequestStatus.CANCELLED,
                            completedAt: now,
                            updatedBy: userId,
                        },
                    });
                }
            });
        return this.getProjectSeal(id, companyId, userId);
    }

    async issueSeal(
        id: string,
        companyId: string,
        userId: string,
        file?: UploadedFile,
    ): Promise<unknown> {
        const projectSeal = await this.prisma.projectSeal.findFirst({
            where: activeOnly({ id, companyId }),
        });
        if (!projectSeal) {
            throw new NotFoundException('Project seal not found');
        }
        
        const canIssue = await this.permissionService.hasPermission(
            userId,
            companyId,
            'project-seal',
            'manage',
        );
        if (!canIssue) {
            throw new ForbiddenException('You do not have permission to issue this project seal');
        }
        if (projectSeal.status === SealStatus.SEAL_ISSUED) {
            throw new BadRequestException('Project seal has already been issued');
        }
        if (projectSeal.status !== SealStatus.APPROVED) {
            throw new BadRequestException('Project seal request cannot be issued in this status');
        }
        const now = new Date();

        if (file?.buffer?.length) {
            if (!isAllowedUploadFile(file)) {
                throw new BadRequestException(
                    `File type not allowed: ${file.mimetype || 'unknown'} (${file.originalname})`,
                );
            }

            const folderId = await this.ensureProjectSealFolder(projectSeal, userId);
            const documentId = randomUUID();
            const safeName = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_');
            const fileKey = `${companyId}/project-seal/${projectSeal.requestNumber}/sealed/${safeName}`;
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
                        fileType: file?.mimetype,
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
                await tx.projectSeal.update({
                    where: { id },
                    data: {
                        sealedDocumentId: documentId,
                        status: SealStatus.SEAL_ISSUED,
                        issuedAt: new Date(),
                        issuedBy: userId,
                        completedAt: now,
                        updatedBy: userId,
                    },
                });
            });
            return this.getProjectSeal(id, companyId, userId);
        }

        await this.prisma.projectSeal.update({
            where: { id },
            data: {
                status: SealStatus.SEAL_ISSUED,
                issuedAt: new Date(),
                issuedBy: userId,
                completedAt: now,
                updatedBy: userId,
            },
        });
        return this.getProjectSeal(id, companyId, userId);
    }
 
    private async assertCanView(
        projectSeal: {
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
            'project-seal',
            'manage',
        );

        if (canManage) return;

        const isOwner = projectSeal.employeeId === userId || projectSeal.createdBy === userId;
        const isTierApprover =
            // Cancelled requests are hidden from the approval chain.
            projectSeal.status !== 'CANCELLED' &&
            (projectSeal.approvalRequest?.tiers?.some(
                (t) => t.approverId === userId,
            ) ?? false);

        if (!isOwner && !isTierApprover) {
            throw new ForbiddenException('You do not have access to this project seal request');
        }
    }

    private normalizeStatuses(status: string | undefined): SealStatus[] | undefined {
        if (!status) return undefined;
        if (status.includes(',')) {
            return status
            .split(',')
            .map((s) => s.trim())
            .filter(Boolean) as SealStatus[];
        }
        return [status as SealStatus];
    }

    private sealExtraFieldsFromDto(dto: SubmitProjectSealRequestDto): {
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
            throw new BadRequestException('Invalid date format');
        }
        return new Date(
            Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]))
        )
    }

    private async ensureProjectSealFolder(
        projectSeal: {
            id: string;
            companyId: string;
            requestNumber: string;
            attachmentFolderId: string | null;
        },
        userId: string,
    ): Promise<string> {
        if (projectSeal.attachmentFolderId) {
            return projectSeal.attachmentFolderId;
        }
        const folderId = randomUUID();
        const path = `/project-seal/${projectSeal.requestNumber}`;
        await this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
            await tx.documentFolder.create({
                data: {
                    id: folderId,
                    companyId: projectSeal.companyId,
                    name: `Project Seal ${projectSeal.requestNumber}`,
                    path,
                    contextType: FolderContextType.PROJECT_SEAL,
                    contextId: projectSeal.id,
                    createdBy: userId,
                    updatedBy: userId,
                },
            });
            await tx.projectSeal.update({
                where: { id: projectSeal.id },
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
        projectSealId: string,
        companyId: string,
        userId: string,
        files: UploadedFile[],
    ): Promise<void> {
        const projectSeal = await this.prisma.projectSeal.findFirst({
            where: activeOnly({ id: projectSealId, companyId }),
            select: {
                id: true,
                companyId: true,
                requestNumber: true,
                attachmentFolderId: true,
            },
        });

        if (!projectSeal) {
            throw new NotFoundException('Project seal not found');
        }

        const folderId = await this.ensureProjectSealFolder(
            projectSeal,
            userId,
        );

        for (const file of files) {
            if (!file?.buffer?.length) {
                continue;
            }
            if (!isAllowedUploadFile(file)) {
                throw new BadRequestException(
                    `File type not allowed: ${file.mimetype || 'unknown'} (${file.originalname})`,
                );
            }

            const documentId = randomUUID();
            const safeName = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_');
            const fileKey = `${companyId}/project-seal/${projectSeal.requestNumber}/attachments/${safeName}`;

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

    private mapProjectSealDetail(
        projectSeal: {
            status: SealStatus;
            approvalRequestId: string | null;
            sealedDocumentId: string | null;
            approvalRequest?: {
                currentTier: number;
                tiers: Array<{ tierOrder: number; label: string; decision: string; }>;
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

        const { attachmentFolder, ...rest } = projectSeal;
        const folderDocuments = attachmentFolder?.documents ?? [];
        const documents = folderDocuments.filter(
            (doc) => doc.id !== projectSeal.sealedDocumentId,
        );
        const pendingTier = projectSeal.approvalRequest?.tiers.find(
            (tier) =>
                tier.tierOrder === projectSeal.approvalRequest?.currentTier &&
                tier.decision === 'PENDING',
        );
        return {
            ...rest,
            documents,
            attachmentFolderId:
                attachmentFolder?.id ?? rest.attachmentFolderId ?? null,
            currentTierLabel: pendingTier?.label ?? null,
            directApproved:
                projectSeal.status === SealStatus.APPROVED &&
                !projectSeal.approvalRequestId,
        };
    }

    private async nextRequestNumber(): Promise<string> {
        const result = await this.prisma.$queryRaw<Array<{ nextval: bigint }>>`
        SELECT nextval('project_seal_number_seq')
    `;
        const seq = Number(result[0].nextval);
        return `PSR-${String(seq).padStart(4, '0')}`;
    }
}