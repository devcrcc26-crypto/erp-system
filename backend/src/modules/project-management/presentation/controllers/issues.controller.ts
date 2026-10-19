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
import { DelegatePermissionCheck } from '../../../../shared/permissions/delegate-permission-check.decorator';
import { PermissionsGuard } from '../../../../shared/permissions/permissions.guard';
import { RequirePermission } from '../../../../shared/permissions/require-permission.decorator';
import { AuthenticatedUser } from '../../../../shared/types/jwt-payload.type';
import {
  CloseIssueDto,
  CreateIssueDto,
  CreateIssueResponseDto,
  LinkIssueCrDto,
  PmListQueryDto,
  ReopenIssueDto,
  StartIssueDto,
  UpdateIssueDto,
} from '../../application/dtos/pm.dtos';
import { IssuesService } from '../../application/services/issues.service';
import { PmModuleAccessGuard } from '../guards/pm-module-access.guard';
import { RequirePmModule } from '../guards/require-pm-module.decorator';

@ApiTags('Issues')
@ApiBearerAuth()
@PmApi()
@UseGuards(PermissionsGuard, PmModuleAccessGuard)
@RequirePmModule('issues')
@Controller('projects/:projectId/issues')
export class IssuesController {
  constructor(private readonly issuesService: IssuesService) {}

  private ctx(user: AuthenticatedUser): { companyId: string; userId: string } {
    return { companyId: user.companyId, userId: user.userId };
  }

  @Get()
  @DelegatePermissionCheck()
  @ApiOperation({ summary: 'List project issues' })
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Param('projectId') projectId: string,
    @Query() query: PmListQueryDto,
  ): Promise<unknown> {
    return this.issuesService.listIssues(this.ctx(user), projectId, query);
  }

  @Get(':issueId')
  @DelegatePermissionCheck()
  @ApiOperation({ summary: 'Get issue by id' })
  get(
    @CurrentUser() user: AuthenticatedUser,
    @Param('projectId') projectId: string,
    @Param('issueId') issueId: string,
  ): Promise<unknown> {
    return this.issuesService.getIssue(this.ctx(user), projectId, issueId);
  }

  @Post()
  @DelegatePermissionCheck()
  @ApiOperation({ summary: 'Create issue' })
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Param('projectId') projectId: string,
    @Body() dto: CreateIssueDto,
  ): Promise<unknown> {
    return this.issuesService.createIssue(this.ctx(user), projectId, dto);
  }

  @Patch(':issueId')
  @DelegatePermissionCheck()
  @ApiOperation({ summary: 'Update issue fields (status via action routes)' })
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('projectId') projectId: string,
    @Param('issueId') issueId: string,
    @Body() dto: UpdateIssueDto,
  ): Promise<unknown> {
    return this.issuesService.updateIssue(
      this.ctx(user),
      projectId,
      issueId,
      dto,
    );
  }

  @Patch(':issueId/start')
  @DelegatePermissionCheck()
  @ApiOperation({ summary: 'Start working on an issue (OPEN â†?IN_PROGRESS)' })
  start(
    @CurrentUser() user: AuthenticatedUser,
    @Param('projectId') projectId: string,
    @Param('issueId') issueId: string,
    @Body() dto: StartIssueDto,
  ): Promise<unknown> {
    return this.issuesService.startIssue(
      this.ctx(user),
      projectId,
      issueId,
      dto,
    );
  }

  @Patch(':issueId/close')
  @DelegatePermissionCheck()
  @ApiOperation({
    summary: 'Close an in-progress issue (IN_PROGRESS â†?CLOSED)',
  })
  close(
    @CurrentUser() user: AuthenticatedUser,
    @Param('projectId') projectId: string,
    @Param('issueId') issueId: string,
    @Body() dto: CloseIssueDto,
  ): Promise<unknown> {
    return this.issuesService.closeIssue(
      this.ctx(user),
      projectId,
      issueId,
      dto,
    );
  }

  @Patch(':issueId/reopen')
  @DelegatePermissionCheck()
  @ApiOperation({ summary: 'Reopen a closed issue â†?IN_PROGRESS' })
  reopen(
    @CurrentUser() user: AuthenticatedUser,
    @Param('projectId') projectId: string,
    @Param('issueId') issueId: string,
    @Body() dto: ReopenIssueDto,
  ): Promise<unknown> {
    return this.issuesService.reopenIssue(
      this.ctx(user),
      projectId,
      issueId,
      dto,
    );
  }

  @Patch(':issueId/link-cr')
  @DelegatePermissionCheck()
  @ApiOperation({ summary: 'Link a change request to an issue' })
  linkCr(
    @CurrentUser() user: AuthenticatedUser,
    @Param('projectId') projectId: string,
    @Param('issueId') issueId: string,
    @Body() dto: LinkIssueCrDto,
  ): Promise<unknown> {
    return this.issuesService.linkChangeRequest(
      this.ctx(user),
      projectId,
      issueId,
      dto,
    );
  }

  @Get(':issueId/responses')
  @DelegatePermissionCheck()
  @ApiOperation({ summary: 'List issue responses' })
  listResponses(
    @CurrentUser() user: AuthenticatedUser,
    @Param('projectId') projectId: string,
    @Param('issueId') issueId: string,
  ): Promise<unknown> {
    return this.issuesService.listIssueResponses(
      this.ctx(user),
      projectId,
      issueId,
    );
  }

  @Post(':issueId/responses')
  @DelegatePermissionCheck()
  @ApiOperation({ summary: 'Add an issue response' })
  addResponse(
    @CurrentUser() user: AuthenticatedUser,
    @Param('projectId') projectId: string,
    @Param('issueId') issueId: string,
    @Body() dto: CreateIssueResponseDto,
  ): Promise<unknown> {
    return this.issuesService.addIssueResponse(
      this.ctx(user),
      projectId,
      issueId,
      dto,
    );
  }

  @Delete(':issueId')
  @RequirePermission('issues', 'delete')
  @ApiOperation({ summary: 'Delete issue' })
  async remove(
    @CurrentUser() user: AuthenticatedUser,
    @Param('projectId') projectId: string,
    @Param('issueId') issueId: string,
  ): Promise<{ message: string }> {
    await this.issuesService.deleteIssue(this.ctx(user), projectId, issueId);
    return { message: 'Issue deleted' };
  }
}
