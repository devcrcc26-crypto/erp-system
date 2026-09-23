export type MatchConfidence =
  | 'ID_MATCH'
  | 'NAME_HIGH'
  | 'NAME_REVIEW'
  | 'MANUAL'
  | 'NO_MATCH';

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
  holidayDays: number;
  lateDays: number;
  totalLateMinutes: number;
  missingClockInDays: number;
  missingClockOutDays: number;
  payableHours: number;
  attendanceRate: number | null;
  importedAt: string;
  employee: {
    id: string;
    firstName: string;
    lastName: string;
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
  data: {
    payableHours: number;
    dailyData: AttendancePreviewDaily[];
  };
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

export interface ConfirmAttendanceImportDto {
  previewToken: string;
  overwrite: boolean;
  confirmedReviewIndices?: number[];
  manualAssignments?: ManualAssignmentDto[];
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
    averageAttendanceRate: number | null;
  };
}
