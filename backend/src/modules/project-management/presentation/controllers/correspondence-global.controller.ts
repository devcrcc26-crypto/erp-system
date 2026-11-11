import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { PmApi } from '../decorators/pm-api.decorator';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../../../shared/decorators/current-user.decorator';
import { PermissionsGuard } from '../../../../shared/permissions/permissions.guard';
import { RequirePermission } from '../../../../shared/permissions/require-permission.decorator';
import { AuthenticatedUser } from '../../../../shared/types/jwt-payload.type';
import { PmListQueryDto } from '../../application/dtos/pm.dtos';
import { CorrespondenceService } from '../../application/services/correspondence.service';

/**
 * Company-scoped correspondence routes (no project path param).
 */
@ApiTags('Correspondence')
@ApiBearerAuth()
@PmApi()
@UseGuards(PermissionsGuard)
@Controller('correspondence')
export class CorrespondenceGlobalController {
  constructor(private readonly correspondenceService: CorrespondenceService) {}

  private ctx(user: AuthenticatedUser): { companyId: string; userId: string } {
    return { companyId: user.companyId, userId: user.userId };
  }

  @Get('all')
  @RequirePermission('projects', 'view')
  @ApiOperation({
    summary: 'List all correspondence across projects (portfolio access)',
  })
  listAll(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: PmListQueryDto,
  ): Promise<unknown> {
    return this.correspondenceService.listAllCorrespondence(
      this.ctx(user),
      query,
    );
  }
}
