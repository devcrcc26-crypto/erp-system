import type { LeavePolicy } from '@/lib/api/leave-policy.types';
import type { HrExportSheet } from '@/lib/utils/hr-export-excel';
import {
  exportBoolean,
  exportCell,
  exportDateTime,
  exportEnumLabel,
  exportNumber,
} from '@/lib/utils/hr-export-excel';

/**
 * Excel export for leave policies, with a second sheet of the per-leave-type
 * rules keyed by policy name.
 */
export function buildLeavePolicyExportSheets(
  rows: LeavePolicy[],
): HrExportSheet[] {
  return [
    {
      name: 'Leave Policies',
      columns: [
        { header: 'Policy Name', key: 'name', width: 28 },
        { header: 'Description', key: 'description', width: 40 },
        { header: 'Governed By', key: 'governedBy', width: 28 },
        { header: 'Active', key: 'isActive', width: 12 },
        { header: 'Employees', key: 'employeeCount', width: 14 },
        { header: 'Rules', key: 'ruleCount', width: 10 },
        { header: 'Created At', key: 'createdAt', width: 18 },
        { header: 'Updated At', key: 'updatedAt', width: 18 },
      ],
      rows: rows.map((row) => ({
        name: exportCell(row.name),
        description: exportCell(row.description),
        governedBy: exportCell(row.governedBy),
        isActive: exportBoolean(row.isActive),
        employeeCount: exportNumber(row.employeeCount),
        ruleCount: exportNumber(row.ruleCount),
        createdAt: exportDateTime(row.createdAt),
        updatedAt: exportDateTime(row.updatedAt),
      })),
    },
    {
      name: 'Rules',
      columns: [
        { header: 'Policy Name', key: 'policyName', width: 28 },
        { header: 'Leave Type', key: 'leaveType', width: 16 },
        { header: 'Base Days', key: 'baseDays', width: 14 },
        { header: 'Progressive', key: 'isProgressive', width: 14 },
        { header: 'Increment Days', key: 'incrementDays', width: 16 },
        {
          header: 'Increment Every (Years)',
          key: 'incrementEveryYears',
          width: 22,
        },
        {
          header: 'Minimum Service (Months)',
          key: 'minimumServiceMonths',
          width: 24,
        },
        { header: 'Max Days Cap', key: 'maxDaysCap', width: 16 },
        {
          header: 'Max Carry Forward Days',
          key: 'maxCarryForwardDays',
          width: 22,
        },
        { header: 'Requires Receipt', key: 'requiresReceipt', width: 18 },
      ],
      rows: rows.flatMap((row) =>
        (row.rules ?? []).map((rule) => ({
          policyName: exportCell(row.name),
          leaveType: exportEnumLabel(rule.leaveType),
          baseDays: exportNumber(rule.baseDays),
          isProgressive: exportBoolean(rule.isProgressive),
          incrementDays: exportNumber(rule.incrementDays),
          incrementEveryYears: exportNumber(rule.incrementEveryYears),
          minimumServiceMonths: exportNumber(rule.minimumServiceMonths),
          maxDaysCap: exportNumber(rule.maxDaysCap),
          maxCarryForwardDays: exportNumber(rule.maxCarryForwardDays),
          requiresReceipt: exportBoolean(rule.requiresReceipt),
        })),
      ),
    },
  ];
}
