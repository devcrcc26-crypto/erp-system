import { apiDelete, apiGet, apiPost } from '@/lib/api/client';

export type EmploymentStatus = 'ACTIVE' | 'INACTIVE' | 'SEPARATED';

export type SeparationType =
  | 'RESIGNATION'
  | 'TERMINATION'
  | 'CONTRACT_END'
  | 'DEATH'
  | 'OTHER';

export const SEPARATION_TYPES: SeparationType[] = [
  'RESIGNATION',
  'TERMINATION',
  'CONTRACT_END',
  'DEATH',
  'OTHER',
];

export interface EmploymentState {
  employmentStatus: EmploymentStatus;
  isActive: boolean;
  employmentDate: string | null;
  periods: Array<{
    id: string;
    startDate: string;
    endDate: string | null;
    separationType: SeparationType | null;
    separationReason: string | null;
    separatedAt: string | null;
  }>;
  separation: {
    periodId: string;
    leavingDate: string;
    separationType: SeparationType | null;
    reason: string | null;
    effective: boolean;
    canCancel: boolean;
    cancelBlockedReason: string | null;
  } | null;
}

export interface LockedPayrollRun {
  id: string;
  runNumber: string;
  month: number;
  year: number;
  status: string;
}

export interface SeparationPreview {
  leavingDate: string;
  effectiveImmediately: boolean;
  employmentStart: string | null;
  activeContract: {
    id: string;
    contractNumber: string;
    startDate: string;
    endDate: string | null;
  } | null;
  lockedPayrollRuns: LockedPayrollRun[];
  pendingApprovalTiers: {
    count: number;
    items: Array<{ requestId: string; requestNumber: string; title: string; tierLabel: string }>;
  };
  pendingSubmittedRequests: {
    count: number;
    items: Array<{ requestId: string; requestNumber: string; title: string; status: string }>;
  };
}

export interface SeparateEmployeePayload {
  leavingDate: string;
  separationType: SeparationType;
  reason: string;
  confirmLockedPayroll?: boolean;
}

export function getEmployment(userId: string): Promise<EmploymentState> {
  return apiGet<EmploymentState>(`/users/${userId}/employment`);
}

export function previewSeparation(
  userId: string,
  leavingDate: string,
): Promise<SeparationPreview> {
  return apiPost<SeparationPreview>(`/users/${userId}/separation/preview`, { leavingDate });
}

export function separateEmployee(
  userId: string,
  payload: SeparateEmployeePayload,
): Promise<EmploymentState> {
  return apiPost<EmploymentState>(`/users/${userId}/separation`, payload);
}

export function cancelSeparation(userId: string): Promise<EmploymentState> {
  return apiDelete<EmploymentState>(`/users/${userId}/separation`);
}
