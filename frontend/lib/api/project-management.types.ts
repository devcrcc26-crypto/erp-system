/**
 * Project Management domain types aligned with project_management_erd.html.
 * API responses use camelCase (NestJS / Prisma convention).
 */

export type ProjectType =
  | 'RESIDENTIAL'
  | 'COMMERCIAL'
  | 'INFRASTRUCTURE'
  | 'INDUSTRIAL'
  | 'ROAD'
  | 'RAILWAY'
  | 'URBAN_RAIL_TRANSIT'
  | 'BUILDING'
  | 'BRIDGE'
  | 'TUNNEL'
  | 'WATER_SUPPLY_DRAINAGE'
  | 'PORT_HARBOR'
  | 'AIRPORT'
  | 'POWER_ENERGY'
  | 'MIXED_USE'
  | 'OTHER';

import type { ProjectStatus } from '@/lib/constants/project-status';
import type { ProjectContractType } from '@/lib/constants/project-contract-type';
import type { ProjectResponsibleDepartment } from '@/lib/constants/project-responsible-department';
import type { ProjectDesignProperties } from '@/lib/constants/project-design-properties';
import type { ProjectDesignStage } from '@/lib/constants/project-design-stage';

export type {
  ProjectStatus,
  ProjectContractType,
  ProjectResponsibleDepartment,
  ProjectDesignProperties,
  ProjectDesignStage,
};

export type TaskStatus =
  | 'NOT_STARTED'
  | 'IN_PROGRESS'
  | 'DELAYED'
  | 'COMPLETED';

export type TaskDependencyType = 'FS' | 'SS' | 'FF' | 'SF';

export type UrgencyLevel = 'NORMAL' | 'URGENT' | 'VERY_URGENT';

export type TaskAttributes = 'ETHIOPIA' | 'CHINA' | 'COMBINE1' | 'COMBINE2';

export type TaskLanguage = 'CHINESE' | 'ENGLISH';

export type ApprovalLevel = 'DESIGN_INSTITUTE_REVIEW' | 'COMPANY_REVIEW';

export type CommissionMode =
  | 'CONTRACT'
  | 'EMAIL'
  | 'INFORMAL_ASSIGNMENT'
  | 'NO_ASSIGNMENT';

export type CompletionStatus = 'NORMAL' | 'AHEAD' | 'BEHIND';

export type RfiPriority = 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';

export type RfiSource =
  | 'SITE_TEAM'
  | 'CONTRACTOR'
  | 'CLIENT_CONSULTANT'
  | 'INTER_DISCIPLINE';

export interface RfiSubtaskOption {
  id: string;
  packageCode: string;
  name: string;
  fullCode: string;
  designerUserId: string | null;
  designerName: string | null;
  siteRepresentativeUserId: string | null;
  siteRepresentativeName: string | null;
}

export interface RfiProjectOption {
  id: string;
  projectCode: string;
  name: string;
}

export type RfiStatus =
  | 'DRAFT'
  | 'SUBMITTED'
  | 'UNDER_REVIEW'
  | 'ANSWERED'
  | 'CLOSED';

export type SubmittalStatus =
  | 'DRAFT'
  | 'UNDER_SITE_REVIEW'
  | 'SITE_APPROVED'
  | 'PENDING_CONSULTANT_REVIEW'
  | 'CONSULTANT_REVIEWED'
  | 'SUBMITTED'
  | 'UNDER_REVIEW'
  | 'APPROVED'
  | 'APPROVED_WITH_COMMENTS'
  | 'REVISE_AND_RESUBMIT'
  | 'REJECTED'
  | 'WITHDRAWN';

export type SubmittalSiteReviewStatus = 'PENDING' | 'APPROVED' | 'COMMENTED';

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
  | 'IN_PROGRESS'
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
  | 'CONTRACTUAL'
  | 'TECHNICAL'
  | 'FINANCIAL'
  | 'LEGAL'
  | 'POLITICAL'
  | 'OTHER';

export type RiskStatus =
  | 'OPEN'
  | 'MONITORING'
  | 'MITIGATED'
  | 'ACCEPTED'
  | 'CLOSED';

export type CorrespondenceType =
  | 'LETTER'
  | 'EMAIL'
  | 'NOTICE'
  | 'INSTRUCTION'
  | 'MEMO';

export type CorrespondenceDirection = 'INCOMING' | 'OUTGOING';

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
  | 'CLOSED'
  | 'IN_PROGRESS'
  | 'COMPLETED'
  | 'CANCELLED';

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
  nameZh: string | null;
  location: string | null;
  projectType: ProjectType | null;
  railwayLengthKm: number | null;
  urbanRailLengthKm: number | null;
  roadLengthKm: number | null;
  grossFloorAreaM2: number | null;
  contractType: ProjectContractType;
  status: ProjectStatus;
  startDate: string | null;
  plannedFinishDate: string | null;
  actualFinishDate: string | null;
  budget: string | null;
  currency: string | null;
  responsiblePersonId: string | null;
  responsiblePersonName?: string | null;
  client: string | null;
  responsibleDepartment: ProjectResponsibleDepartment;
  departmentId?: string | null;
  designProperties: ProjectDesignProperties;
  designStage: ProjectDesignStage;
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
  | 'nameZh'
  | 'status'
  | 'responsiblePersonId'
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
  userName?: string | null;
  userEmail?: string | null;
  visibleModules: string[];
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
  supervisingChiefUserId: string | null;
  assignedPersonUserId: string | null;
  taskIdCode: string;
  overseasTaskNumber: string | null;
  name: string;
  nameZh: string | null;
  description: string | null;
  startDate: string | null;
  finishDate: string | null;
  durationDays: number | null;
  progressPct: number;
  status: TaskStatus;
  isCritical: boolean;
  commissionMode: CommissionMode | null;
  commissioningMethod: string | null;
  requiresArchiving: boolean;
  taskAttributes: TaskAttributes | null;
  onSiteReceivingTime: string | null;
  assignmentToHqTime: string | null;
  contactFormNumber: string | null;
  designStage: ProjectDesignStage | null;
  urgencyLevel: UrgencyLevel;
  hasCustomSchedule: boolean;
  language: TaskLanguage;
  approvalLevel: ApprovalLevel | null;
  actualCompletionTime: string | null;
  actualWorkdays: number | null;
  completionStatus: CompletionStatus | null;
  remark: string | null;
  computedPlannedWorkDays?: number | null;
  computedActualWorkDays?: number | null;
  createdAt: string;
  updatedAt: string;
}

export interface TaskDiscipline {
  id: string;
  taskId: string;
  companyId: string;
  disciplineId: string | null;
  disciplineName: string;
  disciplineIndex?: number | null;
  disciplineNumber?: string | null;
  overseasTaskNumber?: string | null;
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
  supportingDesignerUserId: string | null;
  supportingDesigner: UserSummary | null;
  instituteChiefUserId: string | null;
  instituteChief: UserSummary | null;
  isClosed: boolean;
  closedAt: string | null;
  closedBy: string | null;
  actualCompletionTime: string | null;
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
  companyId: string;
  projectId: string;
  taskDisciplineId: string | null;
  raisedBy: string;
  raisedByName?: string | null;
  assignedTo: string | null;
  assignedToName?: string | null;
  rfiNumber: string;
  title: string;
  description: string | null;
  discipline: string | null;
  priority: RfiPriority;
  status: RfiStatus;
  rfiSource: RfiSource | null;
  linkedDesignPackageId: string | null;
  linkedCrId: string | null;
  linkedCrIds?: string[];
  linkedCrNumber?: string | null;
  linkedCrs?: Array<{
    id: string;
    changeNumber: string;
    title: string;
    status: ChangeRequestStatus;
  }>;
  linkedDesignPackage?: {
    id: string;
    packageCode: string;
    name: string;
    fullCode: string;
  } | null;
  projectName?: string | null;
  projectCode?: string | null;
  dateRaised: string | null;
  dueDate: string | null;
  dateAnswered: string | null;
  sourceEntityType?:
    | 'MEETING'
    | 'CORRESPONDENCE'
    | 'DAILY_LOG'
    | 'SUBMITTAL_REVIEW'
    | null;
  sourceEntityId?: string | null;
  sourceEntitySummary?: SourceEntitySummary | null;
  createdAt: string;
  updatedAt: string;
  attachmentFolderId?: string | null;
}

export interface SourceEntitySummary {
  type: string;
  id: string;
  label: string;
}

export interface RfiSummary {
  id: string;
  rfiNumber: string;
  subject: string;
  status: string;
  priority: string;
}

export interface IssueSummary {
  id: string;
  issueNumber: string;
  title: string;
  status: string;
  severity: string;
}

export interface ChangeRequestSummary {
  id: string;
  changeNumber: string;
  title: string;
  status: string;
}

export interface RfiResponse {
  id: string;
  rfiId: string;
  respondedBy: string;
  respondedByName?: string | null;
  responseText: string;
  responseDocumentId?: string | null;
  responseDocumentName?: string | null;
  respondedAt: string;
  createdAt: string;
}

export interface Submittal {
  id: string;
  projectId: string;
  projectName?: string | null;
  projectCode?: string | null;
  taskDisciplineId: string | null;
  disciplineLeadUserId?: string | null;
  submittedBy: string;
  submittedByName?: string | null;
  assignedTo: string | null;
  assignedToName?: string | null;
  reviewedBy: string | null;
  reviewedByName?: string | null;
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
  siteReviewRequired?: boolean;
  submissionDate: string | null;
  dueDate: string | null;
  reviewDate: string | null;
  issuedAt: string | null;
  createdAt: string;
  updatedAt: string;
  items?: SubmittalItem[];
  siteReviews?: SubmittalSiteReviewRow[];
}

export interface SubmittalSiteReviewRow {
  id: string;
  submittalId: string;
  siteRepUserId: string;
  siteRepUserName?: string | null;
  status: SubmittalSiteReviewStatus;
  comment: string | null;
  reviewedAt: string | null;
  reviewedBy: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface SubmittalEdvSnapshotRow {
  engineeringDocumentVersionId: string;
  engineeringDocumentId: string;
  revisionLabel: string;
  documentNumber: string | null;
  title: string;
  edvStatus: string;
}

export interface SubmittalItemReleasableEdv {
  id: string;
  title: string;
  revisionLabel: string;
  documentNumber: string | null;
  edvStatus: string;
  documentVersionId: string;
}

export interface SubmittalItem {
  id: string;
  submittalId: string;
  designPackageId: string;
  packageCode: string | null;
  /** Full subtask number e.g. 26-ETO-035-01-003 when available. */
  fullSubtaskCode?: string | null;
  packageName: string | null;
  itemType: 'DESIGN_PACKAGE';
  sortOrder: number;
  snapshotCaptured: boolean;
  snapshotEdvIds: string[];
  excludedEdvIds: string[];
  snapshotPayload: SubmittalEdvSnapshotRow[];
  contentHash: string | null;
  capturedAt: string | null;
  /** External party - site representative fields */
  siteRepType?: string | null;
  siteRepName?: string | null;
  siteRepEmail?: string | null;
  siteRepPhone?: string | null;
  siteRepCompany?: string | null;
  siteRepresentativeUserId?: string | null;
  /** External party - consultant fields */
  consultantName?: string | null;
  consultantTitle?: string | null;
  consultantEmail?: string | null;
  consultantPhone?: string | null;
  consultantCompany?: string | null;
  createdAt: string;
}

export interface SubmittalExternalApproval {
  id: string;
  submittalId: string;
  approvalType: 'SITE' | 'CONSULTANT';
  approvedByName: string;
  onBehalfOf: string | null;
  approvedAt: string;
  notes: string | null;
  evidenceFolderId: string | null;
  createdAt: string;
  createdBy: string;
}

export interface SubmittalExternalFeedback {
  id: string;
  submittalId: string;
  feedbackFrom: 'SITE' | 'CONSULTANT' | 'WITHDRAW';
  feedbackKind: 'COMMENT' | 'REJECTION';
  comment: string;
  evidenceFolderId: string | null;
  linkedCrId: string | null;
  createdAt: string;
  createdBy: string;
}

export interface SubmittalDetail extends Submittal {
  items: SubmittalItem[];
  attachmentFolderId: string | null;
  externalApprovals?: SubmittalExternalApproval[];
  externalFeedback?: SubmittalExternalFeedback[];
}

export interface SubmittalReview {
  id: string;
  submittalId: string;
  reviewedBy: string;
  reviewedByName?: string | null;
  revisionNumber: number;
  status: SubmittalStatus;
  comments: string | null;
  attachmentDocumentId?: string | null;
  attachmentDocumentName?: string | null;
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
  uploadedByName?: string | null;
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

export type DailyLogStatus = 'DRAFT' | 'SUBMITTED' | 'APPROVED';

export type WeatherCondition =
  | 'SUNNY'
  | 'PARTLY_CLOUDY'
  | 'OVERCAST'
  | 'LIGHT_RAIN'
  | 'HEAVY_RAIN'
  | 'THUNDERSTORM'
  | 'FOGGY'
  | 'WINDY'
  | 'HOT_AND_DRY';

export type RainfallLevel = 'NONE' | 'LIGHT' | 'MODERATE' | 'HEAVY';

export type VisitorPurpose =
  | 'CLIENT_VISIT'
  | 'INSPECTION'
  | 'DELIVERY'
  | 'CONSULTANT_VISIT'
  | 'REGULATORY_AUTHORITY'
  | 'OTHER';

export type IncidentType =
  | 'SAFETY_VIOLATION'
  | 'NEAR_MISS'
  | 'FIRST_AID'
  | 'MEDICAL_TREATMENT'
  | 'LOST_TIME_INJURY'
  | 'PROPERTY_DAMAGE'
  | 'ENVIRONMENTAL'
  | 'OTHER';

export type IncidentSeverity =
  | 'MINOR'
  | 'MODERATE'
  | 'MAJOR'
  | 'CRITICAL'
  | 'NEAR_MISS';

export interface DailyLog {
  id: string;
  companyId: string;
  projectId: string;
  projectName?: string;
  projectCode?: string;
  siteEngineerId: string;
  siteEngineerName?: string | null;
  logNumber: string | null;
  logDate: string;
  shift: string | null;
  weatherCondition: WeatherCondition | string | null;
  temperatureC: string | null;
  rainfallMm: string | null;
  rainfallLevel: RainfallLevel | string | null;
  humidity: string | null;
  workDescription: string | null;
  workforceCount: number | null;
  contractorName: string | null;
  issues: string | null;
  delays: string | null;
  supervisorId: string | null;
  supervisorName?: string | null;
  supervisedAt: string | null;
  submittedAt: string | null;
  submittedBy: string | null;
  submittedByName?: string | null;
  approvedAt: string | null;
  approvedBy: string | null;
  approvedByName?: string | null;
  status: DailyLogStatus | string;
  totalWorkers: number;
  incidentCount: number;
  equipmentCount: number;
  materialCount: number;
  visitorCount: number;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
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
  purpose: VisitorPurpose | string | null;
}

export interface DailyLogIncident {
  id: string;
  dailyLogId: string;
  incidentType: IncidentType | string;
  description: string;
  severity: IncidentSeverity | string | null;
}

export interface DailyLogMaterial {
  id: string;
  dailyLogId: string;
  materialType: string;
  quantity: string;
  unit: string;
  supplier: string | null;
}

export interface DailyLogDetail extends DailyLog {
  attachmentFolderId: string | null;
  workforce: DailyLogWorkforce[];
  equipment: DailyLogEquipment[];
  visitors: DailyLogVisitor[];
  incidents: DailyLogIncident[];
  materials: DailyLogMaterial[];
}

export type MeetingScope = 'PROJECT' | 'DISCIPLINE' | 'SUBTASK';

export interface MeetingSubtaskOption {
  id: string;
  name: string;
  fullCode: string;
  taskDisciplineId: string;
}

export interface Meeting {
  id: string;
  projectId: string;
  organizerId: string;
  organizerName?: string | null;
  meetingNumber: string;
  meetingType: MeetingType;
  title: string;
  meetingDate: string;
  startTime: string | null;
  endTime: string | null;
  location: string | null;
  status: MeetingStatus;
  minutesIssuedAt: string | null;
  scope: MeetingScope | null;
  taskDisciplineId: string | null;
  taskDisciplineName?: string | null;
  designPackageId: string | null;
  designPackageName?: string | null;
  agenda: string | null;
  minutes: string | null;
  createdBy: string;
  attendeeCount?: number;
  createdAt: string;
  updatedAt: string;
  raisedRfis?: RfiSummary[];
  raisedIssues?: IssueSummary[];
  raisedChangeRequests?: ChangeRequestSummary[];
}

export type MyMeeting = Meeting & {
  projectName: string;
  projectCode: string;
};

export interface MeetingAgendaItem {
  id: string;
  meetingId: string;
  presenterId: string | null;
  presenterName?: string | null;
  itemOrder: number;
  topic: string;
  discussionNotes: string | null;
  decisionsMade: string | null;
}

export interface MeetingAttendee {
  id: string;
  meetingId: string;
  attendeeType: 'INTERNAL' | 'EXTERNAL';
  userId: string | null;
  userName?: string | null;
  externalName: string | null;
  organization: string | null;
  roleAtMeeting: string | null;
  email: string | null;
  attended: boolean;
}

export interface ActionItem {
  id: string;
  meetingId: string;
  ownerId: string | null;
  ownerName?: string | null;
  assignedToName: string | null;
  title: string | null;
  description: string;
  dueDate: string | null;
  status: string;
  closedAt: string | null;
  completedBy: string | null;
  linkedIssueId: string | null;
  linkedIssueNumber?: string | null;
  linkedIssueStatus?: IssueStatus | null;
  designPackageId: string | null;
  createdAt?: string;
  createdBy?: string;
}

export interface MeetingDetail extends Meeting {
  attachmentFolderId: string | null;
  agendaItems: MeetingAgendaItem[];
  attendees: MeetingAttendee[];
  actionItems: ActionItem[];
}

export interface CorrespondenceChainItem {
  id: string;
  referenceNumber: string;
  subject: string;
  direction: CorrespondenceDirection;
  status: CorrespondenceStatus;
  correspondenceDate?: string;
  senderName?: string;
  recipientName?: string;
}

export interface Correspondence {
  id: string;
  companyId: string;
  projectId: string;
  projectName?: string | null;
  projectCode?: string | null;
  senderUserId: string | null;
  recipientUserId: string | null;
  referenceNumber: string;
  correspondenceType: CorrespondenceType;
  direction: CorrespondenceDirection;
  subject: string;
  senderName: string;
  recipientName: string;
  senderCompany: string | null;
  recipientCompany: string | null;
  notes: string | null;
  correspondenceDate: string;
  status: CorrespondenceStatus;
  parentId: string | null;
  sentAt: string | null;
  sentBy: string | null;
  sentByName?: string | null;
  acknowledgedAt: string | null;
  acknowledgedBy: string | null;
  acknowledgedByName?: string | null;
  createdBy: string;
  createdByName?: string | null;
  attachmentFolderId: string | null;
  createdAt: string;
  updatedAt: string;
  parent?: CorrespondenceChainItem | null;
  responses?: CorrespondenceChainItem[];
  raisedRfis?: RfiSummary[];
  raisedIssues?: IssueSummary[];
  raisedChangeRequests?: ChangeRequestSummary[];
}

export interface Risk {
  id: string;
  projectId: string;
  ownerId: string;
  ownerName?: string | null;
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
  residualLikelihood: number | null;
  residualImpact: number | null;
  residualScore: number | null;
  attachmentFolderId: string | null;
  createdBy: string;
  createdByName?: string | null;
  createdAt: string;
  updatedAt: string;
  projectName?: string | null;
  projectCode?: string | null;
}

export interface RiskProjectOption {
  id: string;
  projectCode: string;
  name: string;
}

export interface RiskReview {
  id: string;
  riskId: string;
  reviewedBy: string;
  reviewedByName?: string | null;
  reviewedAt: string;
  previousStatus: string | null;
  newStatus: string | null;
  previousScore: number | null;
  newScore: number | null;
  previousResidualScore: number | null;
  newResidualScore: number | null;
  notes: string | null;
  createdAt: string;
}

export interface RiskMitigation {
  id: string;
  riskId: string;
  attemptNumber: number;
  mitigationStrategy: string;
  residualLikelihood: number;
  residualImpact: number;
  residualScore: number;
  notes: string | null;
  assessedBy: string;
  assessorName?: string | null;
  assessedAt: string;
  createdAt: string;
}

export interface RiskDetail extends Risk {
  reviews: RiskReview[];
  mitigations: RiskMitigation[];
}

export interface IssueProjectOption {
  id: string;
  projectCode: string;
  name: string;
}

export interface Issue {
  id: string;
  companyId: string;
  projectId: string;
  taskDisciplineId: string | null;
  raisedBy: string;
  raisedByName?: string | null;
  assignedTo: string | null;
  assignedToName?: string | null;
  issueNumber: string;
  issueType: string;
  description: string;
  location: string | null;
  severity: IssueSeverity;
  status: IssueStatus;
  dueDate: string | null;
  resolvedAt: string | null;
  resolvedBy: string | null;
  resolvedByName?: string | null;
  resolutionNote: string | null;
  reopenedAt: string | null;
  reopenedBy: string | null;
  reopenedByName?: string | null;
  linkedDesignPackageId: string | null;
  linkedCrIds?: string[];
  linkedCrs?: Array<{
    id: string;
    changeNumber: string;
    title: string;
    status: string;
  }>;
  linkedDesignPackage?: {
    id: string;
    packageCode: string;
    name: string;
    fullCode: string;
  } | null;
  projectName?: string | null;
  projectCode?: string | null;
  sourceEntityType?:
    | 'MEETING'
    | 'CORRESPONDENCE'
    | 'DAILY_LOG'
    | 'SUBMITTAL_REVIEW'
    | null;
  sourceEntityId?: string | null;
  sourceEntitySummary?: SourceEntitySummary | null;
  createdAt: string;
  updatedAt: string;
  attachmentFolderId?: string | null;
}

export interface PunchItem {
  id: string;
  companyId: string;
  projectId: string;
  raisedBy: string;
  raisedByName?: string | null;
  assignedTo: string | null;
  assignedToName?: string | null;
  punchNumber: string;
  title: string;
  description: string;
  roomOrArea: string | null;
  tradeResponsible: string | null;
  category: string | null;
  severity: PunchItemSeverity;
  status: PunchItemStatus;
  dueDate: string | null;
  resolutionNote: string | null;
  correctedAt: string | null;
  verifiedAt: string | null;
  verifiedBy: string | null;
  verifiedByName?: string | null;
  closedAt: string | null;
  closedBy: string | null;
  closedByName?: string | null;
  taskDisciplineId: string | null;
  disciplineName?: string | null;
  designPackageId: string | null;
  packageCode?: string | null;
  packageName?: string | null;
  attachmentFolderId: string | null;
  projectName?: string | null;
  projectCode?: string | null;
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
  nameZh?: string;
  clientCompanyId?: string;
  branchId?: string;
  location?: string;
  projectType?: ProjectType;
  railwayLengthKm?: number;
  urbanRailLengthKm?: number;
  roadLengthKm?: number;
  grossFloorAreaM2?: number;
  contractType?: ProjectContractType;
  status?: ProjectStatus;
  startDate?: string;
  plannedFinishDate?: string;
  budget?: number;
  currency?: string;
  client?: string;
  responsibleDepartment?: ProjectResponsibleDepartment;
  designProperties?: ProjectDesignProperties;
  designStage?: ProjectDesignStage;
  responsiblePersonId?: string;
  description?: string;
  overallProgressPct?: number;
  isOutsourced?: boolean;
}

export type UpdateProjectRequest = Partial<
  Omit<CreateProjectRequest, 'client'>
> & {
  actualFinishDate?: string;
  client?: string | null;
};

export interface ProjectListFilters {
  status?: string;
  projectType?: ProjectType;
  search?: string;
  responsiblePersonId?: string;
  responsibleDepartment?: ProjectResponsibleDepartment;
  designProperties?: ProjectDesignProperties;
  designStage?: ProjectDesignStage;
}

export interface ProjectDashboardStats {
  openRfis: number;
  overdueRfis: number;
  openIssues: number;
  openPunchItems: number;
  scheduleVariancePct: number | null;
  plannedProgressPct: number | null;
  actualProgressPct: number | null;
  inProgressIssues: number;
  closedIssues: number;
  answeredRfis: number;
  closedRfis: number;
  openRisks: number;
  mitigatedRisks: number;
  acceptedRisks: number;
  closedRisks: number;
  criticalRisks: number;
  raisedPunch: number;
  assignedPunch: number;
  correctedPunch: number;
  verifiedPunch: number;
  closedPunch: number;
  draftCrs: number;
  submittedCrs: number;
  approvedCrs: number;
  rejectedCrs: number;
  draftLogs: number;
  submittedLogs: number;
  approvedLogs: number;
  upcomingMeetings: number;
  completedMeetings: number;
  openActions: number;
  draftCorr: number;
  sentCorr: number;
  acknowledgedCorr: number;
  activeSubmittals: number;
  approvedSubmittals: number;
  activeERs: number;
  issuedERs: number;
  subtasksByStatus: Record<string, number>;
  overdueIssues: number;
  overduePunch: number;
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
  userIds?: string[];
  members?: Array<{
    userId: string;
    visibleModules?: string[];
  }>;
}

export interface CreateMilestoneRequest {
  name: string;
  plannedDate?: string;
  actualDate?: string;
  status?: MilestoneStatus;
}

export type UpdateMilestoneRequest = Partial<CreateMilestoneRequest>;

export interface TaskDisciplineAssignment {
  disciplineId: string;
  disciplineLeadUserId: string;
}

export interface CreateTaskRequest {
  milestoneId?: string;
  parentTaskId?: string;
  dispatcherUserId?: string;
  supervisingChiefUserId?: string;
  assignedPersonUserId?: string;
  taskIdCode?: string;
  overseasTaskNumber?: string;
  name: string;
  nameZh?: string;
  description?: string;
  startDate?: string;
  finishDate?: string;
  durationDays?: number;
  progressPct?: number;
  status?: TaskStatus;
  isCritical?: boolean;
  commissionMode?: CommissionMode;
  commissioningMethod?: string;
  requiresArchiving?: boolean;
  taskAttributes?: TaskAttributes;
  disciplines?: TaskDisciplineAssignment[];
  onSiteReceivingTime?: string;
  assignmentToHqTime?: string;
  contactFormNumber?: string;
  designStage?: ProjectDesignStage;
  urgencyLevel?: UrgencyLevel;
  hasCustomSchedule?: boolean;
  language?: TaskLanguage;
  approvalLevel?: ApprovalLevel;
  actualCompletionTime?: string;
  actualWorkdays?: number;
  completionStatus?: CompletionStatus;
  remark?: string;
}

export interface UpdateTaskRequest extends Partial<
  Omit<CreateTaskRequest, 'disciplines'>
> {
  disciplinesToAdd?: TaskDisciplineAssignment[];
  disciplineIdsToRemove?: string[];
}

export interface CreateTaskDisciplineRequest {
  disciplineId: string;
  disciplineLeadUserId: string;
  designerUserId?: string;
  ownerUserId?: string;
  reviewerUserId?: string;
  chiefUserId?: string;
  instituteChiefUserId?: string;
  supportingDesignerUserId?: string;
  actualCompletionTime?: string;
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
  linkedDesignPackageId: string;
  rfiSource: RfiSource;
  title: string;
  description?: string;
  priority?: RfiPriority;
  dueDate?: string;
  sourceEntityType?: 'MEETING' | 'CORRESPONDENCE' | 'DAILY_LOG' | 'SUBMITTAL_REVIEW';
  sourceEntityId?: string;
  directTo?: 'DESIGN_TEAM' | 'SITE_TEAM';
}

export type UpdateRfiRequest = Partial<CreateRfiRequest> & {
  status?: RfiStatus;
};

export interface CreateRfiResponseRequest {
  responseText: string;
  responseDocumentId?: string;
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
  designPackageId: string;
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
  attachmentDocumentId?: string;
  revisionNumber?: number;
}

export interface CreateDailyLogRequest {
  logDate: string;
  shift: string;
  weatherCondition: WeatherCondition | string;
  temperatureC?: number;
  rainfallMm?: number;
  rainfallLevel?: RainfallLevel | string;
  humidity?: number;
  workDescription: string;
  workforceCount?: number;
  contractorName?: string;
  issues?: string;
  delays?: string;
  supervisorId?: string;
}

export type UpdateDailyLogRequest = Partial<CreateDailyLogRequest>;

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
  purpose: VisitorPurpose | string;
}

export interface CreateDailyLogIncidentRequest {
  incidentType: IncidentType | string;
  description: string;
  severity: IncidentSeverity | string;
}

export interface CreateDailyLogMaterialRequest {
  materialType: string;
  quantity: number;
  unit: string;
  supplier?: string;
}

export interface CreateMeetingRequest {
  meetingType: MeetingType;
  title: string;
  meetingDate: string;
  location?: string;
  scope?: MeetingScope;
  taskDisciplineId?: string;
  designPackageId?: string;
  startTime?: string;
  endTime?: string;
  agenda?: string;
}

export type UpdateMeetingRequest = Partial<CreateMeetingRequest> & {
  minutes?: string;
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
  attendeeType?: 'INTERNAL' | 'EXTERNAL';
  userId?: string;
  externalName?: string;
  organization?: string;
  roleAtMeeting?: string;
  email?: string;
  attended?: boolean;
}

export type UpdateMeetingAttendeeRequest = Partial<
  Omit<CreateMeetingAttendeeRequest, 'userId' | 'attendeeType'>
>;

export interface CreateActionItemRequest {
  ownerId?: string;
  assignedToName?: string;
  title?: string;
  description: string;
  dueDate?: string;
  designPackageId?: string;
}

export interface UpdateActionItemRequest {
  title?: string;
  description?: string;
  ownerId?: string;
  dueDate?: string;
  status?: string;
}

export interface CreateCorrespondenceRequest {
  correspondenceType: CorrespondenceType;
  direction: CorrespondenceDirection;
  subject: string;
  senderName: string;
  recipientName: string;
  senderCompany?: string;
  recipientCompany?: string;
  senderUserId?: string;
  recipientUserId?: string;
  notes?: string;
  correspondenceDate: string;
  parentId?: string;
}

export type UpdateCorrespondenceRequest = Partial<
  Omit<CreateCorrespondenceRequest, 'direction' | 'parentId'>
>;

export interface RespondCorrespondenceRequest {
  correspondenceType: CorrespondenceType;
  subject: string;
  senderName: string;
  recipientName: string;
  senderCompany?: string;
  recipientCompany?: string;
  senderUserId?: string;
  recipientUserId?: string;
  correspondenceDate: string;
  notes?: string;
}

export interface CreateRiskRequest {
  title: string;
  description?: string;
  category: RiskCategory;
  probability: number;
  impact: number;
  contingencyPlan?: string;
  reviewDate?: string;
  ownerId: string;
}

export type UpdateRiskRequest = Partial<CreateRiskRequest> & {
  status?: RiskStatus;
  residualLikelihood?: number;
  residualImpact?: number;
  clearResidual?: boolean;
  reviewNotes?: string;
  mitigationPlan?: string;
};

export interface CreateRiskMitigationRequest {
  mitigationStrategy: string;
  residualLikelihood: number;
  residualImpact: number;
  notes?: string;
}

export interface UpdateRiskMitigationRequest {
  mitigationStrategy?: string;
  residualLikelihood?: number;
  residualImpact?: number;
  notes?: string;
}

export interface CreateIssueRequest {
  issueType: string;
  description: string;
  location?: string;
  severity: IssueSeverity;
  assignedTo?: string;
  taskDisciplineId?: string;
  linkedDesignPackageId?: string;
  dueDate?: string;
  sourceEntityType?: 'MEETING' | 'CORRESPONDENCE' | 'DAILY_LOG' | 'SUBMITTAL_REVIEW';
  sourceEntityId?: string;
}

export type UpdateIssueRequest = Partial<CreateIssueRequest>;

export interface CloseIssueRequest {
  resolutionNote: string;
}

export interface ReopenIssueRequest {
  reason: string;
}

export interface IssueResponse {
  id: string;
  issueId: string;
  respondedBy: string;
  respondedByName?: string | null;
  responseText: string;
  responseDocumentId: string | null;
  responseDocumentName?: string | null;
  respondedAt: string;
  createdAt: string;
}

export interface CreateIssueResponseRequest {
  responseText: string;
  responseDocumentId?: string;
}

export interface CreatePunchItemRequest {
  title: string;
  description: string;
  roomOrArea?: string;
  tradeResponsible?: string;
  category?: string;
  severity: PunchItemSeverity;
  assignedTo?: string;
  dueDate?: string;
  taskDisciplineId?: string;
  designPackageId?: string;
}

export type UpdatePunchItemRequest = Partial<CreatePunchItemRequest>;

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
  severity?: string;
  category?: string;
  /** Comma-separated list of SubmittalPurpose values to match any of. */
  submittalPurpose?: string;
  linkedDesignPackageId?: string;
  projectId?: string;
}

export type ChangeRequestStatus =
  | 'DRAFT'
  | 'SUBMITTED'
  | 'APPROVED'
  | 'REJECTED'
  | 'CLOSED';

export type ChangeRequestReason =
  | 'CLIENT_REQUEST'
  | 'SITE_CONDITION'
  | 'DESIGN_ERROR'
  | 'REGULATORY_COMPLIANCE';

export interface AffectedEdvSnapshotItem {
  id: string;
  title: string;
  revisionLabel: string;
}

export interface CurrentEdvOption {
  id: string;
  title: string;
  revisionLabel: string;
  status: string;
  display: string;
}

export interface CrSubtaskOption {
  id: string;
  packageCode: string;
  name: string;
  fullCode: string;
}

export interface CrProjectOption {
  id: string;
  projectCode: string;
  name: string;
}

export interface ProjectChangeRequest {
  id: string;
  companyId: string;
  projectId: string;
  projectName?: string | null;
  projectCode?: string | null;
  changeNumber: string;
  title: string;
  description: string | null;
  status: ChangeRequestStatus;
  sourceType: string;
  sourceEntityId: string | null;
  sourceEntityType?:
    | 'MEETING'
    | 'CORRESPONDENCE'
    | 'DAILY_LOG'
    | 'SUBMITTAL_REVIEW'
    | null;
  originEntityId?: string | null;
  sourceEntitySummary?: SourceEntitySummary | null;
  externalReviewTriggerId: string | null;
  linkedDesignPackageId: string | null;
  linkedDesignPackage?: {
    id: string;
    packageCode: string;
    name: string;
  } | null;
  changeReason: ChangeRequestReason | string | null;
  attachmentFolderId: string | null;
  assignedTo: string | null;
  affectedEdvIds: string[];
  affectedEdvSnapshot: AffectedEdvSnapshotItem[];
  createdBy: string;
  approvedBy: string | null;
  approvedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateChangeRequestDto {
  title: string;
  description?: string;
  linkedDesignPackageId: string;
  affectedEdvIds: string[];
  changeReason: ChangeRequestReason;
  sourceType?: string;
  sourceEntityId?: string;
  sourceEntityType?: string;
  originEntityId?: string;
}

export interface UpdateChangeRequestDto {
  title?: string;
  description?: string;
  status?: ChangeRequestStatus;
  sourceEntityType?: string;
  originEntityId?: string;
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

export type ExternalReviewTriggerStatus =
  | 'PENDING'
  | 'PROCESSED'
  | 'PARTIAL'
  | 'FAILED'
  | 'CANCELLED';

export type ExternalReviewTriggerType =
  | 'RFI'
  | 'ISSUE'
  | 'CHANGE_REQUEST'
  | 'SUBMITTAL_REVIEW';

export interface ExternalReviewTrigger {
  id: string;
  projectId: string;
  status: ExternalReviewTriggerStatus;
  triggerType: ExternalReviewTriggerType;
  sourceEntityType: string;
  sourceEntityId: string;
  sourceEntityLabel?: string;
  submittalId: string | null;
  linkedDesignPackageId: string | null;
  triggerMode: 'REVISION' | 'NEW_PACKAGE';
  createdAt: string;
}

export type ReviewTier =
  | 'DISCIPLINE_OWNER'
  | 'REVIEWER'
  | 'DISCIPLINE_LEAD'
  | 'DEPT_CHIEF'
  | 'INSTITUTE_CHIEF';

export type DesignPackageStatus = 'OPEN' | 'SUBMITTED' | 'CLOSED';

export interface UserSummary {
  id: string;
  name: string;
}

export interface DesignPackage {
  id: string;
  companyId: string;
  taskDisciplineId: string;
  name: string;
  projectedStatus: string;
  projectionPending?: boolean;
  submittedAt: string | null;
  approvedAt: string | null;
  designerUserId?: string | null;
  reviewerUserId?: string | null;
  disciplinaryLeaderUserId?: string | null;
  deptDeputyChiefUserId?: string | null;
  instituteChiefUserId?: string | null;
  disciplineOwnerUserId?: string | null;
  supportingDesignerUserId?: string | null;
  requiredTiers: ReviewTier[];
  briefText: string | null;
  sourceEntityType: string | null;
  sourceEntityId: string | null;
  packageStatus: DesignPackageStatus;
  packageClosedAt: string | null;
  packageClosedBy: string | null;
  createdAt: string;
  createdBy: string;
  updatedAt: string;
  updatedBy: string;
}

export interface ReviewSessionAttachment {
  id: string;
  reviewSessionId: string;
  tier: ReviewTier;
  attachedByUserId: string;
  attachedByUser: UserSummary;
  documentId: string;
  document: {
    id: string;
    name: string;
    downloadUrl?: string;
  };
  attachedAt: string;
  purpose: string | null;
  note: string | null;
}

export interface ConfigureRevisionTriggerRequest {
  triggerMode: 'REVISION' | 'NEW_PACKAGE';
}

export interface AddReviewSessionAttachmentRequest {
  documentId: string;
  purpose?: string;
  note?: string;
}

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
