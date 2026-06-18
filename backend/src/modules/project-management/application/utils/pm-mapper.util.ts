import {
  ActionItem,
  Closeout,
  CloseoutChecklistItem,
  Correspondence,
  DailyLog,
  DailyLogEquipment,
  DailyLogIncident,
  DailyLogVisitor,
  DailyLogWorkforce,
  Drawing,
  DrawingLink,
  DrawingVersion,
  Issue,
  Meeting,
  MeetingAgendaItem,
  MeetingAttendee,
  Milestone,
  Prisma,
  Project,
  ProjectTeam,
  PunchItem,
  Rfi,
  RfiResponse,
  Risk,
  Submittal,
  SubmittalReview,
  Task,
  TaskDependency,
  TaskDiscipline,
  Warranty,
} from '@prisma/client';

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
  location: string | null;
  projectType: Project['projectType'];
  contractType: string | null;
  status: Project['status'];
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

export interface MappedProjectTeamMember {
  id: string;
  projectId: string;
  userId: string;
  roleOnProject: string;
  assignedFrom: string | null;
  assignedTo: string | null;
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
    location: project.location,
    projectType: project.projectType,
    contractType: project.contractType,
    status: project.status,
    startDate: toDateString(project.startDate),
    plannedFinishDate: toDateString(project.plannedFinishDate),
    actualFinishDate: toDateString(project.actualFinishDate),
    budget: decimalToString(project.budget),
    currency: project.currency,
    projectManagerId: project.projectManagerId,
    client: project.client,
    commissioningMethod: project.commissioningMethod,
    responsibleDepartmentId: project.responsibleDepartmentId,
    designProperties: project.designProperties,
    designStage: project.designStage,
    responsiblePersonId: project.responsiblePersonId,
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
    roleOnProject: member.roleOnProject,
    assignedFrom: toDateString(member.assignedFrom),
    assignedTo: toDateString(member.assignedTo),
    createdAt: toIsoString(member.createdAt)!,
    updatedAt: toIsoString(member.updatedAt)!,
  };
}

export interface MappedSubmittal {
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
  status: Submittal['status'];
  submissionDate: string | null;
  dueDate: string | null;
  reviewDate: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface MappedSubmittalReview {
  id: string;
  submittalId: string;
  reviewedBy: string;
  revisionNumber: number;
  status: SubmittalReview['status'];
  comments: string | null;
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

export interface MappedDailyLogDetail extends MappedDailyLog {
  workforce: MappedDailyLogWorkforce[];
  equipment: MappedDailyLogEquipment[];
  visitors: MappedDailyLogVisitor[];
  incidents: MappedDailyLogIncident[];
}

export interface MappedMeeting {
  id: string;
  projectId: string;
  organizerId: string;
  meetingNumber: string;
  meetingType: Meeting['meetingType'];
  title: string;
  meetingDate: string;
  location: string | null;
  status: Meeting['status'];
  minutesIssuedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface MappedMeetingAgendaItem {
  id: string;
  meetingId: string;
  presenterId: string | null;
  itemOrder: number;
  topic: string;
  discussionNotes: string | null;
  decisionsMade: string | null;
}

export interface MappedMeetingAttendee {
  id: string;
  meetingId: string;
  userId: string | null;
  externalName: string | null;
  organization: string | null;
  roleAtMeeting: string | null;
  attended: boolean;
}

export interface MappedActionItem {
  id: string;
  meetingId: string;
  ownerId: string;
  description: string;
  dueDate: string | null;
  status: string;
  closedAt: string | null;
}

export interface MappedMeetingDetail extends MappedMeeting {
  agendaItems: MappedMeetingAgendaItem[];
  attendees: MappedMeetingAttendee[];
  actionItems: MappedActionItem[];
}

export interface MappedCorrespondence {
  id: string;
  projectId: string;
  senderUserId: string | null;
  referenceNumber: string;
  correspondenceType: Correspondence['correspondenceType'];
  subject: string;
  senderName: string;
  recipientName: string;
  correspondenceDate: string;
  status: Correspondence['status'];
  createdAt: string;
  updatedAt: string;
}

export interface MappedRisk {
  id: string;
  projectId: string;
  ownerId: string;
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
  createdAt: string;
  updatedAt: string;
}

export interface MappedPunchItem {
  id: string;
  projectId: string;
  raisedBy: string;
  assignedTo: string | null;
  punchNumber: string;
  description: string;
  roomOrArea: string | null;
  tradeResponsible: string | null;
  severity: PunchItem['severity'];
  status: PunchItem['status'];
  dueDate: string | null;
  correctedAt: string | null;
  verifiedAt: string | null;
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

export function mapSubmittal(row: Submittal): MappedSubmittal {
  return {
    id: row.id,
    projectId: row.projectId,
    submittedBy: row.submittedBy,
    reviewedBy: row.reviewedBy,
    submittalNumber: row.submittalNumber,
    category: row.category,
    title: row.title,
    contractor: row.contractor,
    supplier: row.supplier,
    specReference: row.specReference,
    revisionNumber: row.revisionNumber,
    status: row.status,
    submissionDate: toDateString(row.submissionDate),
    dueDate: toDateString(row.dueDate),
    reviewDate: toDateString(row.reviewDate),
    createdAt: toIsoString(row.createdAt)!,
    updatedAt: toIsoString(row.updatedAt)!,
  };
}

export function mapSubmittalReview(row: SubmittalReview): MappedSubmittalReview {
  return {
    id: row.id,
    submittalId: row.submittalId,
    reviewedBy: row.reviewedBy,
    revisionNumber: row.revisionNumber,
    status: row.status,
    comments: row.comments,
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

export function mapDailyLog(row: DailyLog): MappedDailyLog {
  return {
    id: row.id,
    projectId: row.projectId,
    siteEngineerId: row.siteEngineerId,
    logDate: toDateString(row.logDate)!,
    shift: row.shift,
    weatherCondition: row.weatherCondition,
    temperatureC: decimalToString(row.temperatureC),
    rainfallMm: decimalToString(row.rainfallMm),
    workSummary: row.workSummary,
    status: row.status,
    createdAt: toIsoString(row.createdAt)!,
    updatedAt: toIsoString(row.updatedAt)!,
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

export function mapDailyLogDetail(
  row: DailyLog & {
    workforce: DailyLogWorkforce[];
    equipment: DailyLogEquipment[];
    visitors: DailyLogVisitor[];
    incidents: DailyLogIncident[];
  },
): MappedDailyLogDetail {
  return {
    ...mapDailyLog(row),
    workforce: row.workforce.map(mapDailyLogWorkforce),
    equipment: row.equipment.map(mapDailyLogEquipment),
    visitors: row.visitors.map(mapDailyLogVisitor),
    incidents: row.incidents.map(mapDailyLogIncident),
  };
}

export function mapMeeting(row: Meeting): MappedMeeting {
  return {
    id: row.id,
    projectId: row.projectId,
    organizerId: row.organizerId,
    meetingNumber: row.meetingNumber,
    meetingType: row.meetingType,
    title: row.title,
    meetingDate: toIsoString(row.meetingDate)!,
    location: row.location,
    status: row.status,
    minutesIssuedAt: toIsoString(row.minutesIssuedAt),
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
    userId: row.userId,
    externalName: row.externalName,
    organization: row.organization,
    roleAtMeeting: row.roleAtMeeting,
    attended: row.attended,
  };
}

export function mapActionItem(row: ActionItem): MappedActionItem {
  return {
    id: row.id,
    meetingId: row.meetingId,
    ownerId: row.ownerId,
    description: row.description,
    dueDate: toDateString(row.dueDate),
    status: row.status,
    closedAt: toIsoString(row.closedAt),
  };
}

export function mapMeetingDetail(
  row: Meeting & {
    agendaItems: MeetingAgendaItem[];
    attendees: MeetingAttendee[];
    actionItems: ActionItem[];
  },
): MappedMeetingDetail {
  return {
    ...mapMeeting(row),
    agendaItems: row.agendaItems.map(mapMeetingAgendaItem),
    attendees: row.attendees.map(mapMeetingAttendee),
    actionItems: row.actionItems.map(mapActionItem),
  };
}

export function mapCorrespondence(row: Correspondence): MappedCorrespondence {
  return {
    id: row.id,
    projectId: row.projectId,
    senderUserId: row.senderUserId,
    referenceNumber: row.referenceNumber,
    correspondenceType: row.correspondenceType,
    subject: row.subject,
    senderName: row.senderName,
    recipientName: row.recipientName,
    correspondenceDate: toDateString(row.correspondenceDate)!,
    status: row.status,
    createdAt: toIsoString(row.createdAt)!,
    updatedAt: toIsoString(row.updatedAt)!,
  };
}

export function mapRisk(row: Risk): MappedRisk {
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
    createdAt: toIsoString(row.createdAt)!,
    updatedAt: toIsoString(row.updatedAt)!,
  };
}

export function mapPunchItem(row: PunchItem): MappedPunchItem {
  return {
    id: row.id,
    projectId: row.projectId,
    raisedBy: row.raisedBy,
    assignedTo: row.assignedTo,
    punchNumber: row.punchNumber,
    description: row.description,
    roomOrArea: row.roomOrArea,
    tradeResponsible: row.tradeResponsible,
    severity: row.severity,
    status: row.status,
    dueDate: toDateString(row.dueDate),
    correctedAt: toIsoString(row.correctedAt),
    verifiedAt: toIsoString(row.verifiedAt),
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
  assignedTo: string | null;
  taskIdCode: string;
  name: string;
  description: string | null;
  startDate: string | null;
  finishDate: string | null;
  durationDays: number | null;
  progressPct: number;
  status: Task['status'];
  isCritical: boolean;
  commissioningMethod: string | null;
  requiresArchiving: boolean;
  taskAttributes: string | null;
  onSiteReceivingTime: string | null;
  assignmentToHqTime: string | null;
  contactFormNumber: string | null;
  designStage: string | null;
  urgencyLevel: Task['urgencyLevel'];
  hasCustomSchedule: boolean;
  language: Task['language'];
  approvalLevel: Task['approvalLevel'];
  chiefEngineerName: string | null;
  dispatcherName: string | null;
  responsiblePersonId: string | null;
  actualCompletionTime: string | null;
  actualWorkdays: number | null;
  completionStatus: Task['completionStatus'];
  remark: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface MappedTaskDiscipline {
  id: string;
  taskId: string;
  companyId: string;
  disciplineName: string;
  projectedStatus: TaskDiscipline['projectedStatus'];
  designerName: string | null;
  reviewerName: string | null;
  disciplinaryLeader: string | null;
  deptChiefEngineer: string | null;
  instituteChiefEngineer: string | null;
  designerUserId: string | null;
  reviewerUserId: string | null;
  disciplineLeadUserId: string | null;
  chiefUserId: string | null;
  actualCompletionTime: string | null;
  deptReviewTime: string | null;
  instituteReviewTime: string | null;
  createdAt: string;
  createdBy: string;
  updatedAt: string;
  updatedBy: string;
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
  projectId: string;
  raisedBy: string;
  assignedTo: string | null;
  rfiNumber: string;
  title: string;
  description: string | null;
  discipline: string | null;
  priority: Rfi['priority'];
  status: Rfi['status'];
  dateRaised: string | null;
  dueDate: string | null;
  dateAnswered: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface MappedRfiResponse {
  id: string;
  rfiId: string;
  respondedBy: string;
  responseText: string;
  respondedAt: string;
  createdAt: string;
}

export interface MappedIssue {
  id: string;
  projectId: string;
  raisedBy: string;
  assignedTo: string | null;
  issueNumber: string;
  issueType: string;
  description: string;
  location: string | null;
  severity: Issue['severity'];
  status: Issue['status'];
  dueDate: string | null;
  resolvedAt: string | null;
  verifiedAt: string | null;
  createdAt: string;
  updatedAt: string;
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
    assignedTo: task.assignedTo,
    taskIdCode: task.taskIdCode,
    name: task.name,
    description: task.description,
    startDate: toDateString(task.startDate),
    finishDate: toDateString(task.finishDate),
    durationDays: task.durationDays,
    progressPct: task.progressPct,
    status: task.status,
    isCritical: task.isCritical,
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
    chiefEngineerName: task.chiefEngineerName,
    dispatcherName: task.dispatcherName,
    responsiblePersonId: task.responsiblePersonId,
    actualCompletionTime: toIsoString(task.actualCompletionTime),
    actualWorkdays: task.actualWorkdays,
    completionStatus: task.completionStatus,
    remark: task.remark,
    createdAt: toIsoString(task.createdAt)!,
    updatedAt: toIsoString(task.updatedAt)!,
  };
}

/**
 * Maps a Prisma TaskDiscipline row to the API response shape.
 */
export function mapTaskDiscipline(
  discipline: TaskDiscipline,
): MappedTaskDiscipline {
  return {
    id: discipline.id,
    taskId: discipline.taskId,
    companyId: discipline.companyId,
    disciplineName: discipline.disciplineName,
    projectedStatus: discipline.projectedStatus,
    designerName: discipline.designerName,
    reviewerName: discipline.reviewerName,
    disciplinaryLeader: discipline.disciplinaryLeader,
    deptChiefEngineer: discipline.deptChiefEngineer,
    instituteChiefEngineer: discipline.instituteChiefEngineer,
    designerUserId: discipline.designerUserId,
    reviewerUserId: discipline.reviewerUserId,
    disciplineLeadUserId: discipline.disciplineLeadUserId,
    chiefUserId: discipline.chiefUserId,
    actualCompletionTime: toIsoString(discipline.actualCompletionTime),
    deptReviewTime: toIsoString(discipline.deptReviewTime),
    instituteReviewTime: toIsoString(discipline.instituteReviewTime),
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
    projectId: rfi.projectId,
    raisedBy: rfi.raisedBy,
    assignedTo: rfi.assignedTo,
    rfiNumber: rfi.rfiNumber,
    title: rfi.title,
    description: rfi.description,
    discipline: rfi.discipline,
    priority: rfi.priority,
    status: rfi.status,
    dateRaised: toDateString(rfi.dateRaised),
    dueDate: toDateString(rfi.dueDate),
    dateAnswered: toDateString(rfi.dateAnswered),
    createdAt: toIsoString(rfi.createdAt)!,
    updatedAt: toIsoString(rfi.updatedAt)!,
  };
}

/**
 * Maps a Prisma RfiResponse row to the API response shape.
 */
export function mapRfiResponse(response: RfiResponse): MappedRfiResponse {
  return {
    id: response.id,
    rfiId: response.rfiId,
    respondedBy: response.respondedBy,
    responseText: response.responseText,
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
    projectId: issue.projectId,
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
    verifiedAt: toIsoString(issue.verifiedAt),
    createdAt: toIsoString(issue.createdAt)!,
    updatedAt: toIsoString(issue.updatedAt)!,
  };
}
