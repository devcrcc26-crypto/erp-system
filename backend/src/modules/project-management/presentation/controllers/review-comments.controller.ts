import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../../../shared/decorators/current-user.decorator';
import { PermissionsGuard } from '../../../../shared/permissions/permissions.guard';
import { RequirePermission } from '../../../../shared/permissions/require-permission.decorator';
import { AuthenticatedUser } from '../../../../shared/types/jwt-payload.type';
import {
  AddReviewCommentDto,
  TransitionReviewCommentDto,
  VerifyReviewCommentDto,
} from '../../application/dtos/engineering-document.dtos';
import { ReviewCommentsService } from '../../application/services/review-comments.service';

@ApiTags('Review Comments')
@ApiBearerAuth()
@UseGuards(PermissionsGuard)
@Controller('review-comments')
export class ReviewCommentsController {
  constructor(private readonly reviewCommentsService: ReviewCommentsService) {}

  private ctx(user: AuthenticatedUser): { companyId: string; userId: string } {
    return { companyId: user.companyId, userId: user.userId };
  }

  @Get(':commentId')
  @RequirePermission('schedule', 'view')
  @ApiOperation({ summary: 'Get review comment detail' })
  get(
    @CurrentUser() user: AuthenticatedUser,
    @Param('commentId') commentId: string,
  ): Promise<unknown> {
    return this.reviewCommentsService.getComment(this.ctx(user), commentId);
  }

  @Post()
  @ApiOperation({ summary: 'Add review comment to EDV in active session' })
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: AddReviewCommentDto,
  ): Promise<unknown> {
    return this.reviewCommentsService.addComment(this.ctx(user), dto);
  }

  @Patch(':commentId/status')
  @RequirePermission('schedule', 'edit')
  @ApiOperation({ summary: 'Transition review comment status' })
  transition(
    @CurrentUser() user: AuthenticatedUser,
    @Param('commentId') commentId: string,
    @Body() dto: TransitionReviewCommentDto,
  ): Promise<unknown> {
    return this.reviewCommentsService.transitionComment(
      this.ctx(user),
      commentId,
      dto,
    );
  }

  @Post(':commentId/verify')
  @RequirePermission('schedule', 'approve')
  @ApiOperation({ summary: 'Verify RESOLVED comment (RESOLVED → VERIFIED)' })
  verify(
    @CurrentUser() user: AuthenticatedUser,
    @Param('commentId') commentId: string,
    @Body() dto: VerifyReviewCommentDto,
  ): Promise<unknown> {
    return this.reviewCommentsService.verifyComment(
      this.ctx(user),
      commentId,
      dto,
    );
  }

  @Delete(':commentId')
  @RequirePermission('schedule', 'view')
  @ApiOperation({ summary: 'Remove own OPEN review comment' })
  remove(
    @CurrentUser() user: AuthenticatedUser,
    @Param('commentId') commentId: string,
  ): Promise<unknown> {
    return this.reviewCommentsService.removeComment(this.ctx(user), commentId);
  }
}
