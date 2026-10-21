import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Put,
  Query,
  StreamableFile,
  UseGuards,
} from '@nestjs/common';
import { PmApi } from '../decorators/pm-api.decorator';
import { ApiBearerAuth, ApiOperation, ApiProduces, ApiQuery, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../../../shared/decorators/current-user.decorator';
import { PaginationQueryDto } from '../../../../shared/dtos/pagination-query.dto';
import { DelegatePermissionCheck } from '../../../../shared/permissions/delegate-permission-check.decorator';
import { PermissionsGuard } from '../../../../shared/permissions/permissions.guard';
import { RequirePermission } from '../../../../shared/permissions/require-permission.decorator';
import { AuthenticatedUser } from '../../../../shared/types/jwt-payload.type';
import {
  SetProjectTeamDto,
  CreateProjectDto,
  ProjectExportListQueryDto,
  ProjectListQueryDto,
  UpdateProjectDto,
} from '../../application/dtos/pm.dtos';
import { ProjectExportService } from '../../application/services/project-export.service';
import { ProjectReportPdfService } from '../../application/services/project-report-pdf.service';
import { ProjectsExportPdfService } from '../../application/services/projects-export-pdf.service';
import { ProjectsService } from '../../application/services/projects.service';

@ApiTags('Projects')
@ApiBearerAuth()
@PmApi()
@UseGuards(PermissionsGuard)
@Controller('projects')
export class ProjectsController {
  constructor(
    private readonly projectsService: ProjectsService,
    private readonly projectExportService: ProjectExportService,
    private readonly projectsExportPdfService: ProjectsExportPdfService,
    private readonly projectReportPdfService: ProjectReportPdfService,
  ) {}

  private ctx(user: AuthenticatedUser): { companyId: string; userId: string } {
    return { companyId: user.companyId, userId: user.userId };
  }

  @Get()
  @DelegatePermissionCheck()
  @ApiOperation({ summary: 'List projects' })
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: ProjectListQueryDto,
  ): Promise<unknown> {
    return this.projectsService.listProjects(this.ctx(user), query);
  }

  @Get('export/project-list')
  @RequirePermission('projects', 'export')
  @ApiOperation({ summary: 'Export project list as Excel (company-scoped)' })
  async exportProjectList(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: ProjectExportListQueryDto,
  ): Promise<StreamableFile> {
    const buffer = await this.projectExportService.exportProjectList(
      this.ctx(user),
      query,
    );
    return new StreamableFile(buffer, {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      disposition: 'attachment; filename="project-list.xlsx"',
    });
  }

  @Get(':projectId/export/project-list')
  @RequirePermission('projects', 'export')
  @ApiOperation({ summary: 'Export single project row as Excel' })
  async exportProjectListForProject(
    @CurrentUser() user: AuthenticatedUser,
    @Param('projectId') projectId: string,
  ): Promise<StreamableFile> {
    const buffer = await this.projectExportService.exportProjectListForProject(
      this.ctx(user),
      projectId,
    );
    return new StreamableFile(buffer, {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      disposition: `attachment; filename="project-list-${projectId}.xlsx"`,
    });
  }

  @Get(':projectId/dashboard')
  @DelegatePermissionCheck()
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

  @Get(':projectId/assignable-users')
  @DelegatePermissionCheck()
  @ApiOperation({
    summary: 'List users for role assignment pickers on a project',
    description:
      'Returns active company users for subtask role assignment. Accessible to discipline-scoped users with project read access.',
  })
  listAssignableUsers(
    @CurrentUser() user: AuthenticatedUser,
    @Param('projectId') projectId: string,
    @Query() query: PaginationQueryDto,
  ): Promise<unknown> {
    return this.projectsService.listAssignableUsers(
      this.ctx(user),
      projectId,
      query,
    );
  }

  @Put(':projectId/team')
  @RequirePermission('projects', 'edit')
  @ApiOperation({ summary: 'Set project team members' })
  setTeam(
    @CurrentUser() user: AuthenticatedUser,
    @Param('projectId') projectId: string,
    @Body() dto: SetProjectTeamDto,
  ): Promise<unknown> {
    return this.projectsService.setTeam(this.ctx(user), projectId, dto);
  }

  @Get(':projectId')
  @DelegatePermissionCheck()
  @ApiOperation({ summary: 'Get project by id' })
  get(
    @CurrentUser() user: AuthenticatedUser,
    @Param('projectId') projectId: string,
  ): Promise<unknown> {
    return this.projectsService.getProject(this.ctx(user), projectId);
  }

  @Post()
  @HttpCode(201)
  @RequirePermission('projects', 'create')
  @ApiOperation({ summary: 'Create project' })
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateProjectDto,
  ): Promise<unknown> {
    return this.projectsService.createProject(this.ctx(user), dto);
  }

  @Patch(':projectId')
  @RequirePermission('projects', 'edit')
  @ApiOperation({ summary: 'Update project' })
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('projectId') projectId: string,
    @Body() dto: UpdateProjectDto,
  ): Promise<unknown> {
    return this.projectsService.updateProject(this.ctx(user), projectId, dto);
  }

  @Delete(':projectId')
  @RequirePermission('projects', 'delete')
  @ApiOperation({ summary: 'Delete project' })
  async remove(
    @CurrentUser() user: AuthenticatedUser,
    @Param('projectId') projectId: string,
  ): Promise<{ message: string }> {
    await this.projectsService.deleteProject(this.ctx(user), projectId);
    return { message: 'Project deleted' };
  }

  @Get('export/pdf')
  @RequirePermission('projects', 'view')
  @ApiOperation({ summary: 'Export all projects as PDF' })
  @ApiProduces('application/pdf')
  @ApiQuery({ name: 'status', required: false })
  async exportProjectsPdf(
    @CurrentUser() user: AuthenticatedUser,
    @Query('status') status?: string,
  ): Promise<StreamableFile> {
    const file = await this.projectsExportPdfService.getPdf(
      user.companyId,
      status ? { status } : undefined,
    );
    return new StreamableFile(file.buffer, {
      type: file.mimeType,
      disposition: contentDisposition('inline', file.filename),
    });
  }

  @Get(':projectId/report/pdf')
  @RequirePermission('projects', 'view')
  @ApiOperation({ summary: 'Download project report as PDF' })
  @ApiProduces('application/pdf')
  async downloadProjectReportPdf(
    @CurrentUser() user: AuthenticatedUser,
    @Param('projectId') projectId: string,
  ): Promise<StreamableFile> {
    const file = await this.projectReportPdfService.getPdf(projectId, user.companyId);
    return new StreamableFile(file.buffer, {
      type: file.mimeType,
      disposition: contentDisposition('inline', file.filename),
    });
  }
}

function contentDisposition(kind: 'inline' | 'attachment', filename: string): string {
  const ascii = filename.replace(/[^\x20-\x7E]/g, '_').replace(/"/g, '');
  return `${kind}; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(filename)}`;
}
