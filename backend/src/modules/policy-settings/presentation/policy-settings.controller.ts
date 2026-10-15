import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiProperty, ApiPropertyOptional, ApiTags } from '@nestjs/swagger';
import { IsBoolean, IsDefined, IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';
import { CurrentUser } from '../../../shared/decorators/current-user.decorator';
import { PermissionsGuard } from '../../../shared/permissions/permissions.guard';
import { RequireAnyPermission } from '../../../shared/permissions/require-any-permission.decorator';
import { AuthenticatedUser } from '../../../shared/types/jwt-payload.type';
import { PolicySettingsService } from '../application/policy-settings.service';

const MONTH_START = /^\d{4}-\d{2}-01$/;

export class PolicyPreviewDto {
  @ApiProperty({ example: '2026-11-01' })
  @Matches(MONTH_START, { message: 'effectiveFrom must be YYYY-MM-01' })
  effectiveFrom!: string;
}

export class SavePolicyDto extends PolicyPreviewDto {
  @ApiProperty({ description: 'New value; type depends on the policy key' })
  @IsDefined()
  value!: unknown;

  @ApiProperty({ maxLength: 1000 })
  @IsString()
  @MinLength(3)
  @MaxLength(1000)
  reason!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  confirmAffectedRuns?: boolean;
}

@ApiTags('Policy settings')
@ApiBearerAuth()
@UseGuards(PermissionsGuard)
@Controller('policy-settings')
export class PolicySettingsController {
  constructor(private readonly service: PolicySettingsService) {}

  private ctx(user: AuthenticatedUser): { companyId: string; userId: string } {
    return { companyId: user.companyId, userId: user.userId };
  }

  @Get()
  @RequireAnyPermission({ module: 'hr', action: 'view' })
  @ApiOperation({ summary: 'All HR policies: value in force this month, scheduled changes and history' })
  list(@CurrentUser() user: AuthenticatedUser): Promise<unknown> {
    return this.service.list(this.ctx(user));
  }

  @Post(':key/preview')
  @RequireAnyPermission({ module: 'hr', action: 'view' })
  @ApiOperation({ summary: 'Payroll runs a change from effectiveFrom would affect (no changes)' })
  preview(
    @CurrentUser() user: AuthenticatedUser,
    @Param('key') key: string,
    @Body() dto: PolicyPreviewDto,
  ): Promise<unknown> {
    return this.service.preview(this.ctx(user), key, dto.effectiveFrom);
  }

  @Post(':key')
  @RequireAnyPermission({ module: 'hr', action: 'view' })
  @ApiOperation({
    summary:
      'Save a new version of a policy from effectiveFrom (HR Manager / System Administrator; tax and pension: admin only)',
  })
  save(
    @CurrentUser() user: AuthenticatedUser,
    @Param('key') key: string,
    @Body() dto: SavePolicyDto,
  ): Promise<unknown> {
    return this.service.save(this.ctx(user), key, dto);
  }
}
