import { Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { AuditService } from './application/services/audit.service';
import { AuditController } from './presentation/controllers/audit.controller';
import { AuditInterceptor } from './presentation/interceptors/audit.interceptor';

@Module({
  controllers: [AuditController],
  providers: [
    AuditService,
    {
      provide: APP_INTERCEPTOR,
      useClass: AuditInterceptor,
    },
  ],
  exports: [AuditService],
})
export class AuditModule {}
