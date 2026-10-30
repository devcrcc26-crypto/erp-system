import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleDestroy,
  OnModuleInit,
} from "@nestjs/common";
import { PrismaService } from "../../../../shared/prisma/prisma.service";
import {
  canViewThroughTeam,
  resolveTeamScopedEmployeeIds,
  teamScopeWhere,
} from "../../../../shared/org/team-scope.util";
import {
  isDateInPast,
  parseLocalDateOnly,
  startOfToday,
} from "../../../../shared/utils/date-validation.util";
import { ApprovalDecisionRegistry } from "../../../approvals/application/services/approval-decision-registry.service";
import { randomUUID } from "crypto";
import { CreateExitPermitDto, CreateExitPermitItemDto, ExitPermitStatus, UpdateExitPermitDto, UpdateExitPermitItemDto, ListExitPermitsDto } from "../dtos/exit-permit.dto";
import { activeOnly } from "../../../../shared/prisma/soft-delete.util";
import { PermissionService } from "@/shared/permissions/permission.service";
import { ALLOWED_IMAGE_MIME_TYPES, ALLOWED_UPLOAD_MIME_TYPES, STORAGE_BUCKETS, STORAGE_SERVICE } from "@/shared/storage/storage.constants";
import { Prisma, FolderContextType, ApprovalRequestStatus } from "@prisma/client";
import { IStorageService } from "@/shared/storage/storage.interface";
import { HrApprovalChainService } from "@/modules/hr-shared/application/services/hr-approval-chain.service";
import { buildPaginatedResult, buildPrismaPagination } from "@/shared/utils/pagination.util";
import { ApprovalDecisionListener, ApprovalFinalDecision } from "@/modules/approvals/application/ports/approval-decision.listener";
import { ApprovalsService } from "@/modules/approvals/application/services/approvals.service";
import { OnBehalfService } from "@/modules/on-behalf/on-behalf.service";

const USER_SELECT = {
    id: true,
    firstName: true,
    middleName: true,
    lastName: true,
    chineseName: true,
    email: true,
    employeeId: true,
} as const;

const DOCUMENT_SELECT = {
    id: true,
    name: true,
    fileType: true,
    fileSizeBytes: true,
} as const;

type UploadedFile = {
    originalname: string;
    mimetype: string;
    size: number;
    buffer: Buffer;
};

const DEPARTMENT_SELECT = {
    id: true,
    name: true,
    nameZh: true,
} as const;

const REQUEST_DETAIL_INCLUDE = {
    employee: { select: USER_SELECT },
    creator: { select: USER_SELECT },
    submitter: { select: USER_SELECT },
    department: { select: DEPARTMENT_SELECT },
    items: {
        orderBy: { createdAt: 'asc' as const },
        include: {
            image: { select: DOCUMENT_SELECT },
        },
    },
    attachmentFolder: {
        include: {
            documents: { select: DOCUMENT_SELECT },
        },
    },
    approvalRequest: {
        include: {
            tiers: {
                include: { approver: { select: USER_SELECT } },
                orderBy: { tierOrder: 'asc' as const },
            },
        },
    },
} as const;

@Injectable()
export class ExitPermitService implements ApprovalDecisionListener, OnModuleInit, OnModuleDestroy {

  private readonly logger = new Logger(ExitPermitService.name);
  constructor(
    private readonly prisma: PrismaService,
    private readonly approvalsService: ApprovalsService,
    private readonly decisionRegistry: ApprovalDecisionRegistry,
    private readonly permissionService: PermissionService,
    private readonly hrApprovalChain: HrApprovalChainService,
    private readonly onBehalfService: OnBehalfService,
    @Inject(STORAGE_SERVICE)
    private readonly storage: IStorageService,
  ) {}

  onModuleInit(): void {
    this.decisionRegistry.register(this);
  }

  onModuleDestroy(): void {
    this.decisionRegistry.unregister(this);
  }

  async createDraft(
    dto: CreateExitPermitDto,
    companyId: string,
    userId: string,
  ) {
    const employeeId = await this.resolveTargetEmployeeId(
      dto.onBehalfOfEmployeeId ?? dto.employeeId ?? userId,
      companyId,
      userId,
    );

    if (dto.departmentId) {
      const department = await this.prisma.department.findFirst({
        where: activeOnly({ id: dto.departmentId, companyId }),
        select: { id: true },
      });

      if (!department) {
        throw new NotFoundException("Department not found");
      }
    }

    const requestNumber = await this.nextRequestNumber();
    const requestId = randomUUID();

    const request = await this.prisma.$transaction(async (tx) => {
      const created = await tx.exitPermit.create({
        data: {
          id: requestId,
          companyId,
          requestNumber,
          employeeId,
          departmentId: dto.departmentId ?? null,
          direction: dto.direction,
          date: this.resolveExitPermitDate(dto.date),
          isOnBehalf: employeeId !== userId,
          status: ExitPermitStatus.DRAFT,
          createdBy: userId,
          updatedBy: userId,
        },
      });

      if (dto.items?.length) {
        await tx.exitPermitItem.createMany({
          data: dto.items.map((item) => ({
            requestId: created.id,
            itemName: item.itemName.trim(),
            issue: item.issue?.trim() ?? null,
            quantity: item.quantity ?? 1,
            unit: item.unit?.trim() ?? null,
            documentId: item.documentId ?? null,
          })),
        });
      }

      return created;
    });

    await this.onBehalfService.recordOnBehalfCreate({
      moduleCode: 'EXIT_PERMIT',
      companyId,
      actorUserId: userId,
      employeeId,
      recordId: request.id,
      recordReference: request.requestNumber,
      autoApproveTier: dto.autoApproveTier,
    });

    return this.getRequest(request.id, companyId, userId);
  }

  async updateDraft(
    id: string,
    dto: UpdateExitPermitDto,
    companyId: string,
    userId: string,
  ) {
    await this.assertEditableOwner(id, companyId, userId);

    if (dto.departmentId) {
      const department = await this.prisma.department.findFirst({
        where: activeOnly({ id: dto.departmentId, companyId }),
        select: { id: true },
      });

      if (!department) {
        throw new NotFoundException("Department not found");
      }
    }

    if (dto.employeeId !== undefined) {
      await this.resolveTargetEmployeeId(dto.employeeId, companyId, userId);
    }

    const existing = await this.prisma.exitPermit.findFirstOrThrow({
      where: activeOnly({ id, companyId }),
      select: { status: true, approvalRequestId: true },
    });
    await this.prisma.$transaction(async (tx) => {
      await tx.exitPermit.update({
        where: { id },
        data: {
          ...(dto.direction !== undefined ? { direction: dto.direction } : {}),
          ...(dto.date !== undefined
            ? { date: this.resolveExitPermitDate(dto.date) }
            : {}),
          ...(dto.departmentId !== undefined
            ? { departmentId: dto.departmentId ?? null }
            : {}),
          ...(dto.employeeId !== undefined
            ? {
                employeeId: dto.employeeId,
                isOnBehalf: dto.employeeId !== userId,
              }
            : {}),
          updatedBy: userId,
        },
      });

      if (dto.items !== undefined) {
        await tx.exitPermitItem.deleteMany({
          where: { requestId: id },
        });

        if (dto.items.length > 0) {
          await tx.exitPermitItem.createMany({
            data: dto.items.map((item) => ({
              requestId: id,
              itemName: item.itemName.trim(),
              issue: item.issue?.trim() ?? null,
              quantity: item.quantity ?? 1,
              unit: item.unit?.trim() ?? null,
              documentId: item.documentId ?? null,
            })),
          });
        }
      }
    });

    if (existing.approvalRequestId) {
      // Keep the approval card in step with the edited permit.
      const updated = await this.prisma.exitPermit.findFirstOrThrow({
        where: { id },
        include: { items: { select: { id: true } } },
      });
      await this.prisma.approvalRequest.update({
        where: { id: existing.approvalRequestId },
        data: {
          formData: {
            itemCount: updated.items.length,
            direction: updated.direction,
            date: updated.date,
            departmentId: updated.departmentId,
            employeeId: updated.employeeId,
            submittedBy: updated.submittedBy,
            isOnBehalf: updated.isOnBehalf,
          },
          updatedBy: userId,
        },
      });
    }

    return this.getRequest(id, companyId, userId);
  }

  async addItem(
    requestId: string,
    dto: CreateExitPermitItemDto,
    file: UploadedFile | undefined,
    companyId: string,
    userId: string,
  ) {
    await this.assertEditableOwner(requestId, companyId, userId);

    const request = await this.prisma.exitPermit.findFirst({
        where: activeOnly({id: requestId, companyId}),
        select: {id: true, requestNumber: true, attachmentFolderId: true},
    });

    if (!request){
        throw new NotFoundException('Exit permit not found');
    }

    let documentId: string | null = null;
    if (file?.buffer?.length){
        documentId = await this.uploadItemImage(request, companyId, userId, file);
    }

    await this.prisma.exitPermitItem.create({
        data:{
            id: randomUUID(),
            requestId,
            itemName: dto.itemName.trim(),
            issue: dto.issue?.trim() ?? null,
            quantity: dto.quantity ?? 1,
            unit: dto.unit?.trim() ?? null,
            documentId,
        }
    });
    return this.getRequest(requestId, companyId, userId);
  }

  async updateItem(
    requestId: string,
    itemId: string,
    dto: UpdateExitPermitItemDto,
    file: UploadedFile | undefined,
    companyId: string,
    userId: string,
  ) {
    await this.assertEditableOwner(requestId, companyId, userId);

    const request = await this.prisma.exitPermit.findFirst({
        where: activeOnly({id: requestId, companyId}),
        select: {id: true, requestNumber: true, attachmentFolderId: true},
    });

    if (!request){
        throw new NotFoundException('Exit permit not found');
    }

    const existing = await this.prisma.exitPermitItem.findFirst({
        where: {id: itemId, requestId},
    });

    if (!existing){
        throw new NotFoundException('Exit permit item not found');
    }

    let documentId = existing.documentId;
    if (file?.buffer?.length){
        documentId = await this.uploadItemImage(request, companyId, userId, file);
    }

    await this.prisma.exitPermitItem.update({
        where: {id: itemId},
        data: {
            ...(dto.itemName !== undefined
              ? { itemName: dto.itemName.trim() }
              : {}),
            issue: dto.issue?.trim() ?? existing.issue,
            quantity: dto.quantity ?? existing.quantity,
            unit: dto.unit?.trim() ?? existing.unit,
            documentId,
        }
    });
    return this.getRequest(requestId, companyId, userId);
  }

  async deleteItem(
    requestId: string,
    itemId: string,
    companyId: string,
    userId: string,
  ) {
    await this.assertEditableOwner(requestId, companyId, userId);

    const existing = await this.prisma.exitPermitItem.findFirst({
        where: {id: itemId, requestId},
    });

    if (!existing){
        throw new NotFoundException('Exit permit item not found');
    }

    await this.prisma.exitPermitItem.delete({where: {id: itemId}});
    return this.getRequest(requestId, companyId, userId);
  }

  async submitRequest(
    id: string,
    files: UploadedFile[],
    companyId: string,
    userId: string,
  ) {
    const request = await this.prisma.exitPermit.findFirst({
        where: activeOnly({id, companyId}),
        include: {items: true},
    });

    if (!request){
        throw new NotFoundException('Exit permit not found');
    }

    if (!(await this.canActForRequest(request, companyId, userId))) {
        throw new ForbiddenException(
          'Only the employee, HR, or a full-access role can submit this exit permit',
        );
    }

    if (request.items.length === 0){
        throw new BadRequestException('Add at least one item before submitting');
    }

    // Returned permits go through the approval's resubmit (same chain,
    // restarted); submitting again here would open a second chain.
    if (request.status !== ExitPermitStatus.DRAFT) {
      throw new BadRequestException(
        request.status === ExitPermitStatus.RETURNED
          ? 'Returned permits are resubmitted from Approvals'
          : 'Only draft exit permits can be submitted',
      );
    }

    const submittedOnBehalf = request.employeeId !== userId;
    const isOnBehalf =
      submittedOnBehalf || request.employeeId !== request.createdBy;

    const resolvedTiers =
    await this.hrApprovalChain.buildExitPermitApprovalChain(
      request.employeeId,
      companyId,
      { submittedOnBehalf },
    );

    if (submittedOnBehalf && resolvedTiers.length === 0) {
      throw new BadRequestException(
        'On-behalf exit permits require at least one approval tier',
      );
    }

    if (resolvedTiers.length === 0){
        if (files?.length > 0){
            await this.uploadRequestFiles(request, files, companyId, userId);
        }

        const now = new Date();
        await this.prisma.exitPermit.update({
            where: {id},
            data: {
                status: ExitPermitStatus.APPROVED,
                submittedAt: now,
                submittedBy: userId,
                isOnBehalf,
                completedAt: now,
                updatedBy: userId,
            }
        });

        this.logger.log(
            `Exit permit ${request.requestNumber} auto-approved (employee is HR+ on a self-submit)`,
        );
        return this.getRequest(id, companyId, userId);
    }

    const approval = (await this.approvalsService.submitRequest(
        {
        categoryCode: 'EXIT_PERMIT',
        title: `Exit Permit ${request.requestNumber}`,
        formData: {
            itemCount: request.items.length,
            direction: request.direction,
            date: request.date, 
            departmentId: request.departmentId,
            employeeId: request.employeeId,
            submittedBy: userId,
            isOnBehalf,
        },
    },
    companyId,
    userId,
    {
        resolvedTiers: {
            ruleName: 'Exit permit value chain',
            tiers: resolvedTiers,
        },
    },
    )) as { id: string; requestNumber: string };

    if (files?.length > 0){
        await this.uploadRequestFiles(request, files, companyId, userId);
    }

    await this.prisma.exitPermit.update({
        where: {id},
        data: {
            status: ExitPermitStatus.SUBMITTED,
            approvalRequestId: approval.id,
            submittedAt: new Date(),
            submittedBy: userId,
            isOnBehalf,
            completedAt: null,
            updatedBy: userId,
        }
    });

    await this.onBehalfService.applyAutoApprove({
      moduleCode: 'EXIT_PERMIT',
      companyId,
      actorUserId: userId,
      employeeId: request.employeeId,
      approvalRequestId: approval.id,
      autoApproveTier: await this.onBehalfService.wasAutoApproveRequested(
        'EXIT_PERMIT',
        id,
        userId,
        companyId,
      ),
    });
    return this.getRequest(id, companyId, userId);
  }

  async getRequest(id: string, companyId: string, userId: string) {
    const request = await this.prisma.exitPermit.findFirst({
      where: activeOnly({ id, companyId }),
      include: REQUEST_DETAIL_INCLUDE,
    });

    if (!request) {
      throw new NotFoundException("Exit permit not found");
    }

    await this.assertCanView(request, companyId, userId);

    const pendingTier = request.approvalRequest?.tiers.find(
      (t) =>
        t.tierOrder === request.approvalRequest?.currentTier &&
        t.decision === "PENDING",
    );

    const { attachmentFolder, ...requestRest } = request;

    return {
      ...requestRest,
      documents: attachmentFolder?.documents ?? [],
      itemCount: request.items.length,
      currentTierLabel: pendingTier?.label ?? null,
    };
  }

  async listRequests(filters: ListExitPermitsDto, companyId: string, userId: string) {
    const page = filters.page ?? 1;
    const limit = filters.limit ?? 20;
    const { skip, take } = buildPrismaPagination(page, limit);
    const statuses = this.normalizeStatuses(filters.status);

    const canManage = await this.permissionService.hasPermission(
      userId,
      companyId,
      'exit-permit',
      'manage',
    );

    // Own permits plus the team's for supervisors (not their drafts or
    // cancelled ones).
    const teamScope = canManage
        ? null
        : teamScopeWhere(
            userId,
            await resolveTeamScopedEmployeeIds(this.prisma, userId, companyId),
            filters.employeeId,
        );

    const where: Prisma.ExitPermitWhereInput = {
        companyId,
        deletedAt: null,
        ...(teamScope ? { AND: [teamScope] } : {}),
        ...(statuses ? { status: { in: statuses } } : {}),
        ...(canManage && filters.employeeId ? { employeeId: filters.employeeId } : {}),
        ...(filters.search?.trim() ? {
            OR: [
                {requestNumber: {contains: filters.search.trim(), mode: 'insensitive' as const}},
                {items: {some: {itemName: {contains: filters.search.trim(), mode: 'insensitive' as const}}}},
            ],
        } : {}),
        ...(filters.dateFrom || filters.dateTo ? {
           createdAt: {
            ...(filters.dateFrom ? { gte: this.parseDateOnly(filters.dateFrom) } : {}),
            ...(filters.dateTo ? { lte: this.parseDateOnly(filters.dateTo) } : {}),
           }
        } : {}),
        ...(filters.direction ? { direction: filters.direction } : {}),
    };

    const [rows, total] = await Promise.all([
        this.prisma.exitPermit.findMany({
            where,
            skip,
            take,
            orderBy: { createdAt: 'desc' },
            include: {
                employee: { select: USER_SELECT },
                creator: { select: USER_SELECT },
                submitter: { select: USER_SELECT },
                department: { select: DEPARTMENT_SELECT },
                _count: { select: { items: true } },
                approvalRequest: {
                    select: {
                        id: true,
                        status: true,
                        currentTier: true,
                        tiers: {
                            where: { decision: 'PENDING' },
                            take: 1,
                            select: { tierOrder: true, label: true },
                        },
                    },
                },
            },
        }),
        this.prisma.exitPermit.count({ where }),
    ]);

    return buildPaginatedResult(
        rows.map((row) => {
            const { _count, approvalRequest, ...rest } = row;
            const pendingTier = approvalRequest?.tiers[0];
            return {
                ...rest,
                approvalRequest,
                itemCount: _count.items,
                currentTierLabel: pendingTier?.label ?? null,
            };
        }),
        total,
        page,
        limit,
    );

  }

  async cancelRequest(
    id: string,
    companyId: string,
    userId: string,
  ) {
    const request = await this.prisma.exitPermit.findFirst({
        where: activeOnly({id, companyId}),
    });

    if (!request){
        throw new NotFoundException('Exit permit not found');
    }
    if (!(await this.canActForRequest(request, companyId, userId))) {
        throw new ForbiddenException(
          'Only the employee, HR, or a full-access role can cancel this exit permit',
        );
    }
    if (request.status !== ExitPermitStatus.DRAFT && request.status !== ExitPermitStatus.SUBMITTED){
        throw new BadRequestException('Only draft or submitted requests can be cancelled');
    }
    
    const now = new Date();
    await this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
        await tx.exitPermit.update({
            where: {id},
            data: {
                status: ExitPermitStatus.CANCELLED,
                completedAt: now,
                updatedBy: userId,
            }
        });
        if (request.approvalRequestId){
            await tx.approvalRequest.update({
                where: {id: request.approvalRequestId},
                data: {
                    status: ApprovalRequestStatus.CANCELLED,
                }
            });
        }
    });
    return this.getRequest(id, companyId, userId);
  }

  async onApprovalDecision(
    approvalRequestId: string,
    decision: ApprovalFinalDecision,
  ) {
    const request = await this.prisma.exitPermit.findFirst({
        where: activeOnly({approvalRequestId}),
    });

    if (!request){
        return;
    }
    if (request.status === ExitPermitStatus.APPROVED || request.status === ExitPermitStatus.REJECTED || request.status === ExitPermitStatus.CANCELLED){
        return;
    }

    const now = new Date();
    const nextStatus =
      decision === 'APPROVED'
        ? ExitPermitStatus.APPROVED
        : decision === 'REJECTED'
          ? ExitPermitStatus.REJECTED
          : ExitPermitStatus.RETURNED;
    await this.prisma.exitPermit.update({
        where: {id: request.id},
        data: {
            status: nextStatus,
            completedAt: decision === 'RETURNED' ? null : now,
            updatedBy: request.employeeId,
        }
    });
}

  // Private methods

  private async nextRequestNumber(): Promise<string> {
    const result = await this.prisma.$queryRaw<Array<{ nextval: bigint }>>`
             SELECT nextval('exit_permit_number_seq')
        `;
    const seq = Number(result[0].nextval);
    return `EP-${String(seq).padStart(4, "0")}`;
  }

  private async canActForRequest(
    request: { employeeId: string; createdBy: string },
    companyId: string,
    userId: string,
  ): Promise<boolean> {
    if (await this.onBehalfService.canActForRecord(userId, companyId, request)) {
      return true;
    }

    return this.hrApprovalChain.isHrOrFullAccessActor(userId, companyId);
  }

  private async assertCanView(
    request: {
      status: string;
      employeeId: string;
      createdBy: string;
      approvalRequest?: { tiers?: Array<{ approverId: string }> } | null;
    },
    companyId: string,
    userId: string,
  ) {
    if (request.employeeId === userId || request.createdBy === userId) {
      return;
    }

    if (await this.hrApprovalChain.isHrOrFullAccessActor(userId, companyId)) {
      return;
    }

    const canManage = await this.permissionService.hasPermission(
      userId,
      companyId,
      'exit-permit',
      'manage',
    );

    if (canManage) {
      return;
    }

    const isTierApprover =
      // Cancelled requests are hidden from the approval chain.
      request.status !== 'CANCELLED' &&
      (request.approvalRequest?.tiers?.some((t) => t.approverId === userId) ??
      false);

    if (
      !isTierApprover &&
      !(await canViewThroughTeam(this.prisma, userId, companyId, request))
    ) {
      throw new ForbiddenException(
        "You do not have access to this exit permit",
      );
    }
  }

  private async assertEditableOwner(
    requestId: string,
    companyId: string,
    userId: string,
  ) {
    const request = await this.prisma.exitPermit.findFirst({
      where: activeOnly({ id: requestId, companyId }),
      select: { id: true, employeeId: true, createdBy: true, status: true },
    });

    if (!request) {
      throw new NotFoundException("Exit permit not found");
    }

    if (!(await this.canActForRequest(request, companyId, userId))) {
      throw new ForbiddenException(
        "Only the employee, HR, or a full-access role can edit this exit permit",
      );
    }

    if (
      request.status !== ExitPermitStatus.DRAFT &&
      request.status !== ExitPermitStatus.RETURNED
    ) {
      throw new ForbiddenException("This request can no longer be edited.");
    }
  }

  /**
   * Resolves the employee a permit belongs to.
   * On-behalf targets follow OnBehalfService rules (HR / full access, department head, discipline lead).
   */
  private async resolveTargetEmployeeId(
    employeeId: string,
    companyId: string,
    userId: string,
  ): Promise<string> {
    await this.assertEmployeeInCompany(employeeId, companyId);
    return this.onBehalfService.resolveTargetEmployeeId(
      userId,
      companyId,
      employeeId,
    );
  }

  private async assertEmployeeInCompany(
    employeeId: string,
    companyId: string,
  ): Promise<void> {
    const employee = await this.prisma.user.findFirst({
      where: activeOnly({ id: employeeId, companyId }),
      select: { id: true },
    });

    if (!employee) {
      throw new NotFoundException("Employee not found");
    }
  }

  private async uploadItemImage(
    request: { id: string; requestNumber: string; attachmentFolderId: string | null },
    companyId: string,
    userId: string,
    file: UploadedFile,
  ){
    if (!ALLOWED_IMAGE_MIME_TYPES.has(file.mimetype)){
        throw new BadRequestException(
            `Only image files are allowed (JPEG, PNG, WebP, GIF). Received: ${file.mimetype}`
        );
    }

    const folderId = request.attachmentFolderId ?? 
    (await this.ensureAttachmentFolder(request, companyId, userId));

    const safeName = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_');
    const fileKey = `${companyId}/hr/exit-permits/${request.id}/items/${randomUUID()}_${safeName}`;

    await this.storage.upload({
        bucket: STORAGE_BUCKETS.HR,
        key: fileKey,
        body: file.buffer,
        contentType: file.mimetype,
        contentLength: file.size,
    });

    const documentId = randomUUID();
    await this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
        await tx.document.create({
            data:{
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
            }
        });

        await tx.documentVersion.create({
            data:{
                documentId,
                uploadedBy: userId,
                versionNumber: 1,
                fileKey,
                fileSizeBytes: file.size,
            }
        });
    });
   return documentId;
  }

  private async ensureAttachmentFolder(
    request: { id: string; requestNumber: string; attachmentFolderId: string | null },
    companyId: string,
    userId: string,
  ) {
    if (request.attachmentFolderId) {
        return request.attachmentFolderId;
    }

    const folderId = randomUUID();
    await this.prisma.$transaction(async (tx: Prisma.TransactionClient ) => {
        await tx.documentFolder.create({
            data: {
                id: folderId,
                companyId,
                name: `Exit Permit ${request.requestNumber}`,
                path: `/hr/exit-permits/${request.requestNumber}`,
                contextType: FolderContextType.EXIT_PERMIT,
                contextId: request.id,
                isSystem: false,
                createdBy: userId,
                updatedBy: userId,
            }
        });
        await tx.exitPermit.update({
            where: {id: request.id},
            data: {attachmentFolderId: folderId, updatedBy: userId},
        });
    });
    return folderId;
  }

  private async uploadRequestFiles(
    request: { id: string; requestNumber: string; attachmentFolderId: string | null },
    files: UploadedFile[],
    companyId: string,
    userId: string,
  ){
    const folderId = request.attachmentFolderId ??
    (await this.ensureAttachmentFolder(request, companyId, userId));

    for (const file of files){
        if (!file?.buffer?.length){
            continue;
        }
        if (!ALLOWED_UPLOAD_MIME_TYPES.has(file.mimetype)){
            throw new BadRequestException(`File type not allowed: ${file.mimetype}`);
        }

        const safeName = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_');
        const fileKey = `${companyId}/hr/exit-permits/${request.id}/${randomUUID()}_${safeName}`;

        await this.storage.upload({
            bucket: STORAGE_BUCKETS.HR,
            key: fileKey,
            body: file.buffer,
            contentType: file.mimetype,
            contentLength: file.size,
        });

        const documentId = randomUUID();
        await this.prisma.$transaction(async (tx: Prisma.TransactionClient) =>{
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
                }
            });
            await tx.documentVersion.create({
                data: {
                    documentId,
                    uploadedBy: userId,
                    versionNumber: 1,
                    fileKey,
                    fileSizeBytes: file.size,
                }
            });
        });
    }

  }

  private normalizeStatuses(
    status: string | undefined,
  ){
    if (!status) return undefined;
    if (status.includes(',')) {
      return status.split(',').map((s) => s.trim() as ExitPermitStatus);
    }
    return [status as ExitPermitStatus];
  }

  private parseDateOnly(value: string): Date {
    const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
    if (!match) {
      throw new BadRequestException('Invalid date format. Expected YYYY-MM-DD');
    }
    return new Date(
      Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])),
    );
  }

  /** Exit permit date: today or future (company timezone). Defaults to today when omitted. */
  private resolveExitPermitDate(value?: string): Date {
    if (!value?.trim()) {
      return startOfToday();
    }
    let date: Date;
    try {
      date = parseLocalDateOnly(value);
    } catch {
      throw new BadRequestException('Invalid date format. Expected YYYY-MM-DD');
    }
    if (isDateInPast(date)) {
      throw new BadRequestException(
        'Exit permit date must be today or a future date',
      );
    }
    return date;
  }

}