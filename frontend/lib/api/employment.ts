import { apiDelete, apiGet, apiPatch, apiPost, apiPostForm } from '@/lib/api/client';

export type EmploymentStatus = 'ACTIVE' | 'INACTIVE' | 'SEPARATED';

export interface EmploymentAttachment {
  id: string;
  name: string;
  fileType: string;
  fileSizeBytes: number;
  createdAt: string;
}

/** Presigned download path for an inactive/separation attachment. */
export function employmentDocumentDownloadPath(
  userId: string,
  documentId: string,
): string {
  return `/users/${userId}/employment-documents/${documentId}/download-url`;
}

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

export type InactiveType = 'SUSPENDED' | 'LONG_LEAVE' | 'OTHER';

export const INACTIVE_TYPES: InactiveType[] = ['SUSPENDED', 'LONG_LEAVE', 'OTHER'];

export interface EmploymentState {
  employmentStatus: EmploymentStatus;
  /** Current or upcoming inactive period. */
  inactive: {
    id: string;
    type: InactiveType;
    fromDate: string;
    toDate: string | null;
    current: boolean;
    reason?: string | null;
    attachments: EmploymentAttachment[];
  } | null;
  isActive: boolean;
  employmentDate: string | null;
  periods: Array<{
    id: string;
    startDate: string;
    endDate: string | null;
    separationType: SeparationType | null;
    separationReason: string | null;
    separatedAt: string | null;
    attachments: EmploymentAttachment[];
  }>;
  separation: {
    periodId: string;
    leavingDate: string;
    separationType: SeparationType | null;
    reason: string | null;
    effective: boolean;
    canCancel: boolean;
    cancelBlockedReason: string | null;
    attachments: EmploymentAttachment[];
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
  /** Everything the handover step must decide before confirming. */
  handover: HandoverRequirements;
}

export type LeadershipKind = 'DEPARTMENT_LEADER' | 'DISCIPLINE_LEADER' | 'ROLE';

export interface HandoverRequirements {
  tiers: Array<{
    tierId: string;
    requestId: string;
    requestNumber: string;
    title: string;
    tierLabel: string;
  }>;
  leadership: Array<{ kind: LeadershipKind; id: string; name: string }>;
  submittedRequests: Array<{
    requestId: string;
    requestNumber: string;
    title: string;
    status: string;
  }>;
}

export interface HandoverDecision {
  id: string;
  replacementId?: string | null;
  skipReason?: string | null;
}

export interface HandoverPayload {
  tiers: HandoverDecision[];
  leadership: Array<HandoverDecision & { kind: LeadershipKind }>;
  submittedRequests: Array<{ requestId: string; action: 'CANCEL' | 'KEEP' }>;
}

export interface SeparateEmployeePayload {
  leavingDate: string;
  separationType: SeparationType;
  reason: string;
  confirmLockedPayroll?: boolean;
  handover?: HandoverPayload;
  files?: File[];
}

export interface InactivePeriod {
  id: string;
  type: InactiveType;
  fromDate: string;
  toDate: string | null;
  reason: string;
  createdAt: string;
  endedAt: string | null;
  attachments: EmploymentAttachment[];
}

export interface SetInactivePayload {
  type: InactiveType;
  fromDate: string;
  toDate?: string;
  reason: string;
  files?: File[];
}

export type RehireContractType = 'FIXED_TERM' | 'OPEN_ENDED' | 'PROBATION' | 'RENEWAL';

export interface RehirePayload {
  startDate: string;
  contractType: RehireContractType;
  signedAt: string;
  endDate?: string;
  basicSalary: number;
  transportationAllowance?: number;
  monthlyBonus?: number;
  pensionApplicable?: boolean;
  reason: string;
}

export interface RehireResult {
  temporaryPassword: string;
  mustChangePassword: true;
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
  const files = payload.files ?? [];
  if (files.length === 0) {
    return apiPost<EmploymentState>(`/users/${userId}/separation`, {
      leavingDate: payload.leavingDate,
      separationType: payload.separationType,
      reason: payload.reason,
      confirmLockedPayroll: payload.confirmLockedPayroll,
      handover: payload.handover,
    });
  }
  const formData = new FormData();
  formData.append('leavingDate', payload.leavingDate);
  formData.append('separationType', payload.separationType);
  formData.append('reason', payload.reason);
  if (payload.confirmLockedPayroll != null) {
    formData.append('confirmLockedPayroll', String(payload.confirmLockedPayroll));
  }
  if (payload.handover) {
    formData.append('handover', JSON.stringify(payload.handover));
  }
  for (const file of files) {
    formData.append('files', file);
  }
  return apiPostForm<EmploymentState>(`/users/${userId}/separation`, formData);
}

export function cancelSeparation(userId: string): Promise<EmploymentState> {
  return apiDelete<EmploymentState>(`/users/${userId}/separation`);
}

export interface UpdateLeavingDatePayload {
  leavingDate: string;
  confirmLockedPayroll?: boolean;
}

export function updateLeavingDate(
  userId: string,
  payload: UpdateLeavingDatePayload,
): Promise<EmploymentState> {
  return apiPatch<EmploymentState>(`/users/${userId}/separation`, payload);
}

export function listInactivePeriods(userId: string): Promise<InactivePeriod[]> {
  return apiGet<InactivePeriod[]>(`/users/${userId}/inactive-periods`);
}

export function setInactive(
  userId: string,
  payload: SetInactivePayload,
): Promise<InactivePeriod[]> {
  const files = payload.files ?? [];
  if (files.length === 0) {
    return apiPost<InactivePeriod[]>(`/users/${userId}/inactive`, {
      type: payload.type,
      fromDate: payload.fromDate,
      toDate: payload.toDate,
      reason: payload.reason,
    });
  }
  const formData = new FormData();
  formData.append('type', payload.type);
  formData.append('fromDate', payload.fromDate);
  if (payload.toDate) {
    formData.append('toDate', payload.toDate);
  }
  formData.append('reason', payload.reason);
  for (const file of files) {
    formData.append('files', file);
  }
  return apiPostForm<InactivePeriod[]>(`/users/${userId}/inactive`, formData);
}

export function reactivateEmployee(
  userId: string,
  lastInactiveDate?: string,
): Promise<InactivePeriod[]> {
  return apiPost<InactivePeriod[]>(`/users/${userId}/reactivate`, lastInactiveDate ? { lastInactiveDate } : {});
}

export function rehireEmployee(userId: string, payload: RehirePayload): Promise<RehireResult> {
  return apiPost<RehireResult>(`/users/${userId}/rehire`, payload);
}
