import { Module } from '@nestjs/common';
import { CloseoutService } from './application/services/closeout.service';
import { CorrespondenceService } from './application/services/correspondence.service';
import { DailyLogsService } from './application/services/daily-logs.service';
import { DocumentNumberService } from './application/services/document-number.service';
import { DrawingsService } from './application/services/drawings.service';
import { IssuesService } from './application/services/issues.service';
import { MeetingsService } from './application/services/meetings.service';
import { ProjectScopeService } from './application/services/project-scope.service';
import { ProjectsService } from './application/services/projects.service';
import { PunchItemsService } from './application/services/punch-items.service';
import { RisksService } from './application/services/risks.service';
import { RfisService } from './application/services/rfis.service';
import { ScheduleService } from './application/services/schedule.service';
import { SubmittalsService } from './application/services/submittals.service';
import { CloseoutController } from './presentation/controllers/closeout.controller';
import { CorrespondenceController } from './presentation/controllers/correspondence.controller';
import { DailyLogsController } from './presentation/controllers/daily-logs.controller';
import { DrawingsController } from './presentation/controllers/drawings.controller';
import { IssuesController } from './presentation/controllers/issues.controller';
import { MeetingsController } from './presentation/controllers/meetings.controller';
import { ProjectsController } from './presentation/controllers/projects.controller';
import { PunchItemsController } from './presentation/controllers/punch-items.controller';
import { RisksController } from './presentation/controllers/risks.controller';
import { RfisController } from './presentation/controllers/rfis.controller';
import { ScheduleController } from './presentation/controllers/schedule.controller';
import { SubmittalsController } from './presentation/controllers/submittals.controller';

@Module({
  controllers: [
    ProjectsController,
    ScheduleController,
    RfisController,
    IssuesController,
    SubmittalsController,
    DrawingsController,
    DailyLogsController,
    MeetingsController,
    CorrespondenceController,
    RisksController,
    PunchItemsController,
    CloseoutController,
  ],
  providers: [
    ProjectsService,
    ProjectScopeService,
    DocumentNumberService,
    ScheduleService,
    RfisService,
    IssuesService,
    SubmittalsService,
    DrawingsService,
    DailyLogsService,
    MeetingsService,
    CorrespondenceService,
    RisksService,
    PunchItemsService,
    CloseoutService,
  ],
  exports: [
    ProjectsService,
    ProjectScopeService,
    DocumentNumberService,
    ScheduleService,
    RfisService,
    IssuesService,
    SubmittalsService,
    DrawingsService,
    DailyLogsService,
    MeetingsService,
    CorrespondenceService,
    RisksService,
    PunchItemsService,
    CloseoutService,
  ],
})
export class ProjectManagementModule {}
