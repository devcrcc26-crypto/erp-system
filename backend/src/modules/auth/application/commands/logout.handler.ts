import { Inject, UnauthorizedException } from '@nestjs/common';
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
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
  ) {}

  /**
   * Revokes the current session (hard delete).
   */
  async execute(command: LogoutCommand): Promise<{ message: string }> {
    const session = await this.authRepository.findSessionById(command.sessionId);

    if (!session || session.userId !== command.userId) {
      throw new UnauthorizedException('Invalid session');
    }

    await this.authRepository.deleteSession(command.sessionId);

    return { message: 'Logged out successfully' };
  }
}
