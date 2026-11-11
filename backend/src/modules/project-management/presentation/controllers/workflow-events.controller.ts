import { Body, Controller, Param, Post, UseGuards } from '@nestjs/common';
import { PmApi } from '../decorators/pm-api.decorator';
import { ApiBearerAuth, ApiOperation, ApiProperty, ApiTags } from '@nestjs/swagger';
import { IsNotEmpty, IsObject, IsOptional, IsString } from 'class-validator';
import { CurrentUser } from '../../../../shared/decorators/current-user.decorator';
import { PermissionsGuard } from '../../../../shared/permissions/permissions.guard';
import { RequirePermission } from '../../../../shared/permissions/require-permission.decorator';
import { AuthenticatedUser } from '../../../../shared/types/jwt-payload.type';
import { WorkflowCorrectionService } from '../../application/services/workflow-correction.service';

class WorkflowCorrectionBodyDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  reason!: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsObject()
  afterState?: Record<string, unknown>;
}

@ApiTags('Workflow Events')
@ApiBearerAuth()
@PmApi()
@UseGuards(PermissionsGuard)
@Controller('workflow-events')
export class WorkflowEventsController {
  constructor(private readonly workflowCorrectionService: WorkflowCorrectionService) {}

  private ctx(user: AuthenticatedUser): { companyId: string; userId: string } {
    return { companyId: user.companyId, userId: user.userId };
  }

  @Post(':eventId/correct')
  @RequirePermission('schedule', 'approve')
  @ApiOperation({ summary: 'Append CORRECTION event for a prior workflow log row' })
  correctEvent(
    @CurrentUser() user: AuthenticatedUser,
    @Param('eventId') eventId: string,
    @Body() dto: WorkflowCorrectionBodyDto,
  ): Promise<unknown> {
    return this.workflowCorrectionService.correctEvent(
      this.ctx(user),
      eventId,
      dto,
    );
  }
}
