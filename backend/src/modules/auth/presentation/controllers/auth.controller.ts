import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Req,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { CommandBus } from '@nestjs/cqrs';
import {
  ApiBody,
  ApiConsumes,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { Throttle, SkipThrottle } from '@nestjs/throttler';
import { Request } from 'express';
import { memoryStorage } from 'multer';
import { Public } from '../../../../shared/decorators/public.decorator';
import { CurrentUser } from '../../../../shared/decorators/current-user.decorator';
import { AuthenticatedUser } from '../../../../shared/types/jwt-payload.type';
import { ApiErrorResponseDto } from '../../../../shared/dtos/api-response.dto';
import {
  AuthTokensDto,
  MessageResponseDto,
} from '../../application/dtos/auth-response.dto';
import { CapabilitiesDto } from '../../application/dtos/capabilities.dto';
import { ActivateAccountDto } from '../../application/dtos/activate-account.dto';
import { ResendActivationDto } from '../../application/dtos/resend-activation.dto';
import {
  ChangeEmailDto,
  ChangePasswordDto,
  ConfirmEmailChangeDto,
  ProfileResponseDto,
  UpdateProfileDto,
} from '../../application/dtos/profile.dto';
import { SessionCapabilitiesService } from '../../application/services/session-capabilities.service';
import { ProfileService } from '../../application/services/profile.service';
import { ForgotPasswordDto } from '../../application/dtos/forgot-password.dto';
import { LoginDto } from '../../application/dtos/login.dto';
import { RefreshTokenDto } from '../../application/dtos/refresh-token.dto';
import { ResetPasswordDto } from '../../application/dtos/reset-password.dto';
import { ActivateAccountCommand } from '../../application/commands/activate-account.command';
import { ForgotPasswordCommand } from '../../application/commands/forgot-password.command';
import { LoginCommand } from '../../application/commands/login.command';
import { LogoutCommand } from '../../application/commands/logout.command';
import { RefreshTokenCommand } from '../../application/commands/refresh-token.command';
import { ResendActivationCommand } from '../../application/commands/resend-activation.command';
import { ResetPasswordCommand } from '../../application/commands/reset-password.command';

@ApiTags('Auth')
@Throttle({ default: { limit: 10, ttl: 60_000 } })
@Controller('auth')
export class AuthController {
  constructor(
    private readonly commandBus: CommandBus,
    private readonly sessionCapabilitiesService: SessionCapabilitiesService,
    private readonly profileService: ProfileService,
  ) {}

  @Public()
  @Post('login')
  @ApiOperation({
    summary: 'Authenticate with full name (OA login name) or email and password',
  })
  @ApiResponse({ status: 201, type: AuthTokensDto })
  @ApiResponse({ status: 401, type: ApiErrorResponseDto })
  async login(
    @Body() dto: LoginDto,
    @Req() req: Request,
  ): Promise<AuthTokensDto> {
    return this.commandBus.execute(
      new LoginCommand(
        dto.identifier,
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

  @Get('me')
  @ApiOperation({ summary: 'Get the current user profile' })
  @ApiResponse({ status: 200, type: ProfileResponseDto })
  async getProfile(
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<ProfileResponseDto> {
    return this.profileService.getProfile({
      userId: user.userId,
      companyId: user.companyId,
      sessionId: user.sessionId,
    });
  }

  @Get('me/photo/download-url')
  @ApiOperation({ summary: 'Get presigned URL for the current user profile photo' })
  async getProfilePhotoDownloadUrl(
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<{ url: string; expiresIn: number }> {
    return this.profileService.getProfilePhotoDownloadUrl({
      userId: user.userId,
      companyId: user.companyId,
      sessionId: user.sessionId,
    });
  }

  @Post('me/photo')
  @ApiOperation({ summary: 'Upload or replace the current user profile photo' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['file'],
      properties: {
        file: { type: 'string', format: 'binary' },
      },
    },
  })
  @ApiResponse({ status: 201, type: ProfileResponseDto })
  @UseInterceptors(FileInterceptor('file', { storage: memoryStorage() }))
  uploadProfilePhoto(
    @CurrentUser() user: AuthenticatedUser,
    @UploadedFile() file?: Express.Multer.File,
  ): Promise<ProfileResponseDto> {
    if (!file) {
      throw new BadRequestException('Photo file is required');
    }
    return this.profileService.uploadProfilePhoto(
      {
        userId: user.userId,
        companyId: user.companyId,
        sessionId: user.sessionId,
      },
      {
        originalname: file.originalname,
        mimetype: file.mimetype,
        size: file.size,
        buffer: file.buffer,
      },
    );
  }

  @Delete('me/photo')
  @ApiOperation({ summary: 'Remove the current user profile photo' })
  @ApiResponse({ status: 200, type: ProfileResponseDto })
  deleteProfilePhoto(
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<ProfileResponseDto> {
    return this.profileService.deleteProfilePhoto({
      userId: user.userId,
      companyId: user.companyId,
      sessionId: user.sessionId,
    });
  }

  @Get('me/documents')
  @ApiOperation({
    summary: 'List the current user profile documents (read-only, own folder)',
  })
  listMyDocuments(@CurrentUser() user: AuthenticatedUser): Promise<unknown[]> {
    return this.profileService.listMyDocuments({
      userId: user.userId,
      companyId: user.companyId,
      sessionId: user.sessionId,
    });
  }

  @Get('me/documents/:documentId/download-url')
  @ApiOperation({
    summary: 'Presigned download URL for one of the current user profile documents',
  })
  getMyDocumentDownloadUrl(
    @CurrentUser() user: AuthenticatedUser,
    @Param('documentId', ParseUUIDPipe) documentId: string,
  ): Promise<{ url: string; expiresIn: number }> {
    return this.profileService.getMyDocumentDownloadUrl(
      {
        userId: user.userId,
        companyId: user.companyId,
        sessionId: user.sessionId,
      },
      documentId,
    );
  }

  @Patch('me')
  @ApiOperation({ summary: 'Update the current user profile' })
  @ApiResponse({ status: 200, type: ProfileResponseDto })
  async updateProfile(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: UpdateProfileDto,
  ): Promise<ProfileResponseDto> {
    return this.profileService.updateProfile(
      {
        userId: user.userId,
        companyId: user.companyId,
        sessionId: user.sessionId,
      },
      dto,
    );
  }

  @Post('change-password')
  @ApiOperation({ summary: 'Change password for the current session' })
  @ApiResponse({ status: 201, type: MessageResponseDto })
  async changePassword(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: ChangePasswordDto,
  ): Promise<{ message: string }> {
    return this.profileService.changePassword(
      {
        userId: user.userId,
        companyId: user.companyId,
        sessionId: user.sessionId,
      },
      dto.currentPassword,
      dto.newPassword,
    );
  }

  @Post('change-email')
  @ApiOperation({ summary: 'Request an email address change' })
  @ApiResponse({ status: 201, type: MessageResponseDto })
  async changeEmail(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: ChangeEmailDto,
  ): Promise<{ message: string }> {
    return this.profileService.requestEmailChange(
      {
        userId: user.userId,
        companyId: user.companyId,
        sessionId: user.sessionId,
      },
      dto.newEmail,
    );
  }

  @Public()
  @SkipThrottle()
  @Post('confirm-email-change')
  @ApiOperation({ summary: 'Confirm a pending email change' })
  @ApiResponse({ status: 201, type: MessageResponseDto })
  async confirmEmailChange(
    @Body() dto: ConfirmEmailChangeDto,
  ): Promise<{ message: string }> {
    return this.profileService.confirmEmailChange(dto.token);
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
  @SkipThrottle()
  @Post('activate-account')
  @ApiOperation({ summary: 'Activate account and set password' })
  @ApiResponse({ status: 201, type: MessageResponseDto })
  @ApiResponse({ status: 400, type: ApiErrorResponseDto })
  async activateAccount(
    @Body() dto: ActivateAccountDto,
  ): Promise<{ message: string }> {
    return this.commandBus.execute(
      new ActivateAccountCommand(dto.token, dto.newPassword),
    );
  }

  @Public()
  @Post('resend-activation')
  @ApiOperation({ summary: 'Resend account activation email' })
  @ApiResponse({ status: 201, type: MessageResponseDto })
  async resendActivation(
    @Body() dto: ResendActivationDto,
  ): Promise<{ message: string }> {
    return this.commandBus.execute(new ResendActivationCommand(dto.email));
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
  @SkipThrottle()
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
