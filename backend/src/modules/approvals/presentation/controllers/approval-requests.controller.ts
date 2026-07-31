import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentCompany } from '../../../../shared/decorators/current-company.decorator';
import { CurrentUser } from '../../../../shared/decorators/current-user.decorator';
import { PermissionsGuard } from '../../../../shared/permissions/permissions.guard';
import { RequirePermission } from '../../../../shared/permissions/require-permission.decorator';
import { AuthenticatedUser } from '../../../../shared/types/jwt-payload.type';
import {
  AddConditionDto,
  ListRequestsDto,
  SubmitRequestDto,
  TierActionDto,
} from '../../application/dtos/approval.dtos';
import { ApprovalsService } from '../../application/services/approvals.service';

@ApiTags('Approval Requests')
@ApiBearerAuth()
@UseGuards(PermissionsGuard)
@Controller('approval-requests')
export class ApprovalRequestsController {
  constructor(private readonly approvalsService: ApprovalsService) {}

  @Post()
  @RequirePermission('approvals', 'create')
  @ApiOperation({ summary: 'Submit an approval request' })
  submit(
    @CurrentUser() user: AuthenticatedUser,
    @CurrentCompany() companyId: string,
    @Body() dto: SubmitRequestDto,
  ): Promise<unknown> {
    return this.approvalsService.submitRequest(dto, companyId, user.userId);
  }

  @Get()
  @RequirePermission('approvals', 'view')
  @ApiOperation({ summary: 'List approval requests' })
  list(
    @CurrentCompany() companyId: string,
    @Query() query: ListRequestsDto,
  ): Promise<unknown> {
    return this.approvalsService.listRequests(query, companyId);
  }

  @Get(':id')
  @RequirePermission('approvals', 'view')
  @ApiOperation({ summary: 'Get an approval request with tiers and comments' })
  getOne(
    @CurrentCompany() companyId: string,
    @Param('id') id: string,
  ): Promise<unknown> {
    return this.approvalsService.getRequest(id, companyId);
  }

  @Post(':id/tiers/:tierId/approve')
  @RequirePermission('approvals', 'approve')
  @ApiOperation({ summary: 'Approve the current tier' })
  approve(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Param('tierId') tierId: string,
    @Body() dto: TierActionDto,
  ): Promise<unknown> {
    return this.approvalsService.approveTier(
      id,
      tierId,
      user.userId,
      dto?.note,
    );
  }

  @Post(':id/tiers/:tierId/reject')
  @RequirePermission('approvals', 'approve')
  @ApiOperation({ summary: 'Reject the current tier and request' })
  reject(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Param('tierId') tierId: string,
    @Body() dto: TierActionDto,
  ): Promise<unknown> {
    return this.approvalsService.rejectTier(
      id,
      tierId,
      user.userId,
      dto?.note,
    );
  }

  @Post(':id/tiers/:tierId/return')
  @RequirePermission('approvals', 'approve')
  @ApiOperation({ summary: 'Return the request to the submitter' })
  returnToSubmitter(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Param('tierId') tierId: string,
    @Body() dto: TierActionDto,
  ): Promise<unknown> {
    return this.approvalsService.returnTier(
      id,
      tierId,
      user.userId,
      dto?.note,
    );
  }

  @Post(':id/tiers/:tierId/conditions')
  @RequirePermission('approvals', 'approve')
  @ApiOperation({ summary: 'Add a condition to the current tier' })
  addCondition(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Param('tierId') tierId: string,
    @Body() dto: AddConditionDto,
  ): Promise<unknown> {
    return this.approvalsService.addCondition(
      id,
      tierId,
      dto.text,
      user.userId,
    );
  }

  @Patch(':id/tiers/:tierId/conditions/:index/resolve')
  @RequirePermission('approvals', 'approve')
  @ApiOperation({ summary: 'Mark a tier condition as resolved' })
  resolveCondition(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Param('tierId') tierId: string,
    @Param('index', ParseIntPipe) index: number,
  ): Promise<unknown> {
    return this.approvalsService.resolveCondition(
      id,
      tierId,
      index,
      user.userId,
    );
  }
}
