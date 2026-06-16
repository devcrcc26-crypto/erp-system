import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../../../shared/decorators/current-user.decorator';
import { PermissionsGuard } from '../../../../shared/permissions/permissions.guard';
import { RequirePermission } from '../../../../shared/permissions/require-permission.decorator';
import { AuthenticatedUser } from '../../../../shared/types/jwt-payload.type';
import {
  CreateSubmittalDto,
  CreateSubmittalReviewDto,
  PmListQueryDto,
  UpdateSubmittalDto,
} from '../../application/dtos/pm.dtos';
import { SubmittalsService } from '../../application/services/submittals.service';

@ApiTags('Submittals')
@ApiBearerAuth()
@UseGuards(PermissionsGuard)
@Controller('projects/:projectId/submittals')
export class SubmittalsController {
  constructor(private readonly submittalsService: SubmittalsService) {}

  private ctx(user: AuthenticatedUser): { companyId: string; userId: string } {
    return { companyId: user.companyId, userId: user.userId };
  }

  @Get()
  @RequirePermission('submittals', 'view')
  @ApiOperation({ summary: 'List project submittals' })
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Param('projectId') projectId: string,
    @Query() query: PmListQueryDto,
  ): Promise<unknown> {
    return this.submittalsService.listSubmittals(this.ctx(user), projectId, query);
  }

  @Post()
  @RequirePermission('submittals', 'create')
  @ApiOperation({ summary: 'Create submittal' })
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Param('projectId') projectId: string,
    @Body() dto: CreateSubmittalDto,
  ): Promise<unknown> {
    return this.submittalsService.createSubmittal(this.ctx(user), projectId, dto);
  }

  @Get(':id/reviews')
  @RequirePermission('submittals', 'view')
  @ApiOperation({ summary: 'List submittal reviews' })
  listReviews(
    @CurrentUser() user: AuthenticatedUser,
    @Param('projectId') projectId: string,
    @Param('id') id: string,
  ): Promise<unknown> {
    return this.submittalsService.listReviews(this.ctx(user), projectId, id);
  }

  @Post(':id/reviews')
  @RequirePermission('submittals', 'create')
  @ApiOperation({ summary: 'Add submittal review' })
  addReview(
    @CurrentUser() user: AuthenticatedUser,
    @Param('projectId') projectId: string,
    @Param('id') id: string,
    @Body() dto: CreateSubmittalReviewDto,
  ): Promise<unknown> {
    return this.submittalsService.addReview(this.ctx(user), projectId, id, dto);
  }

  @Get(':id')
  @RequirePermission('submittals', 'view')
  @ApiOperation({ summary: 'Get submittal by id' })
  get(
    @CurrentUser() user: AuthenticatedUser,
    @Param('projectId') projectId: string,
    @Param('id') id: string,
  ): Promise<unknown> {
    return this.submittalsService.getSubmittal(this.ctx(user), projectId, id);
  }

  @Patch(':id')
  @RequirePermission('submittals', 'edit')
  @ApiOperation({ summary: 'Update submittal' })
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('projectId') projectId: string,
    @Param('id') id: string,
    @Body() dto: UpdateSubmittalDto,
  ): Promise<unknown> {
    return this.submittalsService.updateSubmittal(
      this.ctx(user),
      projectId,
      id,
      dto,
    );
  }

  @Delete(':id')
  @RequirePermission('submittals', 'delete')
  @ApiOperation({ summary: 'Delete submittal' })
  async remove(
    @CurrentUser() user: AuthenticatedUser,
    @Param('projectId') projectId: string,
    @Param('id') id: string,
  ): Promise<{ message: string }> {
    await this.submittalsService.deleteSubmittal(this.ctx(user), projectId, id);
    return { message: 'Submittal deleted' };
  }
}
