import { Inject, UnauthorizedException } from '@nestjs/common';
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { AuditService } from '../../../audit/application/services/audit.service';
import {
  AUTH_REPOSITORY,
  IAuthRepository,
} from '../../domain/repositories/auth.repository.interface';
import { LogoutCommand } from './logout.command';

@CommandHandler(LogoutCommand)
export class LogoutHandler implements ICommandHandler<LogoutCommand, { message: string }> {
  constructor(
    @Inject(AUTH_REPOSITORY)
    private readonly authRepository: IAuthRepository,
    private readonly auditService: AuditService,
  ) {}

  /**
   * Revokes the current session (hard delete) after writing an audit entry.
   */
  async execute(command: LogoutCommand): Promise<{ message: string }> {
    const session = await this.authRepository.findSessionById(command.sessionId);

    if (!session || session.userId !== command.userId) {
      throw new UnauthorizedException('Invalid session');
    }

    await this.auditService.create({
      userId: command.userId,
      companyId: session.companyId,
      sessionId: command.sessionId,
      module: 'auth',
      action: 'logout',
      recordType: 'user_session',
      recordId: command.sessionId,
      ipAddress: session.ipAddress ?? undefined,
      deviceInfo: session.deviceInfo ?? undefined,
    });

    await this.authRepository.deleteSession(command.sessionId);

    return { message: 'Logged out successfully' };
  }
}
