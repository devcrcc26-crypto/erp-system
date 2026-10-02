import { Module } from '@nestjs/common';
import { PrismaModule } from '../../shared/prisma/prisma.module';
import { PayrollController } from './presentation/controllers/payroll.controller';
import { PayrollCalculationService } from './application/services/payroll-calculation.service';
import { PayrollRunService } from './application/services/payroll-run.service';
/**
 * NotificationService is exported by NotificationsModule (registered globally
 * in AppModule via NotificationsModule.register()).
 */
@Module({
  imports: [PrismaModule],
  controllers: [PayrollController],
  providers: [PayrollCalculationService, PayrollRunService],
  exports: [PayrollRunService, PayrollCalculationService],
})
export class PayrollModule {}
