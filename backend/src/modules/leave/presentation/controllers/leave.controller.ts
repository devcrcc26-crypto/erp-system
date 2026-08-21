import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UploadedFiles,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { CurrentCompany } from '../../../../shared/decorators/current-company.decorator';
import { CurrentUser } from '../../../../shared/decorators/current-user.decorator';
import { DelegatePermissionCheck } from '../../../../shared/permissions/delegate-permission-check.decorator';
import { PermissionsGuard } from '../../../../shared/permissions/permissions.guard';
import { RequireAnyPermission } from '../../../../shared/permissions/require-any-permission.decorator';
import { AuthenticatedUser } from '../../../../shared/types/jwt-payload.type';
import {
  LeaveBalanceQueryDto,
  ListLeaveBalancesDto,
  ListLeaveRequestsDto,
  SubmitLeaveRequestDto,
  UpdateLeaveRequestDto,
} from '../../application/dtos/leave.dtos';
import { LeaveBalanceService } from '../../application/services/leave-balance.service';
import { LeaveService } from '../../application/services/leave.service';

@ApiTags('HR Leave Requests')
@ApiBearerAuth()
@UseGuards(PermissionsGuard)
@RequireAnyPermission(
  { module: 'hr', action: 'view' },
  { module: 'leave', action: 'view' },
  { module: 'leave', action: 'create' },
)
@Controller('hr/leave-requests')
export class LeaveController {
  constructor(
    private readonly leaveService: LeaveService,
    private readonly leaveBalanceService: LeaveBalanceService,
  ) {}

  @Post()
  @DelegatePermissionCheck()
  @ApiOperation({
    summary: 'Submit a leave request (any authenticated user, own record)',
  })
  @ApiConsumes('multipart/form-data', 'application/json')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['leaveType', 'startDate', 'endDate', 'days'],
      properties: {
        leaveType: { type: 'string' },
        startDate: { type: 'string', format: 'date' },
        endDate: { type: 'string', format: 'date' },
        days: { type: 'number' },
        reason: { type: 'string' },
        files: {
          type: 'array',
          items: { type: 'string', format: 'binary' },
        },
      },
    },
  })
  @UseInterceptors(
    FilesInterceptor('files', 10, { storage: memoryStorage() }),
  )
  submit(
    @CurrentUser() user: AuthenticatedUser,
    @CurrentCompany() companyId: string,
    @Body() dto: SubmitLeaveRequestDto,
    @UploadedFiles() files?: Express.Multer.File[],
  ): Promise<unknown> {
    return this.leaveService.submitRequest(
      dto,
      companyId,
      user.userId,
      files ?? [],
    );
  }

  @Get()
  @ApiOperation({
    summary:
      'List leave requests (company-wide for hr.view; own records otherwise)',
  })
  list(
    @CurrentUser() user: AuthenticatedUser,
    @CurrentCompany() companyId: string,
    @Query() query: ListLeaveRequestsDto,
  ): Promise<unknown> {
    return this.leaveService.listRequests(query, companyId, user.userId);
  }

  @Get('my')
  @DelegatePermissionCheck()
  @ApiOperation({ summary: 'List my leave requests' })
  listMine(
    @CurrentUser() user: AuthenticatedUser,
    @CurrentCompany() companyId: string,
    @Query() query: ListLeaveRequestsDto,
  ): Promise<unknown> {
    return this.leaveService.getMyRequests(user.userId, companyId, query);
  }

  @Get('balance')
  @DelegatePermissionCheck()
  @ApiOperation({
    summary: 'Get my leave balances for a year (auth only — own balances)',
  })
  getMyBalance(
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

  @Get('balances/me')
  @DelegatePermissionCheck()
  @ApiOperation({
    summary: 'Get my leave balances for a year (alias of GET balance)',
  })
  myBalances(
    @CurrentUser() user: AuthenticatedUser,
    @CurrentCompany() companyId: string,
    @Query() query: LeaveBalanceQueryDto,
  ): Promise<unknown> {
    return this.getMyBalance(user, companyId, query);
  }

  @Get('balances')
  @RequireAnyPermission({ module: 'hr', action: 'view' })
  @ApiOperation({
    summary:
      'List employee leave balances (HR only — annual, maternity, compassionate)',
  })
  listBalances(
    @CurrentCompany() companyId: string,
    @Query() query: ListLeaveBalancesDto,
  ): Promise<unknown> {
    return this.leaveBalanceService.listCompanyBalances(query, companyId);
  }

  @Get(':id')
  @RequireAnyPermission(
    { module: 'hr', action: 'view' },
    { module: 'leave', action: 'view' },
    { module: 'leave', action: 'create' },
    { module: 'approvals', action: 'view' },
  )
  @ApiOperation({ summary: 'Get a leave request with approval tiers' })
  getOne(
    @CurrentUser() user: AuthenticatedUser,
    @CurrentCompany() companyId: string,
    @Param('id') id: string,
  ): Promise<unknown> {
    return this.leaveService.getRequest(id, companyId, user.userId);
  }

  @Patch(':id')
  @RequireAnyPermission(
    { module: 'hr', action: 'view' },
    { module: 'leave', action: 'create' },
  )
  @ApiOperation({
    summary:
      'Update a draft or returned leave request (owner or HR)',
  })
  update(
    @CurrentUser() user: AuthenticatedUser,
    @CurrentCompany() companyId: string,
    @Param('id') id: string,
    @Body() dto: UpdateLeaveRequestDto,
  ): Promise<unknown> {
    return this.leaveService.updateRequest(id, dto, companyId, user.userId);
  }

  @Patch(':id/cancel')
  @RequireAnyPermission(
    { module: 'hr', action: 'view' },
    { module: 'leave', action: 'create' },
  )
  @ApiOperation({
    summary:
      'Cancel a draft, submitted, or in-review leave request (owner or HR)',
  })
  cancel(
    @CurrentUser() user: AuthenticatedUser,
    @CurrentCompany() companyId: string,
    @Param('id') id: string,
  ): Promise<unknown> {
    return this.leaveService.cancelRequest(id, companyId, user.userId);
  }

  @Delete(':id')
  @RequireAnyPermission({ module: 'hr', action: 'view' })
  @ApiOperation({
    summary: 'Soft-delete a leave request (HR only) and reverse balance impact',
  })
  async remove(
    @CurrentUser() user: AuthenticatedUser,
    @CurrentCompany() companyId: string,
    @Param('id') id: string,
  ): Promise<{ message: string }> {
    await this.leaveService.deleteRequest(id, companyId, user.userId);
    return { message: 'Leave request deleted' };
  }
}
