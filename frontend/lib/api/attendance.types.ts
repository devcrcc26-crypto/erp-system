export type MatchConfidence =
  | 'IDENTITY'
  | 'ID_MATCH'
  | 'NAME_HIGH'
  | 'NAME_REVIEW'
  | 'MAPPED_INACTIVE'
  | 'MANUAL'
  | 'NO_MATCH'
  | 'IGNORED';

export type AttendanceMode = 'SCANNER' | 'EXEMPT';

export type AttendanceIdentityStatus = 'MAPPED' | 'IGNORED';

export type AttendanceMatchMethod =
  | 'IDENTITY'
  | 'EMPLOYEE_ID'
  | 'NAME_HIGH'
  | 'NAME_REVIEW'
  | 'MANUAL'
  | 'EXEMPT'
  | 'MANUAL_PRESENT'
  | 'NEEDS_ENROLMENT';

export type AttendanceMissingResolution =
  | 'PENDING'
  | 'MARKED_EXEMPT'
  | 'MANUAL_PRESENT'
  | 'NEEDS_ENROLMENT';

export type AttendanceUnmatchedStatus = 'UNMATCHED' | 'IGNORED';

export type AttendanceDayFlag =
  | 'MISSING_CLOCK_IN'
  | 'MISSING_CLOCK_OUT'
  | 'EARLY_LEAVE'
  | 'ON_LEAVE_BUT_SCANNED'
  | 'SCAN_AFTER_SEPARATION'
  | 'NONE';

export type AttendanceMonthStatus =
  | 'PENDING_REVIEW'
  | 'REVIEWED'
  | 'APPROVED'
  | 'UNLOCKED';

export interface AttendanceDailyLogCorrection {
  id: string;
  dailyLogId: string;
  correctedBy: string;
  originalClockInLocal: string | null;
  originalClockOutLocal: string | null;
  correctedClockInLocal: string | null;
  correctedClockOutLocal: string | null;
  correctionNote: string;
  correctedAt: string;
  corrector?: {
    id: string;
    firstName: string;
    lastName: string;
  };
}

export interface AttendanceFieldMovementEntryLink {
  id: string;
  reason: string;
  destination?: string | null;
  departureTime?: string | null;
  returnTime?: string | null;
  notes?: string | null;
  log: {
    id: string;
    status: string;
    requestNumber: string;
  };
}

export interface AttendanceDailyLog {
  id: string;
  attendanceRecordId: string;
  date: string;
  clockInMachine: string | null;
  clockOutMachine: string | null;
  clockInLocal: string | null;
  clockOutLocal: string | null;
  isHoliday: boolean;
  holidayName: string | null;
  isWeekend: boolean;
  isHalfDay: boolean;
  wasPresent: boolean;
  scheduledHours: number;
  recordedHours: number | null;
  isLate: boolean;
  lateMinutes: number;
  missingClockIn: boolean;
  missingClockOut: boolean;
  isEarlyLeave?: boolean;
  earlyLeaveMinutes?: number;
  earlyDepartureBand?: string | null;
  earlyDepartureWouldDeduct?: number;
  flag: AttendanceDayFlag;
  flagResolved: boolean;
  flagResolvedAt: string | null;
  correctedClockInLocal: string | null;
  correctedClockOutLocal: string | null;
  isLastExportDay: boolean;
  dayStatus?:
    | 'PRESENT'
    | 'ABSENT'
    | 'HALF_ABSENT'
    | 'SUNDAY'
    | 'DAY_OFF'
    | 'WORKED_ON_DAY_OFF'
    | 'HOLIDAY'
    | 'WORK_FROM_HOME'
    | 'ON_SITE'
    | 'LEAVE'
    | 'UNPAID_LEAVE'
    | 'FIELD_MOVEMENT_PENDING'
    | 'ENROLMENT_GRACE'
    | 'NOT_EMPLOYED'
    | 'INACTIVE';
  dayDeduction?: number;
  siteAssignmentName?: string | null;
  corrections?: AttendanceDailyLogCorrection[];
  fieldMovementEntries?: AttendanceFieldMovementEntryLink[];
}

export interface AttendanceRecord {
  id: string;
  companyId: string;
  employeeId: string;
  importBatchId: string;
  month: number;
  year: number;
  scheduledDays: number;
  presentDays: number;
  absentDays: number;
  paidDays?: number;
  unpaidLeaveDays?: number;
  holidayDays: number;
  lateDays: number;
  totalLateMinutes: number;
  missingClockInDays: number;
  missingClockOutDays: number;
  payableHours: number;
  flaggedDays: number;
  resolvedDays: number;
  earlyLeaveDays?: number;
  earlyDepartureCount?: number;
  earlyDepartureDeductedDays?: number;
  earlyDepartureWouldDeductDays?: number;
  earlyDepartureWouldDeductNote?: string | null;
  forgotToClockCount?: number;
  forgotToClockFlagThreshold?: number;
  approvedFieldMovementCount?: number;
  attendanceRate: number | null;
  importedAt: string;
  employee: {
    id: string;
    firstName: string;
    middleName?: string | null;
    lastName: string;
    chineseName?: string | null;
    employeeId: string | null;
    departmentId?: string | null;
    department: { id: string; name: string } | null;
  };
  importBatch: {
    id: string;
    fileName: string;
    importedAt: string;
  };
  dailyLogs?: AttendanceDailyLog[];
  approvedLeave?: Array<{
    id: string;
    leaveType: string;
    days: number;
    periods: Array<{
      startDate: string;
      endDate: string;
      days: number;
    }>;
  }>;
  leaveDaysThisMonth?: number;
  siteDaysThisMonth?: Array<{ siteName: string; days: number }>;
  workFromHomeDaysThisMonth?: number;
  matchMethod?: string;
}

export interface AttendanceListParams {
  month?: number;
  year?: number;
  employeeId?: string;
  search?: string;
  page?: number;
  limit?: number;
}

export interface AttendanceListResponse {
  data: AttendanceRecord[];
  total: number;
  page: number;
  limit: number;
}

export interface AttendanceImportBatch {
  id: string;
  month: number;
  year: number;
  fileName: string;
  importedAt: string;
  totalRows: number;
  matchedRows: number;
  reviewRows: number;
  rejectedRows: number;
  importer: {
    id: string;
    firstName: string;
    lastName: string;
  };
  _count: { records: number };
}

export interface AttendancePreviewDaily {
  date: string;
  clockInMachine: string | null;
  clockOutMachine: string | null;
  clockInLocal: string | null;
  clockOutLocal: string | null;
}

export interface AttendancePreviewRow {
  attendanceName: string;
  attendanceId: string;
  matchedEmployeeId: string | null;
  matchedEmployeeName: string | null;
  matchedEmployeeErpId: string | null;
  confidence: MatchConfidence;
  score: number | null;
  identityId?: string | null;
  matchNote?: string | null;
  data: {
    payableHours: number;
    dailyData: AttendancePreviewDaily[];
  };
}

/** Active SCANNER ERP employee with no row in the uploaded attendance file. */
export interface AttendanceMissingEmployee {
  id: string;
  name: string;
  employeeId: string | null;
  departmentName: string | null;
  attendanceMode: AttendanceMode | string;
  /** nth consecutive month not enrolled (2 = second month); absent the first time. */
  notEnrolledMonth?: number;
  /** Pre-selected resolution for the preview. */
  suggestedResolution?: 'NEEDS_ENROLMENT' | 'COVERED';
  totalWorkingDays?: number;
  coveredWorkingDays?: number;
  fullyCovered?: boolean;
  coverageLabel?: string | null;
  coverageTag?: 'SITE' | 'WFH' | 'LEAVE' | 'MIXED' | null;
  siteCoverageDays?: number;
  wfhCoverageDays?: number;
  leaveCoverageDays?: number;
}

/** Employee on the open enrolment list (Needs enrolment, no later scan). */
export interface AwaitingEnrolmentEmployee {
  employeeId: string;
  name: string;
  employeeCode: string | null;
  departmentName: string | null;
  /** Needs-enrolment months since the last scanned month. */
  months: number;
  since: { month: number; year: number };
  latest: { month: number; year: number };
}

export interface AttendancePreviewResult {
  previewToken: string;
  month: number;
  year: number;
  fileName: string;
  alreadyImported: boolean;
  totalRows: number;
  matched: AttendancePreviewRow[];
  review: AttendancePreviewRow[];
  rejected: AttendancePreviewRow[];
  ignored: AttendancePreviewRow[];
  /** System employees not present in the attendance upload. */
  missingFromAttendance: AttendanceMissingEmployee[];
}

export interface AttendanceImportSummary {
  month: number;
  year: number;
  importedCount: number;
  autoMatchedCount: number;
  manualAssignedCount: number;
  skippedReviewCount: number;
  rejectedCount: number;
  rejectedNames: string[];
}

export interface ManualAssignmentDto {
  rowIndex: number;
  bucket: 'review' | 'rejected';
  employeeId: string;
}

export interface IgnoreAttendanceRowDto {
  rowIndex: number;
  reason: string;
}

export interface MissingEmployeeImportActionDto {
  employeeId: string;
  resolution: 'MARKED_EXEMPT' | 'MANUAL_PRESENT' | 'NEEDS_ENROLMENT';
  note?: string;
}

export interface ConfirmAttendanceImportDto {
  previewToken: string;
  overwrite: boolean;
  confirmedReviewIndices?: number[];
  manualAssignments?: ManualAssignmentDto[];
  ignoredRows?: IgnoreAttendanceRowDto[];
  missingEmployeeActions?: MissingEmployeeImportActionDto[];
}

export interface AttendanceIdentity {
  id: string;
  companyId: string;
  attendanceId: string;
  attendanceName: string;
  status: AttendanceIdentityStatus;
  userId: string | null;
  reason: string | null;
  decidedBy: string;
  decidedAt: string;
  user?: {
    id: string;
    firstName: string;
    middleName?: string | null;
    lastName: string;
    employeeId: string | null;
    isActive: boolean;
  } | null;
  decider?: {
    id: string;
    firstName: string;
    lastName: string;
  };
}

export interface AttendanceImportUnmatched {
  id: string;
  attendanceId: string;
  attendanceName: string;
  status: AttendanceUnmatchedStatus;
}

export interface AttendanceImportMissing {
  id: string;
  userId: string;
  resolution: AttendanceMissingResolution;
  note: string | null;
  resolvedBy: string | null;
  resolvedAt: string | null;
  user: {
    id: string;
    firstName: string;
    middleName?: string | null;
    lastName: string;
    employeeId: string | null;
    department?: { name: string } | null;
    attendanceMode?: AttendanceMode | string;
  };
}

export interface AttendanceImportBatchDetails {
  unmatched: AttendanceImportUnmatched[];
  missing: AttendanceImportMissing[];
}

export interface AttendanceEmployeeSearchResult {
  id: string;
  firstName: string;
  lastName: string;
  employeeId: string | null;
  department: { id: string; name: string } | null;
}

export interface MyAttendanceResponse {
  employee: {
    id: string;
    firstName: string;
    lastName: string;
    employeeId: string | null;
  };
  year: number;
  records: (AttendanceRecord & { monthName: string })[];
  summary: {
    totalScheduledDays: number;
    totalPresentDays: number;
    totalAbsentDays: number;
    totalLateDays: number;
    totalLateMinutes: number;
    totalMissingClockOutDays: number;
    totalPayableHours: number;
    averageAttendanceRate: number | null;
  };
}

export interface AttendanceMonthlyApproval {
  id: string;
  companyId: string;
  importBatchId: string;
  month: number;
  year: number;
  status: AttendanceMonthStatus;
  reviewedAt: string | null;
  reviewedBy: string | null;
  approvedAt: string | null;
  approvedBy: string | null;
  unlockedAt: string | null;
  unlockedBy: string | null;
  unlockReason: string | null;
  notificationsSentAt: string | null;
  /** Site/WFH/leave approved while this month was locked - unlock to apply. */
  attendanceRecalcStale?: boolean;
  createdAt: string;
  updatedAt: string;
  importBatch?: {
    id?: string;
    fileName: string;
    importedAt: string;
    totalRows: number;
    matchedRows: number;
    rejectedRows?: number;
    _count?: { records: number };
    importer?: {
      id: string;
      firstName: string;
      lastName: string;
    };
  };
  reviewer?: {
    id: string;
    firstName: string;
    lastName: string;
  } | null;
  approver?: {
    id: string;
    firstName: string;
    lastName: string;
  } | null;
}

export interface CorrectDailyLogDto {
  dailyLogId: string;
  correctedClockInLocal?: string;
  correctedClockOutLocal?: string;
  correctionNote: string;
}

export interface UnlockAttendanceMonthDto {
  unlockReason: string;
}

export interface EmployeeDailyLogsResponse
  extends Omit<AttendanceRecord, 'employee' | 'dailyLogs'> {
  employee: {
    id: string;
    firstName: string;
    middleName?: string | null;
    lastName: string;
    chineseName?: string | null;
    employeeId: string | null;
    departmentId?: string | null;
    department?: { id: string; name: string } | null;
  };
  dailyLogs: AttendanceDailyLog[];
}

export type FieldMovementReason =
  | 'FIELD_VISIT'
  | 'EARLY_LEAVE'
  | 'FORGOT_CLOCK_IN'
  | 'FORGOT_CLOCK_OUT';

export type FieldMovementStatus =
  | 'DRAFT'
  | 'SUBMITTED'
  | 'IN_REVIEW'
  | 'APPROVED'
  | 'REJECTED'
  | 'RETURNED'
  | 'CANCELLED';

export type FieldMovementExplanationStatus =
  | 'NOT_EXPLAINED'
  | 'DRAFT'
  | 'SUBMITTED'
  | 'APPROVED'
  | 'REJECTED'
  | 'RETURNED';

export type FieldMovementIssueType =
  | 'MISSING_CLOCK_OUT'
  | 'MISSING_CLOCK_IN'
  | 'EARLY_DEPARTURE'
  | 'NO_SCANS';

export interface FlaggedDay {
  id: string;
  date: string;
  flag: AttendanceDayFlag;
  clockInLocal: string | null;
  clockOutLocal: string | null;
  correctedClockInLocal: string | null;
  correctedClockOutLocal: string | null;
  isHalfDay: boolean;
  availableReasons: FieldMovementReason[];
  alreadySubmitted: boolean;
  submittedLog: {
    id: string;
    requestNumber: string;
    status: string;
    approvalRequestId: string | null;
    pendingTierLabel: string | null;
    pendingApproverName: string | null;
  } | null;
  /**
   * Set when a pending leave / site assignment / work-from-home request covers
   * the day, e.g. "Leave has been requested for this day (2026-08-04)."
   * The day is then locked (alreadySubmitted).
   */
  coverMessage?: string | null;
  /** Derived issue grouping for bulk explain (server may send; else client derives). */
  issueType?: FieldMovementIssueType | null;
  explanationStatus?: FieldMovementExplanationStatus;
  draftEntries?: CreateFieldMovementEntryDto[];
  draftLogId?: string | null;
  scheduledStartTime?: string;
  scheduledEndTime?: string;
  /** When false, row cannot be selected (locked cover / submitted). */
  selectable?: boolean;
  /** Late-entry reason from the month draft log (when explanationStatus is DRAFT). */
  lateReason?: string | null;
}

export interface FlaggedDaysResponse {
  flaggedDays: FlaggedDay[];
  month: number;
  year: number;
  draftLogId?: string | null;
  draftLateReason?: string | null;
}

/** Flagged days for another employee (on behalf); hasRecord = month imported. */
export interface EmployeeFlaggedDaysResponse extends FlaggedDaysResponse {
  hasRecord: boolean;
}

export interface CreateFieldMovementEntryDto {
  dailyLogId: string;
  reason: FieldMovementReason;
  destination?: string;
  departureTime?: string;
  returnTime?: string;
  notes?: string;
}

export interface CreateFieldMovementLogDto {
  entries: CreateFieldMovementEntryDto[];
  notes?: string;
  onBehalfOfEmployeeId?: string;
  autoApproveTier?: boolean;
  lateReason?: string;
}

export interface SubmitFieldMovementLogDto {
  lateReason?: string;
}

export interface UpsertFieldMovementDraftEntriesDto {
  month: number;
  year: number;
  entries: CreateFieldMovementEntryDto[];
  notes?: string;
  lateReason?: string;
  onBehalfOfEmployeeId?: string;
}

export interface RemoveFieldMovementDraftDayDto {
  month: number;
  year: number;
  dailyLogId: string;
  onBehalfOfEmployeeId?: string;
}

export interface UpsertFieldMovementDraftEntriesResponse {
  draftLogId: string;
  entryCount: number;
}

export interface FieldMovementLogEntry {
  id: string;
  dailyLogId: string;
  date: string;
  reason: FieldMovementReason;
  destination: string | null;
  departureTime: string | null;
  returnTime: string | null;
  notes: string | null;
  dailyLog?: {
    date: string;
    flag: AttendanceDayFlag;
    flagResolved?: boolean;
    clockInLocal: string | null;
    clockOutLocal: string | null;
    correctedClockInLocal: string | null;
    correctedClockOutLocal: string | null;
    isEarlyLeave?: boolean;
    earlyLeaveMinutes?: number;
  };
}

export interface FieldMovementLog {
  id: string;
  companyId: string;
  requestNumber: string;
  employeeId: string;
  month: number;
  year: number;
  status: FieldMovementStatus;
  notes: string | null;
  approvalRequestId: string | null;
  submittedAt: string | null;
  completedAt: string | null;
  createdAt: string;
  entryCount?: number;
  currentTierLabel?: string | null;
  employee?: {
    id: string;
    firstName: string;
    middleName?: string | null;
    lastName: string;
    chineseName?: string | null;
    employeeId: string | null;
  };
  /** Who filed it; differs from employee when submitted on behalf. */
  createdBy?: string;
  creator?: {
    id: string;
    firstName: string;
    middleName?: string | null;
    lastName: string;
    chineseName?: string | null;
  };
  submittedOnBehalf?: boolean;
  entries?: FieldMovementLogEntry[];
  approvalRequest?: {
    id: string;
    status: string;
    currentTier?: number | null;
    tiers?: Array<{ label: string }>;
  } | null;
}

export interface ListFieldMovementLogsParams {
  page?: number;
  limit?: number;
  month?: number;
  year?: number;
  employeeId?: string;
  status?: FieldMovementStatus;
}

export interface FieldMovementLogsListResponse {
  data: FieldMovementLog[];
  total: number;
  page: number;
  limit: number;
}

/** HR decision on a SCAN_AFTER_DEADLINE flag (no pay effect). */
export type AttendanceScanReviewDecision = 'EXCUSED' | 'MARKED_LATE';

export type AttendanceScanReviewStatusFilter = 'PENDING' | 'REVIEWED' | 'ALL';

/** SCAN_ONLY schedule: earliest scan after the schedule's latest scan time. */
export interface AttendanceScanReviewItem {
  dailyLogId: string;
  employeeId: string;
  employeeName: string;
  employeeCode: string | null;
  departmentName: string | null;
  date: string;
  scanTime: string | null;
  needsReview: boolean;
  decision: AttendanceScanReviewDecision | null;
  note: string | null;
  reviewedBy: { id: string; name: string } | null;
  reviewedAt: string | null;
}

export interface AttendanceScanReviewEmployeeCount {
  employeeId: string;
  employeeName: string;
  employeeCode: string | null;
  total: number;
  pending: number;
  excused: number;
  markedLate: number;
}

export interface AttendanceScanReviewsResponse {
  month: number;
  year: number;
  items: AttendanceScanReviewItem[];
  employees: AttendanceScanReviewEmployeeCount[];
}

export interface ReviewScanFlagDto {
  decision: AttendanceScanReviewDecision;
  note?: string;
}
