import { apiGet, apiGetPaginated, apiPost, apiPostForm } from '@/lib/api/client';
import type {
  AttendanceImportBatch,
  AttendanceImportSummary,
  AttendanceListParams,
  AttendanceListResponse,
  AttendancePreviewResult,
  AttendanceRecord,
  ConfirmAttendanceImportDto,
  MyAttendanceResponse,
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
