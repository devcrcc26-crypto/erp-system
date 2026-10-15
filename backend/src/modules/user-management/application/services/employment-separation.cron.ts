import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { EmploymentSeparationService } from './employment-separation.service';

/** 00:05 Addis Ababa: separations whose leaving date has passed take effect. */
@Injectable()
export class EmploymentSeparationCron {
  private readonly logger = new Logger(EmploymentSeparationCron.name);

  constructor(private readonly separations: EmploymentSeparationService) {}

  @Cron('5 0 * * *', { timeZone: 'Africa/Addis_Ababa' })
  async run(): Promise<void> {
    try {
      const { processed, checked } = await this.separations.processDueSeparations();
      this.logger.log(`Separation job: ${processed} applied, ${checked} past leaving dates checked`);
    } catch (error) {
      this.logger.error(
        'Separation job failed',
        error instanceof Error ? error.stack : String(error),
      );
    }
  }
}
