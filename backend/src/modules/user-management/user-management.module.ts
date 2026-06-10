import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { UserManagementService } from './application/services/user-management.service';
import { RolesController } from './presentation/controllers/roles.controller';
import { UsersController } from './presentation/controllers/users.controller';

@Module({
  imports: [AuthModule],
  controllers: [UsersController, RolesController],
  providers: [UserManagementService],
  exports: [UserManagementService],
})
export class UserManagementModule {}
