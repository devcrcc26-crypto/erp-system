import { ConfigService } from '@nestjs/config';
import type { MailerOptions } from '@nestjs-modules/mailer';

/**
 * Builds NestJS Mailer transport options from environment configuration.
 */
export function buildMailerOptions(config: ConfigService): MailerOptions {
  const host = config.get<string>('MAIL_HOST');

  return {
    transport: host
      ? {
          host,
          port: config.get<number>('MAIL_PORT', 1025),
          secure: false,
        }
      : { jsonTransport: true },
    defaults: {
      from: config.get<string>(
        'MAIL_FROM',
        'noreply@construction-erp.local',
      ),
    },
  };
}
