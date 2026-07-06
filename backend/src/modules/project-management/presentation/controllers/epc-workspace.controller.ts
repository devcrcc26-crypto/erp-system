import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../../../shared/decorators/current-user.decorator';
import { PermissionsGuard } from '../../../../shared/permissions/permissions.guard';
import { RequireAnyPermission } from '../../../../shared/permissions/require-any-permission.decorator';
import { RequirePermission } from '../../../../shared/permissions/require-permission.decorator';
import { AuthenticatedUser } from '../../../../shared/types/jwt-payload.type';
import { EpcWorkspaceService } from '../../application/services/epc-workspace.service';
import { MyWorkService } from '../../application/services/my-work.service';
import { ReviewSessionListQueryDto } from '../../application/dtos/pm.dtos';

@ApiTags('EPC Workspace')
@ApiBearerAuth()
@UseGuards(PermissionsGuard)
@Controller()
export class EpcWorkspaceController {
  constructor(
    private readonly epcWorkspaceService: EpcWorkspaceService,
    private readonly myWorkService: MyWorkService,
  ) {}

  private ctx(user: AuthenticatedUser): { companyId: string; userId: string } {
    return { companyId: user.companyId, userId: user.userId };
  }

  @Get('my-work')
  @RequirePermission('schedule', 'view')
  @ApiOperation({ summary: 'Tasks and subtasks assigned to the current user' })
  myWork(@CurrentUser() user: AuthenticatedUser): Promise<unknown> {
    return this.myWorkService.getMyWork(this.ctx(user));
  }

  @Get('projects/:projectId/my-work')
  @RequirePermission('schedule', 'view')
  @ApiOperation({ summary: 'Assigned work scoped to a project' })
  projectMyWork(
    @CurrentUser() user: AuthenticatedUser,
    @Param('projectId') projectId: string,
  ): Promise<unknown> {
    return this.myWorkService.getMyWork(this.ctx(user), projectId);
  }

  @Get('review-inbox')
  @RequireAnyPermission(
    { module: 'schedule', action: 'approve' },
    { module: 'schedule', action: 'view' },
    { module: 'review_sessions', action: 'approve' },
  )
  @ApiOperation({ summary: 'Review inbox for current user' })
  reviewInbox(@CurrentUser() user: AuthenticatedUser): Promise<unknown> {
    return this.epcWorkspaceService.getReviewInbox(this.ctx(user));
  }

  @Get('my-comments')
  @RequirePermission('schedule', 'view')
  @ApiOperation({ summary: 'Open comments assigned to current user' })
  myComments(@CurrentUser() user: AuthenticatedUser): Promise<unknown> {
    return this.epcWorkspaceService.getMyComments(this.ctx(user));
  }

  @Get('projects/:projectId/review-inbox')
  @RequireAnyPermission(
    { module: 'schedule', action: 'approve' },
    { module: 'schedule', action: 'view' },
    { module: 'review_sessions', action: 'approve' },
  )
  @ApiOperation({ summary: 'Review inbox for current user scoped to a project' })
  projectReviewInbox(
    @CurrentUser() user: AuthenticatedUser,
    @Param('projectId') projectId: string,
  ): Promise<unknown> {
    return this.epcWorkspaceService.getReviewInbox(this.ctx(user), projectId);
  }

  @Get('projects/:projectId/my-comments')
  @RequirePermission('schedule', 'view')
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
  @RequirePermission('schedule', 'view')
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
  @RequirePermission('schedule', 'view')
  @ApiOperation({ summary: 'Review mode payload for a design package' })
  reviewMode(
    @CurrentUser() user: AuthenticatedUser,
    @Param('designPackageId') designPackageId: string,
  ): Promise<unknown> {
    return this.epcWorkspaceService.getReviewMode(this.ctx(user), designPackageId);
  }

  @Get('engineering-documents/:engineeringDocumentId/version-history')
  @RequirePermission('schedule', 'view')
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
