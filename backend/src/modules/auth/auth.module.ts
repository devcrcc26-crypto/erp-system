import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { CqrsModule } from '@nestjs/cqrs';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { AuditModule } from '../audit/audit.module';
import { AUTH_REPOSITORY } from './domain/repositories/auth.repository.interface';
import { AuthRepository } from './infrastructure/repositories/auth.repository';
import { ForgotPasswordHandler } from './application/commands/forgot-password.handler';
import { LoginHandler } from './application/commands/login.handler';
import { LogoutHandler } from './application/commands/logout.handler';
import { RefreshTokenHandler } from './application/commands/refresh-token.handler';
import { ResetPasswordHandler } from './application/commands/reset-password.handler';
import { AuthMailService } from './application/services/auth-mail.service';
import { PasswordService } from './application/services/password.service';
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
];

@Module({
  imports: [
    AuditModule,
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
    AuthMailService,
    SessionCapabilitiesService,
    JwtStrategy,
    {
      provide: AUTH_REPOSITORY,
      useClass: AuthRepository,
    },
  ],
  exports: [TokenService, PasswordService, AuthMailService, AUTH_REPOSITORY],
})
export class AuthModule {}
