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
  UpdateSubmittalDto,
} from '../../application/dtos/pm.dtos';
import { SubmittalsService } from '../../application/services/submittals.service';
import { PmModuleAccessGuard } from '../guards/pm-module-access.guard';
import { RequirePmModule } from '../guards/require-pm-module.decorator';

@ApiTags('Submittals')
@ApiBearerAuth()
@UseGuards(PermissionsGuard, PmModuleAccessGuard)
@RequirePmModule('submittals')
@Controller('projects/:projectId/submittals')
export class SubmittalsController {
  constructor(private readonly submittalsService: SubmittalsService) {}

  private ctx(user: AuthenticatedUser): { companyId: string; userId: string } {
    return { companyId: user.companyId, userId: user.userId };
  }

  @Get()
  @RequirePermission('submittals', 'view')
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
  @RequirePermission('submittals', 'create')
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
  @RequirePermission('submittals', 'create')
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
  @RequirePermission('submittals', 'create')
  @ApiOperation({ summary: 'Issue submittal - freeze package snapshots' })
  issue(
    @CurrentUser() user: AuthenticatedUser,
    @Param('projectId') projectId: string,
    @Param('id') id: string,
    @Body() dto: IssueSubmittalDto,
  ): Promise<unknown> {
    return this.submittalsService.issueSubmittal(this.ctx(user), projectId, id, dto);
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
  @RequirePermission('submittals', 'view')
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

  @Get(':id')
  @RequirePermission('submittals', 'view')
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
