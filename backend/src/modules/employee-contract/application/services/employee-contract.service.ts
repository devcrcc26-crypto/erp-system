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
import {
    canViewThroughTeam,
    resolveTeamScopedEmployeeIds,
    teamScopeWhere,
} from "@/shared/org/team-scope.util";
import { loadPolicySnapshot } from "@/shared/policy/policy-reader.util";
import { todayInAddisUtc } from "@/shared/employment/separation-dates.util";
import {
  CreateEmployeeContractDto,
  ListEmployeeContractsDto,
  BonusFromNetDto,
  RenewalPreviewQueryDto,
  SalaryPreviewDto,
  TerminateEmployeeContractDto,
  UpdateEmployeeContractDto,
} from "../dtos/employee-contract.dtos";
import {
  EmployeeContractStatus,
  EmployeeContractType,
  FolderContextType,
  Prisma,
  SupportedCurrency,
} from "@prisma/client";
import { randomUUID } from "crypto";
import { PermissionService } from "@/shared/permissions/permission.service";
import {
  ALLOWED_UPLOAD_MIME_TYPES,
  STORAGE_BUCKETS,
  STORAGE_SERVICE,
} from "@/shared/storage/storage.constants";
import type { IStorageService } from "@/shared/storage/storage.interface";
import { buildPrismaPagination, PaginatedResult, buildPaginatedResult } from "@/shared/utils/pagination.util";
import { PayrollCalculationService } from "@/modules/payroll/application/services/payroll-calculation.service";
import {
  LeaveLedgerService,
  type RenewalLeavePreview,
} from "@/modules/leave-policy/application/services/leave-ledger.service";

type UploadedFile = {
  originalname: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
};

const DEFAULT_TAXABLE_THRESHOLD = 2200;

const USER_SELECT = {
    id: true,
    firstName: true,
    middleName: true,
    lastName: true,
    chineseName: true,
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
 * Self-service contract view for the signed-in employee. Includes their own
 * pay amounts (basic, transport, bonus) so My Profile → Contract can show them.
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
    currency: true,
    basicSalary: true,
    transportationAllowance: true,
    monthlyBonus: true,
    monthlyNetBonus: true,
    pensionApplicable: true,
    taxApplicable: true,
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
    currency: string;
    basicSalary: number | null;
    transportationAllowance: number | null;
    monthlyBonus: number | null;
    monthlyNetBonus: number | null;
    pensionApplicable: boolean;
    taxApplicable: boolean;
}

function toDateOnly(value: Date): string {
    return value.toISOString().slice(0, 10);
}

/** Subtract one calendar day from a @db.Date value (UTC). */
function dayBefore(date: Date): Date {
    const next = new Date(date.getTime());
    next.setUTCDate(next.getUTCDate() - 1);
    return next;
}

const EXPIRING_SOON_DAYS = 90;

const TERMINAL_STATUSES: EmployeeContractStatus[] = [
    EmployeeContractStatus.TERMINATED,
    EmployeeContractStatus.EXPIRED,
    EmployeeContractStatus.SUPERSEDED,
];

const ZERO_OT = {
    normalHours: 0,
    eveningHours: 0,
    sundayHours: 0,
    holidayHours: 0,
};

@Injectable()
export class EmployeeContractService {
    private readonly logger = new Logger(EmployeeContractService.name);
    constructor(
        private readonly prisma: PrismaService,
        private readonly permissionService: PermissionService,
        private readonly payrollCalc: PayrollCalculationService,
        @Inject(STORAGE_SERVICE)
        private readonly storage: IStorageService,
        private readonly leaveLedger: LeaveLedgerService,
    ){}

    /**
     * Leave ledger hook: the contract's start date opens a new leave year
     * (carry-over from the previous contract + entitlement; idempotent). A
     * failure here never blocks the contract change.
     */
    private async syncLeaveLedger(
        contractId: string,
        userId: string,
        mode: 'activated' | 'recompute',
    ): Promise<void> {
        try {
            if (mode === 'activated') {
                await this.leaveLedger.onContractActivated(contractId, userId);
            } else {
                await this.leaveLedger.recomputeContractEntries(contractId, userId);
            }
        } catch (error: unknown) {
            this.logger.error(
                `Leave ledger sync failed for contract ${contractId}`,
                error instanceof Error ? error.stack : String(error),
            );
        }
    }

    async createContract(
        dto: CreateEmployeeContractDto,
        companyId: string,
        userId: string,
        files: UploadedFile[] = [],
    ){
        await this.assertCanManage(companyId, userId);
        const employee = await this.prisma.user.findFirst({
            where: activeOnly({id: dto.employeeId, companyId}),
            select: {id: true, employeeType: true},
        });

        if(!employee){
            throw new NotFoundException('Employee not found');
        }
        // Freelancers always pay pension; everyone else defaults to it unless HR opts out.
        const pensionApplicable =
            employee.employeeType === 'FREELANCER' ? true : (dto.pensionApplicable ?? true);

        const signedAt = this.parseDateOnly(dto.signedAt);
        const startDate = this.parseDateOnly(dto.startDate);
        const endDate = dto.endDate ? this.parseDateOnly(dto.endDate) : null;

        this.validateContractDates(dto.contractType, signedAt, startDate, endDate);

        const salary = this.resolveSalaryFields({
            basicSalary: dto.basicSalary ?? 0,
            transportationAllowance: dto.transportationAllowance ?? 0,
            monthlyBonus: dto.monthlyBonus ?? 0,
            monthlyNetBonus: dto.monthlyNetBonus ?? 0,
            pensionApplicable,
            taxApplicable: dto.taxApplicable ?? true,
        });

        const activeExisting = await this.prisma.employeeContract.findFirst({
            where: activeOnly({
                companyId,
                employeeId: dto.employeeId,
                status: EmployeeContractStatus.ACTIVE,
            }),
            select: {id: true, contractNumber: true, startDate: true},
        })

        if (activeExisting) {
            if (startDate.getTime() <= activeExisting.startDate.getTime()) {
                throw new BadRequestException(
                    `New contract start date must be after the active contract's start date (${toDateOnly(activeExisting.startDate)})`,
                );
            }
        }

        const contractNumber = await this.nextContractNumber();
        const id = randomUUID();

        await this.prisma.$transaction(async (tx) => {
            if (activeExisting) {
                await tx.employeeContract.update({
                    where: { id: activeExisting.id },
                    data: {
                        status: EmployeeContractStatus.SUPERSEDED,
                        endDate: dayBefore(startDate),
                        updatedBy: userId,
                    },
                });
            }

            await tx.employeeContract.create({
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
                    currency: SupportedCurrency.ETB,
                    pensionApplicable: salary.pensionApplicable,
                    taxApplicable: salary.taxApplicable,
                    basicSalary: this.toDecimal(salary.basicSalary),
                    transportationAllowance: this.toDecimal(
                        salary.transportationAllowance,
                    ),
                    monthlyBonus: this.toDecimal(salary.monthlyBonus),
                    monthlyNetBonus:
                        this.toDecimal(salary.monthlyNetBonus) ??
                        new Prisma.Decimal(0),
                    probationEndDate: dto.probationEndDate
                        ? this.parseDateOnly(dto.probationEndDate)
                        : null,
                    governedBy: dto.governedBy?.trim() || null,
                    createdBy: userId,
                    updatedBy: userId,
                },
            });
        });

        if (files.length > 0) {
            await this.attachFiles(id, companyId, userId, files);
        }

        await this.syncLeaveLedger(id, userId, 'activated');

        this.logger.log(`Created employee contract ${contractNumber}`);
        return this.getContract(id, companyId, userId);
    }

    /**
     * Annual leave effect of a new contract (carry-forward, entitlement) using
     * the ledger's own renewal rules. Read-only.
     */
    async previewRenewal(
        dto: RenewalPreviewQueryDto,
        companyId: string,
        userId: string,
    ): Promise<RenewalLeavePreview> {
        await this.assertCanManage(companyId, userId);
        return this.leaveLedger.previewRenewal(
            dto.employeeId,
            companyId,
            this.parseDateOnly(dto.startDate),
        );
    }

    /**
     * Live salary preview for a normal month (gross inputs, 0 absent, 0 OT).
     */
    async previewSalary(
        dto: SalaryPreviewDto,
        companyId: string,
        userId: string,
    ): Promise<Record<string, unknown>> {
        await this.assertCanManage(companyId, userId);
        // A salary preview shows this month's pay, so it uses this month's policy.
        const policy = await loadPolicySnapshot(this.prisma, companyId, todayInAddisUtc());

        const threshold = dto.taxableThreshold ?? DEFAULT_TAXABLE_THRESHOLD;
        const pensionApplicable = dto.pensionApplicable ?? true;
        const taxApplicable = dto.taxApplicable ?? true;
        const basicSalary = dto.basicSalary;
        const transportationAllowance = dto.transportationAllowance ?? 0;
        const monthlyBonus = dto.monthlyBonus ?? 0;
        const monthlyNetBonus = dto.monthlyNetBonus ?? 0;

        const result = this.payrollCalc.calculate({
            basicSalary,
            transportAllowance: transportationAllowance,
            monthlyBonus,
            bonusTopUp: 0,
            contractNetBonus: monthlyNetBonus,
            netTopUp: 0,
            payrollDays: 30,
            overtimeHours: ZERO_OT,
            taxableThreshold: threshold,
            pensionApplicable,
            taxApplicable,
            policy,
        });

        return {
            basicSalary,
            transportationAllowance,
            monthlyBonus,
            monthlyNetBonus,
            pensionApplicable,
            taxApplicable,
            taxableThreshold: threshold,
            earnedSalary: result.earnedSalary,
            taxableTransport: result.taxableTransport,
            nonTaxableTransport: result.nonTaxableTransport,
            taxableIncome: result.taxableIncome,
            grossIncome: result.grossIncome,
            incomeTax: result.incomeTax,
            pensionEmployee: result.pensionEmployee,
            pensionEmployer: result.pensionEmployer,
            totalDeductions: result.totalDeductions,
            totalNetBonus: result.totalNetBonus,
            netPay: result.netPay,
        };
    }

    /**
     * Solves monthly bonus for a target net. Calculator only - nothing is stored.
     */
    async bonusFromNet(
        dto: BonusFromNetDto,
        companyId: string,
        userId: string,
    ): Promise<{ monthlyBonus: number }> {
        await this.assertCanManage(companyId, userId);
        const policy = await loadPolicySnapshot(this.prisma, companyId, todayInAddisUtc());

        const monthlyBonus = this.payrollCalc.solveBonusForNet({
            basicSalary: dto.basicSalary,
            transportAllowance: dto.transportationAllowance ?? 0,
            targetNet: dto.targetNet,
            taxableThreshold: dto.taxableThreshold ?? DEFAULT_TAXABLE_THRESHOLD,
            pensionApplicable: dto.pensionApplicable ?? true,
            taxApplicable: dto.taxApplicable ?? true,
            policy,
        });

        return { monthlyBonus };
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
     * The signed-in employee's contract for My Profile (any authenticated user).
     * Defaults to the ACTIVE contract; pass `contractId` to load another of
     * their own contracts (e.g. from the contract-period filter).
     */
    async getMyActiveContract(
        companyId: string,
        userId: string,
        contractId?: string,
    ): Promise<{ contract: MyActiveContract | null }> {
        const contract = await this.prisma.employeeContract.findFirst({
            where: activeOnly({
                companyId,
                employeeId: userId,
                ...(contractId
                    ? { id: contractId }
                    : { status: EmployeeContractStatus.ACTIVE }),
            }),
            orderBy: { startDate: 'desc' },
            select: MY_CONTRACT_SELECT,
        });

        if (!contract) {
            return { contract: null };
        }

        return {
            contract: this.mapMyContract(contract),
        };
    }

    private mapMyContract(
        contract: {
            id: string;
            contractNumber: string;
            contractType: EmployeeContractType;
            status: EmployeeContractStatus;
            signedAt: Date;
            startDate: Date;
            endDate: Date | null;
            probationEndDate: Date | null;
            governedBy: string | null;
            currency: string;
            basicSalary: Prisma.Decimal | null;
            transportationAllowance: Prisma.Decimal | null;
            monthlyBonus: Prisma.Decimal | null;
            monthlyNetBonus: Prisma.Decimal | null;
            pensionApplicable: boolean;
            taxApplicable: boolean;
        },
    ): MyActiveContract {
        const money = (value: Prisma.Decimal | null): number | null =>
            value == null ? null : Number(value);
        return {
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
            currency: contract.currency,
            basicSalary: money(contract.basicSalary),
            transportationAllowance: money(contract.transportationAllowance),
            monthlyBonus: money(contract.monthlyBonus),
            monthlyNetBonus: money(contract.monthlyNetBonus),
            pensionApplicable: contract.pensionApplicable,
            taxApplicable: contract.taxApplicable,
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

        const salaryTouched =
            dto.basicSalary !== undefined ||
            dto.transportationAllowance !== undefined ||
            dto.monthlyBonus !== undefined ||
            dto.monthlyNetBonus !== undefined ||
            dto.pensionApplicable !== undefined ||
            dto.taxApplicable !== undefined;

        // Freelancers always pay pension, so their contracts cannot opt out.
        const freelancer =
            salaryTouched &&
            (
                await this.prisma.user.findFirst({
                    where: {id: contract.employeeId, companyId},
                    select: {employeeType: true},
                })
            )?.employeeType === 'FREELANCER';

        const salary = salaryTouched
            ? this.resolveSalaryFields({
                  basicSalary:
                      dto.basicSalary ??
                      this.payrollCalc.toNumber(contract.basicSalary),
                  transportationAllowance:
                      dto.transportationAllowance ??
                      this.payrollCalc.toNumber(
                          contract.transportationAllowance,
                      ),
                  monthlyBonus:
                      dto.monthlyBonus ??
                      this.payrollCalc.toNumber(contract.monthlyBonus),
                  monthlyNetBonus:
                      dto.monthlyNetBonus ??
                      this.payrollCalc.toNumber(contract.monthlyNetBonus),
                  pensionApplicable:
                      freelancer || (dto.pensionApplicable ?? contract.pensionApplicable),
                  taxApplicable: dto.taxApplicable ?? contract.taxApplicable,
              })
            : null;

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
                currency: SupportedCurrency.ETB,
                ...(salary
                    ? {
                          pensionApplicable: salary.pensionApplicable,
                          taxApplicable: salary.taxApplicable,
                          basicSalary: this.toDecimal(salary.basicSalary),
                          transportationAllowance: this.toDecimal(
                              salary.transportationAllowance,
                          ),
                          monthlyBonus: this.toDecimal(salary.monthlyBonus),
                          monthlyNetBonus:
                              this.toDecimal(salary.monthlyNetBonus) ??
                              new Prisma.Decimal(0),
                      }
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

        // Back-dated / moved start: recompute only entries this contract generated.
        if (startDate.getTime() !== contract.startDate.getTime()) {
            await this.syncLeaveLedger(id, userId, 'recompute');
        }

        return this.getContract(id, companyId, userId);
    }

    /**
     * Terminate an ACTIVE contract, or amend termination date/reason on a
     * TERMINATED one (HR correcting a wrong date). endDate stays aligned with
     * terminatedAt so payroll and attendance stop on that day.
     */
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
        const amending = contract.status === EmployeeContractStatus.TERMINATED;
        if (
            !amending &&
            contract.status !== EmployeeContractStatus.ACTIVE
        ) {
            throw new BadRequestException(
                'Only active contracts can be terminated',
            );
        }
        const terminatedAt = dto.terminatedAt
        ? this.parseDateOnly(dto.terminatedAt)
        : amending && contract.terminatedAt
          ? contract.terminatedAt
          : this.todayUtc();
        if (terminatedAt.getTime() < contract.startDate.getTime()) {
            throw new BadRequestException(
                `Termination date cannot be before the contract start (${toDateOnly(contract.startDate)})`,
            );
        }
        // First terminate: do not go past the planned end. Amend skips this —
        // endDate already equals the previous termination date.
        if (
            !amending &&
            contract.endDate &&
            terminatedAt.getTime() > contract.endDate.getTime()
        ) {
            throw new BadRequestException(
                `Termination date cannot be after the contract end (${toDateOnly(contract.endDate)})`,
            );
        }
        // Prefer the original planned end from a linked separation when amending.
        if (amending) {
            const linked = await this.prisma.employmentPeriod.findFirst({
                where: {
                    separationContractId: id,
                    separationContractPrevEndDate: { not: null },
                },
                orderBy: { startDate: 'desc' },
                select: { separationContractPrevEndDate: true },
            });
            const plannedEnd = linked?.separationContractPrevEndDate;
            if (
                plannedEnd &&
                terminatedAt.getTime() > plannedEnd.getTime()
            ) {
                throw new BadRequestException(
                    `Termination date cannot be after the contract end (${toDateOnly(plannedEnd)})`,
                );
            }
        }

        await this.prisma.$transaction(async (tx) => {
            await tx.employeeContract.update({
                where: {id},
                data: {
                    status: EmployeeContractStatus.TERMINATED,
                    terminatedAt,
                    endDate: terminatedAt,
                    terminationReason: dto.terminationReason.trim() || null,
                    updatedBy: userId,
                },
            });
            // Keep employment leaving date in sync when this contract ended a separation.
            await tx.employmentPeriod.updateMany({
                where: { separationContractId: id },
                data: { endDate: terminatedAt },
            });
        });
        this.logger.log(
            amending
                ? `Updated termination date on employee contract ${contract.contractNumber}`
                : `Terminated employee contract ${contract.contractNumber}`,
        );
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
        await this.syncLeaveLedger(id, userId, 'recompute');
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

    /**
     * Company-wide contract access. employee-contract.view is granted to every
     * role (for My Profile), so it cannot mean "HR": HR is hr.view or
     * employee-contract.create.
     */
    private async isContractHr(userId: string, companyId: string): Promise<boolean> {
        return (
            (await this.permissionService.hasPermission(userId, companyId, 'hr', 'view')) ||
            (await this.permissionService.hasPermission(
                userId,
                companyId,
                'employee-contract',
                'create',
            ))
        );
    }

    private async assertCanView(
        contract: {employeeId: string; status: string},
        companyId: string,
        userId: string,
    ): Promise<void>{
        if (contract.employeeId === userId || (await this.isContractHr(userId, companyId))) {
            return;
        }
        // Supervisors may read (never change) their reports' contracts.
        if (await canViewThroughTeam(this.prisma, userId, companyId, contract)) {
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
        const isHrViewer = !forceOwn && (await this.isContractHr(userId, companyId));
        // Supervisors: own contracts plus their reports' (not drafts).
        const teamScope =
            forceOwn || isHrViewer
                ? null
                : teamScopeWhere(
                    userId,
                    await resolveTeamScopedEmployeeIds(this.prisma, userId, companyId),
                    filters.employeeId,
                    ['DRAFT'],
                );

        const statuses = this.normalizeStatuses(filters.status);
        const  expiringCutoff = this.addDays(this.todayUtc(), EXPIRING_SOON_DAYS);

        return {
            companyId,
            deletedAt: null,
            ...(forceOwn ? { employeeId: userId } : {}),
            ...(teamScope ? { AND: [teamScope] } : {}),
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
            'monthlyNetBonus',
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

    /**
     * Normalises gross pay fields for storage. Bonus is always what HR enters
     * (default 0). Net is never computed or stored on the contract.
     */
    private resolveSalaryFields(input: {
        basicSalary: number;
        transportationAllowance: number;
        monthlyBonus: number;
        monthlyNetBonus: number;
        pensionApplicable: boolean;
        taxApplicable: boolean;
    }): {
        basicSalary: number;
        transportationAllowance: number;
        monthlyBonus: number;
        monthlyNetBonus: number;
        pensionApplicable: boolean;
        taxApplicable: boolean;
    } {
        return {
            basicSalary: input.basicSalary,
            transportationAllowance: input.transportationAllowance,
            monthlyBonus: input.monthlyBonus ?? 0,
            monthlyNetBonus: input.monthlyNetBonus ?? 0,
            pensionApplicable: input.pensionApplicable,
            taxApplicable: input.taxApplicable,
        };
    }
}
