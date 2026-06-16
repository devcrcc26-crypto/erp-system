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
import { AuthenticatedUser } from '../../../../shared/types/jwt-payload.type';
import {
  CreateIssueDto,
  PmListQueryDto,
  UpdateIssueDto,
} from '../../application/dtos/pm.dtos';
import { IssuesService } from '../../application/services/issues.service';

@ApiTags('Issues')
@ApiBearerAuth()
@UseGuards(PermissionsGuard)
@Controller('projects/:projectId/issues')
export class IssuesController {
  constructor(private readonly issuesService: IssuesService) {}

  private ctx(user: AuthenticatedUser): { companyId: string; userId: string } {
    return { companyId: user.companyId, userId: user.userId };
  }

  @Get()
  @RequirePermission('issues', 'view')
  @ApiOperation({ summary: 'List project issues' })
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Param('projectId') projectId: string,
    @Query() query: PmListQueryDto,
  ): Promise<unknown> {
    return this.issuesService.listIssues(this.ctx(user), projectId, query);
  }

  @Get(':issueId')
  @RequirePermission('issues', 'view')
  @ApiOperation({ summary: 'Get issue by id' })
  get(
    @CurrentUser() user: AuthenticatedUser,
    @Param('projectId') projectId: string,
    @Param('issueId') issueId: string,
  ): Promise<unknown> {
    return this.issuesService.getIssue(this.ctx(user), projectId, issueId);
  }

  @Post()
  @RequirePermission('issues', 'create')
  @ApiOperation({ summary: 'Create issue' })
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Param('projectId') projectId: string,
    @Body() dto: CreateIssueDto,
  ): Promise<unknown> {
    return this.issuesService.createIssue(this.ctx(user), projectId, dto);
  }

  @Patch(':issueId')
  @RequirePermission('issues', 'edit')
  @ApiOperation({ summary: 'Update issue' })
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
