import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
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
  CreatePerDiemRateDto,
  UpdatePerDiemRateDto,
} from '../../application/dtos/per-diem-rate.dtos';
import { PerDiemRateService } from '../../application/services/per-diem-rate.service';

@ApiTags('HR Per Diem Rates')
@ApiBearerAuth()
@UseGuards(PermissionsGuard)
@Controller('hr/per-diem-rates')
export class PerDiemRateController {
  constructor(private readonly perDiemRateService: PerDiemRateService) {}

  @Get('active')
  @DelegatePermissionCheck()
  @ApiOperation({
    summary: 'Active per diem rates for submission form dropdowns (any authenticated user)',
  })
  getActive(@CurrentCompany() companyId: string): Promise<unknown> {
    return this.perDiemRateService.getActiveRates(companyId);
  }

  @Get()
  @RequirePermission('per-diem-rates', 'view')
  @ApiOperation({ summary: 'List all per diem rates (HR)' })
  list(@CurrentCompany() companyId: string): Promise<unknown> {
    return this.perDiemRateService.listRates(companyId);
  }

  @Post()
  @RequirePermission('per-diem-rates', 'edit')
  @ApiOperation({ summary: 'Create a per diem destination rate (HR)' })
  create(
    @CurrentUser() user: AuthenticatedUser,
    @CurrentCompany() companyId: string,
    @Body() dto: CreatePerDiemRateDto,
  ): Promise<unknown> {
    return this.perDiemRateService.createRate(dto, companyId, user.userId);
  }

  @Patch(':id')
  @RequirePermission('per-diem-rates', 'edit')
  @ApiOperation({ summary: 'Update a per diem destination rate (HR)' })
  update(
    @CurrentUser() user: AuthenticatedUser,
    @CurrentCompany() companyId: string,
    @Param('id') id: string,
    @Body() dto: UpdatePerDiemRateDto,
  ): Promise<unknown> {
    return this.perDiemRateService.updateRate(id, dto, companyId, user.userId);
  }

  @Delete(':id')
  @RequirePermission('per-diem-rates', 'edit')
  @ApiOperation({ summary: 'Delete a per diem destination rate (HR)' })
  async remove(
    @CurrentUser() user: AuthenticatedUser,
    @CurrentCompany() companyId: string,
    @Param('id') id: string,
  ): Promise<{ message: string }> {
    await this.perDiemRateService.deleteRate(id, companyId, user.userId);
    return { message: 'Per diem rate deleted' };
  }
}
