import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentCompany } from '../../../../shared/decorators/current-company.decorator';
import { JwtAuthGuard } from '../../../../shared/guards/jwt-auth.guard';
import { ApprovalsService } from '../../application/services/approvals.service';

/**
 * Approval categories for the New Request picker — any authenticated user.
 */
@ApiTags('Approval Categories')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('approval-categories')
export class ApprovalCategoriesController {
  constructor(private readonly approvalsService: ApprovalsService) {}

  @Get()
  @ApiOperation({ summary: 'List active approval categories' })
  list(@CurrentCompany() companyId: string): Promise<unknown> {
    return this.approvalsService.getCategories(companyId);
  }

  @Get(':code')
  @ApiOperation({ summary: 'Get an approval category by code' })
  getByCode(
    @CurrentCompany() companyId: string,
    @Param('code') code: string,
  ): Promise<unknown> {
    return this.approvalsService.getCategoryByCode(code, companyId);
  }
}
