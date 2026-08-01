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
import { CurrentCompany } from '../../../../shared/decorators/current-company.decorator';
import { CurrentUser } from '../../../../shared/decorators/current-user.decorator';
import { PermissionsGuard } from '../../../../shared/permissions/permissions.guard';
import { RequireAnyPermission } from '../../../../shared/permissions/require-any-permission.decorator';
import { AuthenticatedUser } from '../../../../shared/types/jwt-payload.type';
import {
  ListOvertimeSheetsDto,
  UpsertOvertimeEntryDto,
} from '../../application/dtos/overtime.dtos';
import { OvertimeService } from '../../application/services/overtime.service';

@ApiTags('HR Overtime')
@ApiBearerAuth()
@UseGuards(PermissionsGuard)
@RequireAnyPermission(
  { module: 'hr', action: 'view' },
  { module: 'overtime', action: 'view' },
  { module: 'overtime', action: 'create' },
)
@Controller('hr/overtime')
export class OvertimeController {
  constructor(private readonly overtimeService: OvertimeService) {}

  @Get()
  @ApiOperation({
    summary:
      'List overtime sheets (company-wide for hr.view; own otherwise)',
  })
  list(
    @CurrentUser() user: AuthenticatedUser,
    @CurrentCompany() companyId: string,
    @Query() query: ListOvertimeSheetsDto,
  ): Promise<unknown> {
    return this.overtimeService.listSheets(query, companyId, user.userId);
  }

  @Get('current')
  @ApiOperation({
    summary: 'Get or create the current month overtime sheet for the caller',
  })
  current(
    @CurrentUser() user: AuthenticatedUser,
    @CurrentCompany() companyId: string,
  ): Promise<unknown> {
    return this.overtimeService.getCurrentSheet(companyId, user.userId);
  }

  @Get(':id')
  @RequireAnyPermission(
    { module: 'hr', action: 'view' },
    { module: 'overtime', action: 'view' },
    { module: 'overtime', action: 'create' },
    { module: 'approvals', action: 'view' },
  )
  @ApiOperation({ summary: 'Get an overtime sheet with entries and tiers' })
  getOne(
    @CurrentUser() user: AuthenticatedUser,
    @CurrentCompany() companyId: string,
    @Param('id') id: string,
  ): Promise<unknown> {
    return this.overtimeService.getSheet(id, companyId, user.userId);
  }

  @Post(':id/entries')
  @ApiOperation({ summary: 'Add an overtime entry to a draft/returned sheet' })
  addEntry(
    @CurrentUser() user: AuthenticatedUser,
    @CurrentCompany() companyId: string,
    @Param('id') id: string,
    @Body() dto: UpsertOvertimeEntryDto,
  ): Promise<unknown> {
    return this.overtimeService.addEntry(id, dto, companyId, user.userId);
  }

  @Patch(':id/entries/:entryId')
  @ApiOperation({ summary: 'Update an overtime entry' })
  updateEntry(
    @CurrentUser() user: AuthenticatedUser,
    @CurrentCompany() companyId: string,
    @Param('id') id: string,
    @Param('entryId') entryId: string,
    @Body() dto: UpsertOvertimeEntryDto,
  ): Promise<unknown> {
    return this.overtimeService.updateEntry(
      id,
      entryId,
      dto,
      companyId,
      user.userId,
    );
  }

  @Delete(':id/entries/:entryId')
  @ApiOperation({ summary: 'Delete an overtime entry' })
  deleteEntry(
    @CurrentUser() user: AuthenticatedUser,
    @CurrentCompany() companyId: string,
    @Param('id') id: string,
    @Param('entryId') entryId: string,
  ): Promise<unknown> {
    return this.overtimeService.deleteEntry(
      id,
      entryId,
      companyId,
      user.userId,
    );
  }

  @Post(':id/submit')
  @ApiOperation({ summary: 'Submit an overtime sheet for approval' })
  submit(
    @CurrentUser() user: AuthenticatedUser,
    @CurrentCompany() companyId: string,
    @Param('id') id: string,
  ): Promise<unknown> {
    return this.overtimeService.submitSheet(id, companyId, user.userId);
  }

  @Patch(':id/cancel')
  @ApiOperation({ summary: 'Cancel a draft or submitted overtime sheet' })
  cancel(
    @CurrentUser() user: AuthenticatedUser,
    @CurrentCompany() companyId: string,
    @Param('id') id: string,
  ): Promise<unknown> {
    return this.overtimeService.cancelSheet(id, companyId, user.userId);
  }
}
