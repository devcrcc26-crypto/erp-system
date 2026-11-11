export type LeavePolicyLeaveType = 'ANNUAL' | 'MATERNITY' | 'SICK';

export interface LeavePolicyRule {
  id?: string;
  leaveType: LeavePolicyLeaveType | string;
  baseDays: number;
  isProgressive: boolean;
  incrementDays: number | null;
  incrementEveryYears: number | null;
  minimumServiceMonths: number;
  maxDaysCap: number | null;
  maxCarryForwardDays: number | null;
  requiresReceipt: boolean;
}

export interface LeavePolicy {
  id: string;
  companyId: string;
  name: string;
  description: string | null;
  governedBy: string | null;
  isActive: boolean;
  employeeCount: number;
  ruleCount: number;
  rules: LeavePolicyRule[];
  createdAt: string;
  updatedAt: string;
}

export interface LeavePolicyRuleInput {
  leaveType: LeavePolicyLeaveType;
  baseDays: number;
  isProgressive?: boolean;
  incrementDays?: number;
  incrementEveryYears?: number;
  minimumServiceMonths?: number;
  maxDaysCap?: number;
  maxCarryForwardDays?: number;
  requiresReceipt?: boolean;
}

export interface CreateLeavePolicyPayload {
  name: string;
  description?: string;
  governedBy?: string;
  isActive?: boolean;
  rules: LeavePolicyRuleInput[];
}

export interface UpdateLeavePolicyPayload {
  name?: string;
  description?: string | null;
  governedBy?: string | null;
  isActive?: boolean;
  rules?: LeavePolicyRuleInput[];
}
