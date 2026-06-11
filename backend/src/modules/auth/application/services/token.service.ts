import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { randomBytes } from 'crypto';
import * as bcrypt from 'bcrypt';
import { JwtPayload } from '../../../../shared/types/jwt-payload.type';

@Injectable()
export class TokenService {
  private readonly accessExpiresIn: string;
  private readonly refreshExpiresIn: string;
  private readonly refreshExpiresMs: number;

  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {
    this.accessExpiresIn =
      this.configService.get<string>('JWT_ACCESS_EXPIRES_IN') ?? '15m';
    this.refreshExpiresIn =
      this.configService.get<string>('JWT_REFRESH_EXPIRES_IN') ?? '7d';
    this.refreshExpiresMs = this.parseDurationToMs(this.refreshExpiresIn);
  }

  /**
   * Issues a short-lived access JWT for an authenticated session.
   */
  generateAccessToken(payload: JwtPayload): string {
    return this.jwtService.sign(payload, {
      secret: this.configService.get<string>('JWT_ACCESS_SECRET'),
      expiresIn: this.getAccessExpiresInSeconds(),
    });
  }

  /**
   * Generates a cryptographically secure opaque refresh token.
   */
  generateRefreshToken(): string {
    return randomBytes(64).toString('hex');
  }

  /**
   * Generates an opaque password-reset token.
   */
  generatePasswordResetToken(): string {
    return randomBytes(48).toString('hex');
  }

  /**
   * Generates an opaque email-verification token.
   */
  generateEmailVerificationToken(): string {
    return randomBytes(48).toString('hex');
  }

  /**
   * Hashes a token for secure storage (bcrypt, rounds 12).
   */
  async hashToken(token: string): Promise<string> {
    return bcrypt.hash(token, 12);
  }

  /**
   * Verifies a plain token against a stored bcrypt hash.
   */
  async verifyToken(plain: string, hash: string): Promise<boolean> {
    return bcrypt.compare(plain, hash);
  }

  /**
   * Returns refresh token expiry date based on configured TTL.
   */
  getRefreshExpiryDate(): Date {
    return new Date(Date.now() + this.refreshExpiresMs);
  }

  /**
   * Returns password-reset token expiry (1 hour).
   */
  getPasswordResetExpiryDate(): Date {
    return new Date(Date.now() + 60 * 60 * 1000);
  }

  /**
   * Returns email-verification token expiry (24 hours).
   */
  getEmailVerificationExpiryDate(): Date {
    return new Date(Date.now() + 24 * 60 * 60 * 1000);
  }

  getAccessExpiresInSeconds(): number {
    return Math.floor(this.parseDurationToMs(this.accessExpiresIn) / 1000);
  }

  private parseDurationToMs(duration: string): number {
    const match = /^(\d+)([smhd])$/.exec(duration);
    if (!match) {
      return 7 * 24 * 60 * 60 * 1000;
    }

    const value = Number(match[1]);
    const unit = match[2];

    switch (unit) {
      case 's':
        return value * 1000;
      case 'm':
        return value * 60 * 1000;
      case 'h':
        return value * 60 * 60 * 1000;
      case 'd':
        return value * 24 * 60 * 60 * 1000;
      default:
        return 7 * 24 * 60 * 60 * 1000;
    }
  }
}
