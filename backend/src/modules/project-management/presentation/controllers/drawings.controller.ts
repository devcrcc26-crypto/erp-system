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
  CreateDrawingDto,
  CreateDrawingLinkDto,
  PmListQueryDto,
  UpdateDrawingDto,
} from '../../application/dtos/pm.dtos';
import { DrawingsService } from '../../application/services/drawings.service';

@ApiTags('Drawings')
@ApiBearerAuth()
@PmApi()
@UseGuards(PermissionsGuard)
@Controller('projects/:projectId/drawings')
export class DrawingsController {
  constructor(private readonly drawingsService: DrawingsService) {}

  private ctx(user: AuthenticatedUser): { companyId: string; userId: string } {
    return { companyId: user.companyId, userId: user.userId };
  }

  @Get()
  @RequirePermission('drawings', 'view')
  @ApiOperation({ summary: 'List project drawings' })
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Param('projectId') projectId: string,
    @Query() query: PmListQueryDto,
  ): Promise<unknown> {
    return this.drawingsService.listDrawings(this.ctx(user), projectId, query);
  }

  @Post()
  @RequirePermission('drawings', 'create')
  @ApiOperation({ summary: 'Create drawing' })
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Param('projectId') projectId: string,
    @Body() dto: CreateDrawingDto,
  ): Promise<unknown> {
    return this.drawingsService.createDrawing(this.ctx(user), projectId, dto);
  }

  @Get(':id/versions')
  @RequirePermission('drawings', 'view')
  @ApiOperation({ summary: 'List drawing versions' })
  listVersions(
    @CurrentUser() user: AuthenticatedUser,
    @Param('projectId') projectId: string,
    @Param('id') id: string,
  ): Promise<unknown> {
    return this.drawingsService.listVersions(this.ctx(user), projectId, id);
  }

  @Get(':id/links')
  @RequirePermission('drawings', 'view')
  @ApiOperation({ summary: 'List drawing links' })
  listLinks(
    @CurrentUser() user: AuthenticatedUser,
    @Param('projectId') projectId: string,
    @Param('id') id: string,
  ): Promise<unknown> {
    return this.drawingsService.listLinks(this.ctx(user), projectId, id);
  }

  @Post(':id/links')
  @RequirePermission('drawings', 'create')
  @ApiOperation({ summary: 'Create drawing link' })
  createLink(
    @CurrentUser() user: AuthenticatedUser,
    @Param('projectId') projectId: string,
    @Param('id') id: string,
    @Body() dto: CreateDrawingLinkDto,
  ): Promise<unknown> {
    return this.drawingsService.createLink(this.ctx(user), projectId, id, dto);
  }

  @Delete(':id/links/:linkId')
  @RequirePermission('drawings', 'delete')
  @ApiOperation({ summary: 'Delete drawing link' })
  async deleteLink(
    @CurrentUser() user: AuthenticatedUser,
    @Param('projectId') projectId: string,
    @Param('id') id: string,
    @Param('linkId') linkId: string,
  ): Promise<{ message: string }> {
    await this.drawingsService.deleteLink(this.ctx(user), projectId, id, linkId);
    return { message: 'Drawing link deleted' };
  }

  @Get(':id')
  @RequirePermission('drawings', 'view')
  @ApiOperation({ summary: 'Get drawing by id' })
  get(
    @CurrentUser() user: AuthenticatedUser,
    @Param('projectId') projectId: string,
    @Param('id') id: string,
  ): Promise<unknown> {
    return this.drawingsService.getDrawing(this.ctx(user), projectId, id);
  }

  @Patch(':id')
  @RequirePermission('drawings', 'edit')
  @ApiOperation({ summary: 'Update drawing' })
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('projectId') projectId: string,
    @Param('id') id: string,
    @Body() dto: UpdateDrawingDto,
  ): Promise<unknown> {
    return this.drawingsService.updateDrawing(this.ctx(user), projectId, id, dto);
  }

  @Delete(':id')
  @RequirePermission('drawings', 'delete')
  @ApiOperation({ summary: 'Delete drawing' })
  async remove(
    @CurrentUser() user: AuthenticatedUser,
    @Param('projectId') projectId: string,
    @Param('id') id: string,
  ): Promise<{ message: string }> {
    await this.drawingsService.deleteDrawing(this.ctx(user), projectId, id);
    return { message: 'Drawing deleted' };
  }
}
