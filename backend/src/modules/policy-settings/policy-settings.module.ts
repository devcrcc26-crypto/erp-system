import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { PolicySettingsService } from './application/policy-settings.service';
import { PolicySettingsController } from './presentation/policy-settings.controller';

@Module({
  imports: [AuditModule],
  controllers: [PolicySettingsController],
  providers: [PolicySettingsService],
  exports: [PolicySettingsService],
})
export class PolicySettingsModule {}
