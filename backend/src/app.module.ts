import { config as loadEnv } from 'dotenv';
import { resolve } from 'path';
import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';

loadEnv({
  path: [resolve(__dirname, '../.env'), resolve(__dirname, '../../.env')],
});

import { ConfigModule } from '@nestjs/config';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { AppController } from './app.controller';
import { ApprovalsModule } from './modules/approvals/approvals.module';
import { AuthModule } from './modules/auth/auth.module';
import { AuditModule } from './modules/audit/audit.module';
import { CompanySetupModule } from './modules/company-setup/company-setup.module';
import { DocumentsModule } from './modules/documents/documents.module';
import { LeaveModule } from './modules/leave/leave.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { OvertimeModule } from './modules/overtime/overtime.module';
import { FlightModule } from './modules/flight/flight.module';
import { BusinessTripModule } from './modules/business-trip/business-trip.module';
import { ExpenseClaimModule } from './modules/expense-claim/expense-claim.module';
import { PerDiemModule } from './modules/per-diem/per-diem.module';
import { PurchaseRequestModule } from './modules/purchase-request/purchase-request.module';
import { ProjectManagementModule } from './modules/project-management/project-management.module';
import { ReportingModule } from './modules/reporting/reporting.module';
import { UserManagementModule } from './modules/user-management/user-management.module';
import { envValidationSchema } from './shared/config/env.validation';
import { RequestContextMiddleware } from './shared/context/request-context.middleware';
import { HttpExceptionFilter } from './shared/filters/http-exception.filter';
import { JwtAuthGuard } from './shared/guards/jwt-auth.guard';
import { LoggingInterceptor } from './shared/interceptors/logging.interceptor';
import { ResponseEnvelopeInterceptor } from './shared/interceptors/response-envelope.interceptor';
import { CurrencyModule } from './shared/currency/currency.module';
import { MailModule } from './shared/mail/mail.module';
import { PermissionsModule } from './shared/permissions/permissions.module';
import { PrismaModule } from './shared/prisma/prisma.module';
import { StorageModule } from './shared/storage/storage.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env', '../.env'],
      validationSchema: envValidationSchema,
    }),
    ThrottlerModule.forRoot([
      {
        name: 'default',
        ttl: 60_000,
        limit:
          process.env.NODE_ENV === 'production'
            ? Number(process.env.THROTTLE_LIMIT ?? 300)
            : 10_000,
        skipIf: () =>
          process.env.NODE_ENV === 'development' ||
          process.env.NODE_ENV === 'test',
      },
    ]),
    PrismaModule,
    MailModule,
    StorageModule,
    CurrencyModule,
    PermissionsModule,
    AuthModule,
    CompanySetupModule,
    UserManagementModule,
    AuditModule,
    NotificationsModule.register(),
    DocumentsModule,
    ReportingModule,
    ProjectManagementModule,
    ApprovalsModule,
    LeaveModule,
    OvertimeModule,
    FlightModule,
    BusinessTripModule,
    ExpenseClaimModule,
    PerDiemModule,
    PurchaseRequestModule,
  ],
  controllers: [AppController],
  providers: [
    {
      provide: APP_FILTER,
      useClass: HttpExceptionFilter,
    },
    {
      provide: APP_INTERCEPTOR,
      useClass: ResponseEnvelopeInterceptor,
    },
    {
      provide: APP_INTERCEPTOR,
      useClass: LoggingInterceptor,
    },
    {
      provide: APP_GUARD,
      useClass: JwtAuthGuard,
    },
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(RequestContextMiddleware).forRoutes('{*path}');
  }
}
