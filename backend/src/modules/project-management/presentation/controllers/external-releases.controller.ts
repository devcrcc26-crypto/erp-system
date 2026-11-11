import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { PmApi } from '../decorators/pm-api.decorator';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../../../shared/decorators/current-user.decorator';
import { PermissionsGuard } from '../../../../shared/permissions/permissions.guard';
import { RequirePermission } from '../../../../shared/permissions/require-permission.decorator';
import { AuthenticatedUser } from '../../../../shared/types/jwt-payload.type';
import { PmListQueryDto } from '../../application/dtos/pm.dtos';
import { SubmittalsService } from '../../application/services/submittals.service';

/**
 * Company-scoped external release routes (no project path param).
 */
@ApiTags('External Releases')
@ApiBearerAuth()
@PmApi()
@UseGuards(PermissionsGuard)
@Controller('external-releases')
export class ExternalReleasesController {
  constructor(private readonly submittalsService: SubmittalsService) {}

  private ctx(user: AuthenticatedUser): { companyId: string; userId: string } {
    return { companyId: user.companyId, userId: user.userId };
  }

  @Get('all')
  @RequirePermission('projects', 'view')
  @ApiOperation({
    summary: 'List all external releases across projects (portfolio access)',
  })
  listAll(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: PmListQueryDto,
  ): Promise<unknown> {
    return this.submittalsService.listAllExternalReleases(this.ctx(user), query);
  }
}
