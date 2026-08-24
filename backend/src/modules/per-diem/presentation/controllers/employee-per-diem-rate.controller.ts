import {
  Body,
  Controller,
  Get,
  Param,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentCompany } from '../../../../shared/decorators/current-company.decorator';
import { CurrentUser } from '../../../../shared/decorators/current-user.decorator';
import { DelegatePermissionCheck } from '../../../../shared/permissions/delegate-permission-check.decorator';
import { PermissionsGuard } from '../../../../shared/permissions/permissions.guard';
import { RequirePermission } from '../../../../shared/permissions/require-permission.decorator';
import { AuthenticatedUser } from '../../../../shared/types/jwt-payload.type';
import {
  ListEmployeePerDiemRatesQueryDto,
  UpsertEmployeePerDiemRateDto,
} from '../../application/dtos/employee-per-diem-rate.dtos';
import { EmployeePerDiemRateService } from '../../application/services/employee-per-diem-rate.service';

@ApiTags('HR Employee Per Diem Rates')
@ApiBearerAuth()
@UseGuards(PermissionsGuard)
@Controller('hr/employee-per-diem-rates')
export class EmployeePerDiemRateController {
  constructor(
    private readonly employeePerDiemRateService: EmployeePerDiemRateService,
  ) {}

  @Get()
  @RequirePermission('hr', 'view')
  @ApiOperation({ summary: 'List employee per diem rates (HR)' })
  list(
    @Query() query: ListEmployeePerDiemRatesQueryDto,
    @CurrentCompany() companyId: string,
  ): Promise<unknown> {
    return this.employeePerDiemRateService.listForHr(companyId, query);
  }

  @Get('me')
  @DelegatePermissionCheck()
  @ApiOperation({ summary: 'Get per diem rates for the current employee' })
  getMyRate(
    @CurrentUser() user: AuthenticatedUser,
    @CurrentCompany() companyId: string,
  ): Promise<unknown> {
    return this.employeePerDiemRateService.getForEmployee(
      user.userId,
      companyId,
    );
  }

  @Get('me/active')
  @DelegatePermissionCheck()
  @ApiOperation({
    summary:
      'Active destination categories with rates for the current employee (submission form)',
  })
  getMyActive(
    @CurrentUser() user: AuthenticatedUser,
    @CurrentCompany() companyId: string,
  ): Promise<unknown> {
    return this.employeePerDiemRateService.getMyActiveCategories(
      companyId,
      user.userId,
    );
  }

  @Get('employee/:employeeId')
  @RequirePermission('hr', 'view')
  @ApiOperation({ summary: 'Get per diem rates for an employee (HR)' })
  getForEmployee(
    @Param('employeeId') employeeId: string,
    @CurrentCompany() companyId: string,
  ): Promise<unknown> {
    return this.employeePerDiemRateService.getForEmployee(
      employeeId,
      companyId,
    );
  }

  @Put('employee/:employeeId')
  @RequirePermission('hr', 'view')
  @ApiOperation({ summary: 'Create or update per diem rates for an employee (HR)' })
  upsertForEmployee(
    @CurrentUser() user: AuthenticatedUser,
    @CurrentCompany() companyId: string,
    @Param('employeeId') employeeId: string,
    @Body() dto: UpsertEmployeePerDiemRateDto,
  ): Promise<unknown> {
    return this.employeePerDiemRateService.upsertForEmployee(
      employeeId,
      dto,
      companyId,
      user.userId,
    );
  }
}
