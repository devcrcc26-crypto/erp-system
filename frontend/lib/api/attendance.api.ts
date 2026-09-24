import { apiGet, apiGetPaginated, apiPost, apiPostForm } from '@/lib/api/client';
import type {
  AttendanceEmployeeSearchResult,
  AttendanceImportBatch,
  AttendanceImportSummary,
  AttendanceListParams,
  AttendanceListResponse,
  AttendanceMonthlyApproval,
  AttendancePreviewResult,
  AttendanceRecord,
  ConfirmAttendanceImportDto,
  CorrectDailyLogDto,
  EmployeeDailyLogsResponse,
  MyAttendanceResponse,
  UnlockAttendanceMonthDto,
} from '@/lib/api/attendance.types';
import { toQueryString } from '@/lib/query/pm-query-utils';

const ATTENDANCE_PATH = '/hr/attendance';

/**
 * Paginated attendance records for the selected month/year.
 */
export async function listAttendanceRecords(
  params: AttendanceListParams = {},
): Promise<AttendanceListResponse> {
  const result = await apiGetPaginated<AttendanceRecord>(
    `${ATTENDANCE_PATH}${toQueryString(params)}`,
  );
  return {
    data: result.data,
    total: result.meta.total,
    page: result.meta.page,
    limit: result.meta.limit,
  };
}

/**
 * Own attendance year profile with summary totals.
 */
export async function getMyAttendance(
  year: number,
): Promise<MyAttendanceResponse> {
  return apiGet<MyAttendanceResponse>(
    `${ATTENDANCE_PATH}/me?year=${year}`,
  );
}

/**
 * HR year profile for a specific employee.
 */
export async function getEmployeeAttendance(
  employeeId: string,
  year: number,
): Promise<MyAttendanceResponse> {
  return apiGet<MyAttendanceResponse>(
    `${ATTENDANCE_PATH}/${employeeId}/year/${year}`,
  );
}

/**
 * Import batch history for the company.
 */
export async function getAttendanceImportHistory(): Promise<
  AttendanceImportBatch[]
> {
  return apiGet<AttendanceImportBatch[]>(`${ATTENDANCE_PATH}/import/history`);
}

/**
 * Upload a Deli e+ workbook and return a cached preview session.
 */
export async function previewAttendanceImport(
  file: File,
): Promise<AttendancePreviewResult> {
  const formData = new FormData();
  formData.append('file', file);
  return apiPostForm<AttendancePreviewResult>(
    `${ATTENDANCE_PATH}/import/preview`,
    formData,
  );
}

/**
 * Confirm a cached preview and persist attendance records.
 */
export async function confirmAttendanceImport(
  dto: ConfirmAttendanceImportDto,
): Promise<AttendanceImportSummary> {
  return apiPost<AttendanceImportSummary>(
    `${ATTENDANCE_PATH}/import/confirm`,
    dto,
  );
}

/**
 * Search active employees for manual attendance assignment.
 */
export async function searchAttendanceEmployees(
  query: string,
): Promise<AttendanceEmployeeSearchResult[]> {
  const trimmed = query.trim();
  if (trimmed.length < 2) {
    return [];
  }
  return apiGet<AttendanceEmployeeSearchResult[]>(
    `${ATTENDANCE_PATH}/employees/search${toQueryString({ q: trimmed })}`,
  );
}

/**
 * Monthly approval for one period (null when none exists).
 */
export async function getAttendanceMonthlyApproval(
  month: number,
  year: number,
): Promise<AttendanceMonthlyApproval | null> {
  return apiGet<AttendanceMonthlyApproval | null>(
    `${ATTENDANCE_PATH}/monthly-approvals/${month}/${year}`,
  );
}

/**
 * List monthly approvals, optionally filtered by year/status.
 */
export async function listAttendanceMonthlyApprovals(params?: {
  year?: number;
  status?: string;
}): Promise<AttendanceMonthlyApproval[]> {
  return apiGet<AttendanceMonthlyApproval[]>(
    `${ATTENDANCE_PATH}/monthly-approvals${toQueryString(params ?? {})}`,
  );
}

/**
 * Mark a monthly approval as reviewed.
 */
export async function markAttendanceMonthReviewed(
  monthlyApprovalId: string,
): Promise<AttendanceMonthlyApproval> {
  return apiPost<AttendanceMonthlyApproval>(
    `${ATTENDANCE_PATH}/monthly-approvals/${monthlyApprovalId}/review`,
    {},
  );
}

/**
 * Approve and lock a monthly attendance period.
 */
export async function approveAttendanceMonth(
  monthlyApprovalId: string,
): Promise<{ message: string }> {
  return apiPost<{ message: string }>(
    `${ATTENDANCE_PATH}/monthly-approvals/${monthlyApprovalId}/approve`,
    {},
  );
}

/**
 * Unlock an approved month for corrections.
 */
export async function unlockAttendanceMonth(
  monthlyApprovalId: string,
  dto: UnlockAttendanceMonthDto,
): Promise<AttendanceMonthlyApproval> {
  return apiPost<AttendanceMonthlyApproval>(
    `${ATTENDANCE_PATH}/monthly-approvals/${monthlyApprovalId}/unlock`,
    dto,
  );
}

/**
 * Correct clock times on a daily log.
 */
export async function correctAttendanceDailyLog(
  dto: CorrectDailyLogDto,
): Promise<unknown> {
  return apiPost(`${ATTENDANCE_PATH}/daily-logs/correct`, dto);
}

/**
 * Employee day-by-day logs for HR review.
 */
export async function getEmployeeAttendanceDailyLogs(
  employeeId: string,
  month: number,
  year: number,
): Promise<EmployeeDailyLogsResponse> {
  return apiGet<EmployeeDailyLogsResponse>(
    `${ATTENDANCE_PATH}/${employeeId}/month/${month}/year/${year}/daily-logs`,
  );
}
