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
  CreateMeetingDto,
  PmListQueryDto,
  UpdateMeetingDto,
} from '../../application/dtos/pm.dtos';
import { MeetingsService } from '../../application/services/meetings.service';

@ApiTags('Meetings')
@ApiBearerAuth()
@UseGuards(PermissionsGuard)
@Controller('projects/:projectId/meetings')
export class MeetingsController {
  constructor(private readonly meetingsService: MeetingsService) {}

  private ctx(user: AuthenticatedUser): { companyId: string; userId: string } {
    return { companyId: user.companyId, userId: user.userId };
  }

  @Get()
  @RequirePermission('meetings', 'view')
  @ApiOperation({ summary: 'List project meetings' })
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Param('projectId') projectId: string,
    @Query() query: PmListQueryDto,
  ): Promise<unknown> {
    return this.meetingsService.listMeetings(this.ctx(user), projectId, query);
  }

  @Post()
  @RequirePermission('meetings', 'create')
  @ApiOperation({ summary: 'Create meeting' })
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Param('projectId') projectId: string,
    @Body() dto: CreateMeetingDto,
  ): Promise<unknown> {
    return this.meetingsService.createMeeting(this.ctx(user), projectId, dto);
  }

  @Get(':id')
  @RequirePermission('meetings', 'view')
  @ApiOperation({ summary: 'Get meeting by id' })
  get(
    @CurrentUser() user: AuthenticatedUser,
    @Param('projectId') projectId: string,
    @Param('id') id: string,
  ): Promise<unknown> {
    return this.meetingsService.getMeeting(this.ctx(user), projectId, id);
  }

  @Patch(':id')
  @RequirePermission('meetings', 'edit')
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
