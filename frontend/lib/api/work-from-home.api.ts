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

export async function listWorkFromHomeDays(params: {
  month?: number;
  year?: number;
}): Promise<WorkFromHomeDay[]> {
  return apiGet<WorkFromHomeDay[]>('/hr/attendance/work-from-home', { params });
}

export async function createWorkFromHomeDay(
  dto: CreateWorkFromHomeDayDto,
): Promise<WorkFromHomeDay> {
  return apiPost<WorkFromHomeDay>('/hr/attendance/work-from-home', dto);
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
