import { Body, Controller, Get, Post, Req } from '@nestjs/common';
import { CommandBus } from '@nestjs/cqrs';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { Request } from 'express';
import { Public } from '../../../../shared/decorators/public.decorator';
import { CurrentUser } from '../../../../shared/decorators/current-user.decorator';
import { AuthenticatedUser } from '../../../../shared/types/jwt-payload.type';
import { ApiErrorResponseDto } from '../../../../shared/dtos/api-response.dto';
import {
  AuthTokensDto,
  MessageResponseDto,
} from '../../application/dtos/auth-response.dto';
import { CapabilitiesDto } from '../../application/dtos/capabilities.dto';
import { SessionCapabilitiesService } from '../../application/services/session-capabilities.service';
import { ForgotPasswordDto } from '../../application/dtos/forgot-password.dto';
import { LoginDto } from '../../application/dtos/login.dto';
import { RefreshTokenDto } from '../../application/dtos/refresh-token.dto';
import { ResetPasswordDto } from '../../application/dtos/reset-password.dto';
import { ForgotPasswordCommand } from '../../application/commands/forgot-password.command';
import { LoginCommand } from '../../application/commands/login.command';
import { LogoutCommand } from '../../application/commands/logout.command';
import { RefreshTokenCommand } from '../../application/commands/refresh-token.command';
import { ResetPasswordCommand } from '../../application/commands/reset-password.command';

@ApiTags('Auth')
@Throttle({ default: { limit: 10, ttl: 60_000 } })
@Controller('auth')
export class AuthController {
  constructor(
    private readonly commandBus: CommandBus,
    private readonly sessionCapabilitiesService: SessionCapabilitiesService,
  ) {}

  @Public()
  @Post('login')
  @ApiOperation({ summary: 'Authenticate with email and password' })
  @ApiResponse({ status: 201, type: AuthTokensDto })
  @ApiResponse({ status: 401, type: ApiErrorResponseDto })
  async login(
    @Body() dto: LoginDto,
    @Req() req: Request,
  ): Promise<AuthTokensDto> {
    return this.commandBus.execute(
      new LoginCommand(
        dto.email,
        dto.password,
        dto.deviceInfo,
        req.ip,
      ),
    );
  }

  @Public()
  @Post('refresh')
  @ApiOperation({ summary: 'Rotate refresh token and issue new access token' })
  @ApiResponse({ status: 201, type: AuthTokensDto })
  @ApiResponse({ status: 401, type: ApiErrorResponseDto })
  async refresh(
    @Body() dto: RefreshTokenDto,
    @Req() req: Request,
  ): Promise<AuthTokensDto> {
    return this.commandBus.execute(
      new RefreshTokenCommand(dto.sessionId, dto.refreshToken, req.ip),
    );
  }

  @Get('capabilities')
  @ApiOperation({ summary: 'Get UI capability flags for the current session' })
  @ApiResponse({ status: 200, type: CapabilitiesDto })
  async getCapabilities(
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<CapabilitiesDto> {
    return this.sessionCapabilitiesService.resolve(user.userId, user.companyId);
  }

  @Post('logout')
  @ApiOperation({ summary: 'Revoke the current session' })
  @ApiResponse({ status: 201, type: MessageResponseDto })
  async logout(
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<{ message: string }> {
    return this.commandBus.execute(
      new LogoutCommand(user.sessionId, user.userId),
    );
  }

  @Public()
  @Post('forgot-password')
  @ApiOperation({ summary: 'Request a password reset email' })
  @ApiResponse({ status: 201, type: MessageResponseDto })
  async forgotPassword(
    @Body() dto: ForgotPasswordDto,
  ): Promise<{ message: string }> {
    return this.commandBus.execute(new ForgotPasswordCommand(dto.email));
  }

  @Public()
  @Post('reset-password')
  @ApiOperation({ summary: 'Reset password using a one-time token' })
  @ApiResponse({ status: 201, type: MessageResponseDto })
  @ApiResponse({ status: 400, type: ApiErrorResponseDto })
  async resetPassword(
    @Body() dto: ResetPasswordDto,
  ): Promise<{ message: string }> {
    return this.commandBus.execute(
      new ResetPasswordCommand(dto.email, dto.token, dto.newPassword),
    );
  }
}
