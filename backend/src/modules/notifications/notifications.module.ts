import { BullModule } from '@nestjs/bullmq';
import {
  DynamicModule,
  Injectable,
  Logger,
  Module,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { NOTIFICATION_QUEUE } from './application/constants/queue.constants';
import { SendNotificationProcessor } from './application/processors/send-notification.processor';
import { NotificationService } from './application/services/notification.service';
import { TemplateRendererService } from './application/services/template-renderer.service';
import { NotificationAdminController } from './presentation/controllers/notification-admin.controller';
import { NotificationsController } from './presentation/controllers/notifications.controller';
import { NotificationRetentionCron } from './presentation/cron/notification-retention.cron';

@Injectable()
class NotificationsBootstrapLogger implements OnModuleInit {
  private readonly logger = new Logger(NotificationsModule.name);

  constructor(private readonly configService: ConfigService) {}

  onModuleInit(): void {
    if (!this.configService.get<boolean>('REDIS_ENABLED', false)) {
      this.logger.warn(
        'REDIS_ENABLED=false - in-app notifications only; email queue disabled',
      );
    }
  }
}

@Module({})
export class NotificationsModule {
  /**
   * Registers notification providers; BullMQ is included only when Redis is enabled.
   */
  static register(): DynamicModule {
    const redisEnabled = process.env.REDIS_ENABLED === 'true';

    const bullImports = redisEnabled
      ? [
          BullModule.forRootAsync({
            imports: [ConfigModule],
            inject: [ConfigService],
            useFactory: (config: ConfigService) => ({
              connection: {
                host: config.get<string>('REDIS_HOST', 'localhost'),
                port: config.get<number>('REDIS_PORT', 6379),
                maxRetriesPerRequest: null,
              },
            }),
          }),
          BullModule.registerQueue({ name: NOTIFICATION_QUEUE }),
        ]
      : [];

    const bullProviders = redisEnabled ? [SendNotificationProcessor] : [];

    return {
      module: NotificationsModule,
      global: true,
      imports: [ScheduleModule.forRoot(), ...bullImports],
      controllers: [NotificationsController, NotificationAdminController],
      providers: [
        NotificationService,
        TemplateRendererService,
        NotificationRetentionCron,
        NotificationsBootstrapLogger,
        ...bullProviders,
      ],
      exports: [NotificationService],
    };
  }
}
