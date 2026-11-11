import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { PermissionsModule } from '../../shared/permissions/permissions.module';
import { AuditModule } from '../audit/audit.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { DocumentsModule } from '../documents/documents.module';
import {
  WORKFLOW_COMMITTED_QUEUE,
  WORKFLOW_SLA_QUEUE,
} from './application/constants/workflow-queue.constants';
import { WorkflowCommittedProcessor } from './application/processors/workflow-committed.processor';
import { WorkflowSlaProcessor } from './application/processors/workflow-sla.processor';
import { CloseoutService } from './application/services/closeout.service';
import { CorrespondenceService } from './application/services/correspondence.service';
import { DailyLogsService } from './application/services/daily-logs.service';
import { DecisionTraceService } from './application/services/decision-trace.service';
import { DeliverableService } from './application/services/deliverable.service';
import { DefinitionOfDoneService } from './application/services/definition-of-done.service';
import { DependencyGraphService } from './application/services/dependency-graph.service';
import { DesignPackagesService } from './application/services/design-packages.service';
import { DisciplineScopeService } from './application/services/discipline-scope.service';
import { DocumentNumberService } from './application/services/document-number.service';
import { DrawingsService } from './application/services/drawings.service';
import { EdvTransitionService } from './application/services/edv-transition.service';
import { EngineeringDocumentFolderService } from './application/services/engineering-document-folder.service';
import { EngineeringDocumentsService } from './application/services/engineering-documents.service';
import { EpcWorkspaceService } from './application/services/epc-workspace.service';
import { ExternalReviewTriggerService } from './application/services/external-review-trigger.service';
import { IssuesService } from './application/services/issues.service';
import { MeetingsService } from './application/services/meetings.service';
import { MyWorkService } from './application/services/my-work.service';
import { TaskAssignmentNotificationService } from './application/services/task-assignment-notification.service';
import { PermissionResolverService } from './application/services/permission-resolver.service';
import { ProjectChangeRequestService } from './application/services/project-change-request.service';
import { ProjectScopeService } from './application/services/project-scope.service';
import { TaskAccessScopeService } from './application/services/task-access-scope.service';
import { ProjectsService } from './application/services/projects.service';
import { ProjectExportService } from './application/services/project-export.service';
import { ProjectsExportPdfService } from './application/services/projects-export-pdf.service';
import { ProjectReportPdfService } from './application/services/project-report-pdf.service';
import { PunchItemsService } from './application/services/punch-items.service';
import { ReviewBatchService } from './application/services/review-batch.service';
import { ReviewCommentsService } from './application/services/review-comments.service';
import { ReviewContextSnapshotService } from './application/services/review-context-snapshot.service';
import { ReviewRoutingService } from './application/services/review-routing.service';
import { ReviewSlaService } from './application/services/review-sla.service';
import { ReviewWorkflowService } from './application/services/review-workflow.service';
import { RevisionOrchestratorService } from './application/services/revision-orchestrator.service';
import { RisksService } from './application/services/risks.service';
import { RfisService } from './application/services/rfis.service';
import { ScheduleService } from './application/services/schedule.service';
import { StateProjectionService } from './application/services/state-projection.service';
import { StatusWriteGateService } from './application/services/status-write-gate.service';
import { ConflictGuardService } from './application/services/conflict-guard.service';
import { SubmittalSnapshotService } from './application/services/submittal-snapshot.service';
import { SubmittalWorkflowService } from './application/services/submittal-workflow.service';
import { SubmittalsService } from './application/services/submittals.service';
import { WorkflowCommittedDispatcher } from './application/services/workflow-committed-dispatcher.service';
import { WorkflowCommittedService } from './application/services/workflow-committed.service';
import { WorkflowCorrectionService } from './application/services/workflow-correction.service';
import { WorkflowEventLogService } from './application/services/workflow-event-log.service';
import { WorkflowKernelService } from './application/services/workflow-kernel.service';
import { WorkflowSlaDispatcher } from './application/services/workflow-sla-dispatcher.service';
import { WorkflowTransactionRunner } from './application/services/workflow-transaction-runner.service';
import {
  DesignPackageRepository,
  EngineeringDocumentRepository,
  EngineeringDocumentVersionRepository,
  TaskDisciplineScopeRepository,
  WorkflowEventLogRepository,
} from './infrastructure/repositories/epc-storage.repository';
import { EpcReviewRepository } from './infrastructure/repositories/epc-review.repository';
import { EpcSubmittalRepository } from './infrastructure/repositories/epc-submittal.repository';
import { EpcWorkflowRepository } from './infrastructure/repositories/epc-workflow.repository';
import { PmModuleAccessGuard } from './presentation/guards/pm-module-access.guard';
import { PmModuleEnabledGuard } from './presentation/guards/pm-module-enabled.guard';
import { PmModuleSettingsService } from './application/services/pm-module-settings.service';
import { PmModuleSettingsController } from './presentation/controllers/pm-module-settings.controller';
import { CloseoutController } from './presentation/controllers/closeout.controller';
import { ChangeRequestsController } from './presentation/controllers/change-requests.controller';
import { ExternalReleasesController } from './presentation/controllers/external-releases.controller';
import { MyChangeRequestsController } from './presentation/controllers/my-change-requests.controller';
import { MyRfisController } from './presentation/controllers/my-rfis.controller';
import { CorrespondenceController } from './presentation/controllers/correspondence.controller';
import { CorrespondenceGlobalController } from './presentation/controllers/correspondence-global.controller';
import { DailyLogsController } from './presentation/controllers/daily-logs.controller';
import { MyDailyLogsController } from './presentation/controllers/my-daily-logs.controller';
import { DeliverablesController } from './presentation/controllers/deliverables.controller';
import { DesignPackagesController } from './presentation/controllers/design-packages.controller';
import { DrawingsController } from './presentation/controllers/drawings.controller';
import { EngineeringBatchController } from './presentation/controllers/engineering-batch.controller';
import { EngineeringDocumentsController } from './presentation/controllers/engineering-documents.controller';
import { EpcWorkspaceController } from './presentation/controllers/epc-workspace.controller';
import { IssuesController } from './presentation/controllers/issues.controller';
import { MyIssuesController } from './presentation/controllers/my-issues.controller';
import { MeetingsController } from './presentation/controllers/meetings.controller';
import { MyMeetingsController } from './presentation/controllers/my-meetings.controller';
import { ProjectsController } from './presentation/controllers/projects.controller';
import { PunchItemsController } from './presentation/controllers/punch-items.controller';
import { PunchItemsGlobalController } from './presentation/controllers/punch-items-global.controller';
import { ReviewBatchController } from './presentation/controllers/review-batch.controller';
import { ReviewCommentsController } from './presentation/controllers/review-comments.controller';
import { RisksController } from './presentation/controllers/risks.controller';
import { MyRisksController } from './presentation/controllers/my-risks.controller';
import { RfisController } from './presentation/controllers/rfis.controller';
import { ScheduleController } from './presentation/controllers/schedule.controller';
import {
  MySubmittalsController,
  SubmittalsController,
} from './presentation/controllers/submittals.controller';
import { WorkflowEventsController } from './presentation/controllers/workflow-events.controller';
import { ProjectionReconciliationCron } from './presentation/cron/projection-reconciliation.cron';
import { ReviewSlaCron } from './presentation/cron/review-sla.cron';

const redisEnabled = process.env.REDIS_ENABLED === 'true';

const workflowBullImports = redisEnabled
  ? [
      BullModule.registerQueue({ name: WORKFLOW_COMMITTED_QUEUE }),
      BullModule.registerQueue({ name: WORKFLOW_SLA_QUEUE }),
    ]
  : [];

const workflowBullProcessors = redisEnabled
  ? [WorkflowCommittedProcessor, WorkflowSlaProcessor]
  : [];

@Module({
  imports: [
    PermissionsModule,
    AuditModule,
    NotificationsModule,
    DocumentsModule,
    ScheduleModule.forRoot(),
    ...workflowBullImports,
  ],
  controllers: [
    ProjectsController,
    ScheduleController,
    RfisController,
    MyRfisController,
    IssuesController,
    MyIssuesController,
    SubmittalsController,
    MySubmittalsController,
    ExternalReleasesController,
    DrawingsController,
    EngineeringDocumentsController,
    DesignPackagesController,
    ReviewCommentsController,
    ReviewBatchController,
    EngineeringBatchController,
    EpcWorkspaceController,
    WorkflowEventsController,
    DailyLogsController,
    MyDailyLogsController,
    MeetingsController,
    MyMeetingsController,
    CorrespondenceController,
    CorrespondenceGlobalController,
    RisksController,
    MyRisksController,
    PunchItemsController,
    PunchItemsGlobalController,
    CloseoutController,
    ChangeRequestsController,
    MyChangeRequestsController,
    DeliverablesController,
    PmModuleSettingsController,
  ],
  providers: [
    TaskAccessScopeService,
    MyWorkService,
    TaskAssignmentNotificationService,
    ProjectsService,
    ProjectExportService,
    ProjectsExportPdfService,
    ProjectReportPdfService,
    ProjectScopeService,
    DisciplineScopeService,
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
    ReviewRoutingService,
    ReviewCommentsService,
    ReviewBatchService,
    DependencyGraphService,
    DecisionTraceService,
    RevisionOrchestratorService,
    SubmittalWorkflowService,
    SubmittalSnapshotService,
    ExternalReviewTriggerService,
    ProjectChangeRequestService,
    DeliverableService,
    EpcWorkspaceService,
    WorkflowCommittedService,
    WorkflowCommittedDispatcher,
    WorkflowTransactionRunner,
    WorkflowCorrectionService,
    WorkflowSlaDispatcher,
    ProjectionReconciliationCron,
    ReviewSlaCron,
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
    PmModuleAccessGuard,
    PmModuleEnabledGuard,
    PmModuleSettingsService,
    ...workflowBullProcessors,
  ],
  exports: [
    PmModuleSettingsService,
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
    ProjectChangeRequestService,
    DeliverableService,
  ],
})
export class ProjectManagementModule {}
