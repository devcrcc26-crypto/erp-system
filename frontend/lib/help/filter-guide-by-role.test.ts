import { describe, expect, it } from 'vitest';
import {
  filterGuideByRole,
  parseGuideRoleTag,
} from '@/lib/help/filter-guide-by-role';

describe('parseGuideRoleTag', () => {
  it('splits and normalizes role groups', () => {
    expect(parseGuideRoleTag('HR, SUPERVISOR')).toEqual(['HR', 'SUPERVISOR']);
    expect(parseGuideRoleTag(' employee ')).toEqual(['EMPLOYEE']);
  });

  it('ignores unknown tokens', () => {
    expect(parseGuideRoleTag('HR, ADMIN, SUPERVISOR')).toEqual([
      'HR',
      'SUPERVISOR',
    ]);
  });
});

describe('filterGuideByRole', () => {
  const sample = `## For everyone

Shared steps.

<!-- role: HR -->
## HR only

Import attendance.
<!-- /role -->

<!-- role: HR, SUPERVISOR -->
## Approve requests

Approve or return.
<!-- /role -->

<!-- role: EMPLOYEE -->
## Your payslip

Open My Profile.
<!-- /role -->
`;

  it('keeps matching blocks and strips markers', () => {
    const hr = filterGuideByRole(sample, 'HR');
    expect(hr).toContain('## For everyone');
    expect(hr).toContain('## HR only');
    expect(hr).toContain('## Approve requests');
    expect(hr).not.toContain('## Your payslip');
    expect(hr).not.toMatch(/<!--\s*role:/i);
    expect(hr).not.toMatch(/<!--\s*\/role/i);

    const supervisor = filterGuideByRole(sample, 'SUPERVISOR');
    expect(supervisor).not.toContain('## HR only');
    expect(supervisor).toContain('## Approve requests');
    expect(supervisor).not.toContain('## Your payslip');

    const employee = filterGuideByRole(sample, 'EMPLOYEE');
    expect(employee).not.toContain('## HR only');
    expect(employee).not.toContain('## Approve requests');
    expect(employee).toContain('## Your payslip');
  });

  it('keeps a block when the tag list is empty after filtering unknowns', () => {
    const markdown = `<!-- role: UNKNOWN -->
## Kept
<!-- /role -->`;
    expect(filterGuideByRole(markdown, 'EMPLOYEE')).toContain('## Kept');
  });
});
