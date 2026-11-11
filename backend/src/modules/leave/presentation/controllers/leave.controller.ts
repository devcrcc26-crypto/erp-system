import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UploadedFiles,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { PermissionService } from '../../../../shared/permissions/permission.service';
import { isEmployeeInTeamScope } from '../../../../shared/org/team-scope.util';
import { PrismaService } from '../../../../shared/prisma/prisma.service';
import { canEditLeaveBalances } from '../../application/utils/leave-balance-access.util';
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
  LeaveBalanceAdjustmentDto,
  LeaveBalanceQueryDto,
  LeaveBalanceSnapshotDto,
  LeaveLedgerQueryDto,
  LeaveOpeningBalanceDto,
  ListLeaveBalancesDto,
  ListLeaveRequestsDto,
  SubmitLeaveRequestDto,
  UpdateLeaveRequestDto,
} from '../../application/dtos/leave.dtos';
import { LeaveBalanceService } from '../../application/services/leave-balance.service';
import { LeaveService } from '../../application/services/leave.service';
import { LeaveLedgerService } from '../../../leave-policy/application/services/leave-ledger.service';
import { OnBehalfService } from '../../../on-behalf/on-behalf.service';
import { toDateOnlyUtc } from '../../../leave-policy/application/utils/leave-year.util';

function parseDateOnlyUtc(value: string): Date {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  if (!match) {
    throw new BadRequestException(`Invalid date: ${value}`);
  }
  return toDateOnlyUtc(
    new Date(
      Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])),
    ),
  );
}

@ApiTags('HR Leave Requests')
@ApiBearerAuth()
@UseGuards(PermissionsGuard)
@RequireAnyPermission(
  { module: 'leave', action: 'view' },
  { module: 'leave', action: 'create' },
)
@Controller('hr/leave-requests')
export class LeaveController {
  constructor(
    private readonly leaveService: LeaveService,
    private readonly leaveBalanceService: LeaveBalanceService,
    private readonly onBehalfService: OnBehalfService,
    private readonly leaveLedger: LeaveLedgerService,
    private readonly permissionService: PermissionService,
    private readonly prisma: PrismaService,
  ) {}

  /**
   * Balance edits are limited to System Administrator, General Manager, and HR roles.
   */
  private async assertCanEditLeaveBalances(
    userId: string,
    companyId: string,
  ): Promise<void> {
    const roleNames = await this.permissionService.getUserRoleNames(
      userId,
      companyId,
    );
    if (!canEditLeaveBalances(roleNames)) {
      throw new ForbiddenException(
        'Only System Administrator, General Manager, or HR can edit leave balances',
      );
    }
  }

  @Post()
  @RequireAnyPermission({ module: 'leave', action: 'create' })
  @DelegatePermissionCheck()
  @ApiOperation({
    summary: 'Submit a leave request (any authenticated user, own record)',
  })
  @ApiConsumes('multipart/form-data', 'application/json')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['leaveType'],
      properties: {
        leaveType: { type: 'string' },
        periods: {
          type: 'string',
          description: 'JSON array of { startDate, endDate }',
        },
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
  @RequireAnyPermission({ module: 'leave', action: 'view' })
  @DelegatePermissionCheck()
  @ApiOperation({ summary: 'List my leave requests' })
  listMine(
    @CurrentUser() user: AuthenticatedUser,
    @CurrentCompany() companyId: string,
    @Query() query: ListLeaveRequestsDto,
  ): Promise<unknown> {
    return this.leaveService.getMyRequests(user.userId, companyId, query);
  }

  @Get('leave-years')
  @RequireAnyPermission(
    { module: 'leave', action: 'view' },
    { module: 'leave', action: 'create' },
    { module: 'leave', action: 'manage' },
  )
  @DelegatePermissionCheck()
  @ApiOperation({
    summary:
      'Leave-year periods for the year dropdown (contract leave-year ranges)',
  })
  async listLeaveYears(
    @CurrentUser() user: AuthenticatedUser,
    @CurrentCompany() companyId: string,
    @Query() query: LeaveBalanceQueryDto,
  ): Promise<unknown> {
    const canManage = await this.permissionService.hasPermission(
      user.userId,
      companyId,
      'leave',
      'manage',
    );
    const employeeId =
      canManage && query.employeeId
        ? query.employeeId
        : await this.onBehalfService.resolveTargetEmployeeId(
            user.userId,
            companyId,
            query.employeeId,
          );
    return this.leaveBalanceService.listLeaveYears(employeeId, companyId);
  }

  @Get('balance')
  @RequireAnyPermission(
    { module: 'leave', action: 'view' },
    { module: 'leave', action: 'create' },
    { module: 'leave', action: 'manage' },
  )
  @DelegatePermissionCheck()
  @ApiOperation({
    summary:
      'Get my leave balances for a year, or an on-behalf target employee\'s (employeeId)',
  })
  async getMyBalance(
    @CurrentUser() user: AuthenticatedUser,
    @CurrentCompany() companyId: string,
    @Query() query: LeaveBalanceQueryDto,
  ): Promise<unknown> {
    const canManage = await this.permissionService.hasPermission(
      user.userId,
      companyId,
      'leave',
      'manage',
    );
    // HR, or a supervisor reading a report's balance (employee profile page).
    const readsTeamBalance =
      !canManage &&
      Boolean(query.employeeId) &&
      query.employeeId !== user.userId &&
      (await isEmployeeInTeamScope(
        this.prisma,
        user.userId,
        companyId,
        query.employeeId as string,
      ));
    const employeeId =
      (canManage || readsTeamBalance) && query.employeeId
        ? query.employeeId
        : await this.onBehalfService.resolveTargetEmployeeId(
            user.userId,
            companyId,
            query.employeeId,
          );
    let year = query.year;
    if (query.forDate) {
      year = await this.leaveBalanceService.yearLabelForDate(
        employeeId,
        companyId,
        parseDateOnlyUtc(query.forDate),
      );
    }
    // No year / forDate → the employee's current leave year (contract leave year).
    return this.leaveBalanceService.getBalance(employeeId, year, companyId);
  }

  @Get('balances/me')
  @RequireAnyPermission(
    { module: 'leave', action: 'view' },
    { module: 'leave', action: 'create' },
    { module: 'leave', action: 'manage' },
  )
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
  @RequireAnyPermission({ module: 'leave', action: 'manage' })
  @ApiOperation({
    summary:
      'List employee leave balances (HR only - annual, maternity, compassionate)',
  })
  listBalances(
    @CurrentCompany() companyId: string,
    @Query() query: ListLeaveBalancesDto,
  ): Promise<unknown> {
    return this.leaveBalanceService.listCompanyBalances(query, companyId);
  }

  @Get('balance-ledger')
  @RequireAnyPermission({ module: 'leave', action: 'view' })
  @DelegatePermissionCheck()
  @ApiOperation({
    summary:
      'Leave balance ledger entries (who / when / why) for me, an on-behalf target, or any employee (HR)',
  })
  async getLedger(
    @CurrentUser() user: AuthenticatedUser,
    @CurrentCompany() companyId: string,
    @Query() query: LeaveLedgerQueryDto,
  ): Promise<unknown> {
    const employeeId = await this.onBehalfService.resolveTargetEmployeeId(
      user.userId,
      companyId,
      query.employeeId,
    );
    return this.leaveLedger.listEntries(employeeId, companyId, query.year);
  }

  @Post('balance-ledger/adjustments')
  @RequireAnyPermission({ module: 'leave', action: 'manage' })
  @ApiOperation({
    summary:
      'HR: adjust a leave balance (+/− days, reason required). Appends an ADJUSTMENT entry; audit-logged.',
  })
  async adjustBalance(
    @CurrentUser() user: AuthenticatedUser,
    @CurrentCompany() companyId: string,
    @Body() dto: LeaveBalanceAdjustmentDto,
  ): Promise<unknown> {
    await this.assertCanEditLeaveBalances(user.userId, companyId);
    return this.leaveLedger.addAdjustment({
      ...dto,
      companyId,
      actorUserId: user.userId,
    });
  }

  @Post('balance-ledger/opening')
  @RequireAnyPermission({ module: 'leave', action: 'manage' })
  @ApiOperation({
    summary:
      'HR go-live: set the opening balance for the current leave year (once per leave type); audit-logged.',
  })
  async setOpeningBalance(
    @CurrentUser() user: AuthenticatedUser,
    @CurrentCompany() companyId: string,
    @Body() dto: LeaveOpeningBalanceDto,
  ): Promise<unknown> {
    await this.assertCanEditLeaveBalances(user.userId, companyId);
    return this.leaveLedger.setOpeningBalance({
      ...dto,
      companyId,
      actorUserId: user.userId,
    });
  }

  @Post('balance-ledger/snapshot')
  @RequireAnyPermission({ module: 'leave', action: 'manage' })
  @ApiOperation({
    summary:
      'HR: set entitled, brought-forward and used for leave types on a leave year; remaining is calculated.',
  })
  async setBalanceSnapshot(
    @CurrentUser() user: AuthenticatedUser,
    @CurrentCompany() companyId: string,
    @Body() dto: LeaveBalanceSnapshotDto,
  ): Promise<unknown> {
    await this.assertCanEditLeaveBalances(user.userId, companyId);
    return this.leaveLedger.setBalanceSnapshot({
      employeeId: dto.employeeId,
      companyId,
      yearLabel: dto.year,
      rows: dto.rows,
      reason: dto.reason,
      actorUserId: user.userId,
    });
  }

  @Get(':id')
  @RequireAnyPermission({ module: 'leave', action: 'view' })
  @DelegatePermissionCheck()
  @ApiOperation({
    summary:
      'Get a leave request with approval tiers (owner, approver, or HR)',
  })
  getOne(
    @CurrentUser() user: AuthenticatedUser,
    @CurrentCompany() companyId: string,
    @Param('id') id: string,
  ): Promise<unknown> {
    return this.leaveService.getRequest(id, companyId, user.userId);
  }

  @Patch(':id')
  // Ownership (owner or leave.manage) is enforced in the service so employees
  // without leave.edit can still fix their own draft / returned requests.
  @DelegatePermissionCheck()
  @ApiOperation({
    summary:
      'Update a draft or returned leave request (owner or HR). Saves only; a returned request is resubmitted from Approvals.',
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
  // Ownership (owner or leave.manage) and status are enforced in the service,
  // so employees can always cancel their own pending leave.
  @DelegatePermissionCheck()
  @ApiOperation({
    summary:
      'Cancel a draft, submitted or in-review leave request (owner or HR), or an approved one (HR - reverses used days)',
  })
  cancel(
    @CurrentUser() user: AuthenticatedUser,
    @CurrentCompany() companyId: string,
    @Param('id') id: string,
  ): Promise<unknown> {
    return this.leaveService.cancelRequest(id, companyId, user.userId);
  }

  @Delete(':id')
  @RequireAnyPermission({ module: 'leave', action: 'delete' })
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
