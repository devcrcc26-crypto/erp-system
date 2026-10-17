import { describe, expect, it } from 'vitest';
import type { AuditLog } from '@/lib/api/types';
import { formatApprovedOnBehalf, formatSubmittedFor } from '@/lib/utils/approval-display';
import { formatAuditLogOnBehalfSummary } from '@/lib/utils/audit-log-display';

const t = (key: string, vars?: Record<string, string | number>): string =>
  vars ? `${key}(${Object.entries(vars).map(([k, v]) => `${k}=${v}`).join(',')})` : key;

const gm = { id: 'gm', firstName: 'Gena', lastName: 'Manager', email: 'gm@x' };
const lead = { id: 'lead', firstName: 'Asha', lastName: 'Lead', email: 'lead@x' };
const emp = { id: 'emp', firstName: 'Eli', lastName: 'Worker', email: 'emp@x' };

describe('on-behalf display', () => {
  it('"Submitted by Y for X" with the capacity; nothing for self-submissions', () => {
    expect(
      formatSubmittedFor(
        { requestedBy: 'emp', createdBy: 'lead', requester: emp, creator: lead, initiatedAs: 'SUPERVISOR' },
        t,
      ),
    ).toBe(
      'pages.approvals.submittedByFor(by=Asha Lead,for=Eli Worker) (pages.approvals.initiatedAs.SUPERVISOR)',
    );
    expect(
      formatSubmittedFor({ requestedBy: 'emp', createdBy: 'emp', requester: emp, creator: emp }, t),
    ).toBeNull();
  });

  it('"Approved by" / "Returned by Y on behalf of Z" by tier decision', () => {
    expect(
      formatApprovedOnBehalf({ actingApprover: gm, onBehalfOfApprover: lead, decision: 'APPROVED' }, t),
    ).toBe('pages.approvals.approvedOnBehalf(by=Gena Manager,for=Asha Lead)');
    expect(
      formatApprovedOnBehalf({ actingApprover: gm, onBehalfOfApprover: lead, decision: 'RETURNED' }, t),
    ).toBe('pages.approvals.returnedOnBehalf(by=Gena Manager,for=Asha Lead)');
    expect(formatApprovedOnBehalf({ actingApprover: null, onBehalfOfApprover: null }, t)).toBeNull();
  });

  it('audit log summaries for approve / return on behalf and on-behalf creates', () => {
    const log = (action: string, afterValue: unknown) => ({ action, afterValue }) as unknown as AuditLog;
    expect(
      formatAuditLogOnBehalfSummary(
        log('return_on_behalf', { actingApproverName: 'Gena Manager', onBehalfOfApproverName: 'Asha Lead' }),
        t,
      ),
    ).toBe('pages.approvals.returnedOnBehalf(by=Gena Manager,for=Asha Lead)');
    expect(
      formatAuditLogOnBehalfSummary(
        log('CREATE_ON_BEHALF', { createdByName: 'Asha Lead', onBehalfOfName: 'Eli Worker' }),
        t,
      ),
    ).toBe('pages.approvals.submittedByFor(by=Asha Lead,for=Eli Worker)');
    expect(formatAuditLogOnBehalfSummary(log('update', {}), t)).toBeNull();
  });
});
