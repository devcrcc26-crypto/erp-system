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
import { DelegatePermissionCheck } from '../../../../shared/permissions/delegate-permission-check.decorator';
import { PermissionsGuard } from '../../../../shared/permissions/permissions.guard';
import { RequireAnyPermission } from '../../../../shared/permissions/require-any-permission.decorator';
import { AuthenticatedUser } from '../../../../shared/types/jwt-payload.type';
import {
  ListInspectionRepairsDto,
  SubmitInspectionRepairDto,
  UpdateInspectionRepairDto,
} from '../../application/dtos/inspection-repair.dtos';
import { InspectionRepairService } from '../../application/services/inspection-repair.service';

@ApiTags('HR Inspection & Repair')
@ApiBearerAuth()
@UseGuards(PermissionsGuard)
@RequireAnyPermission(
  { module: 'inspection-repair', action: 'view' },
  { module: 'inspection-repair', action: 'create' },
)
@Controller('hr/inspection-repair')
export class InspectionRepairController {
  constructor(
    private readonly inspectionRepairService: InspectionRepairService,
  ) {}

  @Post()
  @DelegatePermissionCheck()
  @ApiOperation({ summary: 'Submit a new inspection and repair request' })
  submit(
    @CurrentUser() user: AuthenticatedUser,
    @CurrentCompany() companyId: string,
    @Body() dto: SubmitInspectionRepairDto,
  ): Promise<unknown> {
    return this.inspectionRepairService.submitRequest(dto, companyId, user.userId);
  }

  @Get()
  @ApiOperation({
    summary:
      'List inspection and repair requests (company-wide for hr.view; own otherwise)',
  })
  list(
    @CurrentUser() user: AuthenticatedUser,
    @CurrentCompany() companyId: string,
    @Query() query: ListInspectionRepairsDto,
  ): Promise<unknown> {
    return this.inspectionRepairService.listRequests(query, companyId, user.userId);
  }

  @Get('my-assets')
  @DelegatePermissionCheck()
  @ApiOperation({ summary: 'List assets currently assigned to the current employee' })
  myAssets(
    @CurrentUser() user: AuthenticatedUser,
    @CurrentCompany() companyId: string,
  ): Promise<unknown> {
    return this.inspectionRepairService.listMyAssignedAssets(companyId, user.userId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get one inspection and repair request' })
  getOne(
    @CurrentUser() user: AuthenticatedUser,
    @CurrentCompany() companyId: string,
    @Param('id') id: string,
  ): Promise<unknown> {
    return this.inspectionRepairService.getRequest(id, companyId, user.userId);
  }

  @Patch(':id')
  @DelegatePermissionCheck()
  @ApiOperation({ summary: 'Update an inspection and repair request' })
  update(
    @CurrentUser() user: AuthenticatedUser,
    @CurrentCompany() companyId: string,
    @Param('id') id: string,
    @Body() dto: UpdateInspectionRepairDto,
  ): Promise<unknown> {
    return this.inspectionRepairService.updateRequest(
      id,
      dto,
      companyId,
      user.userId,
    );
  }

  @Patch(':id/cancel')
  @DelegatePermissionCheck()
  @ApiOperation({ summary: 'Cancel a draft or submitted inspection and repair request' })
  cancel(
    @CurrentUser() user: AuthenticatedUser,
    @CurrentCompany() companyId: string,
    @Param('id') id: string,
  ): Promise<unknown> {
    return this.inspectionRepairService.cancelRequest(id, companyId, user.userId);
  }
}
