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
import { RequireAnyPermission } from '../../../shared/permissions/require-any-permission.decorator';
import { RequirePermission } from '../../../shared/permissions/require-permission.decorator';
import { AuthenticatedUser } from '../../../shared/types/jwt-payload.type';
import { CreatePublicHolidayDto } from '../application/dtos/create-public-holiday.dto';
import {
  BulkHolidayStatusDto,
  DuplicateHolidayYearDto,
  ListPublicHolidaysDto,
  UpcomingHolidaysDto,
} from '../application/dtos/list-public-holidays.dto';
import { UpdatePublicHolidayDto } from '../application/dtos/update-public-holiday.dto';
import { PublicHolidayService } from '../application/services/public-holiday.service';

@ApiTags('HR Public Holidays')
@ApiBearerAuth()
@UseGuards(PermissionsGuard)
@Controller('hr/public-holidays')
export class PublicHolidayController {
  constructor(private readonly publicHolidayService: PublicHolidayService) {}

  @Get()
  @RequireAnyPermission({ module: 'public-holiday', action: 'view' })
  @ApiOperation({ summary: 'List public holidays' })
  list(
    @CurrentCompany() companyId: string,
    @Query() query: ListPublicHolidaysDto,
  ): Promise<unknown[]> {
    return this.publicHolidayService.list(query, companyId);
  }

  @Get('my/upcoming')
  @RequireAnyPermission({ module: 'public-holiday', action: 'view' })
  @ApiOperation({
    summary:
      'Upcoming active holidays that apply to the current user (filtered by own nationality)',
  })
  myUpcoming(
    @CurrentUser() user: AuthenticatedUser,
    @CurrentCompany() companyId: string,
    @Query() query: UpcomingHolidaysDto,
  ): Promise<Record<string, unknown>[]> {
    return this.publicHolidayService.listUpcomingForEmployee(
      user.userId,
      companyId,
      query.days ?? 60,
    );
  }

  @Post('bulk-status')
  @RequirePermission('public-holiday', 'manage')
  @ApiOperation({ summary: 'Activate or deactivate multiple holidays' })
  bulkStatus(
    @CurrentUser() user: AuthenticatedUser,
    @CurrentCompany() companyId: string,
    @Body() dto: BulkHolidayStatusDto,
  ): Promise<{ updated: number }> {
    return this.publicHolidayService.bulkSetActive(dto, companyId, user.userId);
  }

  @Post('duplicate-year')
  @RequirePermission('public-holiday', 'manage')
  @ApiOperation({
    summary: 'Copy a year of holidays into another year (skips conflicts)',
  })
  duplicateYear(
    @CurrentUser() user: AuthenticatedUser,
    @CurrentCompany() companyId: string,
    @Body() dto: DuplicateHolidayYearDto,
  ): Promise<{ copied: number; skipped: number }> {
    return this.publicHolidayService.duplicateYear(dto, companyId, user.userId);
  }

  @Get(':id')
  @RequireAnyPermission({ module: 'public-holiday', action: 'view' })
  @ApiOperation({ summary: 'Get a public holiday' })
  get(
    @CurrentCompany() companyId: string,
    @Param('id') id: string,
  ): Promise<unknown> {
    return this.publicHolidayService.get(id, companyId);
  }

  @Post()
  @RequirePermission('public-holiday', 'manage')
  @ApiOperation({ summary: 'Create a public holiday' })
  create(
    @CurrentUser() user: AuthenticatedUser,
    @CurrentCompany() companyId: string,
    @Body() dto: CreatePublicHolidayDto,
  ): Promise<unknown> {
    return this.publicHolidayService.create(dto, companyId, user.userId);
  }

  @Patch(':id')
  @RequirePermission('public-holiday', 'manage')
  @ApiOperation({ summary: 'Update a public holiday' })
  update(
    @CurrentUser() user: AuthenticatedUser,
    @CurrentCompany() companyId: string,
    @Param('id') id: string,
    @Body() dto: UpdatePublicHolidayDto,
  ): Promise<unknown> {
    return this.publicHolidayService.update(id, dto, companyId, user.userId);
  }

  @Delete(':id')
  @RequirePermission('public-holiday', 'manage')
  @ApiOperation({
    summary:
      'Delete a public holiday (to keep it on record instead, PATCH isActive:false)',
  })
  remove(
    @CurrentUser() user: AuthenticatedUser,
    @CurrentCompany() companyId: string,
    @Param('id') id: string,
  ): Promise<void> {
    return this.publicHolidayService.remove(id, companyId, user.userId);
  }
}
