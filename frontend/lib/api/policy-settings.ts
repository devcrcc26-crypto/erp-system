import { apiGet, apiPost } from '@/lib/api/client';

export type PolicyGroup =
  | 'ATTENDANCE'
  | 'PAYROLL'
  | 'OVERTIME'
  | 'REQUESTS'
  | 'SEPARATION'
  | 'INACTIVE';

export type PolicyKind =
  | 'integer'
  | 'number'
  | 'boolean'
  | 'mode'
  | 'enum'
  | 'nullableInteger'
  | 'taxBrackets'
  | 'multipliers'
  | 'initiators'
  | 'json';

export interface TaxBracket {
  upTo: number | null;
  rate: number;
  deduction: number;
}

export interface PolicyHistoryItem {
  id: string;
  effectiveFrom: string;
  value: unknown;
  previousValue: unknown;
  reason: string;
  createdAt: string;
  createdBy: { id: string; name: string } | null;
}

export interface PolicyItem {
  key: string;
  group: PolicyGroup;
  kind: PolicyKind;
  options: string[] | null;
  adminOnly: boolean;
  informational: boolean;
  locked: boolean;
  /** Takes effect when saved (no effective month). */
  immediate?: boolean;
  defaultValue: unknown;
  currentValue: unknown;
  currentSource: 'DEFAULT' | 'SETTING';
  scheduled: Array<{ effectiveFrom: string; value: unknown }>;
  history: PolicyHistoryItem[];
}

export interface PolicySettingsList {
  canEdit: boolean;
  canEditAdminOnly: boolean;
  currentMonth: string;
  items: PolicyItem[];
}

export interface AffectedRun {
  id: string;
  runNumber: string;
  month: number;
  year: number;
  status: string;
  effect: 'STALE' | 'REVIEW_REQUIRED';
}

export interface SavePolicyPayload {
  value: unknown;
  effectiveFrom: string;
  reason: string;
  confirmAffectedRuns?: boolean;
}

export function listPolicySettings(): Promise<PolicySettingsList> {
  return apiGet<PolicySettingsList>('/policy-settings');
}

export function previewPolicyChange(
  key: string,
  effectiveFrom: string,
): Promise<{ affectedRuns: AffectedRun[] }> {
  return apiPost<{ affectedRuns: AffectedRun[] }>(`/policy-settings/${key}/preview`, {
    effectiveFrom,
  });
}

export function savePolicy(key: string, payload: SavePolicyPayload): Promise<PolicyItem> {
  return apiPost<PolicyItem>(`/policy-settings/${key}`, payload);
}
