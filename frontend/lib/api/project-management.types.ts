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
  designStage: string | null;
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

export interface ProjectTeamMember {
  id: string;
  projectId: string;
  userId: string;
  roleOnProject: string;
  assignedFrom: string | null;
  assignedTo: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Milestone {
  id: string;
  projectId: string;
  name: string;
  plannedDate: string | null;
  actualDate: string | null;
  status: string;
  createdAt: string;
  updatedAt: string;
}

export interface Task {
  id: string;
  projectId: string;
  milestoneId: string | null;
  parentTaskId: string | null;
  assignedTo: string | null;
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
  designStage: string | null;
  urgencyLevel: UrgencyLevel;
  hasCustomSchedule: boolean;
  language: TaskLanguage;
  approvalLevel: ApprovalLevel | null;
  chiefEngineerName: string | null;
  dispatcherName: string | null;
  responsiblePersonId: string | null;
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
  designerName: string | null;
  reviewerName: string | null;
  disciplinaryLeader: string | null;
  deptChiefEngineer: string | null;
  instituteChiefEngineer: string | null;
  actualCompletionTime: string | null;
  deptReviewTime: string | null;
  instituteReviewTime: string | null;
  createdAt: string;
  createdBy: string;
}

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
  submittedBy: string;
  reviewedBy: string | null;
  submittalNumber: string;
  category: string;
  title: string;
  contractor: string | null;
  supplier: string | null;
  specReference: string | null;
  revisionNumber: number;
  status: SubmittalStatus;
  submissionDate: string | null;
  dueDate: string | null;
  reviewDate: string | null;
  createdAt: string;
  updatedAt: string;
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
  createdAt: string;
  updatedAt: string;
}

export interface Issue {
  id: string;
  projectId: string;
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
  designStage?: string;
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
  | 'closeout';

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

export interface AddProjectTeamMemberRequest {
  userId: string;
  roleOnProject: string;
  assignedFrom?: string;
  assignedTo?: string;
}

export interface CreateMilestoneRequest {
  name: string;
  plannedDate?: string;
  actualDate?: string;
  status?: string;
}

export type UpdateMilestoneRequest = Partial<CreateMilestoneRequest>;

export interface CreateTaskRequest {
  milestoneId?: string;
  parentTaskId?: string;
  assignedTo?: string;
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
  designStage?: string;
  urgencyLevel?: UrgencyLevel;
  hasCustomSchedule?: boolean;
  language?: TaskLanguage;
  approvalLevel?: ApprovalLevel;
  chiefEngineerName?: string;
  dispatcherName?: string;
  responsiblePersonId?: string;
  actualCompletionTime?: string;
  actualWorkdays?: number;
  completionStatus?: CompletionStatus;
  remark?: string;
}

export type UpdateTaskRequest = Partial<CreateTaskRequest>;

export interface CreateTaskDisciplineRequest {
  disciplineName: string;
  designerName?: string;
  reviewerName?: string;
  disciplinaryLeader?: string;
  deptChiefEngineer?: string;
  instituteChiefEngineer?: string;
  actualCompletionTime?: string;
  deptReviewTime?: string;
  instituteReviewTime?: string;
}

export type UpdateTaskDisciplineRequest = Partial<CreateTaskDisciplineRequest>;

export interface CreateTaskDependencyRequest {
  predecessorTaskId: string;
  successorTaskId: string;
  dependencyType: TaskDependencyType;
  lagDays?: number;
}

export interface CreateRfiRequest {
  title: string;
  description?: string;
  discipline?: string;
  priority?: RfiPriority;
  assignedTo?: string;
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

export interface CreateMeetingRequest {
  meetingType: MeetingType;
  title: string;
  meetingDate: string;
  location?: string;
}

export type UpdateMeetingRequest = Partial<CreateMeetingRequest> & {
  status?: MeetingStatus;
};

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

export interface PmListFilters {
  search?: string;
  status?: string;
}
