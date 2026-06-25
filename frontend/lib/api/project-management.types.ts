/**
 * Project Management domain types aligned with project_management_erd.html.
 * API responses use camelCase (NestJS / Prisma convention).
 */

export type ProjectType =
  | 'RESIDENTIAL'
  | 'COMMERCIAL'
  | 'INFRASTRUCTURE'
  | 'INDUSTRIAL';

export type ProjectStatus =
  | 'PLANNING'
  | 'TENDER'
  | 'MOBILIZATION'
  | 'ACTIVE'
  | 'ON_HOLD'
  | 'COMPLETED'
  | 'CLOSED';

/** EPC workflow gate — must match backend ProjectDesignPhase enum. */
export type ProjectDesignPhase =
  | 'INITIATION'
  | 'PLANNING'
  | 'CONCEPT_DESIGN'
  | 'SCHEMATIC'
  | 'DETAILED_DESIGN'
  | 'IFC'
  | 'SUBMITTAL'
  | 'CONSTRUCTION_SUPPORT'
  | 'CLOSEOUT';

export type TaskStatus =
  | 'NOT_STARTED'
  | 'IN_PROGRESS'
  | 'DELAYED'
  | 'COMPLETED';

export type TaskDependencyType = 'FS' | 'SS' | 'FF' | 'SF';

export type UrgencyLevel = 'NORMAL' | 'URGENT' | 'CRITICAL';

export type TaskLanguage = 'CHINESE' | 'ENGLISH';

export type ApprovalLevel = 'DEPARTMENT' | 'INSTITUTE';

export type CompletionStatus = 'NORMAL' | 'AHEAD' | 'BEHIND';

export type RfiPriority = 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';

export type RfiStatus =
  | 'DRAFT'
  | 'SUBMITTED'
  | 'UNDER_REVIEW'
  | 'ANSWERED'
  | 'CLOSED';

export type SubmittalStatus =
  | 'DRAFT'
  | 'SUBMITTED'
  | 'UNDER_REVIEW'
  | 'APPROVED'
  | 'APPROVED_WITH_COMMENTS'
  | 'REVISE_AND_RESUBMIT'
  | 'REJECTED';

export type SubmittalPurpose =
  | 'IN_CONSTRUCTION'
  | 'DISCIPLINE_SITE'
  | 'DISCIPLINE_CONSULTANT'
  | 'DEPUTY_BID'
  | 'DEPUTY_INTERIM'
  | 'DEPUTY_FINAL';

export type SubmittalPreparedByRole =
  | 'SITE_TEAM'
  | 'DISCIPLINE_LEAD'
  | 'DEPUTY_CHIEF';

export type IssueSeverity = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

export type IssueStatus =
  | 'OPEN'
  | 'ASSIGNED'
  | 'IN_PROGRESS'
  | 'RESOLVED'
  | 'VERIFIED'
  | 'CLOSED';

export type PunchItemSeverity = 'MINOR' | 'MAJOR' | 'CRITICAL';

export type PunchItemStatus =
  | 'RAISED'
  | 'ASSIGNED'
  | 'CORRECTED'
  | 'VERIFIED'
  | 'CLOSED';

export type RiskCategory =
  | 'COST'
  | 'SCHEDULE'
  | 'SAFETY'
  | 'QUALITY'
  | 'ENVIRONMENTAL'
  | 'CONTRACTUAL';

export type RiskStatus = 'OPEN' | 'MONITORING' | 'MITIGATED' | 'CLOSED';

export type CorrespondenceType =
  | 'LETTER'
  | 'EMAIL'
  | 'NOTICE'
  | 'INSTRUCTION'
  | 'MEMO';

export type CorrespondenceStatus =
  | 'DRAFT'
  | 'SENT'
  | 'ACKNOWLEDGED'
  | 'CLOSED';

export type MeetingType =
  | 'PROGRESS'
  | 'DESIGN_COORDINATION'
  | 'SAFETY'
  | 'CLIENT';

export type MeetingStatus =
  | 'SCHEDULED'
  | 'CONDUCTED'
  | 'MINUTES_ISSUED'
  | 'CLOSED';

export type CloseoutStatus =
  | 'PRACTICAL_COMPLETION'
  | 'DEFECTS_LIABILITY_PERIOD'
  | 'FINAL_COMPLETION'
  | 'FINANCIAL_CLOSEOUT'
  | 'ARCHIVE';

export interface Project {
  id: string;
  companyId: string;
  clientCompanyId: string | null;
  branchId: string | null;
  projectCode: string;
  name: string;
  location: string | null;
  projectType: ProjectType | null;
  contractType: string | null;
  status: ProjectStatus;
  startDate: string | null;
  plannedFinishDate: string | null;
  actualFinishDate: string | null;
  budget: string | null;
  currency: string | null;
  projectManagerId: string | null;
  client: string | null;
  commissioningMethod: string | null;
  responsibleDepartmentId: string | null;
  designProperties: string | null;
  designStage: ProjectDesignPhase | null;
  responsiblePersonId: string | null;
  description: string | null;
  overallProgressPct: number;
  isOutsourced: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ProjectSummary extends Pick<
  Project,
  | 'id'
  | 'projectCode'
  | 'name'
  | 'status'
  | 'projectManagerId'
  | 'plannedFinishDate'
  | 'budget'
  | 'currency'
> {}

export type ProjectTeamRole =
  | 'PROJECT_MANAGER'
  | 'DISPATCHER'
  | 'SITE_COORDINATOR'
  | 'DEPARTMENT_CHIEF'
  | 'INSTITUTE_CHIEF'
  | 'DEPUTY_CHIEF'
  | 'DOCUMENT_CONTROLLER'
  | 'OTHER';

export interface ProjectTeamMember {
  id: string;
  projectId: string;
  userId: string;
  createdAt: string;
  updatedAt: string;
}

export interface Milestone {
  id: string;
  projectId: string;
  name: string;
  plannedDate: string | null;
  actualDate: string | null;
  status: MilestoneStatus;
  createdAt: string;
  updatedAt: string;
}

export type MilestoneStatus =
  | 'PLANNED'
  | 'IN_PROGRESS'
  | 'COMPLETED'
  | 'DELAYED'
  | 'AT_RISK';

export interface Task {
  id: string;
  projectId: string;
  milestoneId: string | null;
  parentTaskId: string | null;
  dispatcherUserId: string | null;
  taskIdCode: string;
  name: string;
  description: string | null;
  startDate: string | null;
  finishDate: string | null;
  durationDays: number | null;
  progressPct: number;
  status: TaskStatus;
  isCritical: boolean;
  commissioningMethod: string | null;
  requiresArchiving: boolean;
  taskAttributes: string | null;
  onSiteReceivingTime: string | null;
  assignmentToHqTime: string | null;
  contactFormNumber: string | null;
  designStage: ProjectDesignPhase | null;
  urgencyLevel: UrgencyLevel;
  hasCustomSchedule: boolean;
  language: TaskLanguage;
  approvalLevel: ApprovalLevel | null;
  actualCompletionTime: string | null;
  actualWorkdays: number | null;
  completionStatus: CompletionStatus | null;
  remark: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface TaskDiscipline {
  id: string;
  taskId: string;
  companyId: string;
  disciplineName: string;
  projectedStatus?: TaskDisciplineProjectedStatus;
  designerName: string | null;
  reviewerName: string | null;
  disciplinaryLeader: string | null;
  deptChiefEngineer: string | null;
  disciplineOwnerName: string | null;
  designerUserId?: string | null;
  ownerUserId?: string | null;
  reviewerUserId?: string | null;
  disciplineLeadUserId?: string | null;
  chiefUserId?: string | null;
  actualCompletionTime: string | null;
  deptReviewTime: string | null;
  createdAt: string;
  createdBy: string;
}

export type TaskDisciplineProjectedStatus =
  | 'IN_PROGRESS'
  | 'PENDING_LEAD'
  | 'APPROVED'
  | 'REWORK_REQUIRED';

export interface TaskDependency {
  id: string;
  predecessorTaskId: string;
  successorTaskId: string;
  dependencyType: TaskDependencyType;
  lagDays: number;
  createdAt: string;
}

export interface Rfi {
  id: string;
  projectId: string;
  taskDisciplineId: string | null;
  raisedBy: string;
  assignedTo: string | null;
  rfiNumber: string;
  title: string;
  description: string | null;
  discipline: string | null;
  priority: RfiPriority;
  status: RfiStatus;
  dateRaised: string | null;
  dueDate: string | null;
  dateAnswered: string | null;
  createdAt: string;
  updatedAt: string;
  attachmentFolderId?: string | null;
}

export interface RfiResponse {
  id: string;
  rfiId: string;
  respondedBy: string;
  responseText: string;
  respondedAt: string;
  createdAt: string;
}

export interface Submittal {
  id: string;
  projectId: string;
  taskDisciplineId: string | null;
  disciplineLeadUserId?: string | null;
  submittedBy: string;
  assignedTo: string | null;
  reviewedBy: string | null;
  submittalNumber: string;
  category: string;
  title: string;
  submittalPurpose: SubmittalPurpose | null;
  preparedByRole: SubmittalPreparedByRole | null;
  contractor: string | null;
  supplier: string | null;
  specReference: string | null;
  revisionNumber: number;
  status: SubmittalStatus;
  submissionDate: string | null;
  dueDate: string | null;
  reviewDate: string | null;
  issuedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface SubmittalItem {
  id: string;
  submittalId: string;
  designPackageId: string;
  itemType: 'DESIGN_PACKAGE';
  sortOrder: number;
  snapshotCaptured: boolean;
  snapshotEdvIds: string[];
  contentHash: string | null;
  capturedAt: string | null;
  createdAt: string;
}

export interface SubmittalDetail extends Submittal {
  items: SubmittalItem[];
  attachmentFolderId: string | null;
}

export interface SubmittalReview {
  id: string;
  submittalId: string;
  reviewedBy: string;
  revisionNumber: number;
  status: SubmittalStatus;
  comments: string | null;
  reviewedAt: string;
  createdAt: string;
}

export interface Drawing {
  id: string;
  projectId: string;
  folderId: string | null;
  drawingNumber: string;
  title: string;
  discipline: string | null;
  revision: string;
  status: string;
  isLatest: boolean;
  dateIssued: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface DrawingVersion {
  id: string;
  drawingId: string;
  uploadedBy: string;
  revision: string;
  fileKey: string;
  status: string;
  changeNote: string | null;
  createdAt: string;
}

export interface DrawingLink {
  id: string;
  drawingId: string;
  linkedEntityType: string;
  linkedEntityId: string;
  createdAt: string;
}

export interface DailyLog {
  id: string;
  projectId: string;
  siteEngineerId: string;
  logDate: string;
  shift: string | null;
  weatherCondition: string | null;
  temperatureC: string | null;
  rainfallMm: string | null;
  workSummary: string | null;
  status: string;
  totalWorkers: number;
  createdAt: string;
  updatedAt: string;
}

export interface DailyLogWorkforce {
  id: string;
  dailyLogId: string;
  trade: string;
  contractor: string | null;
  workerCount: number;
}

export interface DailyLogEquipment {
  id: string;
  dailyLogId: string;
  equipmentType: string;
  quantity: number;
  hoursUsed: string | null;
  hoursDowntime: string | null;
}

export interface DailyLogVisitor {
  id: string;
  dailyLogId: string;
  visitorName: string;
  company: string | null;
  purpose: string | null;
}

export interface DailyLogIncident {
  id: string;
  dailyLogId: string;
  incidentType: string;
  description: string;
  severity: string | null;
}

export interface DailyLogDetail extends DailyLog {
  attachmentFolderId: string | null;
  workforce: DailyLogWorkforce[];
  equipment: DailyLogEquipment[];
  visitors: DailyLogVisitor[];
  incidents: DailyLogIncident[];
}

export interface Meeting {
  id: string;
  projectId: string;
  organizerId: string;
  meetingNumber: string;
  meetingType: MeetingType;
  title: string;
  meetingDate: string;
  location: string | null;
  status: MeetingStatus;
  minutesIssuedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface MeetingAgendaItem {
  id: string;
  meetingId: string;
  presenterId: string | null;
  itemOrder: number;
  topic: string;
  discussionNotes: string | null;
  decisionsMade: string | null;
}

export interface MeetingAttendee {
  id: string;
  meetingId: string;
  userId: string | null;
  externalName: string | null;
  organization: string | null;
  roleAtMeeting: string | null;
  attended: boolean;
}

export interface ActionItem {
  id: string;
  meetingId: string;
  ownerId: string;
  description: string;
  dueDate: string | null;
  status: string;
  closedAt: string | null;
}

export interface MeetingDetail extends Meeting {
  attachmentFolderId: string | null;
  agendaItems: MeetingAgendaItem[];
  attendees: MeetingAttendee[];
  actionItems: ActionItem[];
}

export interface Correspondence {
  id: string;
  projectId: string;
  senderUserId: string | null;
  referenceNumber: string;
  correspondenceType: CorrespondenceType;
  subject: string;
  senderName: string;
  recipientName: string;
  correspondenceDate: string;
  status: CorrespondenceStatus;
  attachmentFolderId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Risk {
  id: string;
  projectId: string;
  ownerId: string;
  riskIdCode: string;
  title: string;
  description: string | null;
  category: RiskCategory;
  probability: number;
  impact: number;
  riskScore: number;
  mitigationPlan: string | null;
  contingencyPlan: string | null;
  reviewDate: string | null;
  status: RiskStatus;
  attachmentFolderId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Issue {
  id: string;
  projectId: string;
  taskDisciplineId: string | null;
  raisedBy: string;
  assignedTo: string | null;
  issueNumber: string;
  issueType: string;
  description: string;
  location: string | null;
  severity: IssueSeverity;
  status: IssueStatus;
  dueDate: string | null;
  resolvedAt: string | null;
  verifiedAt: string | null;
  createdAt: string;
  updatedAt: string;
  attachmentFolderId?: string | null;
}

export interface PunchItem {
  id: string;
  projectId: string;
  raisedBy: string;
  assignedTo: string | null;
  punchNumber: string;
  description: string;
  roomOrArea: string | null;
  tradeResponsible: string | null;
  severity: PunchItemSeverity;
  status: PunchItemStatus;
  dueDate: string | null;
  correctedAt: string | null;
  verifiedAt: string | null;
  attachmentFolderId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Closeout {
  id: string;
  projectId: string;
  practicalCompletionDate: string | null;
  defectsLiabilityEndDate: string | null;
  finalCompletionDate: string | null;
  status: CloseoutStatus;
  contractValue: string | null;
  variationsTotal: string | null;
  claimsTotal: string | null;
  finalSettlement: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CloseoutChecklistItem {
  id: string;
  closeoutId: string;
  verifiedBy: string | null;
  category: string;
  description: string;
  isComplete: boolean;
  completedAt: string | null;
}

export interface Warranty {
  id: string;
  closeoutId: string;
  itemDescription: string;
  supplier: string | null;
  startDate: string | null;
  expiryDate: string | null;
}

export interface CloseoutDetail extends Closeout {
  checklistItems: CloseoutChecklistItem[];
  warranties: Warranty[];
}

export interface CreateProjectRequest {
  projectCode: string;
  name: string;
  clientCompanyId?: string;
  branchId?: string;
  location?: string;
  projectType?: ProjectType;
  contractType?: string;
  status?: ProjectStatus;
  startDate?: string;
  plannedFinishDate?: string;
  budget?: number;
  currency?: string;
  projectManagerId?: string;
  client?: string;
  commissioningMethod?: string;
  responsibleDepartmentId?: string;
  designProperties?: string;
  designStage?: ProjectDesignPhase;
  responsiblePersonId?: string;
  description?: string;
  overallProgressPct?: number;
  isOutsourced?: boolean;
}

export type UpdateProjectRequest = Partial<CreateProjectRequest> & {
  actualFinishDate?: string;
};

export interface ProjectListFilters {
  status?: ProjectStatus;
  projectType?: ProjectType;
  search?: string;
  projectManagerId?: string;
}

export interface ProjectDashboardStats {
  openRfis: number;
  overdueRfis: number;
  openIssues: number;
  openPunchItems: number;
  scheduleVariancePct: number | null;
  plannedProgressPct: number | null;
  actualProgressPct: number | null;
}

export type PmModuleKey =
  | 'projects'
  | 'schedule'
  | 'rfis'
  | 'submittals'
  | 'drawings'
  | 'dailyLogs'
  | 'meetings'
  | 'correspondence'
  | 'risks'
  | 'issues'
  | 'punchItems'
  | 'closeout'
  | 'deliverables'
  | 'change_requests'
  | 'engineering_documents'
  | 'design_packages'
  | 'review_sessions'
  | 'review_comments';

export interface ModuleCapabilities {
  canView: boolean;
  canCreate: boolean;
  canEdit: boolean;
  canDelete: boolean;
}

export type PmCapabilities = Record<PmModuleKey, ModuleCapabilities>;

export const PM_MODULE_KEYS: PmModuleKey[] = [
  'projects',
  'schedule',
  'rfis',
  'submittals',
  'drawings',
  'dailyLogs',
  'meetings',
  'correspondence',
  'risks',
  'issues',
  'punchItems',
  'closeout',
  'deliverables',
  'change_requests',
  'engineering_documents',
  'design_packages',
  'review_sessions',
  'review_comments',
];

export const EMPTY_MODULE_CAPABILITIES: ModuleCapabilities = {
  canView: false,
  canCreate: false,
  canEdit: false,
  canDelete: false,
};

export function createEmptyPmCapabilities(): PmCapabilities {
  return PM_MODULE_KEYS.reduce((accumulator, key) => {
    accumulator[key] = { ...EMPTY_MODULE_CAPABILITIES };
    return accumulator;
  }, {} as PmCapabilities);
}

export interface SetProjectTeamRequest {
  userIds: string[];
}

export interface CreateMilestoneRequest {
  name: string;
  plannedDate?: string;
  actualDate?: string;
  status?: MilestoneStatus;
}

export type UpdateMilestoneRequest = Partial<CreateMilestoneRequest>;

export interface CreateTaskRequest {
  milestoneId?: string;
  parentTaskId?: string;
  dispatcherUserId?: string;
  taskIdCode?: string;
  name: string;
  description?: string;
  startDate?: string;
  finishDate?: string;
  durationDays?: number;
  progressPct?: number;
  status?: TaskStatus;
  isCritical?: boolean;
  commissioningMethod?: string;
  requiresArchiving?: boolean;
  taskAttributes?: string;
  onSiteReceivingTime?: string;
  assignmentToHqTime?: string;
  contactFormNumber?: string;
  designStage?: ProjectDesignPhase;
  urgencyLevel?: UrgencyLevel;
  hasCustomSchedule?: boolean;
  language?: TaskLanguage;
  approvalLevel?: ApprovalLevel;
  actualCompletionTime?: string;
  actualWorkdays?: number;
  completionStatus?: CompletionStatus;
  remark?: string;
}

export type UpdateTaskRequest = Partial<CreateTaskRequest>;

export interface CreateTaskDisciplineRequest {
  disciplineName: string;
  designerUserId?: string;
  ownerUserId?: string;
  reviewerUserId?: string;
  disciplineLeadUserId?: string;
  chiefUserId?: string;
  actualCompletionTime?: string;
  deptReviewTime?: string;
}

export type UpdateTaskDisciplineRequest = Partial<CreateTaskDisciplineRequest>;

export interface CreateTaskDependencyRequest {
  predecessorTaskId: string;
  successorTaskId: string;
  dependencyType: TaskDependencyType;
  lagDays?: number;
}

export type UpdateTaskDependencyRequest = Partial<CreateTaskDependencyRequest>;

export interface CreateRfiRequest {
  title: string;
  description?: string;
  discipline?: string;
  priority?: RfiPriority;
  assignedTo?: string;
  taskDisciplineId?: string;
  dueDate?: string;
}

export type UpdateRfiRequest = Partial<CreateRfiRequest> & {
  status?: RfiStatus;
};

export interface CreateRfiResponseRequest {
  responseText: string;
}

export interface CreateSubmittalRequest {
  category: string;
  title: string;
  contractor?: string;
  supplier?: string;
  specReference?: string;
  revisionNumber?: number;
  dueDate?: string;
}

export interface CreateConstructionSubmittalRequest {
  category: string;
  title: string;
  taskDisciplineId: string;
  designPackageIds?: string[];
  contractor?: string;
  supplier?: string;
  specReference?: string;
  revisionNumber?: number;
  dueDate?: string;
}

export type UpdateSubmittalRequest = Partial<CreateSubmittalRequest> & {
  status?: SubmittalStatus;
  reviewDate?: string;
};

export interface CreateDrawingRequest {
  folderId?: string;
  drawingNumber: string;
  title: string;
  discipline?: string;
  revision: string;
  status?: string;
  dateIssued?: string;
}

export type UpdateDrawingRequest = Partial<CreateDrawingRequest>;

export interface CreateDrawingLinkRequest {
  linkedEntityType: string;
  linkedEntityId: string;
  label?: string;
}

export interface CreateSubmittalReviewRequest {
  status: SubmittalStatus;
  comments?: string;
  revisionNumber?: number;
}

export interface CreateDailyLogRequest {
  logDate: string;
  shift?: string;
  weatherCondition?: string;
  temperatureC?: number;
  rainfallMm?: number;
  workSummary?: string;
}

export type UpdateDailyLogRequest = Partial<CreateDailyLogRequest> & {
  status?: string;
};

export interface CreateDailyLogWorkforceRequest {
  trade: string;
  contractor?: string;
  workerCount: number;
}

export interface CreateDailyLogEquipmentRequest {
  equipmentType: string;
  quantity?: number;
  hoursUsed?: number;
  hoursDowntime?: number;
}

export interface CreateDailyLogVisitorRequest {
  visitorName: string;
  company?: string;
  purpose?: string;
}

export interface CreateDailyLogIncidentRequest {
  incidentType: string;
  description: string;
  severity?: string;
}

export interface CreateMeetingRequest {
  meetingType: MeetingType;
  title: string;
  meetingDate: string;
  location?: string;
}

export type UpdateMeetingRequest = Partial<CreateMeetingRequest> & {
  status?: MeetingStatus;
};

export interface CreateMeetingAgendaItemRequest {
  topic: string;
  presenterId?: string;
  itemOrder?: number;
  discussionNotes?: string;
  decisionsMade?: string;
}

export type UpdateMeetingAgendaItemRequest =
  Partial<CreateMeetingAgendaItemRequest>;

export interface CreateMeetingAttendeeRequest {
  userId?: string;
  externalName?: string;
  organization?: string;
  roleAtMeeting?: string;
  attended?: boolean;
}

export type UpdateMeetingAttendeeRequest = Partial<
  Omit<CreateMeetingAttendeeRequest, 'userId'>
>;

export interface CreateActionItemRequest {
  ownerId: string;
  description: string;
  dueDate?: string;
}

export interface UpdateActionItemRequest {
  description?: string;
  dueDate?: string;
  status?: string;
}

export interface CreateCorrespondenceRequest {
  correspondenceType: CorrespondenceType;
  subject: string;
  senderName: string;
  recipientName: string;
  correspondenceDate: string;
  referenceNumber?: string;
}

export type UpdateCorrespondenceRequest = Partial<CreateCorrespondenceRequest> & {
  status?: CorrespondenceStatus;
};

export interface CreateRiskRequest {
  riskIdCode: string;
  title: string;
  description?: string;
  category: RiskCategory;
  probability: number;
  impact: number;
  mitigationPlan?: string;
  contingencyPlan?: string;
  reviewDate?: string;
  ownerId: string;
}

export type UpdateRiskRequest = Partial<CreateRiskRequest> & {
  status?: RiskStatus;
};

export interface CreateIssueRequest {
  issueType: string;
  description: string;
  location?: string;
  severity: IssueSeverity;
  assignedTo?: string;
  taskDisciplineId?: string;
  dueDate?: string;
}

export type UpdateIssueRequest = Partial<CreateIssueRequest> & {
  status?: IssueStatus;
};

export interface CreatePunchItemRequest {
  description: string;
  roomOrArea?: string;
  tradeResponsible?: string;
  severity: PunchItemSeverity;
  assignedTo?: string;
  dueDate?: string;
}

export type UpdatePunchItemRequest = Partial<CreatePunchItemRequest> & {
  status?: PunchItemStatus;
};

export interface UpdateCloseoutRequest {
  practicalCompletionDate?: string;
  defectsLiabilityEndDate?: string;
  finalCompletionDate?: string;
  status?: CloseoutStatus;
  contractValue?: number;
  variationsTotal?: number;
  claimsTotal?: number;
  finalSettlement?: number;
}

export interface UpdateCloseoutChecklistItemRequest {
  isComplete: boolean;
  verifiedBy?: string;
}

export interface CreateWarrantyRequest {
  itemDescription: string;
  supplier?: string;
  startDate?: string;
  expiryDate?: string;
}

export type UpdateWarrantyRequest = Partial<CreateWarrantyRequest>;

export interface PmListFilters {
  search?: string;
  status?: string;
  submittalPurpose?: SubmittalPurpose;
}

export type ChangeRequestStatus =
  | 'DRAFT'
  | 'SUBMITTED'
  | 'APPROVED'
  | 'REJECTED'
  | 'CLOSED';

export interface ProjectChangeRequest {
  id: string;
  companyId: string;
  projectId: string;
  changeNumber: string;
  title: string;
  description: string | null;
  status: ChangeRequestStatus;
  sourceType: string;
  sourceEntityId: string | null;
  externalReviewTriggerId: string | null;
  approvedBy: string | null;
  approvedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateChangeRequestDto {
  title: string;
  description?: string;
  sourceType?: string;
  sourceEntityId?: string;
}

export interface UpdateChangeRequestDto {
  title?: string;
  description?: string;
  status?: ChangeRequestStatus;
}

export interface RejectChangeRequestDto {
  reason: string;
}

export type DeliverableStatus =
  | 'PLANNED'
  | 'IN_PROGRESS'
  | 'SUBMITTED'
  | 'APPROVED'
  | 'WAIVED';

export interface Deliverable {
  id: string;
  companyId: string;
  projectId: string;
  name: string;
  status: DeliverableStatus;
  dueDate: string | null;
  taskDisciplineId: string | null;
  taskDisciplineName: string | null;
  designPackageId: string | null;
  designPackageName: string | null;
  engineeringDocumentId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateDeliverableDto {
  name: string;
  taskDisciplineId?: string;
  designPackageId?: string;
  engineeringDocumentId?: string;
  dueDate?: string;
}

export interface UpdateDeliverableDto {
  name?: string;
  status?: DeliverableStatus;
  taskDisciplineId?: string;
  designPackageId?: string;
  engineeringDocumentId?: string;
  dueDate?: string;
}

export type ExternalReviewTriggerStatus = 'PENDING' | 'PROCESSED' | 'CANCELLED';

export type ExternalReviewTriggerType =
  | 'RFI'
  | 'CHANGE_REQUEST'
  | 'SUBMITTAL_REVIEW';

export interface ExternalReviewTrigger {
  id: string;
  projectId: string;
  status: ExternalReviewTriggerStatus;
  triggerType: ExternalReviewTriggerType;
  sourceEntityType: string;
  sourceEntityId: string;
  submittalId: string | null;
  createdAt: string;
}

export type ReviewTier =
  | 'DISCIPLINE_OWNER'
  | 'REVIEWER'
  | 'DISCIPLINE_LEAD'
  | 'DEPT_CHIEF';

export type ReviewSessionStatus =
  | 'ACTIVE'
  | 'APPROVED'
  | 'RETURNED_FOR_REWORK'
  | 'CLOSED'
  | 'SUPERSEDED';

export interface ReviewSessionSummary {
  id: string;
  designPackageId: string;
  designPackageName: string;
  taskDisciplineId: string;
  status: ReviewSessionStatus;
  currentTier: ReviewTier;
  assigneeName: string | null;
  slaDeadlineAt: string | null;
  slaOverdue: boolean;
  openedAt: string;
}
