import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../../../shared/decorators/current-user.decorator';
import { PermissionsGuard } from '../../../../shared/permissions/permissions.guard';
import { RequirePermission } from '../../../../shared/permissions/require-permission.decorator';
import { AuthenticatedUser } from '../../../../shared/types/jwt-payload.type';
import {
  BatchReviewApproveDto,
  BatchReviewReturnDto,
} from '../../application/dtos/engineering-document.dtos';
import { ReviewBatchService } from '../../application/services/review-batch.service';

@ApiTags('Review Batch')
@ApiBearerAuth()
@UseGuards(PermissionsGuard)
@Controller('review')
export class ReviewBatchController {
  constructor(private readonly reviewBatchService: ReviewBatchService) {}

  private ctx(user: AuthenticatedUser): { companyId: string; userId: string } {
    return { companyId: user.companyId, userId: user.userId };
  }

  @Post('batch-approve')
  @RequirePermission('schedule', 'approve')
  @ApiOperation({ summary: 'Batch approve EDVs in a design package' })
  batchApprove(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: BatchReviewApproveDto,
  ): Promise<unknown> {
    return this.reviewBatchService.batchApprove(this.ctx(user), '', dto);
  }

  @Post('batch-return')
  @RequirePermission('schedule', 'approve')
  @ApiOperation({ summary: 'Batch return EDVs with comment template' })
  batchReturn(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: BatchReviewReturnDto,
  ): Promise<unknown> {
    return this.reviewBatchService.batchReturn(this.ctx(user), '', dto);
  }
}
