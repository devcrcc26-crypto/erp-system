import { config as loadEnv } from 'dotenv';
import { resolve } from 'path';
import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';

loadEnv({
  path: [resolve(__dirname, '../.env'), resolve(__dirname, '../../.env')],
});

import { ConfigModule } from '@nestjs/config';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { AppController } from './app.controller';
import { ApprovalsModule } from './modules/approvals/approvals.module';
import { AuthModule } from './modules/auth/auth.module';
import { AuditModule } from './modules/audit/audit.module';
import { CompanySetupModule } from './modules/company-setup/company-setup.module';
import { DocumentsModule } from './modules/documents/documents.module';
import { LeaveModule } from './modules/leave/leave.module';
import { WorkScheduleModule } from './modules/work-schedule/work-schedule.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { OvertimeModule } from './modules/overtime/overtime.module';
import { FlightModule } from './modules/flight/flight.module';
import { BusinessTripModule } from './modules/business-trip/business-trip.module';
import { ExpenseClaimModule } from './modules/expense-claim/expense-claim.module';
import { PerDiemModule } from './modules/per-diem/per-diem.module';
import { PurchaseRequestModule } from './modules/purchase-request/purchase-request.module';
import { MaterialRequisitionModule } from './modules/material-requisition/material-requisition.module';
import { ConsumablesRequisitionModule } from './modules/consumables-requisition/consumables-requisition.module';
import { CompanyVehicleModule } from './modules/company-vehicle/company-vehicle.module';
import { CompanyAssetModule } from './modules/company-asset/company-asset.module';
import { AssetRequestModule } from './modules/asset-request/asset-request.module';
import { VehicleApplicationModule } from './modules/vehicle-application/vehicle-application.module';
import { VehicleRefuelingModule } from './modules/vehicle-refueling/vehicle-refueling.module';
import { ProjectManagementModule } from './modules/project-management/project-management.module';
import { ReportingModule } from './modules/reporting/reporting.module';
import { UserManagementModule } from './modules/user-management/user-management.module';
import { InspectionRepairModule } from './modules/inspection-repair/inspection-repair.module';
import { envValidationSchema } from './shared/config/env.validation';
import { RequestContextMiddleware } from './shared/context/request-context.middleware';
import { HttpExceptionFilter } from './shared/filters/http-exception.filter';
import { JwtAuthGuard } from './shared/guards/jwt-auth.guard';
import { MustChangePasswordGuard } from './shared/guards/must-change-password.guard';
import { LoggingInterceptor } from './shared/interceptors/logging.interceptor';
import { ResponseEnvelopeInterceptor } from './shared/interceptors/response-envelope.interceptor';
import { CurrencyModule } from './shared/currency/currency.module';
import { MailModule } from './shared/mail/mail.module';
import { PermissionsModule } from './shared/permissions/permissions.module';
import { PrismaModule } from './shared/prisma/prisma.module';
import { StorageModule } from './shared/storage/storage.module';
import { OfficialSealModule } from './modules/official-seal/official-seal.module';
import { ProjectSealModule } from './modules/project-seal/project-seal.module';
import { EmployeeContractModule } from './modules/employee-contract/employee-contract.module';
import { ExitPermitModule } from './modules/exit-permit/exit-permit.module';
import { SiteAssignmentModule } from './modules/site-assignment/site-assignment.module';
import { AttendanceModule } from './modules/attendance/attendance.module';
import { EvaluationModule } from './modules/evaluation/evaluation.module';
import {PayrollModule} from './modules/payroll/payroll.module';
import { AnnouncementsModule } from './modules/announcements/announcements.module';
import { PolicySettingsModule } from './modules/policy-settings/policy-settings.module';
import { DraftsModule } from './modules/drafts/drafts.module';

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
    ScheduleModule.forRoot(),
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
    WorkScheduleModule,
    LeaveModule,
    OvertimeModule,
    FlightModule,
    BusinessTripModule,
    ExpenseClaimModule,
    PerDiemModule,
    PurchaseRequestModule,
    MaterialRequisitionModule,
    ConsumablesRequisitionModule,
    CompanyVehicleModule,
    CompanyAssetModule,
    AssetRequestModule,
    VehicleApplicationModule,
    VehicleRefuelingModule,
    InspectionRepairModule,
    OfficialSealModule,
    ProjectSealModule,
    EmployeeContractModule,
    ExitPermitModule,
    SiteAssignmentModule,
    AttendanceModule,
    EvaluationModule,
    PayrollModule,
    AnnouncementsModule,
    PolicySettingsModule,
    DraftsModule,
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
      useClass: MustChangePasswordGuard,
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
