import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { PermissionsGuard } from '../../shared/permissions/permissions.guard';
import { RequireAnyPermission } from '../../shared/permissions/require-any-permission.decorator';
import { CurrentUser } from '../../shared/decorators/current-user.decorator';
import { CurrentCompany } from '../../shared/decorators/current-company.decorator';
import type { AuthenticatedUser } from '../../shared/types/jwt-payload.type';
import { DraftsService, type DraftModule } from './drafts.service';

@RequireAnyPermission(
  { module: 'leave', action: 'create' },
  { module: 'expenseClaims', action: 'create' },
  { module: 'procurement', action: 'create' },
  { module: 'fleet', action: 'create' },
  { module: 'administration', action: 'create' },
  { module: 'flight', action: 'create' },
  { module: 'businessTrip', action: 'create' },
  { module: 'overtime', action: 'create' },
)
@Controller('drafts')
@UseGuards(PermissionsGuard)
export class DraftsController {
  constructor(private readonly draftsService: DraftsService) {}

  @Get('my')
  async getMyDrafts(
    @CurrentUser() user: AuthenticatedUser,
    @CurrentCompany() companyId: string,
    @Query('module') module?: DraftModule,
  ) {
    const items = await this.draftsService.getMyDrafts(user.userId, companyId, module);
    return { success: true, data: items };
  }
}