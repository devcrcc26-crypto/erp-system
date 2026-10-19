import { Module, forwardRef } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { CqrsModule } from '@nestjs/cqrs';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { AuditModule } from '../audit/audit.module';
import { DocumentsModule } from '../documents/documents.module';
import { ProjectManagementModule } from '../project-management/project-management.module';
import { AUTH_REPOSITORY } from './domain/repositories/auth.repository.interface';
import { AuthRepository } from './infrastructure/repositories/auth.repository';
import { ActivateAccountHandler } from './application/commands/activate-account.handler';
import { ForgotPasswordHandler } from './application/commands/forgot-password.handler';
import { LoginHandler } from './application/commands/login.handler';
import { LogoutHandler } from './application/commands/logout.handler';
import { RefreshTokenHandler } from './application/commands/refresh-token.handler';
import { ResendActivationHandler } from './application/commands/resend-activation.handler';
import { ResetPasswordHandler } from './application/commands/reset-password.handler';
import { AccountActivationService } from './application/services/account-activation.service';
import { AuthMailService } from './application/services/auth-mail.service';
import { LoginLockoutService } from './application/services/login-lockout.service';
import { PasswordService } from './application/services/password.service';
import { ProfileService } from './application/services/profile.service';
import { SessionCapabilitiesService } from './application/services/session-capabilities.service';
import { TokenService } from './application/services/token.service';
import { AuthController } from './presentation/controllers/auth.controller';
import { JwtStrategy } from './presentation/strategies/jwt.strategy';

const CommandHandlers = [
  LoginHandler,
  RefreshTokenHandler,
  LogoutHandler,
  ForgotPasswordHandler,
  ResetPasswordHandler,
  ActivateAccountHandler,
  ResendActivationHandler,
];

@Module({
  imports: [
    AuditModule,
    forwardRef(() => DocumentsModule),
    forwardRef(() => ProjectManagementModule),
    CqrsModule,
    PassportModule.register({ defaultStrategy: 'jwt' }),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        secret: configService.get<string>('JWT_ACCESS_SECRET'),
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [
    ...CommandHandlers,
    TokenService,
    PasswordService,
    LoginLockoutService,
    AuthMailService,
    AccountActivationService,
    ProfileService,
    SessionCapabilitiesService,
    JwtStrategy,
    {
      provide: AUTH_REPOSITORY,
      useClass: AuthRepository,
    },
  ],
  exports: [
    TokenService,
    PasswordService,
    AuthMailService,
    AccountActivationService,
    AUTH_REPOSITORY,
  ],
})
export class AuthModule {}
