export type OvertimeSheetStatus =
  | 'DRAFT'
  | 'SUBMITTED'
  | 'IN_REVIEW'
  | 'APPROVED'
  | 'REJECTED'
  | 'RETURNED'
  | 'CANCELLED';

export interface OvertimeUserSummary {
  id: string;
  firstName: string;
  middleName?: string | null;
  lastName: string;
  email: string | null;
  chineseName?: string | null;
}

export interface OvertimeApprovalTier {
  id: string;
  tierOrder: number;
  label: string;
  approverId: string;
  resolver: string;
  decision: string;
  comment?: string | null;
  conditions?: unknown;
  decidedAt?: string | null;
  approver?: OvertimeUserSummary;
}

export interface OvertimeApprovalSummary {
  id: string;
  status: string;
  currentTier?: number;
  category?: { id: string; code: string; name: string; icon?: string | null };
  tiers?: OvertimeApprovalTier[];
  formData?: Record<string, unknown> | null;
}

export interface OvertimeAttachmentDocument {
  id: string;
  name: string;
  fileType?: string;
  fileSizeBytes?: number;
  createdAt?: string;
}

export interface OvertimeEntry {
  id: string;
  sheetId: string;
  date: string;
  startTime: string;
  /** HH:mm, or "24:00" when endsAtEndOfDay is true. */
  endTime: string;
  endsAtEndOfDay?: boolean;
  isHoliday: boolean;
  isOvernight?: boolean;
  regularHours: number;
  nightHours: number;
  weekendHours: number;
  holidayHours: number;
  totalHours: number;
  taskDescription: string;
  attendanceWarning?: string | null;
  holidayName?: string | null;
  /** Approved site assignment covering the date when the entry was priced. */
  siteAssignmentId?: string | null;
  siteName?: string | null;
  /** Part of totalHours inside scheduled hours on a site day (already included). */
  siteWithinScheduleHours?: number;
  /** Site assignment cancelled/shortened after submission; hours were kept. */
  siteReviewFlag?: 'ASSIGNMENT_CANCELLED' | 'ASSIGNMENT_SHORTENED' | null;
  siteReviewFlaggedAt?: string | null;
  createdAt: string;
  updatedAt: string;
  documents?: OvertimeAttachmentDocument[];
}

export interface OvertimeEditDiffLine {
  label: string;
  from: string;
  to: string;
}

/** Whole OT entry snapshot for previous / current table columns. */
export interface OvertimeEntryDiffSummary {
  date: string;
  otType: string;
  startTime: string;
  endTime: string;
  hours: string;
  reason: string;
}

export interface OvertimeEditDiff {
  editedAfterApproval: boolean;
  reasonOnly: boolean;
  summaryLines: OvertimeEditDiffLine[];
  entryChanges?: Array<{
    entryId: string;
    /** Entry date for grouping when multiple entries changed. */
    entryDate?: string;
    changes: Array<{
      field: string;
      from: string;
      to: string;
    }>;
    before?: OvertimeEntryDiffSummary | null;
    after?: OvertimeEntryDiffSummary | null;
    added?: boolean;
    removed?: boolean;
  }>;
}

export interface OvertimeSheetListItem {
  id: string;
  companyId: string;
  sheetNumber: string;
  employeeId: string;
  month: number;
  year: number;
  status: OvertimeSheetStatus;
  totalRegularHours: number;
  totalNightHours: number;
  totalWeekendHours: number;
  totalHolidayHours: number;
  totalHours: number;
  approvalRequestId?: string | null;
  submittedAt?: string | null;
  completedAt?: string | null;
  createdAt: string;
  updatedAt: string;
  employee?: OvertimeUserSummary;
  approvalRequest?: Pick<
    OvertimeApprovalSummary,
    'id' | 'status' | 'currentTier'
  > | null;
}

export interface OvertimeSheetDetail extends OvertimeSheetListItem {
  creator?: OvertimeUserSummary;
  entries: OvertimeEntry[];
  approvalRequest?: OvertimeApprovalSummary | null;
  /** True when payroll for this month is GM_APPROVED or PAID. */
  payrollLocked?: boolean;
  /** Server-computed: mutable status and not payroll-locked. */
  canEditEntries?: boolean;
  /** Sheet was previously approved and later edited (pending re-approval). */
  editedAfterApproval?: boolean;
  /** Diff vs last approved snapshot for approver UI. */
  editDiff?: OvertimeEditDiff | null;
  /** Set on mutation responses when approval was restarted. */
  restartedApproval?: boolean;
}

export interface ListOvertimeSheetsParams {
  page?: number;
  limit?: number;
  status?: OvertimeSheetStatus | OvertimeSheetStatus[];
  employeeId?: string;
  month?: number;
  year?: number;
  search?: string;
}

export interface UpsertOvertimeEntryPayload {
  date: string;
  startTime: string;
  /** HH:mm or 24:00 (end of calendar day). */
  endTime: string;
  taskDescription: string;
}

export interface PreviewOvertimeEntryPayload {
  employeeId: string;
  date: string;
  startTime: string;
  endTime: string;
}

export interface PreviewOvertimeEntryResult {
  regularHours: number;
  nightHours: number;
  weekendHours: number;
  holidayHours: number;
  totalHours: number;
  holidayName: string | null;
  isWeekend: boolean;
  isHalfDay: boolean;
  scheduleNote: string | null;
  attendanceWarning: string | null;
  /** Set when the date is inside an approved site assignment. */
  siteName?: string | null;
  siteWithinScheduleHours?: number;
}

export interface SelectableOvertimeWindowsParams {
  employeeId: string;
  date: string;
  /** When set, existing sheet entries for the date are excluded from pickers. */
  sheetId?: string;
  /** Entry being edited — its own times stay selectable. */
  excludeEntryId?: string;
  /** Same-day periods being edited — all stay selectable (comma-joined server-side). */
  excludeEntryIds?: string[];
}

export interface SelectableOvertimeWindowsResult {
  dayKind:
    | 'FULL_WORKING'
    | 'HALF_DAY'
    | 'NON_WORKING'
    | 'HOLIDAY'
    | 'FULL_DAY_LEAVE';
  windows: Array<{ start: string; end: string }>;
  blockedReason: 'FULL_DAY_LEAVE' | null;
  message: string | null;
  siteAssignmentDay?: boolean;
  siteName?: string | null;
}
