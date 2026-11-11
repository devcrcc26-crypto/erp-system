/** HR request modules that support "submit on behalf of" (approval category codes). */
export type OnBehalfModuleCode =
  | 'LEAVE_REQUEST'
  | 'EXPENSE_CLAIM'
  | 'PURCHASE_REQUEST'
  | 'MATERIAL_REQUISITION'
  | 'CONSUMABLES_REQUISITION'
  | 'FLIGHT_APPLICATION'
  | 'BUSINESS_TRIP'
  | 'PER_DIEM'
  | 'VEHICLE_APPLICATION'
  | 'OFFICIAL_SEAL_USAGE'
  | 'PROJECT_SEAL_USAGE'
  | 'VEHICLE_REFUELING'
  | 'OVERTIME_APPLICATION'
  | 'INSPECTION_REPAIR'
  | 'EXIT_PERMIT'
  | 'SITE_ASSIGNMENT'
  | 'WORK_FROM_HOME'
  | 'ASSET_REQUEST';

/** Request types governed by the allowedInitiators policy. */
export type InitiatorModuleCode =
  | 'SITE_ASSIGNMENT'
  | 'WORK_FROM_HOME'
  | 'FLIGHT_APPLICATION'
  | 'BUSINESS_TRIP';

export const INITIATOR_MODULE_CODES: readonly InitiatorModuleCode[] = [
  'SITE_ASSIGNMENT',
  'WORK_FROM_HOME',
  'FLIGHT_APPLICATION',
  'BUSINESS_TRIP',
];

export function isInitiatorModule(code: OnBehalfModuleCode): code is InitiatorModuleCode {
  return (INITIATOR_MODULE_CODES as readonly string[]).includes(code);
}

export type RequestInitiator = 'SELF' | 'SUPERVISOR' | 'DELEGATE';

/** GET /hr/on-behalf/initiable-employees. */
export interface InitiableEmployees {
  allowed: RequestInitiator[];
  selfAllowed: boolean;
  employees: Array<
    Omit<OnBehalfEligibleEmployee, 'discipline' | 'gender'> & {
      discipline?: string | null;
      position: string | null;
      initiatedAs: RequestInitiator;
    }
  >;
}

/** GET /hr/on-behalf/eligible-employees row. */
export interface OnBehalfEligibleEmployee {
  id: string;
  firstName: string;
  middleName: string | null;
  lastName: string;
  employeeId: string | null;
  department: string | null;
  discipline: string | null;
  gender?: 'MALE' | 'FEMALE' | null;
}

/** GET /hr/on-behalf/is-in-chain response. */
export interface OnBehalfChainMembership {
  isInChain: boolean;
  tierLabel: string | null;
  /** False for modules where a delegate may not auto-approve (site assignment). */
  autoApproveAllowed?: boolean;
}

/** Optional on-behalf fields accepted by every HR request create payload. */
export interface OnBehalfPayload {
  onBehalfOfEmployeeId?: string;
  autoApproveTier?: boolean;
}

/** Adds on-behalf fields to a multipart create body (no-op for self-submission). */
export function appendOnBehalfFields(
  formData: FormData,
  payload: OnBehalfPayload,
): void {
  if (!payload.onBehalfOfEmployeeId) {
    return;
  }
  formData.append('onBehalfOfEmployeeId', payload.onBehalfOfEmployeeId);
  formData.append('autoApproveTier', String(payload.autoApproveTier === true));
}
