import {
  ActionItem,
  Closeout,
  CloseoutChecklistItem,
  Correspondence,
  DailyLog,
  Deliverable,
  DailyLogEquipment,
  DailyLogIncident,
  DailyLogMaterial,
  DailyLogVisitor,
  DailyLogWorkforce,
  Drawing,
  DrawingLink,
  DrawingVersion,
  Issue,
  IssueResponse,
  IssueStatus,
  Meeting,
  MeetingAgendaItem,
  MeetingAttendee,
  Milestone,
  Prisma,
  Project,
  ProjectChangeRequest,
  ProjectTeam,
  PunchItem,
  Rfi,
  RfiResponse,
  Risk,
  RiskReview,
  Submittal,
  SubmittalItem,
  SubmittalReview,
  Task,
  TaskDependency,
  TaskDiscipline,
  Warranty,
} from '@prisma/client';
import {
  RaisedChangeRequestSummary,
  RaisedIssueSummary,
  RaisedRfiSummary,
  SourceEntitySummary,
} from './source-entity.util';
import { formatDisciplineNumber } from '../../../../shared/discipline-number.util';
import { formatUserDisplayName } from '../../../../shared/utils/user-display.util';

/**
 * Formats a date as an ISO date string (YYYY-MM-DD).
 */
export function toDateString(value: Date | null | undefined): string | null {
  if (value == null) {
    return null;
  }
  return value.toISOString().slice(0, 10);
}

/**
 * Formats a date as a full ISO-8601 string.
 */
export function toIsoString(value: Date | null | undefined): string | null {
  if (value == null) {
    return null;
  }
  return value.toISOString();
}

/**
 * Converts a Prisma Decimal (or similar) to its string representation.
 */
export function decimalToString(
  value: { toString(): string } | null | undefined,
): string | null {
  if (value == null) {
    return null;
  }
  return value.toString();
}

/**
 * Parses an optional date string into a Date, or returns undefined when absent.
 */
export function parseOptionalDate(value?: string): Date | undefined {
  if (value === undefined || value === '') {
    return undefined;
  }
  return new Date(value);
}

/**
 * Parses an optional number into a Prisma Decimal, or returns undefined when absent.
 */
export function parseOptionalDecimal(value?: number): Prisma.Decimal | undefined {
  if (value === undefined) {
    return undefined;
  }
  return new Prisma.Decimal(value);
}

export interface MappedProject {
  id: string;
  companyId: string;
  clientCompanyId: string | null;
  branchId: string | null;
  projectCode: string;
  name: string;
  nameZh: string | null;
  location: string | null;
  projectType: Project['projectType'];
  railwayLengthKm: number | null;
  urbanRailLengthKm: number | null;
  roadLengthKm: number | null;
  grossFloorAreaM2: number | null;
  contractType: Project['contractType'];
  status: Project['status'];
  startDate: string | null;
  plannedFinishDate: string | null;
  actualFinishDate: string | null;
  budget: string | null;
  currency: string | null;
  responsiblePersonId: string | null;
  responsiblePersonName?: string | null;
  client: string | null;
  responsibleDepartment: Project['responsibleDepartment'];
  designProperties: Project['designProperties'];
  designStage: Project['designStage'];
  description: string | null;
  overallProgressPct: number;
  isOutsourced: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface MappedProjectTeamMember {
  id: string;
  projectId: string;
  userId: string;
  userName?: string | null;
  userEmail?: string | null;
  visibleModules: string[];
  createdAt: string;
  updatedAt: string;
}

export interface MappedProjectDashboardStats {
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

/**
 * Maps a Prisma Project row to the API response shape.
 */
export function mapProject(project: Project): MappedProject {
  return {
    id: project.id,
    companyId: project.companyId,
    clientCompanyId: project.clientCompanyId,
    branchId: project.branchId,
    projectCode: project.projectCode,
    name: project.name,
    nameZh: project.nameZh,
    location: project.location,
    projectType: project.projectType,
    railwayLengthKm: project.railwayLengthKm,
    urbanRailLengthKm: project.urbanRailLengthKm,
    roadLengthKm: project.roadLengthKm,
    grossFloorAreaM2: project.grossFloorAreaM2,
    contractType: project.contractType,
    status: project.status,
    startDate: toDateString(project.startDate),
    plannedFinishDate: toDateString(project.plannedFinishDate),
    actualFinishDate: toDateString(project.actualFinishDate),
    budget: decimalToString(project.budget),
    currency: project.currency,
    responsiblePersonId: project.responsiblePersonId,
    client: project.client,
    responsibleDepartment: project.responsibleDepartment,
    designProperties: project.designProperties,
    designStage: project.designStage,
    description: project.description,
    overallProgressPct: project.overallProgressPct,
    isOutsourced: project.isOutsourced,
    createdAt: toIsoString(project.createdAt)!,
    updatedAt: toIsoString(project.updatedAt)!,
  };
}

/**
 * Maps a Prisma ProjectTeam row to the API response shape.
 */
export function mapProjectTeamMember(member: ProjectTeam): MappedProjectTeamMember {
  return {
    id: member.id,
    projectId: member.projectId,
    userId: member.userId,
    visibleModules: member.visibleModules,
    createdAt: toIsoString(member.createdAt)!,
    updatedAt: toIsoString(member.updatedAt)!,
  };
}

export interface MappedSubmittal {
  id: string;
  projectId: string;
  projectName?: string | null;
  projectCode?: string | null;
  taskDisciplineId: string | null;
  disciplineLeadUserId: string | null;
  submittedBy: string;
  submittedByName?: string | null;
  assignedTo: string | null;
  assignedToName?: string | null;
  reviewedBy: string | null;
  reviewedByName?: string | null;
  submittalNumber: string;
  category: string;
  title: string;
  submittalPurpose: Submittal['submittalPurpose'];
  preparedByRole: Submittal['preparedByRole'];
  contractor: string | null;
  supplier: string | null;
  specReference: string | null;
  revisionNumber: number;
  status: Submittal['status'];
  siteReviewRequired: boolean;
  submissionDate: string | null;
  dueDate: string | null;
  reviewDate: string | null;
  issuedAt: string | null;
  createdAt: string;
  updatedAt: string;
  items?: MappedSubmittalItem[];
  siteReviews?: MappedSubmittalSiteReview[];
  externalApprovals?: MappedSubmittalExternalApproval[];
  externalFeedback?: MappedSubmittalExternalFeedback[];
}

export interface MappedSubmittalSiteReview {
  id: string;
  submittalId: string;
  siteRepUserId: string;
  siteRepUserName?: string | null;
  status: string;
  comment: string | null;
  reviewedAt: string | null;
  reviewedBy: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface MappedSubmittalExternalApproval {
  id: string;
  submittalId: string;
  approvalType: string;
  approvedByName: string;
  onBehalfOf: string;
  approvedAt: string;
  notes: string | null;
  evidenceFolderId: string | null;
  createdAt: string;
  createdBy: string;
}

export interface MappedSubmittalExternalFeedback {
  id: string;
  submittalId: string;
  feedbackFrom: string;
  feedbackKind: string;
  comment: string;
  evidenceFolderId: string | null;
  linkedCrId: string | null;
  createdAt: string;
  createdBy: string;
}

export interface MappedSubmittalItem {
  id: string;
  submittalId: string;
  designPackageId: string;
  packageCode: string | null;
  /** Full subtask number e.g. 26-ETO-035-01-003 when overseas task number is present. */
  fullSubtaskCode?: string | null;
  packageName: string | null;
  siteRepType?: string | null;
  siteRepName?: string | null;
  siteRepEmail?: string | null;
  siteRepPhone?: string | null;
  siteRepCompany?: string | null;
  siteRepresentativeUserId?: string | null;
  consultantName?: string | null;
  consultantTitle?: string | null;
  consultantEmail?: string | null;
  consultantPhone?: string | null;
  consultantCompany?: string | null;
  itemType: SubmittalItem['itemType'];
  sortOrder: number;
  snapshotCaptured: boolean;
  snapshotEdvIds: string[];
  excludedEdvIds: string[];
  snapshotPayload: SubmittalEdvSnapshotRow[];
  contentHash: string | null;
  capturedAt: string | null;
  createdAt: string;
}

/** Nested package shape used when mapping submittal items with full subtask codes. */
export type SubmittalItemDesignPackageSelect = {
  packageCode: string;
  name: string;
  subtaskIndex?: number | null;
  siteRepType?: string | null;
  siteRepName?: string | null;
  siteRepEmail?: string | null;
  siteRepPhone?: string | null;
  siteRepCompany?: string | null;
  siteRepresentativeUserId?: string | null;
  consultantName?: string | null;
  consultantTitle?: string | null;
  consultantEmail?: string | null;
  consultantPhone?: string | null;
  consultantCompany?: string | null;
  taskDiscipline?: {
    disciplineIndex: number | null;
    task: { overseasTaskNumber: string | null };
  } | null;
};

/** Frozen EDV row stored on submittal item at issue time. */
export interface SubmittalEdvSnapshotRow {
  engineeringDocumentVersionId: string;
  engineeringDocumentId: string;
  revisionLabel: string;
  documentNumber: string | null;
  title: string;
  edvStatus: string;
}

export interface MappedSubmittalReview {
  id: string;
  submittalId: string;
  reviewedBy: string;
  reviewedByName?: string | null;
  revisionNumber: number;
  status: SubmittalReview['status'];
  comments: string | null;
  attachmentDocumentId: string | null;
  attachmentDocumentName?: string | null;
  reviewedAt: string;
  createdAt: string;
}

export interface MappedDrawing {
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

export interface MappedDrawingVersion {
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

export interface MappedDrawingLink {
  id: string;
  drawingId: string;
  linkedEntityType: string;
  linkedEntityId: string;
  createdAt: string;
}

export interface MappedDailyLog {
  id: string;
  companyId: string;
  projectId: string;
  siteEngineerId: string;
  siteEngineerName?: string | null;
  logNumber: string | null;
  logDate: string;
  shift: string | null;
  weatherCondition: string | null;
  temperatureC: string | null;
  rainfallMm: string | null;
  rainfallLevel: string | null;
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
  status: string;
  totalWorkers: number;
  incidentCount: number;
  equipmentCount: number;
  materialCount: number;
  visitorCount: number;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
}

export interface MappedDailyLogWorkforce {
  id: string;
  dailyLogId: string;
  trade: string;
  contractor: string | null;
  workerCount: number;
}

export interface MappedDailyLogEquipment {
  id: string;
  dailyLogId: string;
  equipmentType: string;
  quantity: number;
  hoursUsed: string | null;
  hoursDowntime: string | null;
}

export interface MappedDailyLogVisitor {
  id: string;
  dailyLogId: string;
  visitorName: string;
  company: string | null;
  purpose: string | null;
}

export interface MappedDailyLogIncident {
  id: string;
  dailyLogId: string;
  incidentType: string;
  description: string;
  severity: string | null;
}

export interface MappedDailyLogMaterial {
  id: string;
  dailyLogId: string;
  materialType: string;
  quantity: string;
  unit: string;
  supplier: string | null;
}

export interface MappedDailyLogDetail extends MappedDailyLog {
  attachmentFolderId: string | null;
  workforce: MappedDailyLogWorkforce[];
  equipment: MappedDailyLogEquipment[];
  visitors: MappedDailyLogVisitor[];
  incidents: MappedDailyLogIncident[];
  materials: MappedDailyLogMaterial[];
}

export interface MappedMeeting {
  id: string;
  projectId: string;
  organizerId: string;
  organizerName?: string | null;
  meetingNumber: string;
  meetingType: Meeting['meetingType'];
  title: string;
  meetingDate: string;
  startTime: string | null;
  endTime: string | null;
  location: string | null;
  status: Meeting['status'];
  minutesIssuedAt: string | null;
  scope: Meeting['scope'];
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
}

export interface MappedMeetingAgendaItem {
  id: string;
  meetingId: string;
  presenterId: string | null;
  presenterName?: string | null;
  itemOrder: number;
  topic: string;
  discussionNotes: string | null;
  decisionsMade: string | null;
}

export interface MappedMeetingAttendee {
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

export interface MappedActionItem {
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
  createdAt: string;
  createdBy: string;
}

export type MappedMyMeeting = MappedMeeting & {
  projectName: string;
  projectCode: string;
};

export interface MappedMeetingDetail extends MappedMeeting {
  attachmentFolderId: string | null;
  agendaItems: MappedMeetingAgendaItem[];
  attendees: MappedMeetingAttendee[];
  actionItems: MappedActionItem[];
  raisedRfis?: RaisedRfiSummary[];
  raisedIssues?: RaisedIssueSummary[];
  raisedChangeRequests?: RaisedChangeRequestSummary[];
}

export interface MappedCorrespondenceChainItem {
  id: string;
  referenceNumber: string;
  subject: string;
  direction: Correspondence['direction'];
  status: Correspondence['status'];
  correspondenceDate?: string;
  senderName?: string;
  recipientName?: string;
}

export interface MappedCorrespondence {
  id: string;
  companyId: string;
  projectId: string;
  projectName?: string | null;
  projectCode?: string | null;
  senderUserId: string | null;
  recipientUserId: string | null;
  referenceNumber: string;
  correspondenceType: Correspondence['correspondenceType'];
  direction: Correspondence['direction'];
  subject: string;
  senderName: string;
  recipientName: string;
  senderCompany: string | null;
  recipientCompany: string | null;
  notes: string | null;
  correspondenceDate: string;
  status: Correspondence['status'];
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
  parent?: MappedCorrespondenceChainItem | null;
  responses?: MappedCorrespondenceChainItem[];
  raisedRfis?: RaisedRfiSummary[];
  raisedIssues?: RaisedIssueSummary[];
  raisedChangeRequests?: RaisedChangeRequestSummary[];
}

export interface MappedRisk {
  id: string;
  projectId: string;
  ownerId: string;
  ownerName?: string | null;
  riskIdCode: string;
  title: string;
  description: string | null;
  category: Risk['category'];
  probability: number;
  impact: number;
  riskScore: number;
  mitigationPlan: string | null;
  contingencyPlan: string | null;
  reviewDate: string | null;
  status: Risk['status'];
  residualLikelihood: number | null;
  residualImpact: number | null;
  residualScore: number | null;
  attachmentFolderId: string | null;
  createdBy: string;
  createdByName?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface MappedRiskReview {
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

export interface MappedRiskMitigation {
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

export interface MappedRiskDetail extends MappedRisk {
  reviews: MappedRiskReview[];
  mitigations: MappedRiskMitigation[];
}

export interface MappedPunchItem {
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
  severity: PunchItem['severity'];
  status: PunchItem['status'];
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

export interface MappedCloseout {
  id: string;
  projectId: string;
  practicalCompletionDate: string | null;
  defectsLiabilityEndDate: string | null;
  finalCompletionDate: string | null;
  status: Closeout['status'];
  contractValue: string | null;
  variationsTotal: string | null;
  claimsTotal: string | null;
  finalSettlement: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface MappedCloseoutChecklistItem {
  id: string;
  closeoutId: string;
  verifiedBy: string | null;
  category: string;
  description: string;
  isComplete: boolean;
  completedAt: string | null;
}

export interface MappedWarranty {
  id: string;
  closeoutId: string;
  itemDescription: string;
  supplier: string | null;
  startDate: string | null;
  expiryDate: string | null;
}

export interface MappedCloseoutDetail extends MappedCloseout {
  checklistItems: MappedCloseoutChecklistItem[];
  warranties: MappedWarranty[];
}

export function mapSubmittal(
  row: Submittal & {
    project?: { name: string; projectCode: string } | null;
    items?: Parameters<typeof mapSubmittalItem>[0][];
  },
): MappedSubmittal {
  return {
    id: row.id,
    projectId: row.projectId,
    projectName: row.project?.name ?? null,
    projectCode: row.project?.projectCode ?? null,
    taskDisciplineId: row.taskDisciplineId,
    disciplineLeadUserId: null,
    submittedBy: row.submittedBy,
    assignedTo: row.assignedTo,
    reviewedBy: row.reviewedBy,
    submittalNumber: row.submittalNumber,
    category: row.category,
    title: row.title,
    submittalPurpose: row.submittalPurpose,
    preparedByRole: row.preparedByRole,
    contractor: row.contractor,
    supplier: row.supplier,
    specReference: row.specReference,
    revisionNumber: row.revisionNumber,
    status: row.status,
    siteReviewRequired: row.siteReviewRequired ?? false,
    submissionDate: toDateString(row.submissionDate),
    dueDate: toDateString(row.dueDate),
    reviewDate: toDateString(row.reviewDate),
    issuedAt: toIsoString(row.issuedAt),
    createdAt: toIsoString(row.createdAt)!,
    updatedAt: toIsoString(row.updatedAt)!,
    items: row.items?.map(mapSubmittalItem),
  };
}

/**
 * Maps a SubmittalSiteReview row to the API response shape.
 */
export function mapSubmittalSiteReview(row: {
  id: string;
  submittalId: string;
  siteRepUserId: string;
  status: string;
  comment: string | null;
  reviewedAt: Date | null;
  reviewedBy: string | null;
  createdAt: Date;
  updatedAt: Date;
}): MappedSubmittalSiteReview {
  return {
    id: row.id,
    submittalId: row.submittalId,
    siteRepUserId: row.siteRepUserId,
    status: row.status,
    comment: row.comment,
    reviewedAt: toIsoString(row.reviewedAt),
    reviewedBy: row.reviewedBy,
    createdAt: toIsoString(row.createdAt)!,
    updatedAt: toIsoString(row.updatedAt)!,
  };
}

export function mapSubmittalExternalApproval(row: {
  id: string;
  submittalId: string;
  approvalType: string;
  approvedByName: string;
  onBehalfOf: string;
  approvedAt: Date;
  notes: string | null;
  evidenceFolderId: string | null;
  createdAt: Date;
  createdBy: string;
}): MappedSubmittalExternalApproval {
  return {
    id: row.id,
    submittalId: row.submittalId,
    approvalType: row.approvalType,
    approvedByName: row.approvedByName,
    onBehalfOf: row.onBehalfOf,
    approvedAt: toIsoString(row.approvedAt)!,
    notes: row.notes,
    evidenceFolderId: row.evidenceFolderId,
    createdAt: toIsoString(row.createdAt)!,
    createdBy: row.createdBy,
  };
}

export function mapSubmittalExternalFeedback(row: {
  id: string;
  submittalId: string;
  feedbackFrom: string;
  feedbackKind: string;
  comment: string;
  evidenceFolderId: string | null;
  linkedCrId: string | null;
  createdAt: Date;
  createdBy: string;
}): MappedSubmittalExternalFeedback {
  return {
    id: row.id,
    submittalId: row.submittalId,
    feedbackFrom: row.feedbackFrom,
    feedbackKind: row.feedbackKind,
    comment: row.comment,
    evidenceFolderId: row.evidenceFolderId,
    linkedCrId: row.linkedCrId,
    createdAt: toIsoString(row.createdAt)!,
    createdBy: row.createdBy,
  };
}

export function mapSubmittalItem(
  row: SubmittalItem & {
    designPackage?: SubmittalItemDesignPackageSelect | null;
  },
): MappedSubmittalItem {
  const payload = row.snapshotPayload;
  const snapshotPayload: SubmittalEdvSnapshotRow[] = Array.isArray(payload)
    ? (payload as unknown as SubmittalEdvSnapshotRow[])
    : [];

  const pkg = row.designPackage;
  const overseas = pkg?.taskDiscipline?.task?.overseasTaskNumber?.trim() ?? '';
  const discIdx = String(pkg?.taskDiscipline?.disciplineIndex ?? 0).padStart(
    2,
    '0',
  );
  const subIdx = String(pkg?.subtaskIndex ?? 0).padStart(3, '0');
  const fullSubtaskCode = overseas
    ? `${overseas}-${discIdx}-${subIdx}`
    : (pkg?.packageCode ?? null);

  return {
    id: row.id,
    submittalId: row.submittalId,
    designPackageId: row.designPackageId,
    packageCode: pkg?.packageCode ?? null,
    fullSubtaskCode,
    packageName: pkg?.name ?? null,
    siteRepType: pkg?.siteRepType ?? null,
    siteRepName: pkg?.siteRepName ?? null,
    siteRepEmail: pkg?.siteRepEmail ?? null,
    siteRepPhone: pkg?.siteRepPhone ?? null,
    siteRepCompany: pkg?.siteRepCompany ?? null,
    siteRepresentativeUserId: pkg?.siteRepresentativeUserId ?? null,
    consultantName: pkg?.consultantName ?? null,
    consultantTitle: pkg?.consultantTitle ?? null,
    consultantEmail: pkg?.consultantEmail ?? null,
    consultantPhone: pkg?.consultantPhone ?? null,
    consultantCompany: pkg?.consultantCompany ?? null,
    itemType: row.itemType,
    sortOrder: row.sortOrder,
    snapshotCaptured: row.snapshotCaptured,
    snapshotEdvIds: row.snapshotEdvIds,
    excludedEdvIds: row.excludedEdvIds ?? [],
    snapshotPayload,
    contentHash: row.contentHash,
    capturedAt: toIsoString(row.capturedAt),
    createdAt: toIsoString(row.createdAt)!,
  };
}

export function mapSubmittalReview(
  row: SubmittalReview & {
    attachmentDocument?: { name: string } | null;
  },
): MappedSubmittalReview {
  return {
    id: row.id,
    submittalId: row.submittalId,
    reviewedBy: row.reviewedBy,
    revisionNumber: row.revisionNumber,
    status: row.status,
    comments: row.comments,
    attachmentDocumentId: row.attachmentDocumentId ?? null,
    attachmentDocumentName: row.attachmentDocument?.name ?? null,
    reviewedAt: toIsoString(row.reviewedAt)!,
    createdAt: toIsoString(row.createdAt)!,
  };
}

export function mapDrawing(row: Drawing): MappedDrawing {
  return {
    id: row.id,
    projectId: row.projectId,
    folderId: row.folderId,
    drawingNumber: row.drawingNumber,
    title: row.title,
    discipline: row.discipline,
    revision: row.revision,
    status: row.status,
    isLatest: row.isLatest,
    dateIssued: toDateString(row.dateIssued),
    createdAt: toIsoString(row.createdAt)!,
    updatedAt: toIsoString(row.updatedAt)!,
  };
}

export function mapDrawingVersion(row: DrawingVersion): MappedDrawingVersion {
  return {
    id: row.id,
    drawingId: row.drawingId,
    uploadedBy: row.uploadedBy,
    revision: row.revision,
    fileKey: row.fileKey,
    status: row.status,
    changeNote: row.changeNote,
    createdAt: toIsoString(row.createdAt)!,
  };
}

export function mapDrawingLink(row: DrawingLink): MappedDrawingLink {
  return {
    id: row.id,
    drawingId: row.drawingId,
    linkedEntityType: row.linkedEntityType,
    linkedEntityId: row.linkedEntityId,
    createdAt: toIsoString(row.createdAt)!,
  };
}

export function mapDailyLog(
  row: DailyLog & {
    workforce?: { workerCount: number }[];
    equipment?: unknown[];
    visitors?: unknown[];
    incidents?: unknown[];
    materials?: unknown[];
    _count?: {
      equipment?: number;
      visitors?: number;
      incidents?: number;
      materials?: number;
    };
  },
): MappedDailyLog {
  const totalWorkers = (row.workforce ?? []).reduce(
    (sum, entry) => sum + entry.workerCount,
    0,
  );

  return {
    id: row.id,
    companyId: row.companyId,
    projectId: row.projectId,
    siteEngineerId: row.siteEngineerId,
    logNumber: row.logNumber,
    logDate: toDateString(row.logDate)!,
    shift: row.shift,
    weatherCondition: row.weatherCondition,
    temperatureC: decimalToString(row.temperatureC),
    rainfallMm: decimalToString(row.rainfallMm),
    rainfallLevel: row.rainfallLevel,
    humidity: decimalToString(row.humidity),
    workDescription: row.workDescription,
    workforceCount: row.workforceCount,
    contractorName: row.contractorName,
    issues: row.issues,
    delays: row.delays,
    supervisorId: row.supervisorId,
    supervisedAt: toIsoString(row.supervisedAt),
    submittedAt: toIsoString(row.submittedAt),
    submittedBy: row.submittedBy,
    approvedAt: toIsoString(row.approvedAt),
    approvedBy: row.approvedBy,
    status: row.status,
    totalWorkers: row.workforceCount ?? totalWorkers,
    incidentCount: row._count?.incidents ?? row.incidents?.length ?? 0,
    equipmentCount: row._count?.equipment ?? row.equipment?.length ?? 0,
    materialCount: row._count?.materials ?? row.materials?.length ?? 0,
    visitorCount: row._count?.visitors ?? row.visitors?.length ?? 0,
    createdAt: toIsoString(row.createdAt)!,
    updatedAt: toIsoString(row.updatedAt)!,
    createdBy: row.createdBy,
  };
}

export function mapDailyLogWorkforce(
  row: DailyLogWorkforce,
): MappedDailyLogWorkforce {
  return {
    id: row.id,
    dailyLogId: row.dailyLogId,
    trade: row.trade,
    contractor: row.contractor,
    workerCount: row.workerCount,
  };
}

export function mapDailyLogEquipment(
  row: DailyLogEquipment,
): MappedDailyLogEquipment {
  return {
    id: row.id,
    dailyLogId: row.dailyLogId,
    equipmentType: row.equipmentType,
    quantity: row.quantity,
    hoursUsed: decimalToString(row.hoursUsed),
    hoursDowntime: decimalToString(row.hoursDowntime),
  };
}

export function mapDailyLogVisitor(row: DailyLogVisitor): MappedDailyLogVisitor {
  return {
    id: row.id,
    dailyLogId: row.dailyLogId,
    visitorName: row.visitorName,
    company: row.company,
    purpose: row.purpose,
  };
}

export function mapDailyLogIncident(
  row: DailyLogIncident,
): MappedDailyLogIncident {
  return {
    id: row.id,
    dailyLogId: row.dailyLogId,
    incidentType: row.incidentType,
    description: row.description,
    severity: row.severity,
  };
}

export function mapDailyLogMaterial(
  row: DailyLogMaterial,
): MappedDailyLogMaterial {
  return {
    id: row.id,
    dailyLogId: row.dailyLogId,
    materialType: row.materialType,
    quantity: decimalToString(row.quantity) ?? '0',
    unit: row.unit,
    supplier: row.supplier,
  };
}

export function mapDailyLogDetail(
  row: DailyLog & {
    workforce: DailyLogWorkforce[];
    equipment: DailyLogEquipment[];
    visitors: DailyLogVisitor[];
    incidents: DailyLogIncident[];
    materials: DailyLogMaterial[];
  },
  attachmentFolderId: string | null = null,
): MappedDailyLogDetail {
  return {
    ...mapDailyLog(row),
    attachmentFolderId,
    workforce: row.workforce.map(mapDailyLogWorkforce),
    equipment: row.equipment.map(mapDailyLogEquipment),
    visitors: row.visitors.map(mapDailyLogVisitor),
    incidents: row.incidents.map(mapDailyLogIncident),
    materials: row.materials.map(mapDailyLogMaterial),
  };
}

export function mapMeeting(
  row: Meeting & { _count?: { attendees: number } },
): MappedMeeting {
  return {
    id: row.id,
    projectId: row.projectId,
    organizerId: row.organizerId,
    meetingNumber: row.meetingNumber,
    meetingType: row.meetingType,
    title: row.title,
    meetingDate: toIsoString(row.meetingDate)!,
    startTime: row.startTime,
    endTime: row.endTime,
    location: row.location,
    status: row.status,
    minutesIssuedAt: toIsoString(row.minutesIssuedAt),
    scope: row.scope,
    taskDisciplineId: row.taskDisciplineId,
    designPackageId: row.designPackageId,
    agenda: row.agenda,
    minutes: row.minutes,
    createdBy: row.createdBy,
    attendeeCount: row._count?.attendees,
    createdAt: toIsoString(row.createdAt)!,
    updatedAt: toIsoString(row.updatedAt)!,
  };
}

export function mapMeetingAgendaItem(
  row: MeetingAgendaItem,
): MappedMeetingAgendaItem {
  return {
    id: row.id,
    meetingId: row.meetingId,
    presenterId: row.presenterId,
    itemOrder: row.itemOrder,
    topic: row.topic,
    discussionNotes: row.discussionNotes,
    decisionsMade: row.decisionsMade,
  };
}

export function mapMeetingAttendee(row: MeetingAttendee): MappedMeetingAttendee {
  return {
    id: row.id,
    meetingId: row.meetingId,
    attendeeType: row.userId ? 'INTERNAL' : 'EXTERNAL',
    userId: row.userId,
    externalName: row.externalName,
    organization: row.organization,
    roleAtMeeting: row.roleAtMeeting,
    email: row.email,
    attended: row.attended,
  };
}

export function mapActionItem(
  row: ActionItem & {
    linkedIssue?: { issueNumber: string; status: IssueStatus } | null;
  },
): MappedActionItem {
  return {
    id: row.id,
    meetingId: row.meetingId,
    ownerId: row.ownerId,
    assignedToName: row.assignedToName,
    title: row.title ?? null,
    description: row.description,
    dueDate: toDateString(row.dueDate),
    status: row.status,
    closedAt: toIsoString(row.closedAt),
    completedBy: row.completedBy,
    linkedIssueId: row.linkedIssueId,
    linkedIssueNumber: row.linkedIssue?.issueNumber ?? null,
    linkedIssueStatus: row.linkedIssue?.status ?? null,
    designPackageId: row.designPackageId,
    createdAt: toIsoString(row.createdAt)!,
    createdBy: row.createdBy,
  };
}

export function mapMeetingDetail(
  row: Meeting & {
    agendaItems: MeetingAgendaItem[];
    attendees: MeetingAttendee[];
    actionItems: (ActionItem & {
      linkedIssue?: { issueNumber: string; status: IssueStatus } | null;
    })[];
  },
  attachmentFolderId: string | null = null,
  raisedItems?: {
    raisedRfis: RaisedRfiSummary[];
    raisedIssues: RaisedIssueSummary[];
    raisedChangeRequests: RaisedChangeRequestSummary[];
  },
): MappedMeetingDetail {
  return {
    ...mapMeeting(row),
    attachmentFolderId,
    agendaItems: row.agendaItems.map(mapMeetingAgendaItem),
    attendees: row.attendees.map(mapMeetingAttendee),
    actionItems: row.actionItems.map(mapActionItem),
    raisedRfis: raisedItems?.raisedRfis ?? [],
    raisedIssues: raisedItems?.raisedIssues ?? [],
    raisedChangeRequests: raisedItems?.raisedChangeRequests ?? [],
  };
}

export function mapCorrespondence(
  row: Correspondence & {
    parent?: {
      id: string;
      referenceNumber: string;
      subject: string;
      direction: Correspondence['direction'];
      status: Correspondence['status'];
    } | null;
    responses?: Array<{
      id: string;
      referenceNumber: string;
      subject: string;
      direction: Correspondence['direction'];
      status: Correspondence['status'];
      correspondenceDate: Date;
      senderName: string;
      recipientName: string;
    }>;
    project?: { id: string; name: string; projectCode: string } | null;
  },
  attachmentFolderId: string | null = null,
  raisedItems?: {
    raisedRfis: RaisedRfiSummary[];
    raisedIssues: RaisedIssueSummary[];
    raisedChangeRequests: RaisedChangeRequestSummary[];
  },
  nameLookup?: {
    acknowledgedByName?: string | null;
    createdByName?: string | null;
    sentByName?: string | null;
  },
): MappedCorrespondence {
  return {
    id: row.id,
    companyId: row.companyId,
    projectId: row.projectId,
    projectName: row.project?.name ?? null,
    projectCode: row.project?.projectCode ?? null,
    senderUserId: row.senderUserId,
    recipientUserId: row.recipientUserId,
    referenceNumber: row.referenceNumber,
    correspondenceType: row.correspondenceType,
    direction: row.direction,
    subject: row.subject,
    senderName: row.senderName,
    recipientName: row.recipientName,
    senderCompany: row.senderCompany,
    recipientCompany: row.recipientCompany,
    notes: row.notes,
    correspondenceDate: toDateString(row.correspondenceDate)!,
    status: row.status,
    parentId: row.parentId,
    sentAt: toIsoString(row.sentAt),
    sentBy: row.sentBy,
    sentByName: nameLookup?.sentByName ?? null,
    acknowledgedAt: toIsoString(row.acknowledgedAt),
    acknowledgedBy: row.acknowledgedBy,
    acknowledgedByName: nameLookup?.acknowledgedByName ?? null,
    createdBy: row.createdBy,
    createdByName: nameLookup?.createdByName ?? null,
    attachmentFolderId,
    createdAt: toIsoString(row.createdAt)!,
    updatedAt: toIsoString(row.updatedAt)!,
    parent: row.parent
      ? {
          id: row.parent.id,
          referenceNumber: row.parent.referenceNumber,
          subject: row.parent.subject,
          direction: row.parent.direction,
          status: row.parent.status,
        }
      : null,
    responses: (row.responses ?? []).map((response) => ({
      id: response.id,
      referenceNumber: response.referenceNumber,
      subject: response.subject,
      direction: response.direction,
      status: response.status,
      correspondenceDate: toDateString(response.correspondenceDate)!,
      senderName: response.senderName,
      recipientName: response.recipientName,
    })),
    raisedRfis: raisedItems?.raisedRfis ?? [],
    raisedIssues: raisedItems?.raisedIssues ?? [],
    raisedChangeRequests: raisedItems?.raisedChangeRequests ?? [],
  };
}

export function mapRisk(
  row: Risk,
  attachmentFolderId: string | null = null,
): MappedRisk {
  return {
    id: row.id,
    projectId: row.projectId,
    ownerId: row.ownerId,
    riskIdCode: row.riskIdCode,
    title: row.title,
    description: row.description,
    category: row.category,
    probability: row.probability,
    impact: row.impact,
    riskScore: row.riskScore,
    mitigationPlan: row.mitigationPlan,
    contingencyPlan: row.contingencyPlan,
    reviewDate: toDateString(row.reviewDate),
    status: row.status,
    residualLikelihood: row.residualLikelihood,
    residualImpact: row.residualImpact,
    residualScore: row.residualScore,
    attachmentFolderId,
    createdBy: row.createdBy,
    createdAt: toIsoString(row.createdAt)!,
    updatedAt: toIsoString(row.updatedAt)!,
  };
}

export function mapRiskReview(row: RiskReview): MappedRiskReview {
  return {
    id: row.id,
    riskId: row.riskId,
    reviewedBy: row.reviewedBy,
    reviewedAt: toIsoString(row.reviewedAt)!,
    previousStatus: row.previousStatus,
    newStatus: row.newStatus,
    previousScore: row.previousScore,
    newScore: row.newScore,
    previousResidualScore: row.previousResidualScore,
    newResidualScore: row.newResidualScore,
    notes: row.notes,
    createdAt: toIsoString(row.createdAt)!,
  };
}

export function mapRiskMitigation(
  row: {
    id: string;
    riskId: string;
    attemptNumber: number;
    mitigationStrategy: string;
    residualLikelihood: number;
    residualImpact: number;
    residualScore: number;
    notes: string | null;
    assessedBy: string;
    assessedAt: Date;
    createdAt: Date;
    assessor?: { firstName: string | null; lastName: string | null } | null;
  },
): MappedRiskMitigation {
  const first = row.assessor?.firstName?.trim() ?? '';
  const last = row.assessor?.lastName?.trim() ?? '';
  const assessorName = `${first} ${last}`.trim() || null;
  return {
    id: row.id,
    riskId: row.riskId,
    attemptNumber: row.attemptNumber,
    mitigationStrategy: row.mitigationStrategy,
    residualLikelihood: row.residualLikelihood,
    residualImpact: row.residualImpact,
    residualScore: row.residualScore,
    notes: row.notes,
    assessedBy: row.assessedBy,
    assessorName,
    assessedAt: toIsoString(row.assessedAt)!,
    createdAt: toIsoString(row.createdAt)!,
  };
}

/** Prisma PunchItem row (+ optional project join). `title` is required on the model. */
type PunchItemMapperRow = PunchItem & {
  title: string;
  project?: { name: string; projectCode: string } | null;
};

export function mapPunchItem(
  row: PunchItemMapperRow,
  attachmentFolderId: string | null = null,
): MappedPunchItem {
  return {
    id: row.id,
    companyId: row.companyId,
    projectId: row.projectId,
    raisedBy: row.raisedBy,
    assignedTo: row.assignedTo,
    punchNumber: row.punchNumber,
    title: row.title,
    description: row.description,
    roomOrArea: row.roomOrArea,
    tradeResponsible: row.tradeResponsible,
    category: row.category,
    severity: row.severity,
    status: row.status,
    dueDate: toDateString(row.dueDate),
    resolutionNote: row.resolutionNote,
    correctedAt: toIsoString(row.correctedAt),
    verifiedAt: toIsoString(row.verifiedAt),
    verifiedBy: row.verifiedBy,
    closedAt: toIsoString(row.closedAt),
    closedBy: row.closedBy,
    taskDisciplineId: row.taskDisciplineId,
    designPackageId: row.designPackageId,
    attachmentFolderId,
    projectName: row.project?.name ?? null,
    projectCode: row.project?.projectCode ?? null,
    createdAt: toIsoString(row.createdAt)!,
    updatedAt: toIsoString(row.updatedAt)!,
  };
}

export function mapCloseout(row: Closeout): MappedCloseout {
  return {
    id: row.id,
    projectId: row.projectId,
    practicalCompletionDate: toDateString(row.practicalCompletionDate),
    defectsLiabilityEndDate: toDateString(row.defectsLiabilityEndDate),
    finalCompletionDate: toDateString(row.finalCompletionDate),
    status: row.status,
    contractValue: decimalToString(row.contractValue),
    variationsTotal: decimalToString(row.variationsTotal),
    claimsTotal: decimalToString(row.claimsTotal),
    finalSettlement: decimalToString(row.finalSettlement),
    createdAt: toIsoString(row.createdAt)!,
    updatedAt: toIsoString(row.updatedAt)!,
  };
}

export function mapCloseoutChecklistItem(
  row: CloseoutChecklistItem,
): MappedCloseoutChecklistItem {
  return {
    id: row.id,
    closeoutId: row.closeoutId,
    verifiedBy: row.verifiedBy,
    category: row.category,
    description: row.description,
    isComplete: row.isComplete,
    completedAt: toIsoString(row.completedAt),
  };
}

export function mapWarranty(row: Warranty): MappedWarranty {
  return {
    id: row.id,
    closeoutId: row.closeoutId,
    itemDescription: row.itemDescription,
    supplier: row.supplier,
    startDate: toDateString(row.startDate),
    expiryDate: toDateString(row.expiryDate),
  };
}

export function mapCloseoutDetail(
  row: Closeout & {
    checklistItems: CloseoutChecklistItem[];
    warranties: Warranty[];
  },
): MappedCloseoutDetail {
  return {
    ...mapCloseout(row),
    checklistItems: row.checklistItems.map(mapCloseoutChecklistItem),
    warranties: row.warranties
      .filter((item) => item.deletedAt == null)
      .map(mapWarranty),
  };
}

export interface MappedMilestone {
  id: string;
  projectId: string;
  name: string;
  plannedDate: string | null;
  actualDate: string | null;
  status: string;
  createdAt: string;
  updatedAt: string;
}

export interface MappedTask {
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
  status: Task['status'];
  isCritical: boolean;
  commissionMode: Task['commissionMode'];
  commissioningMethod: string | null;
  requiresArchiving: boolean;
  taskAttributes: Task['taskAttributes'];
  onSiteReceivingTime: string | null;
  assignmentToHqTime: string | null;
  contactFormNumber: string | null;
  designStage: Task['designStage'];
  urgencyLevel: Task['urgencyLevel'];
  hasCustomSchedule: boolean;
  language: Task['language'];
  approvalLevel: Task['approvalLevel'];
  actualCompletionTime: string | null;
  actualWorkdays: number | null;
  completionStatus: Task['completionStatus'];
  remark: string | null;
  computedPlannedWorkDays?: number | null;
  computedActualWorkDays?: number | null;
  createdAt: string;
  updatedAt: string;
}

export interface MappedTaskDiscipline {
  id: string;
  taskId: string;
  companyId: string;
  disciplineId: string | null;
  disciplineName: string;
  disciplineIndex: number | null;
  disciplineNumber: string | null;
  projectedStatus: TaskDiscipline['projectedStatus'];
  designerName: string | null;
  reviewerName: string | null;
  disciplinaryLeader: string | null;
  deptChiefEngineer: string | null;
  disciplineOwnerName: string | null;
  designerUserId: string | null;
  ownerUserId: string | null;
  reviewerUserId: string | null;
  disciplineLeadUserId: string | null;
  chiefUserId: string | null;
  instituteChiefUserId: string | null;
  supportingDesignerUserId: string | null;
  instituteChief: { id: string; name: string } | null;
  supportingDesigner: { id: string; name: string } | null;
  isClosed: boolean;
  closedAt: string | null;
  closedBy: string | null;
  actualCompletionTime: string | null;
  createdAt: string;
  createdBy: string;
  updatedAt: string;
  updatedBy: string;
}

export interface MappedProjectTaskDiscipline extends MappedTaskDiscipline {
  taskName: string;
  overseasTaskNumber: string | null;
}

export interface MappedTaskDependency {
  id: string;
  predecessorTaskId: string;
  successorTaskId: string;
  dependencyType: TaskDependency['dependencyType'];
  lagDays: number;
  createdAt: string;
}

export interface MappedRfi {
  id: string;
  companyId: string;
  projectId: string;
  projectName?: string | null;
  projectCode?: string | null;
  taskDisciplineId: string | null;
  raisedBy: string;
  raisedByName?: string | null;
  assignedTo: string | null;
  assignedToName?: string | null;
  rfiNumber: string;
  title: string;
  description: string | null;
  discipline: string | null;
  priority: Rfi['priority'];
  status: Rfi['status'];
  rfiSource: Rfi['rfiSource'];
  dateRaised: string | null;
  dueDate: string | null;
  dateAnswered: string | null;
  linkedDesignPackageId: string | null;
  linkedCrId: string | null;
  linkedCrIds: string[];
  linkedCrNumber?: string | null;
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
  sourceEntityType: string | null;
  sourceEntityId: string | null;
  sourceEntitySummary?: SourceEntitySummary | null;
  createdAt: string;
  updatedAt: string;
  attachmentFolderId?: string | null;
}

export interface MappedRfiResponse {
  id: string;
  rfiId: string;
  respondedBy: string;
  respondedByName?: string | null;
  responseText: string;
  responseDocumentId: string | null;
  responseDocumentName?: string | null;
  respondedAt: string;
  createdAt: string;
}

export interface MappedIssue {
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
  severity: Issue['severity'];
  status: Issue['status'];
  dueDate: string | null;
  resolvedAt: string | null;
  resolvedBy: string | null;
  resolvedByName?: string | null;
  resolutionNote: string | null;
  reopenedAt: string | null;
  reopenedBy: string | null;
  reopenedByName?: string | null;
  linkedDesignPackageId: string | null;
  linkedCrIds: string[];
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
  sourceEntityType: string | null;
  sourceEntityId: string | null;
  sourceEntitySummary?: SourceEntitySummary | null;
  createdAt: string;
  updatedAt: string;
  attachmentFolderId?: string | null;
}

export interface MappedIssueResponse {
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

/**
 * Maps a Prisma Milestone row to the API response shape.
 */
export function mapMilestone(milestone: Milestone): MappedMilestone {
  return {
    id: milestone.id,
    projectId: milestone.projectId,
    name: milestone.name,
    plannedDate: toDateString(milestone.plannedDate),
    actualDate: toDateString(milestone.actualDate),
    status: milestone.status,
    createdAt: toIsoString(milestone.createdAt)!,
    updatedAt: toIsoString(milestone.updatedAt)!,
  };
}

/**
 * Maps a Prisma Task row to the API response shape.
 */
export function mapTask(task: Task): MappedTask {
  return {
    id: task.id,
    projectId: task.projectId,
    milestoneId: task.milestoneId,
    parentTaskId: task.parentTaskId,
    dispatcherUserId: task.dispatcherUserId,
    supervisingChiefUserId: task.supervisingChiefUserId,
    assignedPersonUserId: task.assignedPersonUserId,
    taskIdCode: task.taskIdCode,
    overseasTaskNumber: task.overseasTaskNumber,
    name: task.name,
    nameZh: task.nameZh,
    description: task.description,
    startDate: toDateString(task.startDate),
    finishDate: toDateString(task.finishDate),
    durationDays: task.durationDays,
    progressPct: task.progressPct,
    status: task.status,
    isCritical: task.isCritical,
    commissionMode: task.commissionMode,
    commissioningMethod: task.commissioningMethod,
    requiresArchiving: task.requiresArchiving,
    taskAttributes: task.taskAttributes,
    onSiteReceivingTime: toIsoString(task.onSiteReceivingTime),
    assignmentToHqTime: toIsoString(task.assignmentToHqTime),
    contactFormNumber: task.contactFormNumber,
    designStage: task.designStage,
    urgencyLevel: task.urgencyLevel,
    hasCustomSchedule: task.hasCustomSchedule,
    language: task.language,
    approvalLevel: task.approvalLevel,
    actualCompletionTime: toIsoString(task.actualCompletionTime),
    actualWorkdays: task.actualWorkdays,
    completionStatus: task.completionStatus,
    remark: task.remark,
    createdAt: toIsoString(task.createdAt)!,
    updatedAt: toIsoString(task.updatedAt)!,
  };
}

type TaskDisciplineUserSummary = {
  id: string;
  firstName: string;
  middleName?: string | null;
  lastName: string;
  chineseName?: string | null;
};

type TaskDisciplineWithUsers = TaskDiscipline & {
  instituteChiefUser?: TaskDisciplineUserSummary | null;
  supportingDesignerUser?: TaskDisciplineUserSummary | null;
};

function mapDisciplineUserSummary(
  user: TaskDisciplineUserSummary | null | undefined,
): { id: string; name: string } | null {
  if (!user) {
    return null;
  }
  return { id: user.id, name: formatUserDisplayName(user) };
}

/**
 * Maps a Prisma TaskDiscipline row to the API response shape.
 */
export function mapTaskDiscipline(
  discipline: TaskDisciplineWithUsers,
  overseasTaskNumber?: string | null,
): MappedTaskDiscipline {
  return {
    id: discipline.id,
    taskId: discipline.taskId,
    companyId: discipline.companyId,
    disciplineId: discipline.disciplineId,
    disciplineName: discipline.disciplineName,
    disciplineIndex: discipline.disciplineIndex,
    disciplineNumber: formatDisciplineNumber(
      overseasTaskNumber ?? null,
      discipline.disciplineIndex,
    ),
    projectedStatus: discipline.projectedStatus,
    designerName: discipline.designerName,
    reviewerName: discipline.reviewerName,
    disciplinaryLeader: discipline.disciplinaryLeader,
    deptChiefEngineer: discipline.deptChiefEngineer,
    disciplineOwnerName: discipline.disciplineOwnerName,
    designerUserId: discipline.designerUserId,
    ownerUserId: discipline.ownerUserId,
    reviewerUserId: discipline.reviewerUserId,
    disciplineLeadUserId: discipline.disciplineLeadUserId,
    chiefUserId: discipline.chiefUserId,
    instituteChiefUserId: discipline.instituteChiefUserId,
    supportingDesignerUserId: discipline.supportingDesignerUserId,
    instituteChief: mapDisciplineUserSummary(discipline.instituteChiefUser),
    supportingDesigner: mapDisciplineUserSummary(discipline.supportingDesignerUser),
    isClosed: discipline.isClosed,
    closedAt: toIsoString(discipline.closedAt),
    closedBy: discipline.closedBy,
    actualCompletionTime: toIsoString(discipline.actualCompletionTime),
    createdAt: toIsoString(discipline.createdAt)!,
    createdBy: discipline.createdBy,
    updatedAt: toIsoString(discipline.updatedAt)!,
    updatedBy: discipline.updatedBy,
  };
}

/**
 * Maps a Prisma TaskDependency row to the API response shape.
 */
export function mapTaskDependency(
  dependency: TaskDependency,
): MappedTaskDependency {
  return {
    id: dependency.id,
    predecessorTaskId: dependency.predecessorTaskId,
    successorTaskId: dependency.successorTaskId,
    dependencyType: dependency.dependencyType,
    lagDays: dependency.lagDays,
    createdAt: toIsoString(dependency.createdAt)!,
  };
}

/**
 * Maps a Prisma Rfi row to the API response shape.
 */
export function mapRfi(rfi: Rfi): MappedRfi {
  return {
    id: rfi.id,
    companyId: rfi.companyId,
    projectId: rfi.projectId,
    taskDisciplineId: rfi.taskDisciplineId,
    raisedBy: rfi.raisedBy,
    assignedTo: rfi.assignedTo,
    rfiNumber: rfi.rfiNumber,
    title: rfi.title,
    description: rfi.description,
    discipline: rfi.discipline,
    priority: rfi.priority,
    status: rfi.status,
    rfiSource: rfi.rfiSource,
    dateRaised: toDateString(rfi.dateRaised),
    dueDate: toDateString(rfi.dueDate),
    dateAnswered: toDateString(rfi.dateAnswered),
    linkedDesignPackageId: rfi.linkedDesignPackageId,
    linkedCrId: rfi.linkedCrId,
    linkedCrIds: rfi.linkedCrIds ?? [],
    sourceEntityType: rfi.sourceEntityType,
    sourceEntityId: rfi.sourceEntityId,
    createdAt: toIsoString(rfi.createdAt)!,
    updatedAt: toIsoString(rfi.updatedAt)!,
  };
}

/**
 * Maps a Prisma RfiResponse row to the API response shape.
 */
export function mapRfiResponse(
  response: RfiResponse & {
    responseDocument?: { name: string } | null;
  },
): MappedRfiResponse {
  return {
    id: response.id,
    rfiId: response.rfiId,
    respondedBy: response.respondedBy,
    responseText: response.responseText,
    responseDocumentId: response.responseDocumentId ?? null,
    responseDocumentName: response.responseDocument?.name ?? null,
    respondedAt: toIsoString(response.respondedAt)!,
    createdAt: toIsoString(response.createdAt)!,
  };
}

/**
 * Maps a Prisma Issue row to the API response shape.
 */
export function mapIssue(issue: Issue): MappedIssue {
  return {
    id: issue.id,
    companyId: issue.companyId,
    projectId: issue.projectId,
    taskDisciplineId: issue.taskDisciplineId,
    raisedBy: issue.raisedBy,
    assignedTo: issue.assignedTo,
    issueNumber: issue.issueNumber,
    issueType: issue.issueType,
    description: issue.description,
    location: issue.location,
    severity: issue.severity,
    status: issue.status,
    dueDate: toDateString(issue.dueDate),
    resolvedAt: toIsoString(issue.resolvedAt),
    resolvedBy: issue.resolvedBy,
    resolutionNote: issue.resolutionNote,
    reopenedAt: toIsoString(issue.reopenedAt),
    reopenedBy: issue.reopenedBy,
    linkedDesignPackageId: issue.linkedDesignPackageId,
    linkedCrIds: issue.linkedCrIds ?? [],
    sourceEntityType: issue.sourceEntityType,
    sourceEntityId: issue.sourceEntityId,
    createdAt: toIsoString(issue.createdAt)!,
    updatedAt: toIsoString(issue.updatedAt)!,
  };
}

/**
 * Maps a Prisma IssueResponse row to the API response shape.
 */
export function mapIssueResponse(
  response: IssueResponse & {
    responseDocument?: { name: string } | null;
  },
): MappedIssueResponse {
  return {
    id: response.id,
    issueId: response.issueId,
    respondedBy: response.respondedBy,
    responseText: response.responseText,
    responseDocumentId: response.responseDocumentId ?? null,
    responseDocumentName: response.responseDocument?.name ?? null,
    respondedAt: toIsoString(response.respondedAt)!,
    createdAt: toIsoString(response.createdAt)!,
  };
}

export interface AffectedEdvSnapshotItem {
  id: string;
  title: string;
  revisionLabel: string;
}

export interface MappedProjectChangeRequest {
  id: string;
  companyId: string;
  projectId: string;
  changeNumber: string;
  title: string;
  description: string | null;
  status: string;
  sourceType: string;
  sourceEntityId: string | null;
  sourceEntityType?: string | null;
  originEntityId?: string | null;
  sourceEntitySummary?: SourceEntitySummary | null;
  externalReviewTriggerId: string | null;
  linkedDesignPackageId: string | null;
  linkedDesignPackage?: {
    id: string;
    packageCode: string;
    name: string;
  } | null;
  changeReason: string | null;
  attachmentFolderId: string | null;
  assignedTo: string | null;
  affectedEdvIds: string[];
  affectedEdvSnapshot: AffectedEdvSnapshotItem[];
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  approvedBy: string | null;
  approvedAt: string | null;
}

export interface MappedDeliverable {
  id: string;
  companyId: string;
  projectId: string;
  taskDisciplineId: string | null;
  taskDisciplineName: string | null;
  designPackageId: string | null;
  designPackageName: string | null;
  engineeringDocumentId: string | null;
  name: string;
  status: string;
  dueDate: string | null;
  createdAt: string;
  updatedAt: string;
}

/**
 * Maps a Prisma ProjectChangeRequest row to the API response shape.
 */
export function mapProjectChangeRequest(
  row: ProjectChangeRequest,
): MappedProjectChangeRequest {
  const approved =
    row.status === 'APPROVED'
      ? { approvedBy: row.updatedBy, approvedAt: toIsoString(row.updatedAt) }
      : { approvedBy: null, approvedAt: null };

  const snapshotRaw = row.affectedEdvSnapshot;
  const affectedEdvSnapshot: AffectedEdvSnapshotItem[] = Array.isArray(
    snapshotRaw,
  )
    ? (snapshotRaw as unknown as AffectedEdvSnapshotItem[])
    : [];

  return {
    id: row.id,
    companyId: row.companyId,
    projectId: row.projectId,
    changeNumber: row.changeNumber,
    title: row.title,
    description: row.description,
    status: row.status,
    sourceType: row.sourceType,
    sourceEntityId: row.sourceEntityId,
    externalReviewTriggerId: row.externalReviewTriggerId,
    linkedDesignPackageId: row.linkedDesignPackageId,
    changeReason: row.changeReason,
    attachmentFolderId: row.attachmentFolderId,
    assignedTo: row.assignedTo,
    affectedEdvIds: row.affectedEdvIds ?? [],
    affectedEdvSnapshot,
    createdBy: row.createdBy,
    createdAt: toIsoString(row.createdAt)!,
    updatedAt: toIsoString(row.updatedAt)!,
    ...approved,
  };
}

type DeliverableWithRelations = Deliverable & {
  taskDiscipline?: { id: string; disciplineName: string } | null;
  designPackage?: { id: string; name: string } | null;
};

/**
 * Maps a Prisma Deliverable row to the API response shape.
 */
export function mapDeliverable(row: DeliverableWithRelations): MappedDeliverable {
  return {
    id: row.id,
    companyId: row.companyId,
    projectId: row.projectId,
    taskDisciplineId: row.taskDisciplineId,
    taskDisciplineName: row.taskDiscipline?.disciplineName ?? null,
    designPackageId: row.designPackageId,
    designPackageName: row.designPackage?.name ?? null,
    engineeringDocumentId: row.engineeringDocumentId,
    name: row.name,
    status: row.status,
    dueDate: toDateString(row.dueDate),
    createdAt: toIsoString(row.createdAt)!,
    updatedAt: toIsoString(row.updatedAt)!,
  };
}
