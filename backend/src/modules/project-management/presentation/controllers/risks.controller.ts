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
import { DelegatePermissionCheck } from '../../../../shared/permissions/delegate-permission-check.decorator';
import { PermissionsGuard } from '../../../../shared/permissions/permissions.guard';
import { RequirePermission } from '../../../../shared/permissions/require-permission.decorator';
import { AuthenticatedUser } from '../../../../shared/types/jwt-payload.type';
import {
  CreateRiskDto,
  PmListQueryDto,
  UpdateRiskDto,
} from '../../application/dtos/pm.dtos';
import { RisksService } from '../../application/services/risks.service';
import { PmModuleAccessGuard } from '../guards/pm-module-access.guard';
import { RequirePmModule } from '../guards/require-pm-module.decorator';

@ApiTags('Risks')
@ApiBearerAuth()
@UseGuards(PermissionsGuard, PmModuleAccessGuard)
@RequirePmModule('risks')
@Controller('projects/:projectId/risks')
export class RisksController {
  constructor(private readonly risksService: RisksService) {}

  private ctx(user: AuthenticatedUser): { companyId: string; userId: string } {
    return { companyId: user.companyId, userId: user.userId };
  }

  @Get()
  @DelegatePermissionCheck()
  @ApiOperation({ summary: 'List project risks' })
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Param('projectId') projectId: string,
    @Query() query: PmListQueryDto,
  ): Promise<unknown> {
    return this.risksService.listRisks(this.ctx(user), projectId, query);
  }

  @Post()
  @DelegatePermissionCheck()
  @ApiOperation({ summary: 'Create risk' })
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Param('projectId') projectId: string,
    @Body() dto: CreateRiskDto,
  ): Promise<unknown> {
    return this.risksService.createRisk(this.ctx(user), projectId, dto);
  }

  @Get(':id')
  @DelegatePermissionCheck()
  @ApiOperation({ summary: 'Get risk by id' })
  get(
    @CurrentUser() user: AuthenticatedUser,
    @Param('projectId') projectId: string,
    @Param('id') id: string,
  ): Promise<unknown> {
    return this.risksService.getRisk(this.ctx(user), projectId, id);
  }

  @Patch(':id')
  @DelegatePermissionCheck()
  @ApiOperation({ summary: 'Update risk' })
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('projectId') projectId: string,
    @Param('id') id: string,
    @Body() dto: UpdateRiskDto,
  ): Promise<unknown> {
    return this.risksService.updateRisk(this.ctx(user), projectId, id, dto);
  }

  @Delete(':id')
  @RequirePermission('risks', 'delete')
  @ApiOperation({ summary: 'Delete risk' })
  async remove(
    @CurrentUser() user: AuthenticatedUser,
    @Param('projectId') projectId: string,
    @Param('id') id: string,
  ): Promise<{ message: string }> {
    await this.risksService.deleteRisk(this.ctx(user), projectId, id);
    return { message: 'Risk deleted' };
  }
}
