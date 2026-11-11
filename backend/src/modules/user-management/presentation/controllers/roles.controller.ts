import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../../../shared/decorators/current-user.decorator';
import { PaginationQueryDto } from '../../../../shared/dtos/pagination-query.dto';
import { PermissionsGuard } from '../../../../shared/permissions/permissions.guard';
import { RequirePermission } from '../../../../shared/permissions/require-permission.decorator';
import { AuthenticatedUser } from '../../../../shared/types/jwt-payload.type';
import {
  CreateDataScopeDto,
  CreateRoleDto,
  UpdateDataScopeDto,
  UpdateRoleDto,
  UpdateRolePermissionsDto,
} from '../../application/dtos/user-management.dtos';
import { UserManagementService } from '../../application/services/user-management.service';

@ApiTags('Roles')
@ApiBearerAuth()
@UseGuards(PermissionsGuard)
@Controller()
export class RolesController {
  constructor(private readonly userManagementService: UserManagementService) {}

  private ctx(user: AuthenticatedUser): { companyId: string; userId: string } {
    return { companyId: user.companyId, userId: user.userId };
  }

  @Get('roles')
  @RequirePermission('roles', 'view')
  @ApiOperation({ summary: 'List roles' })
  listRoles(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: PaginationQueryDto,
  ): Promise<unknown> {
    return this.userManagementService.listRoles(this.ctx(user), query);
  }

  @Get('roles/:id')
  @RequirePermission('roles', 'view')
  getRole(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ): Promise<unknown> {
    return this.userManagementService.getRole(this.ctx(user), id);
  }

  @Post('roles')
  @RequirePermission('roles', 'create')
  createRole(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateRoleDto,
  ): Promise<unknown> {
    return this.userManagementService.createRole(this.ctx(user), dto);
  }

  @Patch('roles/:id')
  @RequirePermission('roles', 'edit')
  updateRole(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: UpdateRoleDto,
  ): Promise<unknown> {
    return this.userManagementService.updateRole(this.ctx(user), id, dto);
  }

  @Delete('roles/:id')
  @RequirePermission('roles', 'delete')
  async deleteRole(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ): Promise<{ message: string }> {
    await this.userManagementService.deleteRole(this.ctx(user), id);
    return { message: 'Role deleted' };
  }

  @Put('roles/:id/permissions')
  @RequirePermission('roles', 'edit')
  @ApiOperation({ summary: 'Replace role permission matrix' })
  updatePermissions(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: UpdateRolePermissionsDto,
  ): Promise<unknown> {
    return this.userManagementService.updateRolePermissions(
      this.ctx(user),
      id,
      dto,
    );
  }

  @Get('permissions')
  @RequirePermission('roles', 'view')
  @ApiOperation({ summary: 'List global permissions' })
  listPermissions(): Promise<unknown[]> {
    return this.userManagementService.listPermissions();
  }

  @Get('user-roles/:userRoleId/data-scopes')
  @RequirePermission('roles', 'view')
  listDataScopes(
    @CurrentUser() user: AuthenticatedUser,
    @Param('userRoleId') userRoleId: string,
  ): Promise<unknown[]> {
    return this.userManagementService.listDataScopes(this.ctx(user), userRoleId);
  }

  @Post('user-roles/:userRoleId/data-scopes')
  @RequirePermission('roles', 'edit')
  createDataScope(
    @CurrentUser() user: AuthenticatedUser,
    @Param('userRoleId') userRoleId: string,
    @Body() dto: CreateDataScopeDto,
  ): Promise<unknown> {
    return this.userManagementService.createDataScope(
      this.ctx(user),
      userRoleId,
      dto,
    );
  }

  @Patch('data-scopes/:id')
  @RequirePermission('roles', 'edit')
  updateDataScope(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: UpdateDataScopeDto,
  ): Promise<unknown> {
    return this.userManagementService.updateDataScope(this.ctx(user), id, dto);
  }

  @Delete('data-scopes/:id')
  @RequirePermission('roles', 'edit')
  async deleteDataScope(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ): Promise<{ message: string }> {
    await this.userManagementService.deleteDataScope(this.ctx(user), id);
    return { message: 'Data scope deleted' };
  }
}
