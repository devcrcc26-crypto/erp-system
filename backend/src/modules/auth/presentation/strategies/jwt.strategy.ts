import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { requestContextStorage } from '../../../../shared/context/request-context';
import { AuthenticatedUser, JwtPayload } from '../../../../shared/types/jwt-payload.type';
import {
  AUTH_REPOSITORY,
  IAuthRepository,
} from '../../domain/repositories/auth.repository.interface';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    configService: ConfigService,
    @Inject(AUTH_REPOSITORY)
    private readonly authRepository: IAuthRepository,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: configService.getOrThrow<string>('JWT_ACCESS_SECRET'),
    });
  }

  /**
   * Validates JWT payload and ensures the session is still active.
   */
  async validate(payload: JwtPayload): Promise<AuthenticatedUser> {
    const session = await this.authRepository.findSessionById(payload.sessionId);

    if (!session || session.expiresAt < new Date()) {
      throw new UnauthorizedException('Session expired');
    }

    const user = await this.authRepository.findActiveUserById(payload.sub);

    if (!user) {
      throw new UnauthorizedException('User account is inactive');
    }

    const authenticatedUser: AuthenticatedUser = {
      userId: payload.sub,
      email: payload.email,
      companyId: payload.companyId,
      sessionId: payload.sessionId,
    };

    const store = requestContextStorage.getStore();
    if (store) {
      store.userId = authenticatedUser.userId;
      store.companyId = authenticatedUser.companyId;
      store.sessionId = authenticatedUser.sessionId;
    }

    return authenticatedUser;
  }
}
