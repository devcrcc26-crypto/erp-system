import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { AnnouncementService } from './announcement.service';

@Injectable()
export class AnnouncementSchedulerService {
  private readonly logger = new Logger(AnnouncementSchedulerService.name);
  private running = false;

  constructor(private readonly announcements: AnnouncementService) {}

  /**
   * Every 5 minutes: publishes scheduled announcements that are due. Each post
   * flips status atomically, so recipients are notified exactly once.
   */
  @Cron('*/5 * * * *', { name: 'announcement-publish-due', timeZone: 'UTC' })
  async handlePublishDue(): Promise<void> {
    if (this.running) {
      return;
    }
    this.running = true;
    try {
      const { published } = await this.announcements.publishDue(new Date());
      if (published > 0) {
        this.logger.log(`[AnnouncementScheduler] Published ${published} scheduled announcement(s)`);
      }
    } catch (error) {
      this.logger.error(
        `[AnnouncementScheduler] Failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    } finally {
      this.running = false;
    }
  }
}
