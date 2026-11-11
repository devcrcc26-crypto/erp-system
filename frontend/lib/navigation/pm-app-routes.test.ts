import { describe, expect, it } from 'vitest';
import { isPmAppRoute } from '@/lib/navigation/pm-app-routes';

describe('isPmAppRoute', () => {
  it('matches portfolio and project workspace paths', () => {
    expect(isPmAppRoute('/projects')).toBe(true);
    expect(isPmAppRoute('/projects/abc/submittals')).toBe(true);
    expect(isPmAppRoute('/review-inbox')).toBe(true);
    expect(isPmAppRoute('/design-packages/pkg-1/review')).toBe(true);
  });

  it('does not match HR or home dashboard', () => {
    expect(isPmAppRoute('/')).toBe(false);
    expect(isPmAppRoute('/dashboard')).toBe(false);
    expect(isPmAppRoute('/hr/leave-requests')).toBe(false);
    expect(isPmAppRoute('/approvals')).toBe(false);
  });
});
