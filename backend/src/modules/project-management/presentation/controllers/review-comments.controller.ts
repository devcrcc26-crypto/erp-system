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
import { PmApi } from '../decorators/pm-api.decorator';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../../../shared/decorators/current-user.decorator';
import { DelegatePermissionCheck } from '../../../../shared/permissions/delegate-permission-check.decorator';
import { PermissionsGuard } from '../../../../shared/permissions/permissions.guard';
import { AuthenticatedUser } from '../../../../shared/types/jwt-payload.type';
import {
  AddReviewCommentDto,
  TransitionReviewCommentDto,
  UpdateReviewCommentDto,
  VerifyReviewCommentDto,
} from '../../application/dtos/engineering-document.dtos';
import { ReviewCommentsService } from '../../application/services/review-comments.service';

@ApiTags('Review Comments')
@ApiBearerAuth()
@PmApi()
@UseGuards(PermissionsGuard)
@Controller('review-comments')
export class ReviewCommentsController {
  constructor(private readonly reviewCommentsService: ReviewCommentsService) {}

  private ctx(user: AuthenticatedUser): { companyId: string; userId: string } {
    return { companyId: user.companyId, userId: user.userId };
  }

  @Get(':commentId')
  @DelegatePermissionCheck()
  @ApiOperation({ summary: 'Get review comment detail' })
  get(
    @CurrentUser() user: AuthenticatedUser,
    @Param('commentId') commentId: string,
  ): Promise<unknown> {
    return this.reviewCommentsService.getComment(this.ctx(user), commentId);
  }

  @Post()
  @DelegatePermissionCheck()
  @ApiOperation({ summary: 'Add review comment to EDV in active session' })
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: AddReviewCommentDto,
  ): Promise<unknown> {
    return this.reviewCommentsService.addComment(this.ctx(user), dto);
  }

  @Patch(':commentId')
  @DelegatePermissionCheck()
  @ApiOperation({ summary: 'Edit own OPEN review comment' })
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('commentId') commentId: string,
    @Body() dto: UpdateReviewCommentDto,
  ): Promise<unknown> {
    return this.reviewCommentsService.updateComment(this.ctx(user), commentId, dto);
  }

  @Patch(':commentId/status')
  @DelegatePermissionCheck()
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
  @DelegatePermissionCheck()
  @ApiOperation({ summary: 'Verify RESOLVED comment (RESOLVED â†?VERIFIED)' })
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
  @DelegatePermissionCheck()
  @ApiOperation({ summary: 'Remove own OPEN review comment' })
  remove(
    @CurrentUser() user: AuthenticatedUser,
    @Param('commentId') commentId: string,
  ): Promise<unknown> {
    return this.reviewCommentsService.removeComment(this.ctx(user), commentId);
  }
}
