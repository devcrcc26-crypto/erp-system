import { Module } from '@nestjs/common';
import { PermissionsModule } from '../../shared/permissions/permissions.module';
import { CloseoutService } from './application/services/closeout.service';
import { CorrespondenceService } from './application/services/correspondence.service';
import { DailyLogsService } from './application/services/daily-logs.service';
import { DesignPackagesService } from './application/services/design-packages.service';
import { DocumentNumberService } from './application/services/document-number.service';
import { DrawingsService } from './application/services/drawings.service';
import { EngineeringDocumentFolderService } from './application/services/engineering-document-folder.service';
import { EngineeringDocumentsService } from './application/services/engineering-documents.service';
import { IssuesService } from './application/services/issues.service';
import { MeetingsService } from './application/services/meetings.service';
import { ProjectScopeService } from './application/services/project-scope.service';
import { ProjectsService } from './application/services/projects.service';
import { PunchItemsService } from './application/services/punch-items.service';
import { RisksService } from './application/services/risks.service';
import { RfisService } from './application/services/rfis.service';
import { ScheduleService } from './application/services/schedule.service';
import { SubmittalsService } from './application/services/submittals.service';
import { WorkflowEventLogService } from './application/services/workflow-event-log.service';
import { WorkflowKernelService } from './application/services/workflow-kernel.service';
import { StateProjectionService } from './application/services/state-projection.service';
import { StatusWriteGateService } from './application/services/status-write-gate.service';
import { ConflictGuardService } from './application/services/conflict-guard.service';
import { PermissionResolverService } from './application/services/permission-resolver.service';
import {
  DesignPackageRepository,
  EngineeringDocumentRepository,
  EngineeringDocumentVersionRepository,
  TaskDisciplineScopeRepository,
  WorkflowEventLogRepository,
} from './infrastructure/repositories/epc-storage.repository';
import { EpcWorkflowRepository } from './infrastructure/repositories/epc-workflow.repository';
import { CloseoutController } from './presentation/controllers/closeout.controller';
import { CorrespondenceController } from './presentation/controllers/correspondence.controller';
import { DailyLogsController } from './presentation/controllers/daily-logs.controller';
import { DesignPackagesController } from './presentation/controllers/design-packages.controller';
import { DrawingsController } from './presentation/controllers/drawings.controller';
import { EngineeringDocumentsController } from './presentation/controllers/engineering-documents.controller';
import { IssuesController } from './presentation/controllers/issues.controller';
import { MeetingsController } from './presentation/controllers/meetings.controller';
import { ProjectsController } from './presentation/controllers/projects.controller';
import { PunchItemsController } from './presentation/controllers/punch-items.controller';
import { RisksController } from './presentation/controllers/risks.controller';
import { RfisController } from './presentation/controllers/rfis.controller';
import { ScheduleController } from './presentation/controllers/schedule.controller';
import { SubmittalsController } from './presentation/controllers/submittals.controller';

@Module({
  imports: [PermissionsModule],
  controllers: [
    ProjectsController,
    ScheduleController,
    RfisController,
    IssuesController,
    SubmittalsController,
    DrawingsController,
    EngineeringDocumentsController,
    DesignPackagesController,
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
    EngineeringDocumentFolderService,
    EngineeringDocumentsService,
    DesignPackagesService,
    WorkflowEventLogService,
    WorkflowKernelService,
    StateProjectionService,
    StatusWriteGateService,
    ConflictGuardService,
    PermissionResolverService,
    EpcWorkflowRepository,
    EngineeringDocumentRepository,
    EngineeringDocumentVersionRepository,
    DesignPackageRepository,
    WorkflowEventLogRepository,
    TaskDisciplineScopeRepository,
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
    EngineeringDocumentFolderService,
    EngineeringDocumentsService,
    DesignPackagesService,
    WorkflowEventLogService,
    WorkflowKernelService,
    DailyLogsService,
    MeetingsService,
    CorrespondenceService,
    RisksService,
    PunchItemsService,
    CloseoutService,
  ],
})
export class ProjectManagementModule {}
