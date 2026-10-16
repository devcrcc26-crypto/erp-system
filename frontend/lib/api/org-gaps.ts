import { apiGet } from './client';

export interface OrgGapEmployee {
  id: string;
  employeeId: string | null;
  name: string;
  departmentName: string | null;
  disciplineName: string | null;
}

export interface OrgGapUnit {
  id: string;
  name: string;
  members: number;
  reason: 'NONE' | 'VACANT';
}

export interface OrgGapReport {
  totals: {
    employees: number;
    withoutSupervisor: number;
    withVacantSupervisor: number;
    withoutDepartment: number;
    withoutDiscipline: number;
    departmentsWithoutLeader: number;
    disciplinesWithoutLeader: number;
    supervisorsWithoutAccount: number;
  };
  withoutSupervisor: OrgGapEmployee[];
  withVacantSupervisor: OrgGapEmployee[];
  withoutDepartment: OrgGapEmployee[];
  withoutDiscipline: OrgGapEmployee[];
  departmentsWithoutLeader: OrgGapUnit[];
  disciplinesWithoutLeader: OrgGapUnit[];
  supervisorsWithoutAccount: string[];
}

export async function fetchOrgGapReport(): Promise<OrgGapReport> {
  return apiGet<OrgGapReport>('/users/org-gaps');
}
