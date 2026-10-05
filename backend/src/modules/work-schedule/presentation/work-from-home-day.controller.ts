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
import { CurrentCompany } from '../../../shared/decorators/current-company.decorator';
import { CurrentUser } from '../../../shared/decorators/current-user.decorator';
import { PermissionsGuard } from '../../../shared/permissions/permissions.guard';
import { RequirePermission } from '../../../shared/permissions/require-permission.decorator';
import { AuthenticatedUser } from '../../../shared/types/jwt-payload.type';
import {
  CreateWorkFromHomeDayDto,
  ListWorkFromHomeDaysDto,
  UpdateWorkFromHomeDayDto,
} from '../application/dtos/work-from-home-day.dto';
import { WorkFromHomeDayService } from '../application/services/work-from-home-day.service';

@ApiTags('HR Work From Home')
@ApiBearerAuth()
@UseGuards(PermissionsGuard)
@RequirePermission('hr', 'view')
@Controller('hr/attendance/work-from-home')
export class WorkFromHomeDayController {
  constructor(private readonly service: WorkFromHomeDayService) {}

  @Get()
  @ApiOperation({ summary: 'List work-from-home days' })
  list(
    @CurrentCompany() companyId: string,
    @Query() query: ListWorkFromHomeDaysDto,
  ): Promise<unknown[]> {
    return this.service.list(companyId, query.month, query.year);
  }

  @Post()
  @ApiOperation({ summary: 'Create a work-from-home day' })
  create(
    @CurrentUser() user: AuthenticatedUser,
    @CurrentCompany() companyId: string,
    @Body() dto: CreateWorkFromHomeDayDto,
  ): Promise<unknown> {
    return this.service.create(dto, companyId, user.userId);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update a work-from-home day' })
  update(
    @CurrentUser() user: AuthenticatedUser,
    @CurrentCompany() companyId: string,
    @Param('id') id: string,
    @Body() dto: UpdateWorkFromHomeDayDto,
  ): Promise<unknown> {
    return this.service.update(id, dto, companyId, user.userId);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Soft-delete a work-from-home day' })
  remove(
    @CurrentUser() user: AuthenticatedUser,
    @CurrentCompany() companyId: string,
    @Param('id') id: string,
  ): Promise<void> {
    return this.service.remove(id, companyId, user.userId);
  }
}
