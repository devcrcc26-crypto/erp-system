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
import { PaginationQueryDto } from '../../../../shared/dtos/pagination-query.dto';
import { PermissionsGuard } from '../../../../shared/permissions/permissions.guard';
import { RequirePermission } from '../../../../shared/permissions/require-permission.decorator';
import { AuthenticatedUser } from '../../../../shared/types/jwt-payload.type';
import {
  AssignUserRoleDto,
  CreateUserDto,
  UpdateUserDto,
  UsersQueryDto,
} from '../../application/dtos/user-management.dtos';
import { UserManagementService } from '../../application/services/user-management.service';

@ApiTags('Users')
@ApiBearerAuth()
@UseGuards(PermissionsGuard)
@Controller('users')
export class UsersController {
  constructor(private readonly userManagementService: UserManagementService) {}

  private ctx(user: AuthenticatedUser): { companyId: string; userId: string } {
    return { companyId: user.companyId, userId: user.userId };
  }

  @Get()
  @RequirePermission('users', 'view')
  @ApiOperation({ summary: 'List users' })
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: UsersQueryDto,
  ): Promise<unknown> {
    return this.userManagementService.listUsers(this.ctx(user), query);
  }

  @Get('directory')
  @RequirePermission('projects', 'view')
  @ApiOperation({
    summary: 'List users for assignment pickers',
    description:
      'Returns id, name, and email for project team and task assignment UIs. Requires projects.view, not users.view.',
  })
  listDirectory(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: PaginationQueryDto,
  ): Promise<unknown> {
    return this.userManagementService.listUsersDirectory(this.ctx(user), query);
  }

  @Get(':id')
  @RequirePermission('users', 'view')
  get(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ): Promise<unknown> {
    return this.userManagementService.getUser(this.ctx(user), id);
  }

  @Post()
  @RequirePermission('users', 'create')
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateUserDto,
  ): Promise<unknown> {
    return this.userManagementService.createUser(this.ctx(user), dto);
  }

  @Patch(':id')
  @RequirePermission('users', 'edit')
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: UpdateUserDto,
  ): Promise<unknown> {
    return this.userManagementService.updateUser(this.ctx(user), id, dto);
  }

  @Delete(':id')
  @RequirePermission('users', 'delete')
  async remove(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ): Promise<{ message: string }> {
    await this.userManagementService.deleteUser(this.ctx(user), id);
    return { message: 'User deactivated' };
  }

  @Post(':id/resend-invitation')
  @RequirePermission('users', 'edit')
  resendInvitation(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ): Promise<{ message: string }> {
    return this.userManagementService.resendInvitation(this.ctx(user), id);
  }

  @Post(':id/roles')
  @RequirePermission('users', 'edit')
  assignRole(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: AssignUserRoleDto,
  ): Promise<unknown> {
    return this.userManagementService.assignUserRole(this.ctx(user), id, dto);
  }

  @Delete(':id/roles/:roleId')
  @RequirePermission('users', 'edit')
  async revokeRole(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Param('roleId') roleId: string,
  ): Promise<{ message: string }> {
    await this.userManagementService.revokeUserRole(this.ctx(user), id, roleId);
    return { message: 'Role revoked' };
  }
}
