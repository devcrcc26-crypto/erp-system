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
import { PmApi } from '../decorators/pm-api.decorator';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../../../shared/decorators/current-user.decorator';
import { PermissionsGuard } from '../../../../shared/permissions/permissions.guard';
import { RequirePermission } from '../../../../shared/permissions/require-permission.decorator';
import { DelegatePermissionCheck } from '../../../../shared/permissions/delegate-permission-check.decorator';
import { AuthenticatedUser } from '../../../../shared/types/jwt-payload.type';
import {
  CreateSubmittalDto,
  CreateSubmittalReviewDto,
  CreateConstructionSubmittalDto,
  CreateDesignSubmittalDto,
  IssueSubmittalDto,
  AddSubmittalItemsDto,
  BatchIssueSubmittalsDto,
  BatchAddSubmittalItemsDto,
  PmListQueryDto,
  RecordExternalApprovalDto,
  RecordExternalFeedbackDto,
  SubmittalSiteReviewCommentDto,
  UpdateSubmittalDto,
  WithdrawSubmittalDto,
} from '../../application/dtos/pm.dtos';
import { SubmittalsService } from '../../application/services/submittals.service';
import { PmModuleAccessGuard } from '../guards/pm-module-access.guard';
import { RequirePmModule } from '../guards/require-pm-module.decorator';

@ApiTags('Submittals')
@ApiBearerAuth()
@PmApi()
@UseGuards(PermissionsGuard, PmModuleAccessGuard)
@RequirePmModule('submittals')
@Controller('projects/:projectId/submittals')
export class SubmittalsController {
  constructor(private readonly submittalsService: SubmittalsService) {}

  private ctx(user: AuthenticatedUser): { companyId: string; userId: string } {
    return { companyId: user.companyId, userId: user.userId };
  }

  @Get()
  @DelegatePermissionCheck()
  @ApiOperation({ summary: 'List project submittals' })
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Param('projectId') projectId: string,
    @Query() query: PmListQueryDto,
  ): Promise<unknown> {
    return this.submittalsService.listSubmittals(this.ctx(user), projectId, query);
  }

  @Post()
  @RequirePermission('submittals', 'create')
  @ApiOperation({ summary: 'Create submittal' })
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Param('projectId') projectId: string,
    @Body() dto: CreateSubmittalDto,
  ): Promise<unknown> {
    return this.submittalsService.createSubmittal(this.ctx(user), projectId, dto);
  }

  @Post('design-package')
  @DelegatePermissionCheck()
  @ApiOperation({ summary: 'Create design-package submittal (DRAFT)' })
  createDesign(
    @CurrentUser() user: AuthenticatedUser,
    @Param('projectId') projectId: string,
    @Body() dto: CreateDesignSubmittalDto,
  ): Promise<unknown> {
    return this.submittalsService.createDesignSubmittal(
      this.ctx(user),
      projectId,
      dto,
    );
  }

  @Post('construction')
  @DelegatePermissionCheck()
  @ApiOperation({
    summary:
      'Create in-construction submittal with design packages and document folder',
  })
  createConstruction(
    @CurrentUser() user: AuthenticatedUser,
    @Param('projectId') projectId: string,
    @Body() dto: CreateConstructionSubmittalDto,
  ): Promise<unknown> {
    return this.submittalsService.createConstructionSubmittal(
      this.ctx(user),
      projectId,
      dto,
    );
  }

  @Post(':id/submit-to-lead')
  @DelegatePermissionCheck()
  @ApiOperation({
    summary:
      'Submit or resubmit in-construction submittal to discipline leader',
  })
  submitToLead(
    @CurrentUser() user: AuthenticatedUser,
    @Param('projectId') projectId: string,
    @Param('id') id: string,
  ): Promise<unknown> {
    return this.submittalsService.submitToDisciplineLead(
      this.ctx(user),
      projectId,
      id,
    );
  }

  @Post(':id/issue')
  @DelegatePermissionCheck()
  @ApiOperation({ summary: 'Issue submittal - freeze package snapshots' })
  issue(
    @CurrentUser() user: AuthenticatedUser,
    @Param('projectId') projectId: string,
    @Param('id') id: string,
    @Body() dto: IssueSubmittalDto,
  ): Promise<unknown> {
    return this.submittalsService.issueSubmittal(this.ctx(user), projectId, id, dto);
  }

  @Post(':id/site-reviews/:reviewId/approve')
  @DelegatePermissionCheck()
  @ApiOperation({ summary: 'Site representative approves their review' })
  approveSiteReview(
    @CurrentUser() user: AuthenticatedUser,
    @Param('projectId') projectId: string,
    @Param('id') id: string,
    @Param('reviewId') reviewId: string,
  ): Promise<unknown> {
    return this.submittalsService.approveSiteReview(
      this.ctx(user),
      projectId,
      id,
      reviewId,
    );
  }

  @Post(':id/site-reviews/:reviewId/comment')
  @DelegatePermissionCheck()
  @ApiOperation({ summary: 'Site representative comments without approving' })
  commentSiteReview(
    @CurrentUser() user: AuthenticatedUser,
    @Param('projectId') projectId: string,
    @Param('id') id: string,
    @Param('reviewId') reviewId: string,
    @Body() dto: SubmittalSiteReviewCommentDto,
  ): Promise<unknown> {
    return this.submittalsService.commentSiteReview(
      this.ctx(user),
      projectId,
      id,
      reviewId,
      dto,
    );
  }

  @Post(':id/site-reviews/:reviewId/request-re-review')
  @DelegatePermissionCheck()
  @ApiOperation({
    summary:
      'Partial reset (option B): reset a COMMENTED site review to PENDING after CR resolution',
  })
  requestSiteReviewReReview(
    @CurrentUser() user: AuthenticatedUser,
    @Param('projectId') projectId: string,
    @Param('id') id: string,
    @Param('reviewId') reviewId: string,
  ): Promise<unknown> {
    return this.submittalsService.requestSiteReviewReReview(
      this.ctx(user),
      projectId,
      id,
      reviewId,
    );
  }

  @Post(':id/site-approve')
  @DelegatePermissionCheck()
  @ApiOperation({ summary: 'Record site representative approval on an ER' })
  recordSiteApproval(
    @CurrentUser() user: AuthenticatedUser,
    @Param('projectId') projectId: string,
    @Param('id') id: string,
    @Body() dto: RecordExternalApprovalDto,
  ): Promise<unknown> {
    return this.submittalsService.recordSiteApproval(
      this.ctx(user),
      projectId,
      id,
      dto,
    );
  }

  @Post(':id/site-feedback')
  @DelegatePermissionCheck()
  @ApiOperation({ summary: 'Record site representative feedback on an ER' })
  recordSiteFeedback(
    @CurrentUser() user: AuthenticatedUser,
    @Param('projectId') projectId: string,
    @Param('id') id: string,
    @Body() dto: RecordExternalFeedbackDto,
  ): Promise<unknown> {
    return this.submittalsService.recordSiteFeedback(
      this.ctx(user),
      projectId,
      id,
      dto,
    );
  }

  @Post(':id/consultant-approve')
  @DelegatePermissionCheck()
  @ApiOperation({ summary: 'Record consultant approval on an ER' })
  recordConsultantApproval(
    @CurrentUser() user: AuthenticatedUser,
    @Param('projectId') projectId: string,
    @Param('id') id: string,
    @Body() dto: RecordExternalApprovalDto,
  ): Promise<unknown> {
    return this.submittalsService.recordConsultantApproval(
      this.ctx(user),
      projectId,
      id,
      dto,
    );
  }

  @Post(':id/consultant-feedback')
  @DelegatePermissionCheck()
  @ApiOperation({ summary: 'Record consultant feedback on an ER' })
  recordConsultantFeedback(
    @CurrentUser() user: AuthenticatedUser,
    @Param('projectId') projectId: string,
    @Param('id') id: string,
    @Body() dto: RecordExternalFeedbackDto,
  ): Promise<unknown> {
    return this.submittalsService.recordConsultantFeedback(
      this.ctx(user),
      projectId,
      id,
      dto,
    );
  }

  @Post(':id/withdraw')
  @DelegatePermissionCheck()
  @ApiOperation({ summary: 'Withdraw an external release before issue' })
  withdraw(
    @CurrentUser() user: AuthenticatedUser,
    @Param('projectId') projectId: string,
    @Param('id') id: string,
    @Body() dto: WithdrawSubmittalDto,
  ): Promise<unknown> {
    return this.submittalsService.withdrawSubmittal(
      this.ctx(user),
      projectId,
      id,
      dto,
    );
  }

  @Post(':id/items')
  @RequirePermission('submittals', 'edit')
  @ApiOperation({ summary: 'Add design packages to DRAFT submittal' })
  addItems(
    @CurrentUser() user: AuthenticatedUser,
    @Param('projectId') projectId: string,
    @Param('id') id: string,
    @Body() dto: AddSubmittalItemsDto,
  ): Promise<unknown> {
    return this.submittalsService.addItems(this.ctx(user), projectId, id, dto);
  }

  @Post('batch-issue')
  @RequirePermission('submittals', 'create')
  @ApiOperation({ summary: 'Issue multiple submittals - freeze snapshots each' })
  batchIssue(
    @CurrentUser() user: AuthenticatedUser,
    @Param('projectId') projectId: string,
    @Body() dto: BatchIssueSubmittalsDto,
  ): Promise<unknown> {
    return this.submittalsService.batchIssue(this.ctx(user), projectId, dto);
  }

  @Post('batch-add-items')
  @RequirePermission('submittals', 'edit')
  @ApiOperation({ summary: 'Add design packages to multiple DRAFT submittals' })
  batchAddItems(
    @CurrentUser() user: AuthenticatedUser,
    @Param('projectId') projectId: string,
    @Body() dto: BatchAddSubmittalItemsDto,
  ): Promise<unknown> {
    return this.submittalsService.batchAddItems(this.ctx(user), projectId, dto);
  }

  @Get(':id/reviews')
  @DelegatePermissionCheck()
  @ApiOperation({ summary: 'List submittal reviews' })
  listReviews(
    @CurrentUser() user: AuthenticatedUser,
    @Param('projectId') projectId: string,
    @Param('id') id: string,
  ): Promise<unknown> {
    return this.submittalsService.listReviews(this.ctx(user), projectId, id);
  }

  @Post(':id/reviews')
  @DelegatePermissionCheck()
  @ApiOperation({ summary: 'Add submittal review (assigned discipline lead)' })
  addReview(
    @CurrentUser() user: AuthenticatedUser,
    @Param('projectId') projectId: string,
    @Param('id') id: string,
    @Body() dto: CreateSubmittalReviewDto,
  ): Promise<unknown> {
    return this.submittalsService.addReview(this.ctx(user), projectId, id, dto);
  }

  @Get(':id/items/:itemId/edvs')
  @DelegatePermissionCheck()
  @ApiOperation({ summary: 'List LOCKED EDVs for a submittal item (pre-issue)' })
  listItemEdvs(
    @CurrentUser() user: AuthenticatedUser,
    @Param('projectId') projectId: string,
    @Param('id') id: string,
    @Param('itemId') itemId: string,
  ): Promise<unknown> {
    return this.submittalsService.listSubmittalItemReleasableEdvs(
      this.ctx(user),
      projectId,
      id,
      itemId,
    );
  }

  @Delete(':id/items/:itemId/edvs/:edvId')
  @DelegatePermissionCheck()
  @ApiOperation({ summary: 'Exclude an EDV from external release snapshot' })
  excludeItemEdv(
    @CurrentUser() user: AuthenticatedUser,
    @Param('projectId') projectId: string,
    @Param('id') id: string,
    @Param('itemId') itemId: string,
    @Param('edvId') edvId: string,
  ): Promise<unknown> {
    return this.submittalsService.excludeSubmittalItemEdv(
      this.ctx(user),
      projectId,
      id,
      itemId,
      edvId,
    );
  }

  @Post(':id/items/:itemId/edvs/:edvId/include')
  @DelegatePermissionCheck()
  @ApiOperation({ summary: 'Re-include an excluded EDV in external release' })
  includeItemEdv(
    @CurrentUser() user: AuthenticatedUser,
    @Param('projectId') projectId: string,
    @Param('id') id: string,
    @Param('itemId') itemId: string,
    @Param('edvId') edvId: string,
  ): Promise<unknown> {
    return this.submittalsService.includeSubmittalItemEdv(
      this.ctx(user),
      projectId,
      id,
      itemId,
      edvId,
    );
  }

  @Get(':id')
  @DelegatePermissionCheck()
  @ApiOperation({ summary: 'Get submittal by id' })
  get(
    @CurrentUser() user: AuthenticatedUser,
    @Param('projectId') projectId: string,
    @Param('id') id: string,
  ): Promise<unknown> {
    return this.submittalsService.getSubmittal(this.ctx(user), projectId, id);
  }

  @Patch(':id')
  @RequirePermission('submittals', 'edit')
  @ApiOperation({ summary: 'Update submittal' })
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('projectId') projectId: string,
    @Param('id') id: string,
    @Body() dto: UpdateSubmittalDto,
  ): Promise<unknown> {
    return this.submittalsService.updateSubmittal(
      this.ctx(user),
      projectId,
      id,
      dto,
    );
  }

  @Delete(':id')
  @RequirePermission('submittals', 'delete')
  @ApiOperation({ summary: 'Delete submittal' })
  async remove(
    @CurrentUser() user: AuthenticatedUser,
    @Param('projectId') projectId: string,
    @Param('id') id: string,
  ): Promise<{ message: string }> {
    await this.submittalsService.deleteSubmittal(this.ctx(user), projectId, id);
    return { message: 'Submittal deleted' };
  }
}

/**
 * Company-scoped submittals routes (no project path param).
 * Separate controller so PmModuleAccessGuard is not applied without projectId.
 */
@ApiTags('Submittals')
@ApiBearerAuth()
@PmApi()
@UseGuards(PermissionsGuard)
@Controller('submittals')
export class MySubmittalsController {
  constructor(private readonly submittalsService: SubmittalsService) {}

  private ctx(user: AuthenticatedUser): { companyId: string; userId: string } {
    return { companyId: user.companyId, userId: user.userId };
  }

  @Get('my')
  @DelegatePermissionCheck()
  @ApiOperation({
    summary:
      'List construction submittals relevant to the current user across projects',
  })
  listMy(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: PmListQueryDto,
  ): Promise<unknown> {
    return this.submittalsService.listMySubmittals(this.ctx(user), query);
  }

  @Get('all')
  @RequirePermission('projects', 'view')
  @ApiOperation({
    summary: 'List all construction submittals across projects (portfolio access)',
  })
  listAll(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: PmListQueryDto,
  ): Promise<unknown> {
    return this.submittalsService.listAllSubmittals(this.ctx(user), query);
  }
}
