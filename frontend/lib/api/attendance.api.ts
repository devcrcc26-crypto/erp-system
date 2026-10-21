import {
  apiGet,
  apiGetPaginated,
  apiPatch,
  apiPost,
  apiPostForm,
} from '@/lib/api/client';
import type {
  AttendanceEmployeeSearchResult,
  AwaitingEnrolmentEmployee,
  EmployeeFlaggedDaysResponse,
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
  AttendanceScanReviewStatusFilter,
  AttendanceScanReviewsResponse,
  ConfirmAttendanceImportDto,
  CorrectDailyLogDto,
  CreateFieldMovementLogDto,
  RemoveFieldMovementDraftDayDto,
  SubmitFieldMovementLogDto,
  UpsertFieldMovementDraftEntriesDto,
  UpsertFieldMovementDraftEntriesResponse,
  EmployeeDailyLogsResponse,
  FieldMovementLog,
  FieldMovementLogsListResponse,
  FlaggedDaysResponse,
  ListFieldMovementLogsParams,
  MyAttendanceResponse,
  ReviewScanFlagDto,
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
 * Clear a previously ignored identity from the import preview and move it
 * to the rejected bucket so HR can assign an employee.
 */
export async function unignoreAttendancePreviewRow(dto: {
  previewToken: string;
  ignoredIndex: number;
}): Promise<{
  previewToken: string;
  ignored: AttendancePreviewResult['ignored'];
  rejected: AttendancePreviewResult['rejected'];
}> {
  return apiPost(`${ATTENDANCE_PATH}/import/preview/unignore`, dto);
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
 * Employees marked "Needs enrolment" with no scan in any later import.
 */
export async function getAwaitingEnrolment(): Promise<
  AwaitingEnrolmentEmployee[]
> {
  return apiGet<AwaitingEnrolmentEmployee[]>(
    `${ATTENDANCE_PATH}/awaiting-enrolment`,
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
 * Flagged days for an employee the caller may file field movement for
 * (self or on behalf). Includes whether the month has been imported.
 */
export async function getEmployeeFlaggedDays(
  employeeId: string,
  month: number,
  year: number,
): Promise<EmployeeFlaggedDaysResponse> {
  return apiGet<EmployeeFlaggedDaysResponse>(
    `${ATTENDANCE_PATH}/flagged-days/employee/${encodeURIComponent(employeeId)}?month=${month}&year=${year}`,
  );
}

/**
 * Upsert draft field movement entries for specific days (monthly draft log).
 */
export async function upsertFieldMovementDraftEntries(
  dto: UpsertFieldMovementDraftEntriesDto,
): Promise<UpsertFieldMovementDraftEntriesResponse> {
  return apiPost<UpsertFieldMovementDraftEntriesResponse>(
    `${ATTENDANCE_PATH}/field-movement-logs/draft-entries`,
    dto,
  );
}

/**
 * Remove one day from the monthly field movement draft log.
 */
export async function removeFieldMovementDraftDay(
  dto: RemoveFieldMovementDraftDayDto,
): Promise<void> {
  await apiPost(
    `${ATTENDANCE_PATH}/field-movement-logs/draft-entries/remove-day`,
    dto,
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
  dto: SubmitFieldMovementLogDto = {},
): Promise<FieldMovementLog> {
  return apiPost<FieldMovementLog>(
    `${ATTENDANCE_PATH}/field-movement-logs/${id}/submit`,
    dto,
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

/**
 * SCAN_ONLY schedules: scans after the latest scan time for a month.
 */
export async function listAttendanceScanReviews(params: {
  month: number;
  year: number;
  status?: AttendanceScanReviewStatusFilter;
}): Promise<AttendanceScanReviewsResponse> {
  return apiGet<AttendanceScanReviewsResponse>(
    `${ATTENDANCE_PATH}/scan-reviews${toQueryString(params)}`,
  );
}

/**
 * Excuse or mark late a SCAN_AFTER_DEADLINE flag (no pay effect).
 */
export async function reviewAttendanceScanFlag(
  dailyLogId: string,
  dto: ReviewScanFlagDto,
): Promise<unknown> {
  return apiPatch(`${ATTENDANCE_PATH}/scan-reviews/${dailyLogId}`, dto);
}
