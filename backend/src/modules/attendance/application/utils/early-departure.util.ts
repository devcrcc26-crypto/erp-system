import {
  EARLY_DEPARTURE_DEDUCT_MINUTES,
  EARLY_DEPARTURE_DEDUCTION_MODE,
  EARLY_DEPARTURE_GRACE_MINUTES,
  LATE_ARRIVAL_GRACE_MINUTES,
  type EarlyDepartureDeductionMode,
} from './attendance-policy.constants';

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
 * Late flag only: clock-in after scheduleStart + LATE_ARRIVAL_GRACE_MINUTES.
 * Never contributes to pay deduction.
 */
export function isLateAfterGrace(
  clockIn: string | null | undefined,
  scheduleStart: string | null | undefined,
  graceMinutes: number = LATE_ARRIVAL_GRACE_MINUTES,
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
 * Tiered early departure vs schedule end (weekday 17:30 / Saturday half-day end).
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
  const mode = input.mode ?? EARLY_DEPARTURE_DEDUCTION_MODE;
  const grace = input.graceMinutes ?? EARLY_DEPARTURE_GRACE_MINUTES;
  const deductAt = input.deductMinutes ?? EARLY_DEPARTURE_DEDUCT_MINUTES;

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

  // end − 60 <= OUT < end − 15 → flag only (exactly 60 min early is still FLAG).
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

  // OUT < end − 60: pending FM does not waive — still deduct (even in REPORT_ONLY)
  // until approved; REPORT_ONLY without FM only stores would-deduct.
  if (input.fieldMovement === 'PENDING') {
    return {
      band: 'PENDING_APPROVAL',
      minutesEarly,
      appliedDeduction: 0.5,
      wouldDeduct: 0.5,
      isEarlyLeaveFlag: true,
    };
  }

  const wouldDeduct = 0.5 as const;
  return {
    band: 'OVER_1H',
    minutesEarly,
    appliedDeduction: mode === 'ENFORCED' ? 0.5 : 0,
    wouldDeduct,
    isEarlyLeaveFlag: true,
  };
}
