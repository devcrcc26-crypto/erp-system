import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../../../shared/decorators/current-user.decorator';
import { PaginationQueryDto } from '../../../../shared/dtos/pagination-query.dto';
import { PermissionsGuard } from '../../../../shared/permissions/permissions.guard';
import { RequirePermission } from '../../../../shared/permissions/require-permission.decorator';
import { AuthenticatedUser } from '../../../../shared/types/jwt-payload.type';
import {
  CreateFinancialYearDto,
  CreateNumberSeriesDto,
  UpdateFinancialYearDto,
  UpdateNumberSeriesDto,
} from '../../application/dtos/company.dtos';
import { CompanySetupService } from '../../application/services/company-setup.service';

@ApiTags('Financial Setup')
@ApiBearerAuth()
@UseGuards(PermissionsGuard)
@Controller()
export class FinancialController {
  constructor(private readonly companySetupService: CompanySetupService) {}

  private ctx(user: AuthenticatedUser): { companyId: string; userId: string } {
    return { companyId: user.companyId, userId: user.userId };
  }

  @Get('financial-years')
  @RequirePermission('financial_periods', 'view')
  @ApiOperation({ summary: 'List financial years' })
  listYears(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: PaginationQueryDto,
  ): Promise<unknown> {
    return this.companySetupService.listFinancialYears(this.ctx(user), query);
  }

  @Get('financial-years/:id')
  @RequirePermission('financial_periods', 'view')
  getYear(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ): Promise<unknown> {
    return this.companySetupService.getFinancialYear(this.ctx(user), id);
  }

  @Post('financial-years')
  @RequirePermission('financial_periods', 'edit')
  createYear(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateFinancialYearDto,
  ): Promise<unknown> {
    return this.companySetupService.createFinancialYear(this.ctx(user), dto);
  }

  @Patch('financial-years/:id')
  @RequirePermission('financial_periods', 'edit')
  updateYear(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: UpdateFinancialYearDto,
  ): Promise<unknown> {
    return this.companySetupService.updateFinancialYear(this.ctx(user), id, dto);
  }

  @Get('financial-periods')
  @RequirePermission('financial_periods', 'view')
  listPeriods(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: PaginationQueryDto,
    @Query('financialYearId') financialYearId?: string,
  ): Promise<unknown> {
    return this.companySetupService.listFinancialPeriods(
      this.ctx(user),
      query,
      financialYearId,
    );
  }

  @Get('financial-periods/:id')
  @RequirePermission('financial_periods', 'view')
  getPeriod(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ): Promise<unknown> {
    return this.companySetupService.getFinancialPeriod(this.ctx(user), id);
  }

  @Post('financial-periods/:id/lock')
  @RequirePermission('financial_periods', 'approve')
  lockPeriod(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ): Promise<unknown> {
    return this.companySetupService.lockFinancialPeriod(this.ctx(user), id);
  }

  @Post('financial-periods/:id/close')
  @RequirePermission('financial_periods', 'approve')
  closePeriod(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ): Promise<unknown> {
    return this.companySetupService.closeFinancialPeriod(this.ctx(user), id);
  }

  @Get('number-series')
  @RequirePermission('company', 'view')
  listNumberSeries(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: PaginationQueryDto,
  ): Promise<unknown> {
    return this.companySetupService.listNumberSeries(this.ctx(user), query);
  }

  @Post('number-series')
  @RequirePermission('company', 'edit')
  createNumberSeries(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateNumberSeriesDto,
  ): Promise<unknown> {
    return this.companySetupService.createNumberSeries(this.ctx(user), dto);
  }

  @Patch('number-series/:id')
  @RequirePermission('company', 'edit')
  updateNumberSeries(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: UpdateNumberSeriesDto,
  ): Promise<unknown> {
    return this.companySetupService.updateNumberSeries(this.ctx(user), id, dto);
  }

  @Post('number-series/:documentType/next')
  @RequirePermission('company', 'view')
  nextNumber(
    @CurrentUser() user: AuthenticatedUser,
    @Param('documentType') documentType: string,
  ): Promise<{ documentNumber: string }> {
    return this.companySetupService.getNextDocumentNumber(
      this.ctx(user),
      documentType,
    );
  }
}
