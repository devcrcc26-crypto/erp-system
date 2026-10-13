import { dateToYyyyMmDd } from '../services/attendance-leave.util';
import { siteNameForDate } from '../../../site-assignment/application/utils/site-assignment.util';
import {
  employedCalendarDatesForContracts,
  isAbsenceWorkingDay,
  type ContractSegment,
  type DayDeductionContext,
  type DayKind,
} from './day-deduction.util';
import {
  holidayAppliesToNationality,
  holidayFallsOnDate,
} from '../../../work-schedule/application/services/work-schedule.dates';
import {
  resolveDayKindForDate,
  type ScheduleDayFlags,
} from '../../../work-schedule/application/utils/get-day-kind.util';
import type { HolidayNationality, Nationality } from '@prisma/client';

export type ScheduleCoverageKind = 'SITE' | 'WFH' | 'LEAVE';

export interface MissingEmployeeCoverageSummary {
  totalWorkingDays: number;
  coveredWorkingDays: number;
  fullyCovered: boolean;
  /** Tag for UI when fully covered (single dominant source). */
  coverageTag: ScheduleCoverageKind | 'MIXED' | null;
  coverageLabel: string | null;
  siteDays: number;
  wfhDays: number;
  leaveDays: number;
}

export interface ApprovedSiteRange {
  startDate: Date;
  endDate: Date;
  siteName: string;
}

export interface WfhCalendarRow {
  date: Date;
  scope: string;
  departmentIds: string[];
  employeeIds: string[];
}

export interface HolidayRow {
  name: string;
  date: Date;
  isRecurring: boolean;
  appliesToNationality: HolidayNationality;
}

export interface MissingCoverageEmployeeProfile {
  id: string;
  departmentId: string | null;
  nationality: Nationality | null;
}

function wfhAppliesToEmployee(
  row: WfhCalendarRow,
  employee: MissingCoverageEmployeeProfile,
  dateKey: string,
): boolean {
  if (dateToYyyyMmDd(row.date) !== dateKey) {
    return false;
  }
  if (row.employeeIds.includes(employee.id)) {
    return true;
  }
  if (row.scope === 'ALL') {
    return true;
  }
  if (row.scope === 'EMPLOYEES') {
    return false;
  }
  if (row.scope === 'DEPARTMENTS') {
    return (
      employee.departmentId != null &&
      row.departmentIds.includes(employee.departmentId)
    );
  }
  return false;
}

function buildHolidayContext(
  holidays: HolidayRow[],
  nationality: Nationality | null,
  scheduleFlagsByDate?: ReadonlyMap<string, ScheduleDayFlags>,
): Pick<DayDeductionContext, 'dayKind' | 'isSunday' | 'isPublicHoliday'> {
  const applicable = holidays.filter((holiday) =>
    holidayAppliesToNationality(holiday.appliesToNationality, nationality),
  );
  const isPublicHoliday = (date: Date): boolean =>
    applicable.some((holiday) =>
      holidayFallsOnDate(holiday.date, holiday.isRecurring, date),
    );
  const dayKind = (date: Date): DayKind =>
    resolveDayKindForDate(
      date,
      isPublicHoliday(date),
      scheduleFlagsByDate?.get(dateToYyyyMmDd(date)),
    );
  return {
    dayKind,
    isSunday: (date) => dayKind(date) === 'DAY_OFF',
    isPublicHoliday,
  };
}

function coverageKindForDate(
  date: Date,
  employee: MissingCoverageEmployeeProfile,
  sites: ApprovedSiteRange[],
  wfhDays: WfhCalendarRow[],
  leaveDateKeys: Set<string>,
): ScheduleCoverageKind | null {
  const key = dateToYyyyMmDd(date);
  if (siteNameForDate(date, sites)) {
    return 'SITE';
  }
  if (wfhDays.some((row) => wfhAppliesToEmployee(row, employee, key))) {
    return 'WFH';
  }
  if (leaveDateKeys.has(key)) {
    return 'LEAVE';
  }
  return null;
}

function coverageLabelForTag(
  tag: ScheduleCoverageKind | 'MIXED' | null,
): string | null {
  if (tag === 'SITE') {
    return 'Covered by site assignment';
  }
  if (tag === 'WFH') {
    return 'Covered by work from home';
  }
  if (tag === 'LEAVE') {
    return 'Covered by leave';
  }
  if (tag === 'MIXED') {
    return 'Covered by site / WFH / leave';
  }
  return null;
}

/**
 * Counts WORKING / HALF_DAY days in the employment window covered by approved
 * site assignment, WFH calendar rows, or approved leave.
 */
export function summarizeMissingEmployeeCoverage(input: {
  month: number;
  year: number;
  contractSegments: ContractSegment[];
  employee: MissingCoverageEmployeeProfile;
  holidays: HolidayRow[];
  approvedSites: ApprovedSiteRange[];
  wfhDays: WfhCalendarRow[];
  leaveDateKeys: Set<string>;
  /** Per-date schedule flags; omitted → Mon–Sat / Sunday-off fallback. */
  scheduleFlagsByDate?: ReadonlyMap<string, ScheduleDayFlags>;
}): MissingEmployeeCoverageSummary {
  const holidayContext = buildHolidayContext(
    input.holidays,
    input.employee.nationality,
    input.scheduleFlagsByDate,
  );
  const employedDates = employedCalendarDatesForContracts(
    input.month,
    input.year,
    input.contractSegments,
  );

  let totalWorkingDays = 0;
  let coveredWorkingDays = 0;
  let siteDays = 0;
  let wfhDays = 0;
  let leaveDays = 0;
  const kindsSeen = new Set<ScheduleCoverageKind>();

  for (const date of employedDates) {
    if (!isAbsenceWorkingDay(date, holidayContext)) {
      continue;
    }
    totalWorkingDays += 1;
    const kind = coverageKindForDate(
      date,
      input.employee,
      input.approvedSites,
      input.wfhDays,
      input.leaveDateKeys,
    );
    if (!kind) {
      continue;
    }
    coveredWorkingDays += 1;
    kindsSeen.add(kind);
    if (kind === 'SITE') {
      siteDays += 1;
    } else if (kind === 'WFH') {
      wfhDays += 1;
    } else {
      leaveDays += 1;
    }
  }

  const fullyCovered =
    totalWorkingDays > 0 && coveredWorkingDays === totalWorkingDays;

  let coverageTag: ScheduleCoverageKind | 'MIXED' | null = null;
  if (fullyCovered) {
    if (kindsSeen.size === 1) {
      coverageTag = [...kindsSeen][0] ?? null;
    } else if (kindsSeen.size > 1) {
      coverageTag = 'MIXED';
    }
  }

  const partialLabel =
    !fullyCovered && coveredWorkingDays > 0
      ? `Covered ${coveredWorkingDays} of ${totalWorkingDays} days`
      : null;

  return {
    totalWorkingDays,
    coveredWorkingDays,
    fullyCovered,
    coverageTag,
    coverageLabel: fullyCovered
      ? coverageLabelForTag(coverageTag)
      : partialLabel,
    siteDays,
    wfhDays,
    leaveDays,
  };
}
