import { apiGet, apiGetPaginated, apiPatch, apiPost, apiPostForm } from '@/lib/api/client';
import type {
  AttendanceEmployeeSearchResult,
  AttendanceIdentity,
  AttendanceImportBatch,
  AttendanceImportBatchDetails,
  AttendanceImportMissing,
  AttendanceImportSummary,
  AttendanceListParams,
  AttendanceListResponse,
  AttendanceMonthlyApproval,
  AttendancePreviewResult,
  AttendanceRecord,
  ConfirmAttendanceImportDto,
  CorrectDailyLogDto,
  CreateFieldMovementLogDto,
  EmployeeDailyLogsResponse,
  FieldMovementLog,
  FieldMovementLogsListResponse,
  FlaggedDaysResponse,
  ListFieldMovementLogsParams,
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
 * List stored Deli attendance identities.
 */
export async function listAttendanceIdentities(params?: {
  status?: 'MAPPED' | 'IGNORED';
}): Promise<AttendanceIdentity[]> {
  const status = params?.status;
  const query =
    status != null ? `?status=${encodeURIComponent(status)}` : '';
  return apiGet<AttendanceIdentity[]>(`${ATTENDANCE_PATH}/identities${query}`);
}

/**
 * Update a stored attendance identity.
 */
export async function updateAttendanceIdentity(
  id: string,
  dto: {
    status?: 'MAPPED' | 'IGNORED';
    userId?: string | null;
    reason?: string | null;
  },
): Promise<AttendanceIdentity> {
  return apiPatch<AttendanceIdentity>(
    `${ATTENDANCE_PATH}/identities/${id}`,
    dto,
  );
}

/**
 * Unmatched and missing rows for an import batch.
 */
export async function getAttendanceImportBatchDetails(
  batchId: string,
): Promise<AttendanceImportBatchDetails> {
  return apiGet<AttendanceImportBatchDetails>(
    `${ATTENDANCE_PATH}/imports/${batchId}/details`,
  );
}

/**
 * Resolve a missing-from-file employee on an existing batch.
 */
export async function resolveAttendanceImportMissing(
  batchId: string,
  missingId: string,
  dto: {
    resolution: 'MARKED_EXEMPT' | 'MANUAL_PRESENT' | 'NEEDS_ENROLMENT';
    note?: string;
  },
): Promise<AttendanceImportMissing> {
  return apiPost<AttendanceImportMissing>(
    `${ATTENDANCE_PATH}/imports/${batchId}/missing/${missingId}/resolve`,
    dto,
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

/**
 * Unresolved flagged days for the signed-in employee.
 */
export async function getMyFlaggedDays(
  month: number,
  year: number,
): Promise<FlaggedDaysResponse> {
  return apiGet<FlaggedDaysResponse>(
    `${ATTENDANCE_PATH}/flagged-days/me${toQueryString({ month, year })}`,
  );
}

/**
 * Create a draft field movement log.
 */
export async function createFieldMovementLog(
  dto: CreateFieldMovementLogDto,
): Promise<FieldMovementLog> {
  return apiPost<FieldMovementLog>(
    `${ATTENDANCE_PATH}/field-movement-logs`,
    dto,
  );
}

/**
 * Submit a field movement log for approval.
 */
export async function submitFieldMovementLog(
  id: string,
): Promise<FieldMovementLog> {
  return apiPost<FieldMovementLog>(
    `${ATTENDANCE_PATH}/field-movement-logs/${id}/submit`,
    {},
  );
}

/**
 * Cancel a draft or submitted field movement log.
 */
export async function cancelFieldMovementLog(
  id: string,
): Promise<FieldMovementLog> {
  return apiPatch<FieldMovementLog>(
    `${ATTENDANCE_PATH}/field-movement-logs/${id}/cancel`,
    {},
  );
}

/**
 * Get one field movement log.
 */
export async function getFieldMovementLog(
  id: string,
): Promise<FieldMovementLog> {
  return apiGet<FieldMovementLog>(
    `${ATTENDANCE_PATH}/field-movement-logs/${id}`,
  );
}

/**
 * List field movement logs (paginated).
 */
export async function listFieldMovementLogs(
  params: ListFieldMovementLogsParams = {},
): Promise<FieldMovementLogsListResponse> {
  const result = await apiGetPaginated<FieldMovementLog>(
    `${ATTENDANCE_PATH}/field-movement-logs${toQueryString(params)}`,
  );
  return {
    data: result.data,
    total: result.meta.total,
    page: result.meta.page,
    limit: result.meta.limit,
  };
}
