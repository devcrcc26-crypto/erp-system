import { Module } from '@nestjs/common';
import { AnnouncementAudienceService } from './application/services/announcement-audience.service';
import { AnnouncementSchedulerService } from './application/services/announcement-scheduler.service';
import { AnnouncementService } from './application/services/announcement.service';
import { AnnouncementsAdminController } from './presentation/controllers/announcements-admin.controller';
import { AnnouncementsController } from './presentation/controllers/announcements.controller';

/**
 * Company announcements (HR) and system "What's new" posts. Notifications,
 * permissions, storage and Prisma come from global modules.
 */
@Module({
  controllers: [AnnouncementsController, AnnouncementsAdminController],
  providers: [AnnouncementService, AnnouncementAudienceService, AnnouncementSchedulerService],
  exports: [AnnouncementService],
})
export class AnnouncementsModule {}
