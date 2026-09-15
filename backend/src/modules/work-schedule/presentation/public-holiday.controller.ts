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
import { DelegatePermissionCheck } from '../../../shared/permissions/delegate-permission-check.decorator';
import { PermissionsGuard } from '../../../shared/permissions/permissions.guard';
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
@RequirePermission('hr', 'view')
@Controller('hr/public-holidays')
export class PublicHolidayController {
  constructor(private readonly publicHolidayService: PublicHolidayService) {}

  @Get()
  @ApiOperation({ summary: 'List public holidays' })
  list(
    @CurrentCompany() companyId: string,
    @Query() query: ListPublicHolidaysDto,
  ): Promise<unknown[]> {
    return this.publicHolidayService.list(query, companyId);
  }

  @Get('my/upcoming')
  @DelegatePermissionCheck()
  @ApiOperation({
    summary:
      'Upcoming active holidays that apply to the current user (any authenticated user; filtered by own nationality)',
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
  @ApiOperation({ summary: 'Activate or deactivate multiple holidays' })
  bulkStatus(
    @CurrentUser() user: AuthenticatedUser,
    @CurrentCompany() companyId: string,
    @Body() dto: BulkHolidayStatusDto,
  ): Promise<{ updated: number }> {
    return this.publicHolidayService.bulkSetActive(dto, companyId, user.userId);
  }

  @Post('duplicate-year')
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
  @ApiOperation({ summary: 'Get a public holiday' })
  get(
    @CurrentCompany() companyId: string,
    @Param('id') id: string,
  ): Promise<unknown> {
    return this.publicHolidayService.get(id, companyId);
  }

  @Post()
  @ApiOperation({ summary: 'Create a public holiday' })
  create(
    @CurrentUser() user: AuthenticatedUser,
    @CurrentCompany() companyId: string,
    @Body() dto: CreatePublicHolidayDto,
  ): Promise<unknown> {
    return this.publicHolidayService.create(dto, companyId, user.userId);
  }

  @Patch(':id')
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
  @ApiOperation({ summary: 'Deactivate a public holiday' })
  deactivate(
    @CurrentUser() user: AuthenticatedUser,
    @CurrentCompany() companyId: string,
    @Param('id') id: string,
  ): Promise<unknown> {
    return this.publicHolidayService.deactivate(id, companyId, user.userId);
  }
}
