import { apiDelete, apiGet, apiPatch, apiPost } from '@/lib/api/client';

export type WorkFromHomeScope = 'ALL' | 'DEPARTMENTS' | 'EMPLOYEES';

export interface WorkFromHomeEmployeeSummary {
  id: string;
  firstName: string;
  middleName?: string | null;
  lastName: string;
  chineseName?: string | null;
  employeeId: string | null;
}

export interface WorkFromHomeDay {
  id: string;
  date: string;
  reason: string;
  scope: WorkFromHomeScope;
  departmentIds: string[];
  employeeIds: string[];
  /** Resolved names for employeeIds (EMPLOYEES scope). */
  employees?: WorkFromHomeEmployeeSummary[];
}

export interface CreateWorkFromHomeDayDto {
  /** Single day (legacy / edit). Prefer startDate–endDate for assign ranges. */
  date?: string;
  startDate?: string;
  endDate?: string;
  reason: string;
  scope?: WorkFromHomeScope;
  departmentIds?: string[];
  employeeIds?: string[];
}

/** Longest range one work-from-home request may cover (calendar days). */
export const WFH_MAX_RANGE_DAYS = 31;

export interface RequestWorkFromHomeDayDto {
  /** Range (preferred). */
  startDate?: string;
  endDate?: string;
  /** Legacy single day. */
  date?: string;
  reason: string;
  onBehalfOfEmployeeId?: string;
  createdFromAttendanceImport?: boolean;
  lateReason?: string;
}

export interface WorkFromHomeAssignableEmployee {
  id: string;
  firstName: string;
  middleName?: string | null;
  lastName: string;
  chineseName?: string | null;
  employeeId: string | null;
  department: string | null;
  discipline: string | null;
}

export interface WorkFromHomeAssignableResult {
  canAssignCompanyWide: boolean;
  isDisciplineLead: boolean;
  employees: WorkFromHomeAssignableEmployee[];
}

export async function listWorkFromHomeDays(params: {
  month?: number;
  year?: number;
}): Promise<WorkFromHomeDay[]> {
  return apiGet<WorkFromHomeDay[]>('/hr/attendance/work-from-home', { params });
}

export async function listWorkFromHomeAssignableEmployees(): Promise<WorkFromHomeAssignableResult> {
  return apiGet<WorkFromHomeAssignableResult>(
    '/hr/attendance/work-from-home/assignable-employees',
  );
}

export async function createWorkFromHomeDay(
  dto: CreateWorkFromHomeDayDto,
): Promise<WorkFromHomeDay | { created: number; days: WorkFromHomeDay[] }> {
  return apiPost('/hr/attendance/work-from-home', dto);
}

export async function requestWorkFromHomeDay(
  dto: RequestWorkFromHomeDayDto,
): Promise<unknown> {
  return apiPost('/hr/attendance/work-from-home/request', dto);
}

export async function updateWorkFromHomeDay(
  id: string,
  dto: Partial<CreateWorkFromHomeDayDto>,
): Promise<WorkFromHomeDay> {
  return apiPatch<WorkFromHomeDay>(`/hr/attendance/work-from-home/${id}`, dto);
}

export async function deleteWorkFromHomeDay(id: string): Promise<void> {
  await apiDelete(`/hr/attendance/work-from-home/${id}`);
}

export type WorkFromHomeSkipReason =
  | 'SUNDAY'
  | 'HOLIDAY'
  | 'NON_WORKING_DAY'
  | 'LEAVE'
  | 'SITE_ASSIGNMENT'
  | 'ALREADY_WFH'
  | 'WFH_REQUESTED'
  | 'FIELD_MOVEMENT'
  | 'ATTENDANCE';

export interface WorkFromHomeRangeDay {
  date: string;
  included: boolean;
  reason?: WorkFromHomeSkipReason;
  holidayName?: string;
  reference?: string | null;
}

export interface WorkFromHomeRangePreview {
  employeeId: string;
  startDate: string;
  endDate: string;
  days: WorkFromHomeRangeDay[];
  dates: string[];
  skipped: Array<{ date: string; reason: WorkFromHomeSkipReason }>;
  workingDays: number;
  /** "Aug 11 – Aug 15 (4 days)" */
  label: string;
}

/** Approval formData of a work-from-home request. */
export interface WorkFromHomeRequestForm {
  startDate?: string;
  endDate?: string;
  dates?: string[];
  skipped?: Array<{ date: string; reason: WorkFromHomeSkipReason }>;
  date?: string;
  reason?: string;
  employeeId?: string;
  appliedDates?: string[];
  notAppliedDates?: string[];
  cancelledAt?: string;
  cancelReason?: string | null;
}

export async function previewWorkFromHomeRange(dto: {
  startDate: string;
  endDate: string;
  onBehalfOfEmployeeId?: string;
  /** Own request being edited: its days are not "already requested". */
  editingRequestId?: string;
}): Promise<WorkFromHomeRangePreview> {
  return apiPost<WorkFromHomeRangePreview>(
    '/hr/attendance/work-from-home/preview',
    dto,
  );
}

export async function cancelWorkFromHomeRequest(
  approvalRequestId: string,
  reason?: string,
): Promise<{ status: string; removedDates: string[] }> {
  return apiPost(
    `/hr/attendance/work-from-home/requests/${approvalRequestId}/cancel`,
    { reason },
  );
}

/** Employee edit of their own RETURNED request; saving resubmits it. */
export interface UpdateWorkFromHomeRequestDto {
  startDate: string;
  endDate: string;
  reason: string;
  lateReason?: string;
}

export async function updateWorkFromHomeRequest(
  approvalRequestId: string,
  dto: UpdateWorkFromHomeRequestDto,
): Promise<unknown> {
  return apiPatch(
    `/hr/attendance/work-from-home/requests/${approvalRequestId}`,
    dto,
  );
}
