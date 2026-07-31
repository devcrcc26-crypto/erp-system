import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentCompany } from '../../../../shared/decorators/current-company.decorator';
import { PermissionsGuard } from '../../../../shared/permissions/permissions.guard';
import { RequirePermission } from '../../../../shared/permissions/require-permission.decorator';
import { ApprovalsService } from '../../application/services/approvals.service';

@ApiTags('Approval Categories')
@ApiBearerAuth()
@UseGuards(PermissionsGuard)
@Controller('approval-categories')
export class ApprovalCategoriesController {
  constructor(private readonly approvalsService: ApprovalsService) {}

  @Get()
  @RequirePermission('approvals', 'view')
  @ApiOperation({ summary: 'List active approval categories' })
  list(@CurrentCompany() companyId: string): Promise<unknown> {
    return this.approvalsService.getCategories(companyId);
  }

  @Get(':code')
  @RequirePermission('approvals', 'view')
  @ApiOperation({ summary: 'Get an approval category by code' })
  getByCode(
    @CurrentCompany() companyId: string,
    @Param('code') code: string,
  ): Promise<unknown> {
    return this.approvalsService.getCategoryByCode(code, companyId);
  }
}
