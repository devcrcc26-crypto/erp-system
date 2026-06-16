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
  AddProjectTeamMemberDto,
  CreateProjectDto,
  ProjectListQueryDto,
  UpdateProjectDto,
} from '../../application/dtos/pm.dtos';
import { ProjectsService } from '../../application/services/projects.service';

@ApiTags('Projects')
@ApiBearerAuth()
@UseGuards(PermissionsGuard)
@Controller('projects')
export class ProjectsController {
  constructor(private readonly projectsService: ProjectsService) {}

  private ctx(user: AuthenticatedUser): { companyId: string; userId: string } {
    return { companyId: user.companyId, userId: user.userId };
  }

  @Get()
  @RequirePermission('projects', 'view')
  @ApiOperation({ summary: 'List projects' })
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: ProjectListQueryDto,
  ): Promise<unknown> {
    return this.projectsService.listProjects(this.ctx(user), query);
  }

  @Get(':projectId/dashboard')
  @RequirePermission('projects', 'view')
  @ApiOperation({ summary: 'Get project dashboard stats' })
  dashboard(
    @CurrentUser() user: AuthenticatedUser,
    @Param('projectId') projectId: string,
  ): Promise<unknown> {
    return this.projectsService.getDashboardStats(this.ctx(user), projectId);
  }

  @Get(':projectId/team')
  @RequirePermission('projects', 'view')
  @ApiOperation({ summary: 'List project team members' })
  listTeam(
    @CurrentUser() user: AuthenticatedUser,
    @Param('projectId') projectId: string,
  ): Promise<unknown> {
    return this.projectsService.listTeam(this.ctx(user), projectId);
  }

  @Post(':projectId/team')
  @RequirePermission('projects', 'edit')
  @ApiOperation({ summary: 'Add project team member' })
  addTeamMember(
    @CurrentUser() user: AuthenticatedUser,
    @Param('projectId') projectId: string,
    @Body() dto: AddProjectTeamMemberDto,
  ): Promise<unknown> {
    return this.projectsService.addTeamMember(this.ctx(user), projectId, dto);
  }

  @Delete(':projectId/team/:memberId')
  @RequirePermission('projects', 'edit')
  @ApiOperation({ summary: 'Remove project team member' })
  async removeTeamMember(
    @CurrentUser() user: AuthenticatedUser,
    @Param('projectId') projectId: string,
    @Param('memberId') memberId: string,
  ): Promise<{ message: string }> {
    await this.projectsService.removeTeamMember(
      this.ctx(user),
      projectId,
      memberId,
    );
    return { message: 'Team member removed' };
  }

  @Get(':id')
  @RequirePermission('projects', 'view')
  @ApiOperation({ summary: 'Get project by id' })
  get(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ): Promise<unknown> {
    return this.projectsService.getProject(this.ctx(user), id);
  }

  @Post()
  @RequirePermission('projects', 'create')
  @ApiOperation({ summary: 'Create project' })
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateProjectDto,
  ): Promise<unknown> {
    return this.projectsService.createProject(this.ctx(user), dto);
  }

  @Patch(':id')
  @RequirePermission('projects', 'edit')
  @ApiOperation({ summary: 'Update project' })
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: UpdateProjectDto,
  ): Promise<unknown> {
    return this.projectsService.updateProject(this.ctx(user), id, dto);
  }

  @Delete(':id')
  @RequirePermission('projects', 'delete')
  @ApiOperation({ summary: 'Delete project' })
  async remove(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ): Promise<{ message: string }> {
    await this.projectsService.deleteProject(this.ctx(user), id);
    return { message: 'Project deleted' };
  }
}
