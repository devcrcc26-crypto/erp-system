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
  CreateChangeRequestDto,
  PmListQueryDto,
  RejectChangeRequestDto,
  UpdateChangeRequestDto,
} from '../../application/dtos/pm.dtos';
import { ProjectChangeRequestService } from '../../application/services/project-change-request.service';
import { PmModuleAccessGuard } from '../guards/pm-module-access.guard';
import { RequirePmModule } from '../guards/require-pm-module.decorator';

@ApiTags('Change Requests')
@ApiBearerAuth()
@PmApi()
@UseGuards(PermissionsGuard, PmModuleAccessGuard)
@RequirePmModule('change_requests')
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

  @Get('eligible-subtasks')
  @DelegatePermissionCheck()
  @ApiOperation({ summary: 'List subtasks eligible for CR creation' })
  eligibleSubtasks(
    @CurrentUser() user: AuthenticatedUser,
    @Param('projectId') projectId: string,
  ): Promise<unknown> {
    return this.changeRequestService.listEligibleSubtasks(
      this.ctx(user),
      projectId,
    );
  }

  @Get(':changeRequestId')
  @DelegatePermissionCheck()
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
  @DelegatePermissionCheck()
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
  @DelegatePermissionCheck()
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

  @Patch(':changeRequestId/submit')
  @DelegatePermissionCheck()
  @ApiOperation({ summary: 'Submit change request for D.Lead review' })
  submit(
    @CurrentUser() user: AuthenticatedUser,
    @Param('projectId') projectId: string,
    @Param('changeRequestId') changeRequestId: string,
  ): Promise<unknown> {
    return this.changeRequestService.submitChangeRequest(
      this.ctx(user),
      projectId,
      changeRequestId,
    );
  }

  @Patch(':changeRequestId/recall')
  @DelegatePermissionCheck()
  @ApiOperation({ summary: 'Recall submitted change request to draft' })
  recall(
    @CurrentUser() user: AuthenticatedUser,
    @Param('projectId') projectId: string,
    @Param('changeRequestId') changeRequestId: string,
  ): Promise<unknown> {
    return this.changeRequestService.recallChangeRequest(
      this.ctx(user),
      projectId,
      changeRequestId,
    );
  }

  @Patch(':changeRequestId/approve')
  @DelegatePermissionCheck()
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
  @DelegatePermissionCheck()
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
