import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { PmApi } from '../decorators/pm-api.decorator';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../../../shared/decorators/current-user.decorator';
import { DelegatePermissionCheck } from '../../../../shared/permissions/delegate-permission-check.decorator';
import { PermissionsGuard } from '../../../../shared/permissions/permissions.guard';
import { RequirePermission } from '../../../../shared/permissions/require-permission.decorator';
import { AuthenticatedUser } from '../../../../shared/types/jwt-payload.type';
import { EpcWorkspaceService } from '../../application/services/epc-workspace.service';
import { MyWorkService } from '../../application/services/my-work.service';
import { ProjectChangeRequestService } from '../../application/services/project-change-request.service';
import { ReviewSessionListQueryDto } from '../../application/dtos/pm.dtos';

@ApiTags('EPC Workspace')
@ApiBearerAuth()
@PmApi()
@UseGuards(PermissionsGuard)
@Controller()
export class EpcWorkspaceController {
  constructor(
    private readonly epcWorkspaceService: EpcWorkspaceService,
    private readonly myWorkService: MyWorkService,
    private readonly changeRequestService: ProjectChangeRequestService,
  ) {}

  private ctx(user: AuthenticatedUser): { companyId: string; userId: string } {
    return { companyId: user.companyId, userId: user.userId };
  }

  @Get('my-work')
  @DelegatePermissionCheck()
  @ApiOperation({ summary: 'Tasks and subtasks assigned to the current user' })
  myWork(@CurrentUser() user: AuthenticatedUser): Promise<unknown> {
    return this.myWorkService.getMyWork(this.ctx(user));
  }

  @Get('projects/:projectId/my-work')
  @DelegatePermissionCheck()
  @ApiOperation({ summary: 'Assigned work scoped to a project' })
  projectMyWork(
    @CurrentUser() user: AuthenticatedUser,
    @Param('projectId') projectId: string,
  ): Promise<unknown> {
    return this.myWorkService.getMyWork(this.ctx(user), projectId);
  }

  @Get('review-inbox')
  @DelegatePermissionCheck()
  @ApiOperation({ summary: 'Review inbox for current user' })
  reviewInbox(@CurrentUser() user: AuthenticatedUser): Promise<unknown> {
    return this.epcWorkspaceService.getReviewInbox(this.ctx(user));
  }

  @Get('my-comments')
  @DelegatePermissionCheck()
  @ApiOperation({ summary: 'Open comments assigned to current user' })
  myComments(@CurrentUser() user: AuthenticatedUser): Promise<unknown> {
    return this.epcWorkspaceService.getMyComments(this.ctx(user));
  }

  @Get('projects/:projectId/review-inbox')
  @DelegatePermissionCheck()
  @ApiOperation({ summary: 'Review inbox for current user scoped to a project' })
  projectReviewInbox(
    @CurrentUser() user: AuthenticatedUser,
    @Param('projectId') projectId: string,
  ): Promise<unknown> {
    return this.epcWorkspaceService.getReviewInbox(this.ctx(user), projectId);
  }

  @Get('projects/:projectId/my-comments')
  @DelegatePermissionCheck()
  @ApiOperation({ summary: 'Open comments assigned to current user scoped to a project' })
  projectMyComments(
    @CurrentUser() user: AuthenticatedUser,
    @Param('projectId') projectId: string,
  ): Promise<unknown> {
    return this.epcWorkspaceService.getMyComments(this.ctx(user), projectId);
  }

  @Get('projects/:projectId/status-board')
  @RequirePermission('schedule', 'view')
  @ApiOperation({ summary: 'Project EPC status board KPIs' })
  statusBoard(
    @CurrentUser() user: AuthenticatedUser,
    @Param('projectId') projectId: string,
  ): Promise<unknown> {
    return this.epcWorkspaceService.getStatusBoard(this.ctx(user), projectId);
  }

  @Get('projects/:projectId/workload')
  @RequirePermission('schedule', 'view')
  @ApiOperation({ summary: 'Dispatcher workload and bottleneck KPIs' })
  workload(
    @CurrentUser() user: AuthenticatedUser,
    @Param('projectId') projectId: string,
  ): Promise<unknown> {
    return this.epcWorkspaceService.getWorkload(this.ctx(user), projectId);
  }

  @Get('projects/:projectId/review-sessions')
  @DelegatePermissionCheck()
  @ApiOperation({ summary: 'List review sessions across all disciplines in a project' })
  listProjectReviewSessions(
    @CurrentUser() user: AuthenticatedUser,
    @Param('projectId') projectId: string,
    @Query() query: ReviewSessionListQueryDto,
  ): Promise<unknown> {
    return this.epcWorkspaceService.listProjectReviewSessions(
      this.ctx(user),
      projectId,
      query,
    );
  }

  @Get('design-packages/:designPackageId/review-mode')
  @DelegatePermissionCheck()
  @ApiOperation({ summary: 'Review mode payload for a design package' })
  reviewMode(
    @CurrentUser() user: AuthenticatedUser,
    @Param('designPackageId') designPackageId: string,
    @Query('reviewSessionId') reviewSessionId?: string,
  ): Promise<unknown> {
    return this.epcWorkspaceService.getReviewMode(
      this.ctx(user),
      designPackageId,
      reviewSessionId,
    );
  }

  @Get('design-packages/:packageId/current-edvs')
  @DelegatePermissionCheck()
  @ApiOperation({ summary: 'Current isCurrent EDVs for a design package' })
  currentEdvs(
    @CurrentUser() user: AuthenticatedUser,
    @Param('packageId') packageId: string,
  ): Promise<unknown> {
    return this.changeRequestService.listCurrentEdvs(this.ctx(user), packageId);
  }

  @Get('design-packages/:packageId/next-cr-number')
  @DelegatePermissionCheck()
  @ApiOperation({ summary: 'Preview next change request number for a package' })
  nextCrNumber(
    @CurrentUser() user: AuthenticatedUser,
    @Param('packageId') packageId: string,
  ): Promise<unknown> {
    return this.changeRequestService.previewNextCrNumber(
      this.ctx(user),
      packageId,
    );
  }

  @Get('engineering-documents/:engineeringDocumentId/version-history')
  @DelegatePermissionCheck()
  @ApiOperation({ summary: 'EDV version history with workflow events' })
  versionHistory(
    @CurrentUser() user: AuthenticatedUser,
    @Param('engineeringDocumentId') engineeringDocumentId: string,
  ): Promise<unknown> {
    return this.epcWorkspaceService.getVersionHistory(
      this.ctx(user),
      engineeringDocumentId,
    );
  }
}
