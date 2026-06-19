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
import { PaginationQueryDto } from '../../../../shared/dtos/pagination-query.dto';
import { PermissionsGuard } from '../../../../shared/permissions/permissions.guard';
import { RequirePermission } from '../../../../shared/permissions/require-permission.decorator';
import { AuthenticatedUser } from '../../../../shared/types/jwt-payload.type';
import {
  CreateMilestoneDto,
  CreateTaskDependencyDto,
  CreateTaskDisciplineDto,
  CreateTaskDto,
  UpdateMilestoneDto,
  UpdateTaskDisciplineDto,
  UpdateTaskDependencyDto,
  UpdateTaskDto,
} from '../../application/dtos/pm.dtos';
import { ScheduleService } from '../../application/services/schedule.service';

@ApiTags('Schedule')
@ApiBearerAuth()
@UseGuards(PermissionsGuard)
@Controller('projects/:projectId/schedule')
export class ScheduleController {
  constructor(private readonly scheduleService: ScheduleService) {}

  private ctx(user: AuthenticatedUser): { companyId: string; userId: string } {
    return { companyId: user.companyId, userId: user.userId };
  }

  @Get('milestones')
  @RequirePermission('schedule', 'view')
  @ApiOperation({ summary: 'List project milestones' })
  listMilestones(
    @CurrentUser() user: AuthenticatedUser,
    @Param('projectId') projectId: string,
    @Query() query: PaginationQueryDto,
  ): Promise<unknown> {
    return this.scheduleService.listMilestones(this.ctx(user), projectId, query);
  }

  @Post('milestones')
  @RequirePermission('schedule', 'create')
  @ApiOperation({ summary: 'Create project milestone' })
  createMilestone(
    @CurrentUser() user: AuthenticatedUser,
    @Param('projectId') projectId: string,
    @Body() dto: CreateMilestoneDto,
  ): Promise<unknown> {
    return this.scheduleService.createMilestone(this.ctx(user), projectId, dto);
  }

  @Patch('milestones/:id')
  @RequirePermission('schedule', 'edit')
  @ApiOperation({ summary: 'Update project milestone' })
  updateMilestone(
    @CurrentUser() user: AuthenticatedUser,
    @Param('projectId') projectId: string,
    @Param('id') id: string,
    @Body() dto: UpdateMilestoneDto,
  ): Promise<unknown> {
    return this.scheduleService.updateMilestone(
      this.ctx(user),
      projectId,
      id,
      dto,
    );
  }

  @Delete('milestones/:id')
  @RequirePermission('schedule', 'delete')
  @ApiOperation({ summary: 'Delete project milestone' })
  async deleteMilestone(
    @CurrentUser() user: AuthenticatedUser,
    @Param('projectId') projectId: string,
    @Param('id') id: string,
  ): Promise<{ message: string }> {
    await this.scheduleService.deleteMilestone(this.ctx(user), projectId, id);
    return { message: 'Milestone deleted' };
  }

  @Get('tasks')
  @RequirePermission('schedule', 'view')
  @ApiOperation({ summary: 'List project tasks' })
  listTasks(
    @CurrentUser() user: AuthenticatedUser,
    @Param('projectId') projectId: string,
    @Query() query: PaginationQueryDto,
  ): Promise<unknown> {
    return this.scheduleService.listTasks(this.ctx(user), projectId, query);
  }

  @Post('tasks')
  @RequirePermission('schedule', 'create')
  @ApiOperation({ summary: 'Create project task' })
  createTask(
    @CurrentUser() user: AuthenticatedUser,
    @Param('projectId') projectId: string,
    @Body() dto: CreateTaskDto,
  ): Promise<unknown> {
    return this.scheduleService.createTask(this.ctx(user), projectId, dto);
  }

  @Patch('tasks/:id')
  @RequirePermission('schedule', 'edit')
  @ApiOperation({ summary: 'Update project task' })
  updateTask(
    @CurrentUser() user: AuthenticatedUser,
    @Param('projectId') projectId: string,
    @Param('id') id: string,
    @Body() dto: UpdateTaskDto,
  ): Promise<unknown> {
    return this.scheduleService.updateTask(this.ctx(user), projectId, id, dto);
  }

  @Delete('tasks/:id')
  @RequirePermission('schedule', 'delete')
  @ApiOperation({ summary: 'Delete project task' })
  async deleteTask(
    @CurrentUser() user: AuthenticatedUser,
    @Param('projectId') projectId: string,
    @Param('id') id: string,
  ): Promise<{ message: string }> {
    await this.scheduleService.deleteTask(this.ctx(user), projectId, id);
    return { message: 'Task deleted' };
  }

  @Get('disciplines')
  @RequirePermission('schedule', 'view')
  @ApiOperation({ summary: 'List all project schedule disciplines' })
  listProjectDisciplines(
    @CurrentUser() user: AuthenticatedUser,
    @Param('projectId') projectId: string,
  ): Promise<unknown> {
    return this.scheduleService.listProjectDisciplines(
      this.ctx(user),
      projectId,
    );
  }

  @Get('disciplines/:disciplineId')
  @RequirePermission('schedule', 'view')
  @ApiOperation({ summary: 'Get project schedule discipline by id' })
  getProjectDiscipline(
    @CurrentUser() user: AuthenticatedUser,
    @Param('projectId') projectId: string,
    @Param('disciplineId') disciplineId: string,
  ): Promise<unknown> {
    return this.scheduleService.getProjectDiscipline(
      this.ctx(user),
      projectId,
      disciplineId,
    );
  }

  @Get('tasks/:taskId/disciplines')
  @RequirePermission('schedule', 'view')
  @ApiOperation({ summary: 'List task disciplines' })
  listTaskDisciplines(
    @CurrentUser() user: AuthenticatedUser,
    @Param('projectId') projectId: string,
    @Param('taskId') taskId: string,
  ): Promise<unknown> {
    return this.scheduleService.listTaskDisciplines(
      this.ctx(user),
      projectId,
      taskId,
    );
  }

  @Post('tasks/:taskId/disciplines')
  @RequirePermission('schedule', 'create')
  @ApiOperation({ summary: 'Create task discipline' })
  createTaskDiscipline(
    @CurrentUser() user: AuthenticatedUser,
    @Param('projectId') projectId: string,
    @Param('taskId') taskId: string,
    @Body() dto: CreateTaskDisciplineDto,
  ): Promise<unknown> {
    return this.scheduleService.createTaskDiscipline(
      this.ctx(user),
      projectId,
      taskId,
      dto,
    );
  }

  @Patch('tasks/:taskId/disciplines/:disciplineId')
  @RequirePermission('schedule', 'edit')
  @ApiOperation({ summary: 'Update task discipline' })
  updateTaskDiscipline(
    @CurrentUser() user: AuthenticatedUser,
    @Param('projectId') projectId: string,
    @Param('taskId') taskId: string,
    @Param('disciplineId') disciplineId: string,
    @Body() dto: UpdateTaskDisciplineDto,
  ): Promise<unknown> {
    return this.scheduleService.updateTaskDiscipline(
      this.ctx(user),
      projectId,
      taskId,
      disciplineId,
      dto,
    );
  }

  @Delete('tasks/:taskId/disciplines/:disciplineId')
  @RequirePermission('schedule', 'delete')
  @ApiOperation({ summary: 'Delete task discipline' })
  async deleteTaskDiscipline(
    @CurrentUser() user: AuthenticatedUser,
    @Param('projectId') projectId: string,
    @Param('taskId') taskId: string,
    @Param('disciplineId') disciplineId: string,
  ): Promise<{ message: string }> {
    await this.scheduleService.deleteTaskDiscipline(
      this.ctx(user),
      projectId,
      taskId,
      disciplineId,
    );
    return { message: 'Task discipline deleted' };
  }

  @Get('task-dependencies')
  @RequirePermission('schedule', 'view')
  @ApiOperation({ summary: 'List project task dependencies' })
  listTaskDependencies(
    @CurrentUser() user: AuthenticatedUser,
    @Param('projectId') projectId: string,
  ): Promise<unknown> {
    return this.scheduleService.listTaskDependencies(
      this.ctx(user),
      projectId,
    );
  }

  @Post('task-dependencies')
  @RequirePermission('schedule', 'create')
  @ApiOperation({ summary: 'Create task dependency' })
  createTaskDependency(
    @CurrentUser() user: AuthenticatedUser,
    @Param('projectId') projectId: string,
    @Body() dto: CreateTaskDependencyDto,
  ): Promise<unknown> {
    return this.scheduleService.createTaskDependency(
      this.ctx(user),
      projectId,
      dto,
    );
  }

  @Patch('task-dependencies/:id')
  @RequirePermission('schedule', 'edit')
  @ApiOperation({ summary: 'Update task dependency' })
  updateTaskDependency(
    @CurrentUser() user: AuthenticatedUser,
    @Param('projectId') projectId: string,
    @Param('id') id: string,
    @Body() dto: UpdateTaskDependencyDto,
  ): Promise<unknown> {
    return this.scheduleService.updateTaskDependency(
      this.ctx(user),
      projectId,
      id,
      dto,
    );
  }

  @Delete('task-dependencies/:id')
  @RequirePermission('schedule', 'delete')
  @ApiOperation({ summary: 'Delete task dependency' })
  async deleteTaskDependency(
    @CurrentUser() user: AuthenticatedUser,
    @Param('projectId') projectId: string,
    @Param('id') id: string,
  ): Promise<{ message: string }> {
    await this.scheduleService.deleteTaskDependency(
      this.ctx(user),
      projectId,
      id,
    );
    return { message: 'Task dependency deleted' };
  }
}
