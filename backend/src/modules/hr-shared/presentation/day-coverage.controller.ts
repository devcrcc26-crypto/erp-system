import {
  BadRequestException,
  Controller,
  ForbiddenException,
  Get,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentCompany } from '../../../shared/decorators/current-company.decorator';
import { CurrentUser } from '../../../shared/decorators/current-user.decorator';
import { PermissionsGuard } from '../../../shared/permissions/permissions.guard';
import { RequireAnyPermission } from '../../../shared/permissions/require-any-permission.decorator';
import type { AuthenticatedUser } from '../../../shared/types/jwt-payload.type';
import { OnBehalfService } from '../../on-behalf/on-behalf.service';
import { DayCoverageQueryDto } from '../application/dtos/day-coverage.dto';
import { DayCoverageService } from '../application/services/day-coverage.service';
import {
  type CoverModule,
  type DayCover,
  eachDay,
} from '../application/utils/day-coverage.util';
import { parseDateOnly } from '../../work-schedule/application/services/work-schedule.dates';
import { HrApprovalChainService } from '../application/services/hr-approval-chain.service';

const DEFAULT_CHECK: CoverModule[] = [
  'LEAVE',
  'SITE_ASSIGNMENT',
  'WORK_FROM_HOME',
  'FIELD_MOVEMENT',
];

const MAX_RANGE_DAYS = 62;

const FOCUS_ORDER: CoverModule[] = [
  'LEAVE',
  'SITE_ASSIGNMENT',
  'WORK_FROM_HOME',
  'FIELD_MOVEMENT',
];

/**
 * Read-only day coverage for HR request forms (warn when a date already has
 * leave / site / WFH / field movement).
 */
@ApiTags('HR Day Coverage')
@ApiBearerAuth()
@UseGuards(PermissionsGuard)
@RequireAnyPermission(
  { module: 'hr', action: 'view' },
  { module: 'leave', action: 'view' },
  { module: 'leave', action: 'create' },
  { module: 'overtime', action: 'view' },
  { module: 'overtime', action: 'create' },
  { module: 'attendance', action: 'view' },
  { module: 'attendance', action: 'create' },
)
@Controller('hr/day-coverage')
export class DayCoverageController {
  constructor(
    private readonly dayCoverage: DayCoverageService,
    private readonly onBehalf: OnBehalfService,
    private readonly hrApprovalChain: HrApprovalChainService,
  ) {}

  @Get()
  @ApiOperation({
    summary:
      'List leave / site / WFH / field-movement coverage for an employee date range',
  })
  async list(
    @CurrentCompany() companyId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: DayCoverageQueryDto,
  ): Promise<{ covers: DayCover[] }> {
    await this.assertCanViewEmployee(user.userId, companyId, query.employeeId);

    const from = parseDateOnly(query.from);
    const to = parseDateOnly(query.to);
    if (to.getTime() < from.getTime()) {
      throw new BadRequestException('to must be on or after from');
    }
    const spanDays =
      Math.round((to.getTime() - from.getTime()) / 86_400_000) + 1;
    if (spanDays > MAX_RANGE_DAYS) {
      throw new BadRequestException(
        `Date range cannot exceed ${MAX_RANGE_DAYS} days`,
      );
    }

    const covers = await this.dayCoverage.findCovers(
      companyId,
      query.employeeId,
      eachDay(from, to),
      DEFAULT_CHECK,
    );

    const focus = this.parseFocus(query.focus);
    const sorted = [...covers].sort((a, b) => {
      if (focus) {
        const aFocus = a.module === focus ? 0 : 1;
        const bFocus = b.module === focus ? 0 : 1;
        if (aFocus !== bFocus) {
          return aFocus - bFocus;
        }
      }
      if (a.date !== b.date) {
        return a.date.localeCompare(b.date);
      }
      return FOCUS_ORDER.indexOf(a.module) - FOCUS_ORDER.indexOf(b.module);
    });

    return { covers: sorted };
  }

  private parseFocus(value: string | undefined): CoverModule | null {
    if (!value) {
      return null;
    }
    const normalised = value.trim().toUpperCase();
    return FOCUS_ORDER.includes(normalised as CoverModule)
      ? (normalised as CoverModule)
      : null;
  }

  private async assertCanViewEmployee(
    actorUserId: string,
    companyId: string,
    employeeId: string,
  ): Promise<void> {
    if (actorUserId === employeeId) {
      return;
    }
    if (await this.hrApprovalChain.isHrOrFullAccessActor(actorUserId, companyId)) {
      return;
    }
    if (await this.onBehalf.isEligibleFor(actorUserId, employeeId, companyId)) {
      return;
    }
    throw new ForbiddenException(
      'You do not have access to this employee day coverage',
    );
  }
}
