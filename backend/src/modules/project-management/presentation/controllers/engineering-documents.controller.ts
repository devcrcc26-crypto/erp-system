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
import { WorkflowEntityType } from '@prisma/client';
import { PaginationQueryDto } from '../../../../shared/dtos/pagination-query.dto';
import { CurrentUser } from '../../../../shared/decorators/current-user.decorator';
import { DelegatePermissionCheck } from '../../../../shared/permissions/delegate-permission-check.decorator';
import { PermissionsGuard } from '../../../../shared/permissions/permissions.guard';
import { RequirePermission } from '../../../../shared/permissions/require-permission.decorator';
import { AuthenticatedUser } from '../../../../shared/types/jwt-payload.type';
import {
  EngineeringDocumentListQueryDto,
  RegisterEngineeringDocumentDto,
  TransitionEdvStatusDto,
  UpdateEngineeringDocumentDto,
  UpdateEngineeringDocumentVersionDto,
  UploadEngineeringDocumentVersionDto,
} from '../../application/dtos/engineering-document.dtos';
import { EngineeringDocumentsService } from '../../application/services/engineering-documents.service';
import { WorkflowEventLogService } from '../../application/services/workflow-event-log.service';

@ApiTags('Engineering Documents')
@ApiBearerAuth()
@PmApi()
@UseGuards(PermissionsGuard)
@Controller(
  'projects/:projectId/task-disciplines/:taskDisciplineId/engineering-documents',
)
export class EngineeringDocumentsController {
  constructor(
    private readonly engineeringDocumentsService: EngineeringDocumentsService,
    private readonly workflowEventLogService: WorkflowEventLogService,
  ) {}

  private ctx(user: AuthenticatedUser): { companyId: string; userId: string } {
    return { companyId: user.companyId, userId: user.userId };
  }

  @Get()
  @DelegatePermissionCheck()
  @ApiOperation({ summary: 'List engineering documents for a discipline' })
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Param('projectId') projectId: string,
    @Param('taskDisciplineId') taskDisciplineId: string,
    @Query() query: EngineeringDocumentListQueryDto,
  ): Promise<unknown> {
    return this.engineeringDocumentsService.list(
      this.ctx(user),
      projectId,
      taskDisciplineId,
      query,
    );
  }

  @Get('upload-folder')
  @DelegatePermissionCheck()
  @ApiOperation({ summary: 'Resolve discipline document upload folder' })
  uploadFolder(
    @CurrentUser() user: AuthenticatedUser,
    @Param('projectId') projectId: string,
    @Param('taskDisciplineId') taskDisciplineId: string,
  ): Promise<unknown> {
    return this.engineeringDocumentsService.resolveUploadFolder(
      this.ctx(user),
      projectId,
      taskDisciplineId,
    );
  }

  @Post('register')
  @DelegatePermissionCheck()
  @ApiOperation({ summary: 'Register uploaded file as engineering document Rev 0' })
  register(
    @CurrentUser() user: AuthenticatedUser,
    @Param('projectId') projectId: string,
    @Param('taskDisciplineId') taskDisciplineId: string,
    @Body() dto: RegisterEngineeringDocumentDto,
  ): Promise<unknown> {
    return this.engineeringDocumentsService.registerFromUpload(
      this.ctx(user),
      projectId,
      taskDisciplineId,
      dto,
    );
  }

  @Get(':id')
  @DelegatePermissionCheck()
  @ApiOperation({ summary: 'Get engineering document' })
  get(
    @CurrentUser() user: AuthenticatedUser,
    @Param('projectId') projectId: string,
    @Param('taskDisciplineId') taskDisciplineId: string,
    @Param('id') id: string,
  ): Promise<unknown> {
    return this.engineeringDocumentsService.getById(
      this.ctx(user),
      projectId,
      taskDisciplineId,
      id,
    );
  }

  @Patch(':id')
  @DelegatePermissionCheck()
  @ApiOperation({ summary: 'Update engineering document metadata' })
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('projectId') projectId: string,
    @Param('taskDisciplineId') taskDisciplineId: string,
    @Param('id') id: string,
    @Body() dto: UpdateEngineeringDocumentDto,
  ): Promise<unknown> {
    return this.engineeringDocumentsService.update(
      this.ctx(user),
      projectId,
      taskDisciplineId,
      id,
      dto,
    );
  }

  @Delete(':id')
  @RequirePermission('schedule', 'delete')
  @ApiOperation({ summary: 'Soft-delete engineering document' })
  async delete(
    @CurrentUser() user: AuthenticatedUser,
    @Param('projectId') projectId: string,
    @Param('taskDisciplineId') taskDisciplineId: string,
    @Param('id') id: string,
  ): Promise<{ message: string }> {
    await this.engineeringDocumentsService.delete(
      this.ctx(user),
      projectId,
      taskDisciplineId,
      id,
    );
    return { message: 'Engineering document deleted' };
  }

  @Post(':id/versions')
  @DelegatePermissionCheck()
  @ApiOperation({ summary: 'Link new core document version as EDV row' })
  uploadVersion(
    @CurrentUser() user: AuthenticatedUser,
    @Param('projectId') projectId: string,
    @Param('taskDisciplineId') taskDisciplineId: string,
    @Param('id') id: string,
    @Body() dto: UploadEngineeringDocumentVersionDto,
  ): Promise<unknown> {
    return this.engineeringDocumentsService.uploadNewVersion(
      this.ctx(user),
      projectId,
      taskDisciplineId,
      id,
      dto,
    );
  }

  @Patch(':id/versions/:versionId')
  @DelegatePermissionCheck()
  @ApiOperation({ summary: 'Update EDV revision label only' })
  updateVersion(
    @CurrentUser() user: AuthenticatedUser,
    @Param('projectId') projectId: string,
    @Param('taskDisciplineId') taskDisciplineId: string,
    @Param('id') id: string,
    @Param('versionId') versionId: string,
    @Body() dto: UpdateEngineeringDocumentVersionDto,
  ): Promise<unknown> {
    return this.engineeringDocumentsService.updateVersion(
      this.ctx(user),
      projectId,
      taskDisciplineId,
      id,
      versionId,
      dto,
    );
  }

  @Post(':id/versions/:versionId/transition')
  @DelegatePermissionCheck()
  @ApiOperation({ summary: 'Transition EDV status via WorkflowKernel Phase A' })
  transitionVersion(
    @CurrentUser() user: AuthenticatedUser,
    @Param('projectId') projectId: string,
    @Param('taskDisciplineId') taskDisciplineId: string,
    @Param('id') id: string,
    @Param('versionId') versionId: string,
    @Body() dto: TransitionEdvStatusDto,
  ): Promise<unknown> {
    return this.engineeringDocumentsService.transitionEdvStatus(
      this.ctx(user),
      projectId,
      taskDisciplineId,
      id,
      versionId,
      dto,
    );
  }

  @Get(':id/versions/:versionId/events')
  @DelegatePermissionCheck()
  @ApiOperation({ summary: 'List workflow event log for EDV' })
  listVersionEvents(
    @CurrentUser() user: AuthenticatedUser,
    @Param('versionId') versionId: string,
    @Query() query: PaginationQueryDto,
  ): Promise<unknown> {
    return this.workflowEventLogService.listByEntity(
      this.ctx(user),
      WorkflowEntityType.EngineeringDocumentVersion,
      versionId,
      query,
    );
  }
}
