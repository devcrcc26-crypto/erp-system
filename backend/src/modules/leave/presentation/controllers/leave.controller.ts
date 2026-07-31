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
import { RequirePermission } from '../../../../shared/permissions/require-permission.decorator';
import { AuthenticatedUser } from '../../../../shared/types/jwt-payload.type';
import {
  LeaveBalanceQueryDto,
  ListLeaveRequestsDto,
  SubmitLeaveRequestDto,
} from '../../application/dtos/leave.dtos';
import { LeaveBalanceService } from '../../application/services/leave-balance.service';
import { LeaveService } from '../../application/services/leave.service';

@ApiTags('HR Leave Requests')
@ApiBearerAuth()
@UseGuards(PermissionsGuard)
@Controller('hr/leave-requests')
export class LeaveController {
  constructor(
    private readonly leaveService: LeaveService,
    private readonly leaveBalanceService: LeaveBalanceService,
  ) {}

  @Post()
  @RequirePermission('leave', 'create')
  @ApiOperation({ summary: 'Submit a leave request' })
  submit(
    @CurrentUser() user: AuthenticatedUser,
    @CurrentCompany() companyId: string,
    @Body() dto: SubmitLeaveRequestDto,
  ): Promise<unknown> {
    return this.leaveService.submitRequest(dto, companyId, user.userId);
  }

  @Get()
  @RequirePermission('leave', 'view')
  @ApiOperation({ summary: 'List leave requests' })
  list(
    @CurrentCompany() companyId: string,
    @Query() query: ListLeaveRequestsDto,
  ): Promise<unknown> {
    return this.leaveService.listRequests(query, companyId);
  }

  @Get('my')
  @RequirePermission('leave', 'view')
  @ApiOperation({ summary: 'List my leave requests' })
  listMine(
    @CurrentUser() user: AuthenticatedUser,
    @CurrentCompany() companyId: string,
    @Query() query: ListLeaveRequestsDto,
  ): Promise<unknown> {
    return this.leaveService.getMyRequests(user.userId, companyId, query);
  }

  @Get('balances/me')
  @RequirePermission('leave', 'view')
  @ApiOperation({ summary: 'Get my leave balances for a year' })
  myBalances(
    @CurrentUser() user: AuthenticatedUser,
    @CurrentCompany() companyId: string,
    @Query() query: LeaveBalanceQueryDto,
  ): Promise<unknown> {
    const year = query.year ?? new Date().getFullYear();
    return this.leaveBalanceService.getBalance(
      user.userId,
      year,
      companyId,
    );
  }

  @Get(':id')
  @RequirePermission('leave', 'view')
  @ApiOperation({ summary: 'Get a leave request with approval tiers' })
  getOne(
    @CurrentCompany() companyId: string,
    @Param('id') id: string,
  ): Promise<unknown> {
    return this.leaveService.getRequest(id, companyId);
  }

  @Patch(':id/cancel')
  @RequirePermission('leave', 'create')
  @ApiOperation({ summary: 'Cancel a draft or submitted leave request' })
  cancel(
    @CurrentUser() user: AuthenticatedUser,
    @CurrentCompany() companyId: string,
    @Param('id') id: string,
  ): Promise<unknown> {
    return this.leaveService.cancelRequest(id, companyId, user.userId);
  }
}
