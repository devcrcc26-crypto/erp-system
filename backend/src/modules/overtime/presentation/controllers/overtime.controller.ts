import {
  Body,
  Controller,
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
  ListOvertimeRequestsDto,
  SubmitOvertimeRequestDto,
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

  @Post()
  @ApiOperation({ summary: 'Submit an overtime request' })
  submit(
    @CurrentUser() user: AuthenticatedUser,
    @CurrentCompany() companyId: string,
    @Body() dto: SubmitOvertimeRequestDto,
  ): Promise<unknown> {
    return this.overtimeService.submitRequest(dto, companyId, user.userId);
  }

  @Get()
  @ApiOperation({
    summary:
      'List overtime requests (company-wide for hr.view; own records otherwise)',
  })
  list(
    @CurrentUser() user: AuthenticatedUser,
    @CurrentCompany() companyId: string,
    @Query() query: ListOvertimeRequestsDto,
  ): Promise<unknown> {
    return this.overtimeService.listRequests(query, companyId, user.userId);
  }

  @Get('my')
  @ApiOperation({ summary: 'List my overtime requests' })
  listMine(
    @CurrentUser() user: AuthenticatedUser,
    @CurrentCompany() companyId: string,
    @Query() query: ListOvertimeRequestsDto,
  ): Promise<unknown> {
    return this.overtimeService.getMyRequests(user.userId, companyId, query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get an overtime request with approval tiers' })
  getOne(
    @CurrentUser() user: AuthenticatedUser,
    @CurrentCompany() companyId: string,
    @Param('id') id: string,
  ): Promise<unknown> {
    return this.overtimeService.getRequest(id, companyId, user.userId);
  }

  @Patch(':id/cancel')
  @ApiOperation({ summary: 'Cancel a draft or submitted overtime request' })
  cancel(
    @CurrentUser() user: AuthenticatedUser,
    @CurrentCompany() companyId: string,
    @Param('id') id: string,
  ): Promise<unknown> {
    return this.overtimeService.cancelRequest(id, companyId, user.userId);
  }
}
