import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { EmploymentLifecycleService } from './employment-lifecycle.service';
import { EmploymentSeparationService } from './employment-separation.service';

/**
 * 00:05 Addis Ababa: separations past their leaving date take effect, inactive
 * periods start/end, and contracts that ended without a new one are flagged to HR.
 */
@Injectable()
export class EmploymentSeparationCron {
  private readonly logger = new Logger(EmploymentSeparationCron.name);

  constructor(
    private readonly separations: EmploymentSeparationService,
    private readonly lifecycle: EmploymentLifecycleService,
  ) {}

  @Cron('5 0 * * *', { timeZone: 'Africa/Addis_Ababa' })
  async run(): Promise<void> {
    await this.step('separations', async () => {
      const r = await this.separations.processDueSeparations();
      return `${r.processed} applied, ${r.checked} past leaving dates checked`;
    });
    await this.step('inactive periods', async () => {
      const r = await this.lifecycle.processInactivePeriods();
      return `${r.changed} changed, ${r.checked} checked`;
    });
    await this.step('ended contracts', async () => {
      const r = await this.lifecycle.notifyEndedContracts();
      return `${r.notified} flagged to HR`;
    });
  }

  private async step(name: string, fn: () => Promise<string>): Promise<void> {
    try {
      this.logger.log(`Employment job (${name}): ${await fn()}`);
    } catch (error) {
      this.logger.error(
        `Employment job (${name}) failed`,
        error instanceof Error ? error.stack : String(error),
      );
    }
  }
}
