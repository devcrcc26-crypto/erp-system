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
import { AuthenticatedUser } from '../../../../shared/types/jwt-payload.type';
import {
  CreateCorrespondenceDto,
  PmListQueryDto,
  RespondCorrespondenceDto,
  UpdateCorrespondenceDto,
} from '../../application/dtos/pm.dtos';
import { CorrespondenceService } from '../../application/services/correspondence.service';
import { PmModuleAccessGuard } from '../guards/pm-module-access.guard';
import { RequirePmModule } from '../guards/require-pm-module.decorator';

@ApiTags('Correspondence')
@ApiBearerAuth()
@PmApi()
@UseGuards(PermissionsGuard, PmModuleAccessGuard)
@RequirePmModule('correspondence')
@Controller('projects/:projectId/correspondence')
export class CorrespondenceController {
  constructor(private readonly correspondenceService: CorrespondenceService) {}

  private ctx(user: AuthenticatedUser): { companyId: string; userId: string } {
    return { companyId: user.companyId, userId: user.userId };
  }

  @Get()
  @RequirePermission('correspondence', 'view')
  @ApiOperation({ summary: 'List project correspondence' })
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Param('projectId') projectId: string,
    @Query() query: PmListQueryDto,
  ): Promise<unknown> {
    return this.correspondenceService.listCorrespondence(
      this.ctx(user),
      projectId,
      query,
    );
  }

  @Post()
  @RequirePermission('correspondence', 'create')
  @ApiOperation({ summary: 'Create correspondence' })
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Param('projectId') projectId: string,
    @Body() dto: CreateCorrespondenceDto,
  ): Promise<unknown> {
    return this.correspondenceService.createCorrespondence(
      this.ctx(user),
      projectId,
      dto,
    );
  }

  @Get(':id')
  @RequirePermission('correspondence', 'view')
  @ApiOperation({ summary: 'Get correspondence by id' })
  get(
    @CurrentUser() user: AuthenticatedUser,
    @Param('projectId') projectId: string,
    @Param('id') id: string,
  ): Promise<unknown> {
    return this.correspondenceService.getCorrespondence(
      this.ctx(user),
      projectId,
      id,
    );
  }

  @Patch(':id')
  @RequirePermission('correspondence', 'edit')
  @ApiOperation({ summary: 'Update correspondence' })
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('projectId') projectId: string,
    @Param('id') id: string,
    @Body() dto: UpdateCorrespondenceDto,
  ): Promise<unknown> {
    return this.correspondenceService.updateCorrespondence(
      this.ctx(user),
      projectId,
      id,
      dto,
    );
  }

  @Post(':id/send')
  @RequirePermission('correspondence', 'edit')
  @ApiOperation({ summary: 'Mark outgoing correspondence as sent' })
  send(
    @CurrentUser() user: AuthenticatedUser,
    @Param('projectId') projectId: string,
    @Param('id') id: string,
  ): Promise<unknown> {
    return this.correspondenceService.markAsSent(this.ctx(user), projectId, id);
  }

  @Post(':id/acknowledge')
  @RequirePermission('correspondence', 'edit')
  @ApiOperation({ summary: 'Record acknowledgement of sent correspondence' })
  acknowledge(
    @CurrentUser() user: AuthenticatedUser,
    @Param('projectId') projectId: string,
    @Param('id') id: string,
  ): Promise<unknown> {
    return this.correspondenceService.recordAcknowledgement(
      this.ctx(user),
      projectId,
      id,
    );
  }

  @Post(':id/close')
  @RequirePermission('correspondence', 'edit')
  @ApiOperation({ summary: 'Close correspondence' })
  close(
    @CurrentUser() user: AuthenticatedUser,
    @Param('projectId') projectId: string,
    @Param('id') id: string,
  ): Promise<unknown> {
    return this.correspondenceService.closeCorrespondence(
      this.ctx(user),
      projectId,
      id,
    );
  }

  @Post(':id/respond')
  @RequirePermission('correspondence', 'create')
  @ApiOperation({ summary: 'Create a response linked to this correspondence' })
  respond(
    @CurrentUser() user: AuthenticatedUser,
    @Param('projectId') projectId: string,
    @Param('id') id: string,
    @Body() dto: RespondCorrespondenceDto,
  ): Promise<unknown> {
    return this.correspondenceService.createResponse(
      this.ctx(user),
      projectId,
      id,
      dto,
    );
  }

  @Delete(':id')
  @RequirePermission('correspondence', 'delete')
  @ApiOperation({ summary: 'Delete correspondence' })
  async remove(
    @CurrentUser() user: AuthenticatedUser,
    @Param('projectId') projectId: string,
    @Param('id') id: string,
  ): Promise<{ message: string }> {
    await this.correspondenceService.deleteCorrespondence(
      this.ctx(user),
      projectId,
      id,
    );
    return { message: 'Correspondence deleted' };
  }
}
