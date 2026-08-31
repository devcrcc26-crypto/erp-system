import { Injectable, NotFoundException, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { PrismaService } from "../../../../shared/prisma/prisma.service";
import { ApprovalDecisionRegistry } from "../../../approvals/application/services/approval-decision-registry.service";
import type { ApprovalDecisionListener } from "../../../approvals/application/ports/approval-decision.listener";
import { randomUUID } from "crypto";
import { CreateExitPermitDto, ExitPermitStatus } from "../dtos/exit-permit.dto";
import { endWith } from "rxjs";
import { activeOnly } from "@/shared/prisma/soft-delete.util";
import { PermissionService } from "@/shared/permissions/permission.service";
import { ForbiddenException } from "@nestjs/common";

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


const REQUEST_DETAIL_INCLUDE = {
    employee: { select: USER_SELECT },
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
export class ExitPermitService
    implements OnModuleInit, OnModuleDestroy {

    constructor(
        private readonly prisma: PrismaService,
        private readonly decisionRegistry: ApprovalDecisionRegistry,
        private readonly permissionService: PermissionService,
    ){}

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
    ){
        const requestNumber = await this.nextRequestNumber();

        const request = await this.prisma.exitPermit.create({
            data: {
                id: randomUUID(),
                companyId,
                requestNumber, 
                employeeId: userId,
                departmentId: dto.departmentId ?? null,
                direction: dto.direction,
                date: dto.date ?? new Date(),   
                status: ExitPermitStatus.DRAFT,
                createdBy: userId,
                updatedBy: userId,
            },
        });
        return this.getRequest(request.id, companyId, userId);
    }

    async updateDraft(){}

    async addItem(){}

    async updateItem(){}

    async deleteItem(){}

    async submitRequest(){}

    async getRequest(
        id: string,
        companyId: string,
        userId: string,
    ){
        const request = await this.prisma.exitPermit.findFirst({
            where: activeOnly({id, companyId}),
            include: REQUEST_DETAIL_INCLUDE,
        });

        if (!request) {
            throw new NotFoundException('Exit permit not found');
        }

        await this.assertCanView(request, companyId, userId);

        const pendingTier = request.approvalRequest?.tiers.find(
            (t) => 
                t.tierOrder === request.approvalRequest?.currentTier &&
                t.decision === 'PENDING',
        );

        const { attachmentFolder, ...requestRest } = request;

        return {
            ...requestRest,
            documents: attachmentFolder?.documents ?? [],
            itemCount: request.items.length,
            currentTierLabel: pendingTier?.label ?? null,
        };
    }

    async listRequests(){}

    async cancelRequest(){}

    async onApprovalDecision(){}


    // Private methods

    private async nextRequestNumber(): Promise<string>{
        const result = await this.prisma.$queryRaw<Array<{nextval: bigint}>>`
             SELECT nextval('exit_permit_number_seq')
        `;
        const seq = Number(result[0].nextval);
        return `EP-${String(seq).padStart(4, '0')}`;
    }

    private async assertCanView(
        request: {
            employeeId: string;
            approvalRequest?: { tiers?: Array<{ approverId: string }> } | null;
        },
        companyId: string,
        userId: string,
    ){
        const isHrViewer = await this.permissionService.hasPermission(
            userId,
            companyId,
            'hr',
            'view',
        );

        if (isHrViewer) return;

        const isOwner = request.employeeId === userId;
        const isTierApprover =
            request.approvalRequest?.tiers?.some((t) => t.approverId === userId) ?? false;

        if (!isOwner && !isTierApprover) {
            throw new ForbiddenException(
                'You do not have access to this exit permit',
            );
        }
    }
}