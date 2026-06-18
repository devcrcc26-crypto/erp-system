import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
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
import { EdvTransitionService } from './application/services/edv-transition.service';
import { ReviewWorkflowService } from './application/services/review-workflow.service';
import { ReviewContextSnapshotService } from './application/services/review-context-snapshot.service';
import { DefinitionOfDoneService } from './application/services/definition-of-done.service';
import { ReviewSlaService } from './application/services/review-sla.service';
import { ReviewCommentsService } from './application/services/review-comments.service';
import { ReviewBatchService } from './application/services/review-batch.service';
import { DependencyGraphService } from './application/services/dependency-graph.service';
import { DecisionTraceService } from './application/services/decision-trace.service';
import { RevisionOrchestratorService } from './application/services/revision-orchestrator.service';
import { SubmittalWorkflowService } from './application/services/submittal-workflow.service';
import { SubmittalSnapshotService } from './application/services/submittal-snapshot.service';
import { ExternalReviewTriggerService } from './application/services/external-review-trigger.service';
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
import { EpcReviewRepository } from './infrastructure/repositories/epc-review.repository';
import { EpcSubmittalRepository } from './infrastructure/repositories/epc-submittal.repository';
import { CloseoutController } from './presentation/controllers/closeout.controller';
import { CorrespondenceController } from './presentation/controllers/correspondence.controller';
import { DailyLogsController } from './presentation/controllers/daily-logs.controller';
import { DesignPackagesController } from './presentation/controllers/design-packages.controller';
import { ReviewCommentsController } from './presentation/controllers/review-comments.controller';
import { ReviewBatchController } from './presentation/controllers/review-batch.controller';
import { EngineeringBatchController } from './presentation/controllers/engineering-batch.controller';
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
  imports: [PermissionsModule, ScheduleModule.forRoot()],
  controllers: [
    ProjectsController,
    ScheduleController,
    RfisController,
    IssuesController,
    SubmittalsController,
    DrawingsController,
    EngineeringDocumentsController,
    DesignPackagesController,
    ReviewCommentsController,
    ReviewBatchController,
    EngineeringBatchController,
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
    EdvTransitionService,
    ReviewWorkflowService,
    ReviewContextSnapshotService,
    DefinitionOfDoneService,
    ReviewSlaService,
    ReviewCommentsService,
    ReviewBatchService,
    DependencyGraphService,
    DecisionTraceService,
    RevisionOrchestratorService,
    SubmittalWorkflowService,
    SubmittalSnapshotService,
    ExternalReviewTriggerService,
    EpcSubmittalRepository,
    StatusWriteGateService,
    ConflictGuardService,
    PermissionResolverService,
    EpcWorkflowRepository,
    EpcReviewRepository,
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
