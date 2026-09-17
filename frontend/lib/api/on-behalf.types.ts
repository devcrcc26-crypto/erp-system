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
  | 'EXIT_PERMIT';

/** GET /hr/on-behalf/eligible-employees row. */
export interface OnBehalfEligibleEmployee {
  id: string;
  firstName: string;
  lastName: string;
  employeeId: string | null;
  department: string | null;
  discipline: string | null;
}

/** GET /hr/on-behalf/is-in-chain response. */
export interface OnBehalfChainMembership {
  isInChain: boolean;
  tierLabel: string | null;
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
