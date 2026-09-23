export type MatchConfidence =
  | 'ID_MATCH'
  | 'NAME_HIGH'
  | 'NAME_REVIEW'
  | 'NO_MATCH';

export interface AttendanceRecord {
  id: string;
  companyId: string;
  employeeId: string;
  importBatchId: string;
  month: number;
  year: number;
  expectedDays: number;
  actualDays: number;
  expectedHours: number;
  actualHours: number;
  payableHours: number;
  overtimePaidHours: number;
  overtimeTimeOffHours: number;
  lateCount: number;
  lateMinutes: number;
  earlyLeaveCount: number;
  earlyLeaveMinutes: number;
  missingClockIn: number;
  missingClockOut: number;
  absentDays: number;
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

export interface AttendancePreviewRow {
  attendanceName: string;
  attendanceId: string;
  matchedEmployeeId: string | null;
  matchedEmployeeName: string | null;
  matchedEmployeeErpId: string | null;
  confidence: MatchConfidence;
  score: number | null;
  data: {
    expectedDays: number;
    actualDays: number;
    expectedHours: number;
    actualHours: number;
    payableHours: number;
    overtimePaidHours: number;
    overtimeTimeOffHours: number;
    lateCount: number;
    lateMinutes: number;
    earlyLeaveCount: number;
    earlyLeaveMinutes: number;
    missingClockIn: number;
    missingClockOut: number;
    absentDays: number;
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
  skippedReviewCount: number;
  rejectedCount: number;
  rejectedNames: string[];
}

export interface ConfirmAttendanceImportDto {
  previewToken: string;
  overwrite: boolean;
  confirmedReviewIndices?: number[];
  /** Map rejected preview rows to ERP employees before import. */
  manualMatches?: Array<{
    rejectedIndex: number;
    employeeId: string;
  }>;
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
    totalExpectedDays: number;
    totalActualDays: number;
    totalAbsentDays: number;
    totalLateCount: number;
    totalOvertimePaidHours: number;
    averageAttendanceRate: number | null;
  };
}
