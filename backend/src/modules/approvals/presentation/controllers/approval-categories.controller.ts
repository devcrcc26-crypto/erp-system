import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentCompany } from '../../../../shared/decorators/current-company.decorator';
import { CurrentUser } from '../../../../shared/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../../../shared/guards/jwt-auth.guard';
import { AuthenticatedUser } from '../../../../shared/types/jwt-payload.type';
import { ApprovalsService } from '../../application/services/approvals.service';

/**
 * Approval categories for the New Request picker - filtered by create permission.
 */
@ApiTags('Approval Categories')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('approval-categories')
export class ApprovalCategoriesController {
  constructor(private readonly approvalsService: ApprovalsService) {}

  @Get()
  @ApiOperation({
    summary:
      'List user-requestable approval categories the caller may create (System Administrator sees all requestable)',
  })
  list(
    @CurrentUser() user: AuthenticatedUser,
    @CurrentCompany() companyId: string,
  ): Promise<unknown> {
    return this.approvalsService.getCategories(companyId, user.userId);
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
