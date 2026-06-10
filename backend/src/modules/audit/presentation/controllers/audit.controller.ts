import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../../../shared/decorators/current-user.decorator';
import { PermissionsGuard } from '../../../../shared/permissions/permissions.guard';
import { RequirePermission } from '../../../../shared/permissions/require-permission.decorator';
import { AuthenticatedUser } from '../../../../shared/types/jwt-payload.type';
import { AuditLogQueryDto } from '../../application/dtos/audit-log-query.dto';
import { AuditService } from '../../application/services/audit.service';

@ApiTags('Audit')
@ApiBearerAuth()
@UseGuards(PermissionsGuard)
@Controller('audit-logs')
export class AuditController {
  constructor(private readonly auditService: AuditService) {}

  @Get()
  @RequirePermission('audit', 'view')
  @ApiOperation({ summary: 'List audit logs (paginated, filterable)' })
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: AuditLogQueryDto,
  ): Promise<unknown> {
    return this.auditService.list(user.companyId, query);
  }
}
