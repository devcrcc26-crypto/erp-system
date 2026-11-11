import { MailerService } from '@nestjs-modules/mailer';
import { Injectable, Logger, OnModuleInit, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { isLikelyFakeEmail } from '../utils/email-guard.util';

export interface EmailPayload {
  readonly to: string;
  readonly subject: string;
  readonly html: string;
}

/** Seed-mode suppression counters (process-local). */
let seedSuppressedEmails = 0;

/**
 * Returns how many emails were suppressed under SEED_MODE.
 */
export function getSeedSuppressedEmailCount(): number {
  return seedSuppressedEmails;
}

/**
 * Resets seed-mode email suppression counters.
 */
export function resetSeedSuppressedEmailCount(): void {
  seedSuppressedEmails = 0;
}

/**
 * Sends transactional email via Resend API or SMTP fallback.
 */
@Injectable()
export class ResendEmailService implements OnModuleInit {
  private readonly logger = new Logger(ResendEmailService.name);
  private readonly resendApiKey: string;
  private readonly mailFrom: string;
  private readonly mailHost: string;
  private readonly redisEnabled: boolean;
  private readonly seedMode: boolean;
  private readonly emailDisabled: boolean;

  constructor(
    private readonly configService: ConfigService,
    @Optional() private readonly mailerService?: MailerService,
  ) {
    this.resendApiKey = this.configService.get<string>('RESEND_API_KEY') ?? '';
    this.mailFrom =
      this.configService.get<string>('MAIL_FROM') ?? 'onboarding@resend.dev';
    this.mailHost = this.configService.get<string>('MAIL_HOST') ?? '';
    this.redisEnabled =
      this.configService.get<string>('REDIS_ENABLED') === 'true';
    this.seedMode = this.configService.get<boolean>('SEED_MODE') === true;
    this.emailDisabled =
      this.configService.get<boolean>('EMAIL_DISABLED') === true;
  }

  /**
   * Logs provider configuration at startup.
   */
  onModuleInit(): void {
    const provider = this.resendApiKey
      ? 'Resend'
      : this.mailHost
        ? 'SMTP'
        : 'none';

    this.logger.log(
      `Email service ready - provider: ${provider}, ` +
        `from: ${this.mailFrom}, ` +
        `API key configured: ${Boolean(this.resendApiKey)}, ` +
        `Redis enabled: ${this.redisEnabled}`,
    );
  }

  /**
   * Sends an email when configured; skips fake/seed addresses silently.
   * SEED_MODE suppresses and counts the skip. EMAIL_DISABLED returns
   * without sending and does not affect the seed-mode counter.
   * @returns true when the email was delivered successfully
   */
  async send(payload: EmailPayload): Promise<boolean> {
    if (this.seedMode) {
      seedSuppressedEmails += 1;
      this.logger.debug(
        `SEED_MODE: suppressed email to ${payload.to} (${payload.subject})`,
      );
      return false;
    }

    if (this.emailDisabled) {
      this.logger.log(`EMAIL_DISABLED: skipped email to ${payload.to}`);
      return false;
    }

    if (isLikelyFakeEmail(payload.to)) {
      this.logger.log(
        `Email skipped - fake/seeded address detected: ${payload.to}`,
      );
      return false;
    }

    this.logger.log(
      `Attempting email send to: ${payload.to}, subject: ${payload.subject}`,
    );

    if (this.resendApiKey) {
      return this.sendDirectly(payload);
    }

    if (this.mailHost && this.mailerService) {
      return this.sendViaSmtp(payload);
    }

    this.logger.warn(
      `Email not sent to ${payload.to} - configure RESEND_API_KEY or MAIL_HOST`,
    );
    return false;
  }

  /**
   * Sends email through the Resend HTTP API.
   */
  private async sendDirectly(payload: EmailPayload): Promise<boolean> {
    try {
      const response = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.resendApiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: this.mailFrom,
          to: payload.to,
          subject: payload.subject,
          html: payload.html,
        }),
      });

      if (!response.ok) {
        const error = await response.text();
        this.logger.error(`Resend API error: ${response.status} ${error}`);
        return false;
      }

      this.logger.log(
        `Email sent via Resend to ${payload.to}: ${payload.subject}`,
      );
      return true;
    } catch (error: unknown) {
      const reason = error instanceof Error ? error.message : String(error);
      this.logger.error(`Resend API request failed: ${reason}`);
      return false;
    }
  }

  /**
   * Sends email through the configured SMTP transport.
   */
  private async sendViaSmtp(payload: EmailPayload): Promise<boolean> {
    if (!this.mailerService) {
      return false;
    }

    try {
      await this.mailerService.sendMail({
        to: payload.to,
        subject: payload.subject,
        html: payload.html,
      });
      this.logger.log(
        `Email sent via SMTP to ${payload.to}: ${payload.subject}`,
      );
      return true;
    } catch (error: unknown) {
      const reason = error instanceof Error ? error.message : String(error);
      this.logger.error(`SMTP send failed for ${payload.to}: ${reason}`);
      return false;
    }
  }
}
