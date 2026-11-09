/**
 * HR policy settings: keys, types, defaults and validation.
 * Defaults reproduce the behaviour that was hard-coded before policy settings
 * existed; a company with no saved versions calculates exactly as before.
 */

export type PolicyGroup = 'ATTENDANCE' | 'PAYROLL' | 'OVERTIME' | 'REQUESTS' | 'SEPARATION' | 'INACTIVE';
export type DeductionMode = 'REPORT_ONLY' | 'ENFORCED';
export type InactiveType = 'SUSPENDED' | 'LONG_LEAVE' | 'OTHER';

/** Who may file a request: the employee, their direct supervisor, or a delegate. */
export type RequestInitiator = 'SELF' | 'SUPERVISOR' | 'DELEGATE';

/** Request types governed by allowedInitiators. */
export type InitiatorRequestType =
  | 'SITE_ASSIGNMENT'
  | 'WORK_FROM_HOME'
  | 'FLIGHT_APPLICATION'
  | 'BUSINESS_TRIP';

export const REQUEST_INITIATORS: readonly RequestInitiator[] = ['SELF', 'SUPERVISOR', 'DELEGATE'];
export const INITIATOR_REQUEST_TYPES: readonly InitiatorRequestType[] = [
  'SITE_ASSIGNMENT',
  'WORK_FROM_HOME',
  'FLIGHT_APPLICATION',
  'BUSINESS_TRIP',
];

export interface TaxBracket {
  /** Upper bound of taxable income for this band (inclusive); null = no upper bound. */
  upTo: number | null;
  /** Percent, e.g. 15 for 15 %. */
  rate: number;
  /** Fixed amount subtracted: tax = income × rate − deduction. */
  deduction: number;
}

export interface PolicyValues {
  // Attendance
  lateGraceMinutes: number;
  lateDeductionMode: DeductionMode;
  latesPerHalfDay: number;
  earlyDepartureGraceMinutes: number;
  earlyDepartureDeductMinutes: number;
  earlyDepartureMode: DeductionMode;
  /** null = grace lasts from hire until the day after the first scan (no cap). */
  enrolmentGraceWorkingDays: number | null;
  forgotToClockFlagThreshold: number;
  unpaidLeaveCountsRestDays: boolean;
  // Payroll
  monthDays: number;
  leaverAllowanceMode: 'PRORATED' | 'FULL';
  allowancesReducedByAbsence: boolean;
  pensionEmployeePct: number;
  pensionEmployerPct: number;
  pensionBase: 'EARNED';
  incomeTaxBrackets: TaxBracket[];
  transportTaxable: boolean;
  // Overtime
  hoursDivisor: number;
  holidayHoursDivisor: number;
  multipliers: { regular: number; night: number; weekend: number; holiday: number };
  lunchCountsAsOvertime: boolean;
  /** On approved site-assignment days, scheduled office hours are claimable OT. */
  siteDayScheduledHoursClaimable: boolean;
  // Requests
  /** Allowed initiators per request type (full-access roles may always file as DELEGATE). */
  allowedInitiators: Record<InitiatorRequestType, RequestInitiator[]>;
  // Separation (stored for phase 2; not used by calculations yet)
  /**
   * prorateCurrentYear: pay leave earned in the current leave year up to the
   * leaving date (entitlement × elapsed share), not the full year's entitlement.
   */
  unusedLeavePayout: { enabled: boolean; dailyRateBase: 'basic/30'; prorateCurrentYear: boolean };
  severancePay: { enabled: boolean; parameters: Record<string, unknown> };
  noticePay: { enabled: boolean; days: number };
  // Inactive periods (attendance pay + login)
  inactivePaid: Record<InactiveType, boolean>;
  inactiveCanLogin: Record<InactiveType, boolean>;
}

export type PolicyKey = keyof PolicyValues;

export const POLICY_DEFAULTS: Readonly<PolicyValues> = Object.freeze({
  lateGraceMinutes: 15,
  lateDeductionMode: 'REPORT_ONLY',
  latesPerHalfDay: 2,
  earlyDepartureGraceMinutes: 15,
  earlyDepartureDeductMinutes: 60,
  earlyDepartureMode: 'REPORT_ONLY',
  enrolmentGraceWorkingDays: 5,
  forgotToClockFlagThreshold: 3,
  unpaidLeaveCountsRestDays: false,
  monthDays: 30,
  leaverAllowanceMode: 'PRORATED',
  allowancesReducedByAbsence: false,
  pensionEmployeePct: 7,
  pensionEmployerPct: 11,
  pensionBase: 'EARNED',
  incomeTaxBrackets: [
    { upTo: 2000, rate: 0, deduction: 0 },
    { upTo: 4000, rate: 15, deduction: 300 },
    { upTo: 7000, rate: 20, deduction: 500 },
    { upTo: 10000, rate: 25, deduction: 850 },
    { upTo: 14000, rate: 30, deduction: 1350 },
    { upTo: null, rate: 35, deduction: 2050 },
  ],
  transportTaxable: false,
  hoursDivisor: 192,
  holidayHoursDivisor: 196,
  multipliers: { regular: 1.5, night: 1.75, weekend: 2, holiday: 2.5 },
  lunchCountsAsOvertime: false,
  siteDayScheduledHoursClaimable: false,
  allowedInitiators: {
    SITE_ASSIGNMENT: ['SUPERVISOR', 'DELEGATE'],
    WORK_FROM_HOME: ['SELF', 'SUPERVISOR', 'DELEGATE'],
    FLIGHT_APPLICATION: ['SELF', 'DELEGATE'],
    BUSINESS_TRIP: ['SELF', 'SUPERVISOR', 'DELEGATE'],
  },
  unusedLeavePayout: { enabled: false, dailyRateBase: 'basic/30', prorateCurrentYear: true },
  severancePay: { enabled: false, parameters: {} },
  noticePay: { enabled: false, days: 0 },
  inactivePaid: { SUSPENDED: false, LONG_LEAVE: false, OTHER: false },
  inactiveCanLogin: { SUSPENDED: false, LONG_LEAVE: true, OTHER: false },
} satisfies PolicyValues);

export interface PolicyDefinition {
  key: PolicyKey;
  group: PolicyGroup;
  /** Only System Administrators may change it (HR Manager can view). */
  adminOnly: boolean;
  /** UI editor shape. */
  kind:
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
  options?: readonly string[];
  /** Saved but not read by any calculation yet (phase 2 features). */
  informational?: boolean;
  /** Value is fixed for now; the editor shows it read-only. */
  locked?: boolean;
  /**
   * Takes effect when saved: the version is dated to the current month and no
   * payroll run is affected (not read by any calculation).
   */
  immediate?: boolean;
  validate: (value: unknown) => string | null;
}

const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

function intIn(min: number, max: number) {
  return (v: unknown): string | null =>
    Number.isInteger(v) && (v as number) >= min && (v as number) <= max
      ? null
      : `Must be a whole number from ${min} to ${max}`;
}

function numIn(min: number, max: number) {
  return (v: unknown): string | null =>
    typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max
      ? null
      : `Must be a number from ${min} to ${max}`;
}

const isBool = (v: unknown): string | null =>
  typeof v === 'boolean' ? null : 'Must be true or false';

function oneOf(options: readonly string[]) {
  return (v: unknown): string | null =>
    typeof v === 'string' && options.includes(v) ? null : `Must be one of ${options.join(', ')}`;
}

function exactly(expected: unknown) {
  return (v: unknown): string | null =>
    v === expected ? null : `Fixed at ${String(expected)} for now`;
}

function boolRecord(keys: readonly string[]) {
  return (v: unknown): string | null => {
    if (!isObject(v)) return 'Must be an object';
    for (const k of keys) {
      if (typeof v[k] !== 'boolean') return `${k} must be true or false`;
    }
    const extra = Object.keys(v).filter((k) => !keys.includes(k));
    return extra.length ? `Unknown field(s): ${extra.join(', ')}` : null;
  };
}

export function validateTaxBrackets(v: unknown): string | null {
  if (!Array.isArray(v) || v.length === 0) return 'At least one tax band is required';
  let previous = -Infinity;
  for (let i = 0; i < v.length; i += 1) {
    const b = v[i] as Record<string, unknown>;
    if (!isObject(b)) return `Band ${i + 1} is invalid`;
    const last = i === v.length - 1;
    if (last) {
      if (b.upTo !== null) return 'The last band must have no upper limit';
    } else if (typeof b.upTo !== 'number' || !(b.upTo > previous)) {
      return `Band ${i + 1}: upper limit must be greater than the previous band`;
    }
    if (typeof b.rate !== 'number' || b.rate < 0 || b.rate > 100) {
      return `Band ${i + 1}: rate must be 0–100 %`;
    }
    if (typeof b.deduction !== 'number' || b.deduction < 0) {
      return `Band ${i + 1}: deduction must be 0 or more`;
    }
    if (!last) previous = b.upTo as number;
  }
  return null;
}

export function validateAllowedInitiators(v: unknown): string | null {
  if (!isObject(v)) return 'Must be an object';
  const extra = Object.keys(v).filter((k) => !INITIATOR_REQUEST_TYPES.includes(k as InitiatorRequestType));
  if (extra.length) return `Unknown request type(s): ${extra.join(', ')}`;
  for (const type of INITIATOR_REQUEST_TYPES) {
    const list = v[type];
    if (!Array.isArray(list) || list.length === 0) return `${type}: choose at least one initiator`;
    if (new Set(list).size !== list.length) return `${type}: duplicate initiator`;
    const bad = list.filter((i) => !REQUEST_INITIATORS.includes(i as RequestInitiator));
    if (bad.length) return `${type}: unknown initiator(s) ${bad.join(', ')}`;
  }
  return null;
}

const INACTIVE_TYPES = ['SUSPENDED', 'LONG_LEAVE', 'OTHER'] as const;
const MODES = ['REPORT_ONLY', 'ENFORCED'] as const;

export const POLICY_DEFINITIONS: readonly PolicyDefinition[] = [
  { key: 'lateGraceMinutes', group: 'ATTENDANCE', adminOnly: false, kind: 'integer', validate: intIn(0, 120) },
  { key: 'lateDeductionMode', group: 'ATTENDANCE', adminOnly: false, kind: 'mode', options: MODES, validate: oneOf(MODES) },
  { key: 'latesPerHalfDay', group: 'ATTENDANCE', adminOnly: false, kind: 'integer', validate: intIn(1, 31) },
  { key: 'earlyDepartureGraceMinutes', group: 'ATTENDANCE', adminOnly: false, kind: 'integer', validate: intIn(0, 240) },
  {
    key: 'earlyDepartureDeductMinutes',
    group: 'ATTENDANCE',
    adminOnly: false,
    kind: 'integer',
    validate: intIn(1, 480),
  },
  { key: 'earlyDepartureMode', group: 'ATTENDANCE', adminOnly: false, kind: 'mode', options: MODES, validate: oneOf(MODES) },
  {
    key: 'enrolmentGraceWorkingDays',
    group: 'ATTENDANCE',
    adminOnly: false,
    kind: 'nullableInteger',
    validate: (v) => (v === null ? null : intIn(1, 60)(v)),
  },
  { key: 'forgotToClockFlagThreshold', group: 'ATTENDANCE', adminOnly: false, kind: 'integer', validate: intIn(1, 31) },
  { key: 'unpaidLeaveCountsRestDays', group: 'ATTENDANCE', adminOnly: false, kind: 'boolean', validate: isBool },
  // The joiner/leaver/renewal day-split rules are built on a 30-day month.
  { key: 'monthDays', group: 'PAYROLL', adminOnly: false, kind: 'integer', locked: true, validate: exactly(30) },
  {
    key: 'leaverAllowanceMode',
    group: 'PAYROLL',
    adminOnly: false,
    kind: 'enum',
    options: ['PRORATED', 'FULL'],
    validate: oneOf(['PRORATED', 'FULL']),
  },
  { key: 'allowancesReducedByAbsence', group: 'PAYROLL', adminOnly: false, kind: 'boolean', validate: isBool },
  { key: 'pensionEmployeePct', group: 'PAYROLL', adminOnly: true, kind: 'number', validate: numIn(0, 50) },
  { key: 'pensionEmployerPct', group: 'PAYROLL', adminOnly: true, kind: 'number', validate: numIn(0, 50) },
  {
    key: 'pensionBase',
    group: 'PAYROLL',
    adminOnly: true,
    kind: 'enum',
    options: ['EARNED'],
    locked: true,
    validate: oneOf(['EARNED']),
  },
  { key: 'incomeTaxBrackets', group: 'PAYROLL', adminOnly: true, kind: 'taxBrackets', validate: validateTaxBrackets },
  { key: 'transportTaxable', group: 'PAYROLL', adminOnly: true, kind: 'boolean', validate: isBool },
  { key: 'hoursDivisor', group: 'OVERTIME', adminOnly: false, kind: 'number', validate: numIn(1, 400) },
  { key: 'holidayHoursDivisor', group: 'OVERTIME', adminOnly: false, kind: 'number', validate: numIn(1, 400) },
  {
    key: 'multipliers',
    group: 'OVERTIME',
    adminOnly: false,
    kind: 'multipliers',
    validate: (v) => {
      if (!isObject(v)) return 'Must be an object';
      for (const k of ['regular', 'night', 'weekend', 'holiday']) {
        const n = v[k];
        if (typeof n !== 'number' || !Number.isFinite(n) || n < 1 || n > 10) {
          return `${k} must be a number from 1 to 10`;
        }
      }
      return Object.keys(v).length === 4 ? null : 'Only regular, night, weekend and holiday are allowed';
    },
  },
  { key: 'lunchCountsAsOvertime', group: 'OVERTIME', adminOnly: false, kind: 'boolean', validate: isBool },
  {
    key: 'siteDayScheduledHoursClaimable',
    group: 'OVERTIME',
    adminOnly: true,
    kind: 'boolean',
    validate: isBool,
  },
  {
    key: 'allowedInitiators',
    group: 'REQUESTS',
    adminOnly: true,
    kind: 'initiators',
    immediate: true,
    validate: validateAllowedInitiators,
  },
  {
    key: 'unusedLeavePayout',
    group: 'SEPARATION',
    adminOnly: false,
    kind: 'json',
    validate: (v) => {
      if (!isObject(v)) return 'Must be an object';
      if (typeof v.enabled !== 'boolean') return 'enabled must be true or false';
      if (v.dailyRateBase !== 'basic/30') return 'dailyRateBase must be "basic/30"';
      // Optional for values saved before the field existed (treated as true).
      if (v.prorateCurrentYear !== undefined && typeof v.prorateCurrentYear !== 'boolean') {
        return 'prorateCurrentYear must be true or false';
      }
      return null;
    },
  },
  {
    key: 'severancePay',
    group: 'SEPARATION',
    adminOnly: false,
    kind: 'json',
    validate: (v) => {
      if (!isObject(v)) return 'Must be an object';
      if (typeof v.enabled !== 'boolean') return 'enabled must be true or false';
      if (!isObject(v.parameters)) return 'parameters must be a JSON object';
      return null;
    },
  },
  {
    key: 'noticePay',
    group: 'SEPARATION',
    adminOnly: false,
    kind: 'json',
    validate: (v) => {
      if (!isObject(v)) return 'Must be an object';
      if (typeof v.enabled !== 'boolean') return 'enabled must be true or false';
      return intIn(0, 365)(v.days);
    },
  },
  {
    key: 'inactivePaid',
    group: 'INACTIVE',
    adminOnly: false,
    kind: 'json',
    validate: boolRecord(INACTIVE_TYPES),
  },
  {
    key: 'inactiveCanLogin',
    group: 'INACTIVE',
    adminOnly: false,
    kind: 'json',
    validate: boolRecord(INACTIVE_TYPES),
  },
];

const DEFINITION_BY_KEY = new Map(POLICY_DEFINITIONS.map((d) => [d.key, d]));

export function policyDefinition(key: string): PolicyDefinition | undefined {
  return DEFINITION_BY_KEY.get(key as PolicyKey);
}

/** Cross-field rules that a single value can't express. */
export function validateAgainstSnapshot(
  key: PolicyKey,
  value: unknown,
  snapshot: PolicyValues,
): string | null {
  if (key === 'earlyDepartureDeductMinutes' && (value as number) <= snapshot.earlyDepartureGraceMinutes) {
    return 'Must be longer than the early-departure grace';
  }
  if (key === 'earlyDepartureGraceMinutes' && (value as number) >= snapshot.earlyDepartureDeductMinutes) {
    return 'Must be shorter than the early-departure deduction threshold';
  }
  return null;
}

/** Progressive income tax using the configured bands (same arithmetic as the old table). */
export function incomeTaxFromBrackets(taxableIncome: number, brackets: readonly TaxBracket[]): number {
  for (const band of brackets) {
    if (band.upTo === null || taxableIncome <= band.upTo) {
      if (band.rate === 0 && band.deduction === 0) return 0;
      return taxableIncome * (band.rate / 100) - band.deduction;
    }
  }
  return 0;
}
