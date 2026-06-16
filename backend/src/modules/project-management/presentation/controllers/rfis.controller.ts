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
  CreateRfiDto,
  CreateRfiResponseDto,
  PmListQueryDto,
  UpdateRfiDto,
} from '../../application/dtos/pm.dtos';
import { RfisService } from '../../application/services/rfis.service';

@ApiTags('RFIs')
@ApiBearerAuth()
@UseGuards(PermissionsGuard)
@Controller('projects/:projectId/rfis')
export class RfisController {
  constructor(private readonly rfisService: RfisService) {}

  private ctx(user: AuthenticatedUser): { companyId: string; userId: string } {
    return { companyId: user.companyId, userId: user.userId };
  }

  @Get()
  @RequirePermission('rfis', 'view')
  @ApiOperation({ summary: 'List project RFIs' })
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Param('projectId') projectId: string,
    @Query() query: PmListQueryDto,
  ): Promise<unknown> {
    return this.rfisService.listRfis(this.ctx(user), projectId, query);
  }

  @Get(':rfiId')
  @RequirePermission('rfis', 'view')
  @ApiOperation({ summary: 'Get RFI by id' })
  get(
    @CurrentUser() user: AuthenticatedUser,
    @Param('projectId') projectId: string,
    @Param('rfiId') rfiId: string,
  ): Promise<unknown> {
    return this.rfisService.getRfi(this.ctx(user), projectId, rfiId);
  }

  @Post()
  @RequirePermission('rfis', 'create')
  @ApiOperation({ summary: 'Create RFI' })
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Param('projectId') projectId: string,
    @Body() dto: CreateRfiDto,
  ): Promise<unknown> {
    return this.rfisService.createRfi(this.ctx(user), projectId, dto);
  }

  @Patch(':rfiId')
  @RequirePermission('rfis', 'edit')
  @ApiOperation({ summary: 'Update RFI' })
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('projectId') projectId: string,
    @Param('rfiId') rfiId: string,
    @Body() dto: UpdateRfiDto,
  ): Promise<unknown> {
    return this.rfisService.updateRfi(this.ctx(user), projectId, rfiId, dto);
  }

  @Delete(':rfiId')
  @RequirePermission('rfis', 'delete')
  @ApiOperation({ summary: 'Delete RFI' })
  async remove(
    @CurrentUser() user: AuthenticatedUser,
    @Param('projectId') projectId: string,
    @Param('rfiId') rfiId: string,
  ): Promise<{ message: string }> {
    await this.rfisService.deleteRfi(this.ctx(user), projectId, rfiId);
    return { message: 'RFI deleted' };
  }

  @Get(':rfiId/responses')
  @RequirePermission('rfis', 'view')
  @ApiOperation({ summary: 'List RFI responses' })
  listResponses(
    @CurrentUser() user: AuthenticatedUser,
    @Param('projectId') projectId: string,
    @Param('rfiId') rfiId: string,
  ): Promise<unknown> {
    return this.rfisService.listRfiResponses(
      this.ctx(user),
      projectId,
      rfiId,
    );
  }

  @Post(':rfiId/responses')
  @RequirePermission('rfis', 'create')
  @ApiOperation({ summary: 'Add RFI response' })
  addResponse(
    @CurrentUser() user: AuthenticatedUser,
    @Param('projectId') projectId: string,
    @Param('rfiId') rfiId: string,
    @Body() dto: CreateRfiResponseDto,
  ): Promise<unknown> {
    return this.rfisService.addRfiResponse(
      this.ctx(user),
      projectId,
      rfiId,
      dto,
    );
  }
}
