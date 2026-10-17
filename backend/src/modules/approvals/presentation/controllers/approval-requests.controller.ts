import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  UploadedFiles,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { memoryStorage } from 'multer';
import { CurrentCompany } from '../../../../shared/decorators/current-company.decorator';
import { CurrentUser } from '../../../../shared/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../../../shared/guards/jwt-auth.guard';
import { AuthenticatedUser } from '../../../../shared/types/jwt-payload.type';
import {
  AddConditionDto,
  ListRequestsDto,
  SubmitRequestDto,
  TierActionDto,
} from '../../application/dtos/approval.dtos';
import { ApprovalsService } from '../../application/services/approvals.service';

/**
 * Approval requests - authenticated users only.
 * Visibility is enforced in ApprovalsService (own + assigned vs hr.view full access).
 * Tier actions still verify the caller is the assigned approver in the service.
 */
@ApiTags('Approval Requests')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('approval-requests')
export class ApprovalRequestsController {
  constructor(private readonly approvalsService: ApprovalsService) {}

  @Post()
  @ApiOperation({ summary: 'Submit an approval request' })
  submit(
    @CurrentUser() user: AuthenticatedUser,
    @CurrentCompany() companyId: string,
    @Body() dto: SubmitRequestDto,
  ): Promise<unknown> {
    return this.approvalsService.submitRequest(dto, companyId, user.userId);
  }

  @Get()
  @ApiOperation({
    summary:
      'List approval requests (scoped to requester/approver unless hr.view; use inbox tabs)',
  })
  list(
    @CurrentUser() user: AuthenticatedUser,
    @CurrentCompany() companyId: string,
    @Query() query: ListRequestsDto,
  ): Promise<unknown> {
    return this.approvalsService.listRequests(query, companyId, user.userId);
  }

  @Get('count')
  @ApiOperation({
    summary: 'Count approval requests for the given inbox/filters (badge totals)',
  })
  count(
    @CurrentUser() user: AuthenticatedUser,
    @CurrentCompany() companyId: string,
    @Query() query: ListRequestsDto,
  ): Promise<{ total: number }> {
    return this.approvalsService.countRequests(query, companyId, user.userId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get an approval request with tiers and comments' })
  getOne(
    @CurrentUser() user: AuthenticatedUser,
    @CurrentCompany() companyId: string,
    @Param('id') id: string,
  ): Promise<unknown> {
    return this.approvalsService.getRequest(id, companyId, user.userId);
  }

  @Post(':id/resubmit')
  @ApiOperation({ summary: 'Resubmit a returned approval request' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        note: { type: 'string' },
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
  resubmit(
    @CurrentUser() user: AuthenticatedUser,
    @CurrentCompany() companyId: string,
    @Param('id') id: string,
    @Body() body: { note?: string },
    @UploadedFiles() files: Express.Multer.File[],
  ): Promise<unknown> {
    return this.approvalsService.resubmitRequest(
      id,
      companyId,
      user.userId,
      body?.note,
      files ?? [],
    );
  }

  @Post(':id/conditions/:index/respond')
  @ApiOperation({ summary: 'Respond to a condition on the active tier' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        note: { type: 'string' },
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
  respondToCondition(
    @CurrentUser() user: AuthenticatedUser,
    @CurrentCompany() companyId: string,
    @Param('id') id: string,
    @Param('index', ParseIntPipe) index: number,
    @Body() body: { note?: string },
    @UploadedFiles() files: Express.Multer.File[],
  ): Promise<unknown> {
    return this.approvalsService.respondToCondition(
      id,
      index,
      companyId,
      user.userId,
      body?.note,
      files ?? [],
    );
  }

  @Post(':id/tiers/:tierId/approve')
  @ApiOperation({
    summary:
      'Approve the current tier (onBehalf: full-access roles approve for the assigned approver)',
  })
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
      { onBehalf: dto?.onBehalf === true },
    );
  }

  @Post(':id/tiers/:tierId/reject')
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
      { onBehalf: dto?.onBehalf === true },
    );
  }

  @Post(':id/tiers/:tierId/conditions')
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
