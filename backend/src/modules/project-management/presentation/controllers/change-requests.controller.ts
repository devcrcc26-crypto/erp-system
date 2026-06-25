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
  CreateChangeRequestDto,
  PmListQueryDto,
  RejectChangeRequestDto,
  UpdateChangeRequestDto,
} from '../../application/dtos/pm.dtos';
import { ProjectChangeRequestService } from '../../application/services/project-change-request.service';

@ApiTags('Change Requests')
@ApiBearerAuth()
@UseGuards(PermissionsGuard)
@Controller('projects/:projectId/change-requests')
export class ChangeRequestsController {
  constructor(
    private readonly changeRequestService: ProjectChangeRequestService,
  ) {}

  private ctx(user: AuthenticatedUser): { companyId: string; userId: string } {
    return { companyId: user.companyId, userId: user.userId };
  }

  @Get()
  @RequirePermission('projects', 'view')
  @ApiOperation({ summary: 'List project change requests' })
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Param('projectId') projectId: string,
    @Query() query: PmListQueryDto,
  ): Promise<unknown> {
    return this.changeRequestService.listChangeRequests(
      this.ctx(user),
      projectId,
      query,
    );
  }

  @Get(':changeRequestId')
  @RequirePermission('projects', 'view')
  @ApiOperation({ summary: 'Get change request by id' })
  get(
    @CurrentUser() user: AuthenticatedUser,
    @Param('projectId') projectId: string,
    @Param('changeRequestId') changeRequestId: string,
  ): Promise<unknown> {
    return this.changeRequestService.getChangeRequest(
      this.ctx(user),
      projectId,
      changeRequestId,
    );
  }

  @Post()
  @RequirePermission('projects', 'create')
  @ApiOperation({ summary: 'Create change request' })
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Param('projectId') projectId: string,
    @Body() dto: CreateChangeRequestDto,
  ): Promise<unknown> {
    return this.changeRequestService.createChangeRequest(
      this.ctx(user),
      projectId,
      dto,
    );
  }

  @Patch(':changeRequestId')
  @RequirePermission('projects', 'edit')
  @ApiOperation({ summary: 'Update change request' })
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('projectId') projectId: string,
    @Param('changeRequestId') changeRequestId: string,
    @Body() dto: UpdateChangeRequestDto,
  ): Promise<unknown> {
    return this.changeRequestService.updateChangeRequest(
      this.ctx(user),
      projectId,
      changeRequestId,
      dto,
    );
  }

  @Patch(':changeRequestId/approve')
  @RequirePermission('projects', 'edit')
  @ApiOperation({ summary: 'Approve change request' })
  approve(
    @CurrentUser() user: AuthenticatedUser,
    @Param('projectId') projectId: string,
    @Param('changeRequestId') changeRequestId: string,
  ): Promise<unknown> {
    return this.changeRequestService.approveChangeRequest(
      this.ctx(user),
      projectId,
      changeRequestId,
    );
  }

  @Patch(':changeRequestId/reject')
  @RequirePermission('projects', 'edit')
  @ApiOperation({ summary: 'Reject change request' })
  reject(
    @CurrentUser() user: AuthenticatedUser,
    @Param('projectId') projectId: string,
    @Param('changeRequestId') changeRequestId: string,
    @Body() dto: RejectChangeRequestDto,
  ): Promise<unknown> {
    return this.changeRequestService.rejectChangeRequest(
      this.ctx(user),
      projectId,
      changeRequestId,
      dto,
    );
  }

  @Delete(':changeRequestId')
  @RequirePermission('projects', 'delete')
  @ApiOperation({ summary: 'Delete change request' })
  async remove(
    @CurrentUser() user: AuthenticatedUser,
    @Param('projectId') projectId: string,
    @Param('changeRequestId') changeRequestId: string,
  ): Promise<{ message: string }> {
    await this.changeRequestService.deleteChangeRequest(
      this.ctx(user),
      projectId,
      changeRequestId,
    );
    return { message: 'Change request deleted' };
  }
}
