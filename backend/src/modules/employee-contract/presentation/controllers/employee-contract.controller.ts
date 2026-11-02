import {
    BadRequestException,
    Controller,
    Body,
    Post,
    Patch,
    Query,
    Get,
    Param,
    Delete,
    UseGuards,
    UseInterceptors,
    UploadedFiles,
} from "@nestjs/common";
import { FilesInterceptor } from "@nestjs/platform-express";
import { memoryStorage } from "multer";
import { ApiBearerAuth, ApiBody, ApiConsumes, ApiOperation, ApiTags } from "@nestjs/swagger";
import { plainToInstance } from "class-transformer";
import { validate } from "class-validator";
import {
    CreateEmployeeContractDto,
    ListEmployeeContractsDto,
    BonusFromNetDto,
    RenewalPreviewQueryDto,
    SalaryPreviewDto,
    TerminateEmployeeContractDto,
    UpdateEmployeeContractDto,
} from "../../application/dtos/employee-contract.dtos";
import { EmployeeContractService } from "../../application/services/employee-contract.service";
import { CurrentUser } from "@/shared/decorators/current-user.decorator";
import { AuthenticatedUser } from "@/shared/types/jwt-payload.type";
import { CurrentCompany } from "@/shared/decorators/current-company.decorator";
import { DelegatePermissionCheck } from "@/shared/permissions/delegate-permission-check.decorator";
import { RequireAnyPermission } from "@/shared/permissions/require-any-permission.decorator";
import { PermissionsGuard } from "@/shared/permissions/permissions.guard";

async function parseDto<T extends object>(
    cls: new () => T,
    body: Record<string, unknown>,
): Promise<T> {
    const dto = plainToInstance(cls, body);
    const errors = await validate(dto, {
        whitelist: true,
        forbidNonWhitelisted: true,
    });
    if (errors.length > 0) {
        throw new BadRequestException({
            message: 'Validation failed',
            details: errors.map((error) => ({
                property: error.property,
                constraints: error.constraints,
            })),
        });
    }
    return dto;
}

@ApiTags('HR Employee Contract')
@ApiBearerAuth()
@UseGuards(PermissionsGuard)
@RequireAnyPermission(
    { module: 'employee-contract', action: 'view' },
    { module: 'employee-contract', action: 'create' },
)
@Controller('hr/employee-contracts')
export class EmployeeContractController {
    constructor(
        private readonly employeeContractService: EmployeeContractService,
    ){}

    @Post()
    @DelegatePermissionCheck()
    @RequireAnyPermission(
        { module: 'employee-contract', action: 'create' },
    )
    @ApiOperation({ summary: 'Create an employee contract (HR)' })
    @ApiConsumes('multipart/form-data', 'application/json')
    @ApiBody({
        schema: {
            type: 'object',
            properties: {
                employeeId: { type: 'string', format: 'uuid' },
                contractType: { type: 'string' },
                signedAt: { type: 'string', format: 'date' },
                startDate: { type: 'string', format: 'date' },
                endDate: { type: 'string', format: 'date' },
                notes: { type: 'string' },
                basicSalary: { type: 'number' },
                transportationAllowance: { type: 'number' },
                monthlyBonus: { type: 'number' },
                monthlyNetBonus: { type: 'number' },
                pensionApplicable: { type: 'boolean' },
                taxApplicable: { type: 'boolean' },
                probationEndDate: { type: 'string', format: 'date' },
                governedBy: { type: 'string' },
                files: {
                    type: 'array',
                    items: { type: 'string', format: 'binary' },
                },
            },
        },
    })
    @UseInterceptors(
        FilesInterceptor('files', 10, { storage: memoryStorage() }),
    )
    async create(
        @CurrentUser() user: AuthenticatedUser,
        @CurrentCompany() companyId: string,
        @Body() body: Record<string, unknown>,
        @UploadedFiles() files?: Express.Multer.File[],
    ): Promise<unknown>{
        const dto = await parseDto(CreateEmployeeContractDto, body);
        return this.employeeContractService.createContract(
            dto,
            companyId,
            user.userId,
            files ?? [],
        );
    }

    @Post('salary-preview')
    @DelegatePermissionCheck()
    @RequireAnyPermission(
        { module: 'employee-contract', action: 'create' },
    )
    @ApiOperation({
        summary:
            'Preview estimated net for a normal month (gross inputs, no OT/absences)',
    })
    async salaryPreview(
        @CurrentUser() user: AuthenticatedUser,
        @CurrentCompany() companyId: string,
        @Body() body: Record<string, unknown>,
    ): Promise<unknown> {
        const dto = await parseDto(SalaryPreviewDto, body);
        return this.employeeContractService.previewSalary(
            dto,
            companyId,
            user.userId,
        );
    }

    @Post('bonus-from-net')
    @DelegatePermissionCheck()
    @RequireAnyPermission(
        { module: 'employee-contract', action: 'create' },
    )
    @ApiOperation({
        summary:
            'Solve monthly bonus for a target net (calculator only - not stored)',
    })
    async bonusFromNet(
        @CurrentUser() user: AuthenticatedUser,
        @CurrentCompany() companyId: string,
        @Body() body: Record<string, unknown>,
    ): Promise<unknown> {
        const dto = await parseDto(BonusFromNetDto, body);
        return this.employeeContractService.bonusFromNet(
            dto,
            companyId,
            user.userId,
        );
    }

    @Get()
    @ApiOperation({ summary: 'List employee contracts (HR)' })
    async list(
        @CurrentUser() user: AuthenticatedUser,
        @CurrentCompany() companyId: string,
        @Query() query: ListEmployeeContractsDto,
    ): Promise<unknown>{
        return this.employeeContractService.listContracts(
            query, 
            companyId,
            user.userId,
        );
    }


    @Get('my')
    @ApiOperation({ summary: 'List my employee contracts' })
    async listMine(
        @CurrentUser() user: AuthenticatedUser,
        @CurrentCompany() companyId: string,
        @Query() query: ListEmployeeContractsDto,
    ): Promise<unknown>{
        return this.employeeContractService.listMyContracts(
            query,
            companyId,
            user.userId,
        );
    }

    @Get('my/active')
    @DelegatePermissionCheck()
    @RequireAnyPermission(
        { module: 'employee-contract', action: 'view' },
    )
    @ApiOperation({
        summary:
            'My contract for profile (pay amounts included). Optional contractId for a past own contract.',
    })
    async myActive(
        @CurrentUser() user: AuthenticatedUser,
        @CurrentCompany() companyId: string,
        @Query('contractId') contractId?: string,
    ): Promise<unknown> {
        return this.employeeContractService.getMyActiveContract(
            companyId,
            user.userId,
            contractId?.trim() || undefined,
        );
    }

    @Get('renewal-preview')
    @DelegatePermissionCheck()
    @RequireAnyPermission(
        { module: 'employee-contract', action: 'create' },
    )
    @ApiOperation({
        summary:
            'Preview annual leave carry-forward and entitlement for a new contract starting on startDate',
    })
    async renewalPreview(
        @CurrentUser() user: AuthenticatedUser,
        @CurrentCompany() companyId: string,
        @Query() query: Record<string, unknown>,
    ): Promise<unknown> {
        const dto = await parseDto(RenewalPreviewQueryDto, query);
        return this.employeeContractService.previewRenewal(
            dto,
            companyId,
            user.userId,
        );
    }

    @Get(':id')
    @ApiOperation({ summary: 'Get an employee contract by id' })
    async getOne(
        @CurrentUser() user: AuthenticatedUser,
        @CurrentCompany() companyId: string,
        @Param('id') id: string,
    ): Promise<unknown>{
        return this.employeeContractService.getContract(
            id,
            companyId,
            user.userId,
        );
    }

    @Post(':id/attachments')
    @DelegatePermissionCheck()
    @RequireAnyPermission(
        { module: 'employee-contract', action: 'edit' },
        { module: 'employee-contract', action: 'create' },
    )
    @ApiOperation({ summary: 'Attach supporting documents to an employee contract' })
    @ApiConsumes('multipart/form-data')
    @ApiBody({
        schema: {
            type: 'object',
            properties: {
                files: {
                    type: 'array',
                    items: { type: 'string', format: 'binary' },
                },
            },
        },
    })
    @UseInterceptors(
        FilesInterceptor('files', 10, { storage: memoryStorage() }),
    )
    async attachFiles(
        @CurrentUser() user: AuthenticatedUser,
        @CurrentCompany() companyId: string,
        @Param('id') id: string,
        @UploadedFiles() files?: Express.Multer.File[],
    ): Promise<unknown> {
        return this.employeeContractService.attachContractFiles(
            id,
            companyId,
            user.userId,
            files ?? [],
        );
    }

    @Delete(':id/attachments/:documentId')
    @DelegatePermissionCheck()
    @RequireAnyPermission(
        { module: 'employee-contract', action: 'edit' },
        { module: 'employee-contract', action: 'create' },
    )
    @ApiOperation({ summary: 'Remove a supporting document from an employee contract' })
    async removeAttachment(
        @CurrentUser() user: AuthenticatedUser,
        @CurrentCompany() companyId: string,
        @Param('id') id: string,
        @Param('documentId') documentId: string,
    ): Promise<unknown> {
        return this.employeeContractService.removeContractAttachment(
            id,
            documentId,
            companyId,
            user.userId,
        );
    }

    @Patch(':id')
    @DelegatePermissionCheck()
    @RequireAnyPermission(
        { module: 'employee-contract', action: 'edit' },
    )
    @ApiOperation({ summary: 'Update an employee contract' })
    async update(
        @CurrentUser() user: AuthenticatedUser,
        @CurrentCompany() companyId: string,
        @Param('id') id: string,
        @Body() body: Record<string, unknown>,
    ): Promise<unknown>{
        const dto = await parseDto(UpdateEmployeeContractDto, body);
        return this.employeeContractService.updateContract(
            id,
            dto,
            companyId,
            user.userId,
        );
    }

    @Patch(':id/terminate')
    @DelegatePermissionCheck()
    @RequireAnyPermission(
        { module: 'employee-contract', action: 'edit' },
    )
    @ApiOperation({
        summary:
            'Terminate an active employee contract, or amend termination date/reason on a terminated one',
    })
    async terminate(
        @CurrentUser() user: AuthenticatedUser,
        @CurrentCompany() companyId: string,
        @Param('id') id: string,
        @Body() body: Record<string, unknown>,
    ): Promise<unknown>{
        const dto = await parseDto(TerminateEmployeeContractDto, body);
        return this.employeeContractService.terminateContract(
            id,
            user.userId,
            companyId,
            dto,
        );
    }

    @Delete(':id')
    @DelegatePermissionCheck()
    @RequireAnyPermission(
        { module: 'employee-contract', action: 'edit' },
    )
    @ApiOperation({ summary: 'Delete an employee contract' })
    async remove(
        @Param('id') id: string,
        @CurrentCompany() companyId: string,
        @CurrentUser() user: AuthenticatedUser,
        ): Promise<{success: boolean}>{
            await this.employeeContractService.deleteContract(
            id,
            companyId,
            user.userId,
        );
        return {success: true}
    }   
}
