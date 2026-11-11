import { describe, expect, it } from '@jest/globals';
import { notificationLinkMatchesRoute } from './notification-route-match.util';

describe('notificationLinkMatchesRoute', () => {
  it('matches exact approval detail paths', () => {
    expect(
      notificationLinkMatchesRoute(
        '/approvals/abc-123',
        '/approvals/abc-123',
      ),
    ).toBe(true);
  });

  it('matches when the current route has extra query params', () => {
    expect(
      notificationLinkMatchesRoute(
        '/profile?tab=attendance&month=3&year=2026',
        '/profile?tab=attendance&month=3&year=2026&from=bell',
      ),
    ).toBe(true);
  });

  it('rejects when required query params differ', () => {
    expect(
      notificationLinkMatchesRoute(
        '/profile?tab=attendance&month=3&year=2026',
        '/profile?tab=attendance&month=4&year=2026',
      ),
    ).toBe(false);
  });

  it('rejects different pathnames', () => {
    expect(
      notificationLinkMatchesRoute(
        '/approvals/one',
        '/approvals/two',
      ),
    ).toBe(false);
  });
});
