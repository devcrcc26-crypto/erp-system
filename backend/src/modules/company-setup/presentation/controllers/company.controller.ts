import {
  Body,
  Controller,
  Delete,
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
  CreateCompanySettingDto,
  UpdateCompanyDto,
  UpdateCompanySettingDto,
} from '../../application/dtos/company.dtos';
import { CompanySetupService } from '../../application/services/company-setup.service';

@ApiTags('Company')
@ApiBearerAuth()
@UseGuards(PermissionsGuard)
@Controller()
export class CompanyController {
  constructor(private readonly companySetupService: CompanySetupService) {}

  @Get('company')
  @RequirePermission('company', 'view')
  @ApiOperation({ summary: 'Get current company profile' })
  getCompany(@CurrentUser() user: AuthenticatedUser): Promise<unknown> {
    return this.companySetupService.getCompany({
      companyId: user.companyId,
      userId: user.userId,
    });
  }

  @Patch('company')
  @RequirePermission('company', 'edit')
  @ApiOperation({ summary: 'Update company profile' })
  updateCompany(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: UpdateCompanyDto,
  ): Promise<unknown> {
    return this.companySetupService.updateCompany(
      { companyId: user.companyId, userId: user.userId },
      dto,
    );
  }

  @Get('company-settings')
  @RequirePermission('company_settings', 'view')
  @ApiOperation({ summary: 'List company settings' })
  listSettings(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: PaginationQueryDto,
  ): Promise<unknown> {
    return this.companySetupService.listCompanySettings(
      { companyId: user.companyId, userId: user.userId },
      query,
    );
  }

  @Post('company-settings')
  @RequirePermission('company_settings', 'edit')
  @ApiOperation({ summary: 'Create company setting' })
  createSetting(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateCompanySettingDto,
  ): Promise<unknown> {
    return this.companySetupService.createCompanySetting(
      { companyId: user.companyId, userId: user.userId },
      dto,
    );
  }

  @Patch('company-settings/:id')
  @RequirePermission('company_settings', 'edit')
  @ApiOperation({ summary: 'Update company setting' })
  updateSetting(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: UpdateCompanySettingDto,
  ): Promise<unknown> {
    return this.companySetupService.updateCompanySetting(
      { companyId: user.companyId, userId: user.userId },
      id,
      dto,
    );
  }

  @Delete('company-settings/:id')
  @RequirePermission('company_settings', 'edit')
  @ApiOperation({ summary: 'Delete company setting' })
  async deleteSetting(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ): Promise<{ message: string }> {
    await this.companySetupService.deleteCompanySetting(
      { companyId: user.companyId, userId: user.userId },
      id,
    );
    return { message: 'Company setting deleted' };
  }
}
