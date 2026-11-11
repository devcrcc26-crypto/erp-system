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
  CreateActionItemDto,
  CreateIssueFromActionItemDto,
  CreateMeetingAgendaItemDto,
  CreateMeetingAttendeeDto,
  CreateMeetingDto,
  PmListQueryDto,
  UpdateActionItemDto,
  UpdateMeetingAgendaItemDto,
  UpdateMeetingAttendeeDto,
  UpdateMeetingDto,
} from '../../application/dtos/pm.dtos';
import { MeetingsService } from '../../application/services/meetings.service';
import { PmModuleAccessGuard } from '../guards/pm-module-access.guard';
import { RequirePmModule } from '../guards/require-pm-module.decorator';

@ApiTags('Meetings')
@ApiBearerAuth()
@PmApi()
@UseGuards(PermissionsGuard, PmModuleAccessGuard)
@RequirePmModule('meetings')
@Controller('projects/:projectId/meetings')
export class MeetingsController {
  constructor(private readonly meetingsService: MeetingsService) {}

  private ctx(user: AuthenticatedUser): { companyId: string; userId: string } {
    return { companyId: user.companyId, userId: user.userId };
  }

  @Get()
  @DelegatePermissionCheck()
  @ApiOperation({ summary: 'List project meetings' })
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Param('projectId') projectId: string,
    @Query() query: PmListQueryDto,
  ): Promise<unknown> {
    return this.meetingsService.listMeetings(this.ctx(user), projectId, query);
  }

  @Post()
  @DelegatePermissionCheck()
  @ApiOperation({ summary: 'Create meeting' })
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Param('projectId') projectId: string,
    @Body() dto: CreateMeetingDto,
  ): Promise<unknown> {
    return this.meetingsService.createMeeting(this.ctx(user), projectId, dto);
  }

  @Post(':id/agenda')
  @RequirePermission('meetings', 'create')
  @ApiOperation({ summary: 'Add agenda item' })
  addAgendaItem(
    @CurrentUser() user: AuthenticatedUser,
    @Param('projectId') projectId: string,
    @Param('id') id: string,
    @Body() dto: CreateMeetingAgendaItemDto,
  ): Promise<unknown> {
    return this.meetingsService.addAgendaItem(
      this.ctx(user),
      projectId,
      id,
      dto,
    );
  }

  @Patch(':id/agenda/:agendaItemId')
  @RequirePermission('meetings', 'edit')
  @ApiOperation({ summary: 'Update agenda item' })
  updateAgendaItem(
    @CurrentUser() user: AuthenticatedUser,
    @Param('projectId') projectId: string,
    @Param('id') id: string,
    @Param('agendaItemId') agendaItemId: string,
    @Body() dto: UpdateMeetingAgendaItemDto,
  ): Promise<unknown> {
    return this.meetingsService.updateAgendaItem(
      this.ctx(user),
      projectId,
      id,
      agendaItemId,
      dto,
    );
  }

  @Delete(':id/agenda/:agendaItemId')
  @RequirePermission('meetings', 'edit')
  @ApiOperation({ summary: 'Remove agenda item' })
  async removeAgendaItem(
    @CurrentUser() user: AuthenticatedUser,
    @Param('projectId') projectId: string,
    @Param('id') id: string,
    @Param('agendaItemId') agendaItemId: string,
  ): Promise<{ message: string }> {
    await this.meetingsService.removeAgendaItem(
      this.ctx(user),
      projectId,
      id,
      agendaItemId,
    );
    return { message: 'Agenda item removed' };
  }

  @Post(':id/attendees')
  @DelegatePermissionCheck()
  @ApiOperation({ summary: 'Add attendee' })
  addAttendee(
    @CurrentUser() user: AuthenticatedUser,
    @Param('projectId') projectId: string,
    @Param('id') id: string,
    @Body() dto: CreateMeetingAttendeeDto,
  ): Promise<unknown> {
    return this.meetingsService.addAttendee(
      this.ctx(user),
      projectId,
      id,
      dto,
    );
  }

  @Patch(':id/attendees/:attendeeId')
  @DelegatePermissionCheck()
  @ApiOperation({ summary: 'Update attendee' })
  updateAttendee(
    @CurrentUser() user: AuthenticatedUser,
    @Param('projectId') projectId: string,
    @Param('id') id: string,
    @Param('attendeeId') attendeeId: string,
    @Body() dto: UpdateMeetingAttendeeDto,
  ): Promise<unknown> {
    return this.meetingsService.updateAttendee(
      this.ctx(user),
      projectId,
      id,
      attendeeId,
      dto,
    );
  }

  @Delete(':id/attendees/:attendeeId')
  @DelegatePermissionCheck()
  @ApiOperation({ summary: 'Remove attendee' })
  async removeAttendee(
    @CurrentUser() user: AuthenticatedUser,
    @Param('projectId') projectId: string,
    @Param('id') id: string,
    @Param('attendeeId') attendeeId: string,
  ): Promise<{ message: string }> {
    await this.meetingsService.removeAttendee(
      this.ctx(user),
      projectId,
      id,
      attendeeId,
    );
    return { message: 'Attendee removed' };
  }

  @Post(':id/action-items')
  @DelegatePermissionCheck()
  @ApiOperation({ summary: 'Add action item' })
  addActionItem(
    @CurrentUser() user: AuthenticatedUser,
    @Param('projectId') projectId: string,
    @Param('id') id: string,
    @Body() dto: CreateActionItemDto,
  ): Promise<unknown> {
    return this.meetingsService.addActionItem(
      this.ctx(user),
      projectId,
      id,
      dto,
    );
  }

  @Patch(':id/action-items/:actionItemId')
  @DelegatePermissionCheck()
  @ApiOperation({ summary: 'Update action item' })
  updateActionItem(
    @CurrentUser() user: AuthenticatedUser,
    @Param('projectId') projectId: string,
    @Param('id') id: string,
    @Param('actionItemId') actionItemId: string,
    @Body() dto: UpdateActionItemDto,
  ): Promise<unknown> {
    return this.meetingsService.updateActionItem(
      this.ctx(user),
      projectId,
      id,
      actionItemId,
      dto,
    );
  }

  @Delete(':id/action-items/:actionItemId')
  @DelegatePermissionCheck()
  @ApiOperation({ summary: 'Remove action item' })
  async removeActionItem(
    @CurrentUser() user: AuthenticatedUser,
    @Param('projectId') projectId: string,
    @Param('id') id: string,
    @Param('actionItemId') actionItemId: string,
  ): Promise<{ message: string }> {
    await this.meetingsService.removeActionItem(
      this.ctx(user),
      projectId,
      id,
      actionItemId,
    );
    return { message: 'Action item removed' };
  }

  @Post(':id/action-items/:actionItemId/create-issue')
  @DelegatePermissionCheck()
  @ApiOperation({ summary: 'Create an Issue from a meeting action item' })
  createIssueFromActionItem(
    @CurrentUser() user: AuthenticatedUser,
    @Param('projectId') projectId: string,
    @Param('id') id: string,
    @Param('actionItemId') actionItemId: string,
    @Body() dto: CreateIssueFromActionItemDto,
  ): Promise<unknown> {
    return this.meetingsService.createIssueFromActionItem(
      this.ctx(user),
      projectId,
      id,
      actionItemId,
      dto,
    );
  }

  @Get('eligible-subtasks')
  @DelegatePermissionCheck()
  @ApiOperation({ summary: 'List subtasks eligible for a subtask-scoped meeting' })
  listEligibleSubtasks(
    @CurrentUser() user: AuthenticatedUser,
    @Param('projectId') projectId: string,
  ): Promise<unknown> {
    return this.meetingsService.listEligibleSubtasks(this.ctx(user), projectId);
  }

  @Get(':id')
  @DelegatePermissionCheck()
  @ApiOperation({ summary: 'Get meeting by id' })
  get(
    @CurrentUser() user: AuthenticatedUser,
    @Param('projectId') projectId: string,
    @Param('id') id: string,
  ): Promise<unknown> {
    return this.meetingsService.getMeeting(this.ctx(user), projectId, id);
  }

  @Patch(':id')
  @DelegatePermissionCheck()
  @ApiOperation({ summary: 'Update meeting' })
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('projectId') projectId: string,
    @Param('id') id: string,
    @Body() dto: UpdateMeetingDto,
  ): Promise<unknown> {
    return this.meetingsService.updateMeeting(
      this.ctx(user),
      projectId,
      id,
      dto,
    );
  }

  @Patch(':id/cancel')
  @DelegatePermissionCheck()
  @ApiOperation({ summary: 'Cancel a scheduled meeting' })
  cancel(
    @CurrentUser() user: AuthenticatedUser,
    @Param('projectId') projectId: string,
    @Param('id') id: string,
  ): Promise<unknown> {
    return this.meetingsService.cancelMeeting(this.ctx(user), projectId, id);
  }

  @Delete(':id')
  @RequirePermission('meetings', 'delete')
  @ApiOperation({ summary: 'Delete meeting' })
  async remove(
    @CurrentUser() user: AuthenticatedUser,
    @Param('projectId') projectId: string,
    @Param('id') id: string,
  ): Promise<{ message: string }> {
    await this.meetingsService.deleteMeeting(this.ctx(user), projectId, id);
    return { message: 'Meeting deleted' };
  }
}
