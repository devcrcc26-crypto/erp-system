import { MailerModule } from '@nestjs-modules/mailer';
import { Global, Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { buildMailerOptions } from './mail.config';
import { ResendEmailService } from './resend-email.service';

@Global()
@Module({
  imports: [
    MailerModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => buildMailerOptions(config),
    }),
  ],
  providers: [ResendEmailService],
  exports: [MailerModule, ResendEmailService],
})
export class MailModule {}
