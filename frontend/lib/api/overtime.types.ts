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
  endTime: string;
  isHoliday: boolean;
  regularHours: number;
  nightHours: number;
  weekendHours: number;
  holidayHours: number;
  totalHours: number;
  taskDescription: string;
  holidayName?: string | null;
  createdAt: string;
  updatedAt: string;
  documents?: OvertimeAttachmentDocument[];
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
}
