import {
  POLICY_DEFAULTS,
  type DeductionMode,
} from '../../../../shared/policy/policy-definitions';

/** REPORT_ONLY: store/show would-deduct, paid days unchanged. ENFORCED: subtract it. */
export type EarlyDepartureDeductionMode = DeductionMode;

export type EarlyDepartureBand =
  | 'NONE'
  | 'FLAG'
  | 'OVER_1H'
  | 'COVERED_APPROVED'
  | 'PENDING_APPROVAL';

export type FieldMovementCoverageKind = 'NONE' | 'APPROVED' | 'PENDING';

export interface EarlyDepartureEvaluation {
  band: EarlyDepartureBand;
  /** Minutes before scheduled end (0 when not early). */
  minutesEarly: number;
  /** Deduction applied to paid days (0 in REPORT_ONLY or when covered). */
  appliedDeduction: 0 | 0.5;
  /** Amount that would deduct if ENFORCED (for review / payroll notes). */
  wouldDeduct: 0 | 0.5;
  isEarlyLeaveFlag: boolean;
}

function timeToMinutes(value: string): number {
  const [h, m] = value.split(':').map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
}

/**
 * Late flag: clock-in after scheduleStart + lateGraceMinutes (policy). Pay is
 * only affected when the lateDeductionMode policy is ENFORCED (monthly count).
 */
export function isLateAfterGrace(
  clockIn: string | null | undefined,
  scheduleStart: string | null | undefined,
  graceMinutes: number = POLICY_DEFAULTS.lateGraceMinutes,
): { isLate: boolean; lateMinutes: number } {
  if (!clockIn || !scheduleStart) {
    return { isLate: false, lateMinutes: 0 };
  }
  const inMins = timeToMinutes(clockIn);
  const startMins = timeToMinutes(scheduleStart);
  const threshold = startMins + graceMinutes;
  if (inMins <= threshold) {
    return { isLate: false, lateMinutes: 0 };
  }
  return { isLate: true, lateMinutes: inMins - startMins };
}

/**
 * Monthly late-arrival deduction: ENFORCED → 0.5 day per `latesPerHalfDay`
 * late arrivals (whole groups only); REPORT_ONLY → 0.
 */
export function lateArrivalDeduction(
  lateCount: number,
  mode: DeductionMode = POLICY_DEFAULTS.lateDeductionMode,
  latesPerHalfDay: number = POLICY_DEFAULTS.latesPerHalfDay,
): number {
  if (mode !== 'ENFORCED' || latesPerHalfDay < 1) return 0;
  return Math.floor(lateCount / latesPerHalfDay) * 0.5;
}

/**
 * Tiered early departure vs schedule end (weekday 17:30 / Saturday half-day 12:30).
 * Same grace (earlyDepartureGraceMinutes policy) applies on weekdays and Saturdays.
 */
export function evaluateEarlyDeparture(input: {
  clockOut: string | null | undefined;
  scheduledEnd: string | null | undefined;
  /** Approved / pending field movement covering this day. */
  fieldMovement: FieldMovementCoverageKind;
  /**
   * When true, skip early-departure logic entirely (site/WFH/leave/holiday/
   * Sunday/exempt/counted-present/missing-punch day).
   */
  skipEarlyDeparture?: boolean;
  mode?: EarlyDepartureDeductionMode;
  graceMinutes?: number;
  deductMinutes?: number;
}): EarlyDepartureEvaluation {
  const mode = input.mode ?? POLICY_DEFAULTS.earlyDepartureMode;
  const grace = input.graceMinutes ?? POLICY_DEFAULTS.earlyDepartureGraceMinutes;
  const deductAt = input.deductMinutes ?? POLICY_DEFAULTS.earlyDepartureDeductMinutes;

  if (input.skipEarlyDeparture || !input.clockOut || !input.scheduledEnd) {
    return {
      band: 'NONE',
      minutesEarly: 0,
      appliedDeduction: 0,
      wouldDeduct: 0,
      isEarlyLeaveFlag: false,
    };
  }

  const outMins = timeToMinutes(input.clockOut);
  const endMins = timeToMinutes(input.scheduledEnd);
  const minutesEarly = Math.max(0, endMins - outMins);

  if (minutesEarly <= grace) {
    return {
      band: 'NONE',
      minutesEarly: 0,
      appliedDeduction: 0,
      wouldDeduct: 0,
      isEarlyLeaveFlag: false,
    };
  }

  if (input.fieldMovement === 'APPROVED') {
    return {
      band: 'COVERED_APPROVED',
      minutesEarly,
      appliedDeduction: 0,
      wouldDeduct: 0,
      isEarlyLeaveFlag: true,
    };
  }

  // end − 60 <= OUT < end − grace → flag only (exactly 60 min early is still FLAG).
  if (minutesEarly <= deductAt) {
    if (input.fieldMovement === 'PENDING') {
      return {
        band: 'PENDING_APPROVAL',
        minutesEarly,
        appliedDeduction: 0,
        wouldDeduct: 0,
        isEarlyLeaveFlag: true,
      };
    }
    return {
      band: 'FLAG',
      minutesEarly,
      appliedDeduction: 0,
      wouldDeduct: 0,
      isEarlyLeaveFlag: true,
    };
  }

  // OUT < end − 60. REPORT_ONLY never changes paid days (appliedDeduction 0);
  // ENFORCED applies 0.5. Pending EARLY_LEAVE/FIELD_VISIT does not waive.
  const wouldDeduct = 0.5 as const;
  const applied: 0 | 0.5 = mode === 'ENFORCED' ? 0.5 : 0;

  if (input.fieldMovement === 'PENDING') {
    return {
      band: 'PENDING_APPROVAL',
      minutesEarly,
      appliedDeduction: applied,
      wouldDeduct,
      isEarlyLeaveFlag: true,
    };
  }

  return {
    band: 'OVER_1H',
    minutesEarly,
    appliedDeduction: applied,
    wouldDeduct,
    isEarlyLeaveFlag: true,
  };
}
