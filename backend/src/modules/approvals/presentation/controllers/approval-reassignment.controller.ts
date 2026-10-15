import { Body, Controller, Param, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiProperty, ApiTags } from '@nestjs/swagger';
import { IsString, IsUUID, MaxLength, MinLength } from 'class-validator';
import { CurrentUser } from '../../../../shared/decorators/current-user.decorator';
import { PermissionsGuard } from '../../../../shared/permissions/permissions.guard';
import { AuthenticatedUser } from '../../../../shared/types/jwt-payload.type';
import { ApprovalReassignmentService } from '../../application/services/approval-reassignment.service';

export class ReassignTierDto {
  @ApiProperty()
  @IsUUID()
  newApproverId!: string;

  @ApiProperty({ maxLength: 1000 })
  @IsString()
  @MinLength(3)
  @MaxLength(1000)
  reason!: string;
}

@ApiTags('Approvals')
@ApiBearerAuth()
@UseGuards(PermissionsGuard)
@Controller('approvals/tiers')
export class ApprovalReassignmentController {
  constructor(private readonly service: ApprovalReassignmentService) {}

  @Post(':tierId/reassign')
  @ApiOperation({
    summary: 'Reassign a pending approval tier to another active user (HR Manager / System Administrator)',
  })
  reassign(
    @CurrentUser() user: AuthenticatedUser,
    @Param('tierId') tierId: string,
    @Body() dto: ReassignTierDto,
  ): Promise<unknown> {
    return this.service.reassignTier(
      { companyId: user.companyId, userId: user.userId },
      tierId,
      dto.newApproverId,
      dto.reason,
    );
  }
}
