export type BackdatingActorKind = 'EMPLOYEE_SELF' | 'HR_ON_BEHALF';

export interface EarliestAllowedDateResponse {
  earliestDate: string;
  actorKind: BackdatingActorKind;
  requiresLateReasonWhenBeforeCurrentMonth: boolean;
}
