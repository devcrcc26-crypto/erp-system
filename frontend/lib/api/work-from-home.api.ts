import { apiDelete, apiGet, apiPatch, apiPost } from '@/lib/api/client';

export type WorkFromHomeScope = 'ALL' | 'DEPARTMENTS' | 'EMPLOYEES';

export interface WorkFromHomeDay {
  id: string;
  date: string;
  reason: string;
  scope: WorkFromHomeScope;
  departmentIds: string[];
  employeeIds: string[];
}

export interface CreateWorkFromHomeDayDto {
  date: string;
  reason: string;
  scope?: WorkFromHomeScope;
  departmentIds?: string[];
  employeeIds?: string[];
}

export interface RequestWorkFromHomeDayDto {
  date: string;
  reason: string;
  onBehalfOfEmployeeId?: string;
  createdFromAttendanceImport?: boolean;
}

export interface WorkFromHomeAssignableEmployee {
  id: string;
  firstName: string;
  lastName: string;
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
): Promise<WorkFromHomeDay> {
  return apiPost<WorkFromHomeDay>('/hr/attendance/work-from-home', dto);
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
