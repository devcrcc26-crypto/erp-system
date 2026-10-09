import { describe, expect, it } from '@jest/globals';
import { Nationality } from '@prisma/client';
import { dateToYyyyMmDd } from '../services/attendance-leave.util';
import {
  summarizeMissingEmployeeCoverage,
  type ApprovedSiteRange,
} from './attendance-import-coverage.util';

function d(year: number, month: number, day: number): Date {
  return new Date(Date.UTC(year, month - 1, day));
}

const employee = {
  id: 'emp-1',
  departmentId: 'dept-1',
  nationality: Nationality.ETHIOPIAN,
};

const fullMonthContract = [{ startDate: d(2020, 1, 1), endDate: null }];

describe('summarizeMissingEmployeeCoverage', () => {
  it('approved site Mon–Wed only → 3 of August working days covered', () => {
    const sites: ApprovedSiteRange[] = [
      {
        startDate: d(2026, 8, 3),
        endDate: d(2026, 8, 5),
        siteName: 'Site A',
      },
    ];
    const result = summarizeMissingEmployeeCoverage({
      month: 8,
      year: 2026,
      contractSegments: fullMonthContract,
      employee,
      holidays: [],
      approvedSites: sites,
      wfhDays: [],
      leaveDateKeys: new Set(),
    });
    expect(result.siteDays).toBe(3);
    expect(result.fullyCovered).toBe(false);
    expect(result.coverageLabel).toMatch(/^Covered 3 of \d+ days$/);
  });

  it('full month on approved site → fully covered with site tag', () => {
    const sites: ApprovedSiteRange[] = [
      {
        startDate: d(2026, 8, 1),
        endDate: d(2026, 8, 31),
        siteName: 'Remote camp',
      },
    ];
    const result = summarizeMissingEmployeeCoverage({
      month: 8,
      year: 2026,
      contractSegments: fullMonthContract,
      employee,
      holidays: [],
      approvedSites: sites,
      wfhDays: [],
      leaveDateKeys: new Set(),
    });
    expect(result.fullyCovered).toBe(true);
    expect(result.coverageTag).toBe('SITE');
    expect(result.coverageLabel).toBe('Covered by site assignment');
  });

  it('WFH row for one day → that day counts toward coverage', () => {
    const wfhDate = d(2026, 8, 12);
    const result = summarizeMissingEmployeeCoverage({
      month: 8,
      year: 2026,
      contractSegments: fullMonthContract,
      employee,
      holidays: [],
      approvedSites: [],
      wfhDays: [
        {
          date: wfhDate,
          scope: 'EMPLOYEES',
          departmentIds: [],
          employeeIds: [employee.id],
        },
      ],
      leaveDateKeys: new Set(),
    });
    expect(result.wfhDays).toBe(1);
    expect(result.coveredWorkingDays).toBe(1);
    expect(result.fullyCovered).toBe(false);
  });

  it('approved leave date key covers that working day', () => {
    const leaveDay = d(2026, 8, 6);
    const result = summarizeMissingEmployeeCoverage({
      month: 8,
      year: 2026,
      contractSegments: fullMonthContract,
      employee,
      holidays: [],
      approvedSites: [],
      wfhDays: [],
      leaveDateKeys: new Set([dateToYyyyMmDd(leaveDay)]),
    });
    expect(result.leaveDays).toBe(1);
  });

  it('unpaid leave dates are not passed as leaveDateKeys → no COVERED from unpaid only', () => {
    const result = summarizeMissingEmployeeCoverage({
      month: 8,
      year: 2026,
      contractSegments: fullMonthContract,
      employee,
      holidays: [],
      approvedSites: [],
      wfhDays: [],
      // Caller excludes UNPAID from leaveDateKeys (see attendance.service).
      leaveDateKeys: new Set(),
    });
    expect(result.coveredWorkingDays).toBe(0);
    expect(result.fullyCovered).toBe(false);
    expect(result.coverageTag).toBeNull();
  });
});
