import { BadRequestException, Controller, Body, Post,Patch, Query, Get, Param, Delete, UseGuards } from "@nestjs/common";
import { CreateEmployeeContractDto, ListEmployeeContractsDto, TerminateEmployeeContractDto, UpdateEmployeeContractDto } from "../../application/dtos/employee-contract.dtos";
import { plainToInstance } from "class-transformer";
import { validate } from "class-validator";
import { EmployeeContractService } from "../../application/services/employee-contract.service";
import { CurrentUser } from "@/shared/decorators/current-user.decorator";
import { AuthenticatedUser } from "@/shared/types/jwt-payload.type";
import { CurrentCompany } from "@/shared/decorators/current-company.decorator";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
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
    { module: 'hr', action: 'view' },
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
        { module: 'hr', action: 'view' },
        { module: 'employee-contract', action: 'create' },
    )
    @ApiOperation({ summary: 'Create an employee contract (HR)' })
    async create(
        @CurrentUser() user: AuthenticatedUser,
        @CurrentCompany() companyId: string,
        @Body() body: Record<string, unknown>,
    ): Promise<unknown>{
        const dto = await parseDto(CreateEmployeeContractDto, body);
        return this.employeeContractService.createContract(
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
    @ApiOperation({
        summary: 'My active contract without salary fields (any authenticated user)',
    })
    getMyActive(
        @CurrentUser() user: AuthenticatedUser,
        @CurrentCompany() companyId: string,
    ): Promise<unknown> {
        return this.employeeContractService.getMyActiveContract(
            companyId,
            user.userId,
        );
    }


    @Get(':id')
    @ApiOperation({ summary: 'Get an employee contract by id' })
    getOne(
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

    @Patch(':id')
    @DelegatePermissionCheck()
    @RequireAnyPermission(
        { module: 'hr', action: 'view' },
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
        { module: 'hr', action: 'view' },
        { module: 'employee-contract', action: 'edit' },
    )
    @ApiOperation({ summary: 'Terminate an employee contract' })
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
        { module: 'hr', action: 'view' },
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