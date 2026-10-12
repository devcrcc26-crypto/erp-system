/**
 * Central attendance policy knobs (grace, thresholds, early-departure mode).
 * Kept beside enrolment grace so payroll/HR review share one source of truth.
 */

/**
 * Working days from hire date until first scanner punch that are not counted
 * absent (enrolment grace). Shown on attendance daily logs as ENROLMENT_GRACE.
 */
export const ENROLMENT_GRACE_WORKING_DAYS = 3;

/** First clock-in after scheduleStart + this many minutes → late flag only (no pay deduction). */
export const LATE_ARRIVAL_GRACE_MINUTES = 15;

/** Last OUT at or after scheduleEnd − this → not early. */
export const EARLY_DEPARTURE_GRACE_MINUTES = 30;

/** Last OUT earlier than scheduleEnd − this → 0.5 day (or would-deduct in REPORT_ONLY). */
export const EARLY_DEPARTURE_DEDUCT_MINUTES = 60;

/**
 * REPORT_ONLY: store/show would-deduct; paid days unchanged.
 * ENFORCED: subtract early-departure 0.5 from paid days like other half-absences.
 */
export type EarlyDepartureDeductionMode = 'REPORT_ONLY' | 'ENFORCED';

export const EARLY_DEPARTURE_DEDUCTION_MODE: EarlyDepartureDeductionMode =
  'REPORT_ONLY';

/** Monthly FORGOT_CLOCK_IN + FORGOT_CLOCK_OUT approved count that flags review. */
export const FORGOT_TO_CLOCK_FLAG_THRESHOLD = 3;
