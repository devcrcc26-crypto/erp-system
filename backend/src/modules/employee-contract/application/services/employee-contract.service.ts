import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import { PrismaService } from "@/shared/prisma/prisma.service";
import { activeOnly } from "@/shared/prisma/soft-delete.util";
import { CreateEmployeeContractDto, ListEmployeeContractsDto, TerminateEmployeeContractDto, UpdateEmployeeContractDto } from "../dtos/employee-contract.dtos";
import { EmployeeContractStatus, EmployeeContractType, FolderContextType, Prisma } from "@prisma/client";
import { randomUUID } from "crypto";
import { PermissionService } from "@/shared/permissions/permission.service";
import {
  ALLOWED_UPLOAD_MIME_TYPES,
  STORAGE_BUCKETS,
  STORAGE_SERVICE,
} from "@/shared/storage/storage.constants";
import type { IStorageService } from "@/shared/storage/storage.interface";
import { buildPrismaPagination, PaginatedResult, buildPaginatedResult } from "@/shared/utils/pagination.util";

type UploadedFile = {
  originalname: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
};

const USER_SELECT ={
    id: true,
    firstName: true,
    lastName: true,
    email: true,
} as const;

const CONTRACT_DETAIL_INCLUDE = {
    employee: {select: USER_SELECT},
    creator: {select: USER_SELECT},
    attachmentFolder: {
        include: {
            documents:{
                where: {deletedAt: null, isCurrent: true},
                select: {
                    id: true,
                    name: true,
                    fileKey: true,
                    fileType: true,
                    fileSizeBytes: true,
                },
            },
        },
    },
} as const;

/**
 * Self-service contract view. Whitelists display fields only — pay columns
 * (basicSalary, transportationAllowance, monthlyBonus, netSalary) are never
 * selected, so they cannot reach the client.
 */
const MY_CONTRACT_SELECT = {
    id: true,
    contractNumber: true,
    contractType: true,
    status: true,
    signedAt: true,
    startDate: true,
    endDate: true,
    probationEndDate: true,
    governedBy: true,
} satisfies Prisma.EmployeeContractSelect;

export interface MyActiveContract {
    id: string;
    contractNumber: string;
    contractType: EmployeeContractType;
    status: EmployeeContractStatus;
    signedAt: string;
    startDate: string;
    endDate: string | null;
    probationEndDate: string | null;
    governedBy: string | null;
}

function toDateOnly(value: Date): string {
    return value.toISOString().slice(0, 10);
}

const EXPIRING_SOON_DAYS = 90;

const TERMINAL_STATUSES: EmployeeContractStatus[] = [
    EmployeeContractStatus.TERMINATED,
    EmployeeContractStatus.EXPIRED,
    EmployeeContractStatus.SUPERSEDED,
];

@Injectable()
export class EmployeeContractService {
    private readonly logger = new Logger(EmployeeContractService.name);
    constructor(
        private readonly prisma: PrismaService,
        private readonly permissionService: PermissionService,
        @Inject(STORAGE_SERVICE)
        private readonly storage: IStorageService,
    ){}

    async createContract(
        dto: CreateEmployeeContractDto,
        companyId: string,
        userId: string,
        files: UploadedFile[] = [],
    ){
        await this.assertCanManage(companyId, userId);
        const employee = await this.prisma.user.findFirst({
            where: activeOnly({id: dto.employeeId, companyId}),
            select: {id: true},
        });

        if(!employee){
            throw new NotFoundException('Employee not found');
        }

        const signedAt = this.parseDateOnly(dto.signedAt);
        const startDate = this.parseDateOnly(dto.startDate);
        const endDate = dto.endDate ? this.parseDateOnly(dto.endDate) : null;

        this.validateContractDates(dto.contractType, signedAt, startDate, endDate);

        const activeExisting = await this.prisma.employeeContract.findFirst({
            where: activeOnly({
                companyId,
                employeeId: dto.employeeId,
                status: EmployeeContractStatus.ACTIVE,
            }),
            select: {id: true, contractNumber: true},
        })
        if(activeExisting){
            throw new BadRequestException(
                `Employee already has an active contract (${activeExisting.contractNumber}). Terminate or supersede it first.`,
            )
        }

        const contractNumber = await this.nextContractNumber();
        const id = randomUUID();

        await this.prisma.employeeContract.create({
            data: {
                id,
                companyId,
                contractNumber,
                employeeId: dto.employeeId,
                contractType: dto.contractType,
                status: EmployeeContractStatus.ACTIVE,
                signedAt,
                startDate,
                endDate,
                notes: dto.notes?.trim() || null,
                currency: dto.currency ?? 'ETB',
                basicSalary: this.toDecimal(dto.basicSalary),
                transportationAllowance: this.toDecimal(dto.transportationAllowance),
                monthlyBonus: this.toDecimal(dto.monthlyBonus),
                netSalary: this.toDecimal(dto.netSalary),
                probationEndDate: dto.probationEndDate
                    ? this.parseDateOnly(dto.probationEndDate)
                    : null,
                governedBy: dto.governedBy?.trim() || null,
                createdBy: userId,
                updatedBy: userId,
            }
        })

        if (files.length > 0) {
            await this.attachFiles(id, companyId, userId, files);
        }

        this.logger.log(`Created employee contract ${contractNumber}`);
        return this.getContract(id, companyId, userId);
    }

    /**
     * Uploads supporting documents onto an existing contract.
     */
    async attachContractFiles(
        id: string,
        companyId: string,
        userId: string,
        files: UploadedFile[],
    ) {
        await this.assertCanManage(companyId, userId);
        const contract = await this.prisma.employeeContract.findFirst({
            where: activeOnly({ id, companyId }),
            select: { id: true },
        });
        if (!contract) {
            throw new NotFoundException('Employee contract not found');
        }
        if (files.length === 0) {
            throw new BadRequestException('At least one file is required');
        }
        await this.attachFiles(id, companyId, userId, files);
        return this.getContract(id, companyId, userId);
    }

    /**
     * Soft-deletes a supporting document that belongs to this contract's folder.
     */
    async removeContractAttachment(
        id: string,
        documentId: string,
        companyId: string,
        userId: string,
    ) {
        await this.assertCanManage(companyId, userId);
        const contract = await this.prisma.employeeContract.findFirst({
            where: activeOnly({ id, companyId }),
            select: { id: true, attachmentFolderId: true },
        });
        if (!contract) {
            throw new NotFoundException('Employee contract not found');
        }
        if (!contract.attachmentFolderId) {
            throw new NotFoundException('Attachment not found');
        }

        const document = await this.prisma.document.findFirst({
            where: activeOnly({
                id: documentId,
                companyId,
                folderId: contract.attachmentFolderId,
            }),
            select: { id: true },
        });
        if (!document) {
            throw new NotFoundException('Attachment not found');
        }

        await this.prisma.document.update({
            where: { id: documentId },
            data: {
                deletedAt: new Date(),
                deletedBy: userId,
            },
        });

        return this.getContract(id, companyId, userId);
    }

    async listContracts(
        filters: ListEmployeeContractsDto,
        companyId: string,
        userId: string,
    ){
        const where = await this.buildListWhere(filters, companyId, userId, false);
        return this.fetchPaginatedContracts(filters, where);
    }
      /** Lists contracts for the current user only. */
    async listMyContracts(
        filters: ListEmployeeContractsDto,
        companyId: string,
        userId: string,
    ): Promise<PaginatedResult<unknown>> {
        const where = await this.buildListWhere(filters, companyId, userId, true);
        return this.fetchPaginatedContracts(filters, where);
    }

    async getContract(
        id: string,
        companyId: string,
        userId: string,
    ){
        const contract =  await this.prisma.employeeContract.findFirst({
            where: activeOnly({id, companyId}),
            include: CONTRACT_DETAIL_INCLUDE,
        });

        if(!contract){
            throw new NotFoundException('Employee contract not found');
        }

        await this.assertCanView(contract, companyId, userId);
        return this.toContractResponse(
          contract as unknown as Record<string, unknown>,
        );
    }

    /**
     * The signed-in employee's current ACTIVE contract (any authenticated user).
     * Returns `{ contract: null }` when there is none. Never includes pay data.
     */
    async getMyActiveContract(
        companyId: string,
        userId: string,
    ): Promise<{ contract: MyActiveContract | null }> {
        const contract = await this.prisma.employeeContract.findFirst({
            where: activeOnly({
                companyId,
                employeeId: userId,
                status: EmployeeContractStatus.ACTIVE,
            }),
            orderBy: { startDate: 'desc' },
            select: MY_CONTRACT_SELECT,
        });

        if (!contract) {
            return { contract: null };
        }

        return {
            contract: {
                id: contract.id,
                contractNumber: contract.contractNumber,
                contractType: contract.contractType,
                status: contract.status,
                signedAt: toDateOnly(contract.signedAt),
                startDate: toDateOnly(contract.startDate),
                endDate: contract.endDate ? toDateOnly(contract.endDate) : null,
                probationEndDate: contract.probationEndDate
                    ? toDateOnly(contract.probationEndDate)
                    : null,
                governedBy: contract.governedBy,
            },
        };
    }

    async updateContract(
        id: string,
        dto: UpdateEmployeeContractDto,
        companyId: string,
        userId: string,
    ): Promise<unknown>{
        await this.assertCanManage(companyId, userId);
        const contract = await this.prisma.employeeContract.findFirst({
            where: activeOnly({id, companyId}),
        })
        if(!contract){
            throw new NotFoundException('Employee contract not found');
        }

        if (TERMINAL_STATUSES.includes(contract.status)){
            throw new BadRequestException(
                `Cannot update a ${contract.status.toLowerCase()} contract`,
            );
        }

        const contractType = dto.contractType ?? contract.contractType;
        const signedAt = dto.signedAt
        ? this.parseDateOnly(dto.signedAt)
        : contract.signedAt;
        const startDate = dto.startDate
        ? this.parseDateOnly(dto.startDate)
        : contract.startDate;
        const endDate = dto.endDate !== undefined
        ? dto.endDate ? this.parseDateOnly(dto.endDate) : null
        : contract.endDate;

        this.validateContractDates(contractType, signedAt, startDate, endDate);

        await this.prisma.employeeContract.update({
            where: {id},
            data : {
                ...(dto.contractType !== undefined ? {contractType: dto.contractType} : {}),
                ...(dto.signedAt !== undefined ? {signedAt} : {}),
                ...(dto.startDate !== undefined ? {startDate} : {}),
                ...(dto.endDate !== undefined ? {endDate} : {}),
                ...(dto.notes !== undefined
                    ? { notes: dto.notes == null ? null : dto.notes.trim() || null }
                    : {}),
                ...(dto.currency !== undefined ? { currency: dto.currency } : {}),
                ...(dto.basicSalary !== undefined
                    ? { basicSalary: this.toDecimal(dto.basicSalary) }
                    : {}),
                ...(dto.transportationAllowance !== undefined
                    ? { transportationAllowance: this.toDecimal(dto.transportationAllowance) }
                    : {}),
                ...(dto.monthlyBonus !== undefined
                    ? { monthlyBonus: this.toDecimal(dto.monthlyBonus) }
                    : {}),
                ...(dto.netSalary !== undefined
                    ? { netSalary: this.toDecimal(dto.netSalary) }
                    : {}),
                ...(dto.probationEndDate !== undefined
                    ? {
                        probationEndDate: dto.probationEndDate
                            ? this.parseDateOnly(dto.probationEndDate)
                            : null,
                    }
                    : {}),
                ...(dto.governedBy !== undefined
                    ? {
                        governedBy:
                          dto.governedBy == null
                            ? null
                            : dto.governedBy.trim() || null,
                      }
                    : {}),
                updatedBy: userId,
            }
        });

        return this.getContract(id, companyId, userId);
    }

    async terminateContract(
        id: string,
        userId: string,
        companyId: string,
        dto: TerminateEmployeeContractDto,
    ){
        await this.assertCanManage(companyId, userId);

        const contract = await this.prisma.employeeContract.findFirst({
            where: activeOnly({id, companyId}),
        });

        if(!contract){
            throw new NotFoundException('Employee contract not found');
        }
        if(contract.status !== EmployeeContractStatus.ACTIVE){
            throw new BadRequestException(
                'Only active contracts can be terminated',
            );
        }
        const terminatedAt = dto.terminatedAt
        ? this.parseDateOnly(dto.terminatedAt)
        : this.todayUtc();
        await this.prisma.employeeContract.update({
            where: {id},
            data: {
                status: EmployeeContractStatus.TERMINATED,
                terminatedAt,
                terminationReason: dto.terminationReason.trim() || null,
                updatedBy: userId,
            }
        });
        this.logger.log(`Terminated employee contract ${contract.contractNumber}`);
        return this.getContract(id, companyId, userId);
    }

    async deleteContract(
        id: string,
        companyId: string,
        userId: string,
    ): Promise<void>{

        await this.assertCanManage(companyId, userId);

        const contract = await this.prisma.employeeContract.findFirst({
            where: activeOnly({id, companyId}),
        });
        if(!contract){
            throw new NotFoundException('Employee contract not found');
        }
        if(contract.status !== EmployeeContractStatus.ACTIVE){
            throw new BadRequestException(
                'Only active contracts can be deleted');
        }
        const now = new Date();
        await this.prisma.employeeContract.update({
            where: {id},
            data: {
                deletedAt: now,
                deletedBy: userId,
                updatedBy: userId,
            }
        });
        this.logger.log(`Deleted employee contract ${contract.contractNumber}`);
    }


    //----------- Private helpers -----------------------

    private parseDateOnly(value: string): Date {
        const match  = /^(\d{4})-(\d{2})-(\d{2})/.exec(value)
        if(!match){
            throw new BadRequestException(`Invalid date: ${value}`);
        }
        return new Date(
            Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])),
        );
    }

    private toDecimal(value?: number): Prisma.Decimal | null {
        if (value === undefined || value === null) {
            return null;
        }
        return new Prisma.Decimal(value);
    }

    private validateContractDates(
        contractType: EmployeeContractType,
        signedAt: Date,
        startDate: Date,
        endDate: Date | null,
    ): void {
        if(contractType === EmployeeContractType.OPEN_ENDED && endDate){
            throw new BadRequestException(
                'Open-ended contracts must not have an end date',
            )
        }

        if(
            contractType !== EmployeeContractType.OPEN_ENDED && !endDate
        ){
            throw new BadRequestException(
                'End date is required for this contract type',
            )
        }

        if(endDate && endDate < startDate){
            throw new BadRequestException('End date must be on or after start date');
        }

        if(startDate < signedAt){
            throw new BadRequestException('Start date must be on or after signing date');
        }
    }

    private async nextContractNumber(): Promise<string>{
        const result =  await this.prisma.$queryRaw<Array<{nextval: bigint}>>`
            SELECT nextval('employee_contract_number_seq')
        `;
        const seq = Number(result[0].nextval);
        return `EC-${String(seq).padStart(4, '0')}`;
    }

    private async assertCanView(
        contract: {employeeId: string},
        companyId: string,
        userId: string,
    ): Promise<void>{
        const isHrViewer = await this.permissionService.hasPermission(
            userId,
            companyId,
            'hr',
            'view',
        );

        if(isHrViewer || contract.employeeId === userId){
            return;
        }
        throw new ForbiddenException(
            'You do not have access to this employee contract',
        );
    }

    private async buildListWhere(
        filters: ListEmployeeContractsDto,
        companyId: string,
        userId: string,
        forceOwn: boolean,
    ): Promise<Prisma.EmployeeContractWhereInput>{
        const isHrViewer = await this.permissionService.hasPermission(
            userId,
            companyId,
            'hr',
            'view',
        );

        const statuses = this.normalizeStatuses(filters.status);
        const  expiringCutoff = this.addDays(this.todayUtc(), EXPIRING_SOON_DAYS);

        return {
            companyId,
            deletedAt: null,
            ...(forceOwn || !isHrViewer ? { employeeId: userId } : {}),
            ...(isHrViewer && !forceOwn && filters.employeeId
                ? { employeeId: filters.employeeId }
                : {}),
            ...(statuses ? { status: { in: statuses } } : {}),
            ...(filters.contractType ? { contractType: filters.contractType } : {}),
            ...(filters.expiringSoon
                ? {
                    status: EmployeeContractStatus.ACTIVE,
                    endDate: { lte: expiringCutoff, not: null },
                }
                : {}),
            ...(filters.search?.trim()
                ? {
                    OR: [
                        {
                            contractNumber: {
                                contains: filters.search.trim(),
                                mode: 'insensitive',
                            },
                        },
                        {
                            employee: {
                                OR: [
                                    {
                                        firstName: {
                                            contains: filters.search.trim(),
                                            mode: 'insensitive',
                                        },
                                    },
                                    {
                                        lastName: {
                                            contains: filters.search.trim(),
                                            mode: 'insensitive',
                                        },
                                    },
                                ],
                            },
                        },
                    ],
                }
                : {}),
        };
    }
    

    private normalizeStatuses(
        status:
        | EmployeeContractStatus
        | EmployeeContractStatus[]
        | string
        | undefined,
    ){
        if (!status) return undefined;
        if (Array.isArray(status)) return status;

        if (typeof status === 'string' && status.includes(',')){
            return status
            .split(',')
            .map((s) => s.trim())
            .filter(Boolean) as EmployeeContractStatus[];
        }
        return [status as EmployeeContractStatus];
    }

    private todayUtc(): Date{
        const now = new Date();
        return new Date(
            Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
        );
    }
    private addDays(date: Date, days: number): Date{
        const result = new Date(date);
        result.setUTCDate(result.getUTCDate() + days);
        return result;
    }

    private async fetchPaginatedContracts(
        filters: ListEmployeeContractsDto,
        where: Prisma.EmployeeContractWhereInput,
    ): Promise<PaginatedResult<unknown>>{
        const page = filters.page ?? 1;
        const limit = filters.limit ?? 20;
        const {skip, take} = buildPrismaPagination(page, limit);
    
        const [rows, total] = await Promise.all([
            this.prisma.employeeContract.findMany({
                where,
                skip,
                take,
                orderBy: {createdAt: 'desc'},
                include: {
                    employee: {select: USER_SELECT},
                },
            }),
            this.prisma.employeeContract.count({where}),
        ]);
        return buildPaginatedResult(
            rows.map((row) =>
              this.toContractResponse(row as unknown as Record<string, unknown>),
            ),
            total,
            page,
            limit,
        );
    }

    /**
     * Serializes contract rows for the API (date-only strings, numeric pay fields).
     */
    private toContractResponse<T extends Record<string, unknown>>(
        contract: T,
    ): Record<string, unknown> {
        const decimalFields = [
            'basicSalary',
            'transportationAllowance',
            'monthlyBonus',
            'netSalary',
        ] as const;
        const dateFields = [
            'signedAt',
            'startDate',
            'endDate',
            'probationEndDate',
            'terminatedAt',
            'lastWarnedAt',
        ] as const;

        const result: Record<string, unknown> = { ...contract };

        for (const field of dateFields) {
            const value = result[field];
            if (value instanceof Date) {
                result[field] = toDateOnly(value);
            } else if (value == null) {
                result[field] = null;
            }
        }

        for (const field of decimalFields) {
            const value = result[field];
            if (value == null) {
                result[field] = null;
            } else if (
                typeof value === 'object' &&
                value !== null &&
                'toNumber' in value &&
                typeof (value as { toNumber: () => number }).toNumber === 'function'
            ) {
                result[field] = (value as { toNumber: () => number }).toNumber();
            } else if (
                typeof value === 'string' ||
                typeof value === 'number'
            ) {
                result[field] = Number(value);
            }
        }

        if (result.createdAt instanceof Date) {
            result.createdAt = (result.createdAt as Date).toISOString();
        }
        if (result.updatedAt instanceof Date) {
            result.updatedAt = (result.updatedAt as Date).toISOString();
        }

        return result;
    }

    /**
     * Creates attachment folder (if needed) and uploads files to erp-hr.
     */
    private async attachFiles(
        contractId: string,
        companyId: string,
        userId: string,
        files: UploadedFile[],
    ): Promise<void> {
        const contract = await this.prisma.employeeContract.findFirst({
            where: activeOnly({ id: contractId, companyId }),
            select: {
                id: true,
                contractNumber: true,
                attachmentFolderId: true,
            },
        });
        if (!contract) {
            throw new NotFoundException('Employee contract not found');
        }

        const folderId =
            contract.attachmentFolderId ??
            (await this.ensureAttachmentFolder(contract, companyId, userId));

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
            const fileKey = `${companyId}/hr/employee-contracts/${contractId}/attachments/${safeName}`;

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

    private async ensureAttachmentFolder(
        contract: {
            id: string;
            contractNumber: string;
            attachmentFolderId: string | null;
        },
        companyId: string,
        userId: string,
    ): Promise<string> {
        if (contract.attachmentFolderId) {
            return contract.attachmentFolderId;
        }

        const folderId = randomUUID();
        await this.prisma.$transaction(async (tx) => {
            await tx.documentFolder.create({
                data: {
                    id: folderId,
                    companyId,
                    name: `Contract ${contract.contractNumber}`,
                    path: `/hr/employee-contracts/${contract.contractNumber}`,
                    contextType: FolderContextType.EMPLOYEE_CONTRACT,
                    contextId: contract.id,
                    isSystem: false,
                    createdBy: userId,
                    updatedBy: userId,
                },
            });
            await tx.employeeContract.update({
                where: { id: contract.id },
                data: {
                    attachmentFolderId: folderId,
                    updatedBy: userId,
                },
            });
        });

        return folderId;
    }

    private async assertCanManage(
        companyId: string,
        userId: string,
    ): Promise<void>{
        const canManage = 
        (await this.permissionService.hasPermission(
            userId,
            companyId,
            'hr',
            'view'
        ))  || 
        (await this.permissionService.hasPermission(
            userId,
            companyId,
            'employee-contract',
            'create',
        )) || 
        (await this.permissionService.hasPermission(
            userId,
            companyId,
            'employee-contract',
            'edit',
        ));
        if(!canManage){
            throw new ForbiddenException('You do not have permission to manage employee contracts');
        }
    }
}
