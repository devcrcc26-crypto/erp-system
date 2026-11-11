import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { PmApi } from '../decorators/pm-api.decorator';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../../../shared/decorators/current-user.decorator';
import { DelegatePermissionCheck } from '../../../../shared/permissions/delegate-permission-check.decorator';
import { PermissionsGuard } from '../../../../shared/permissions/permissions.guard';
import { RequirePermission } from '../../../../shared/permissions/require-permission.decorator';
import { AuthenticatedUser } from '../../../../shared/types/jwt-payload.type';
import { PmListQueryDto } from '../../application/dtos/pm.dtos';
import { MeetingsService } from '../../application/services/meetings.service';

/**
 * Company-scoped meeting routes (no project path param).
 */
@ApiTags('Meetings')
@ApiBearerAuth()
@PmApi()
@UseGuards(PermissionsGuard)
@Controller('meetings')
export class MyMeetingsController {
  constructor(private readonly meetingsService: MeetingsService) {}

  private ctx(user: AuthenticatedUser): { companyId: string; userId: string } {
    return { companyId: user.companyId, userId: user.userId };
  }

  @Get('my')
  @DelegatePermissionCheck()
  @ApiOperation({
    summary: 'List meetings relevant to the current user across projects',
  })
  listMy(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: PmListQueryDto,
  ): Promise<unknown> {
    return this.meetingsService.listMyMeetings(this.ctx(user), query);
  }

  @Get('all')
  @RequirePermission('projects', 'view')
  @ApiOperation({
    summary: 'List all meetings across projects (portfolio access)',
  })
  listAll(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: PmListQueryDto,
  ): Promise<unknown> {
    return this.meetingsService.listAllMeetings(this.ctx(user), query);
  }
}
