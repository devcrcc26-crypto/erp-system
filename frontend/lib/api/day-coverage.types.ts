export type DayCoverModule =
  | 'LEAVE'
  | 'SITE_ASSIGNMENT'
  | 'WORK_FROM_HOME'
  | 'FIELD_MOVEMENT'
  | 'ATTENDANCE';

export type DayCoverState = 'APPROVED' | 'REQUESTED';

export interface DayCover {
  date: string;
  module: DayCoverModule;
  state: DayCoverState;
  reference?: string | null;
}

export interface DayCoverageParams {
  employeeId: string;
  from: string;
  to: string;
  /** Prefer sorting this module's covers first. */
  focus?: DayCoverModule;
}

export interface DayCoverageResponse {
  covers: DayCover[];
}
