import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import OvertimeSiteChips from './OvertimeSiteChips';

vi.mock('@/hooks/use-epc-translation', () => ({
  useEpcTranslation: () => ({
    t: (key: string, vars?: Record<string, string | number>) =>
      vars ? `${key}(${Object.values(vars).join(',')})` : key,
    locale: 'en',
  }),
}));

describe('OvertimeSiteChips', () => {
  it('renders nothing for an office-day entry', () => {
    const { container } = render(
      <OvertimeSiteChips
        entry={{
          siteAssignmentId: null,
          siteName: null,
          siteWithinScheduleHours: 0,
          siteReviewFlag: null,
        }}
      />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('labels a site-day entry and shows the within-scheduled-hours subtotal', () => {
    render(
      <OvertimeSiteChips
        entry={{
          siteAssignmentId: 'sa-1',
          siteName: 'Dam site',
          siteWithinScheduleHours: 3,
          siteReviewFlag: null,
        }}
      />,
    );
    expect(screen.getByText('pages.hr.overtime.siteAssignment')).toBeInTheDocument();
    expect(
      screen.getByText(/pages\.hr\.overtime\.withinScheduleSiteHours\(3/),
    ).toBeInTheDocument();
    expect(screen.queryByText('pages.hr.overtime.siteReviewFlag')).toBeNull();
  });

  it('labels without a subtotal when no scheduled hours were claimed', () => {
    render(
      <OvertimeSiteChips
        entry={{
          siteAssignmentId: 'sa-1',
          siteName: 'Dam site',
          siteWithinScheduleHours: 0,
          siteReviewFlag: null,
        }}
      />,
    );
    expect(screen.getByText('pages.hr.overtime.siteAssignment')).toBeInTheDocument();
    expect(screen.queryByText(/withinScheduleSiteHours/)).toBeNull();
  });

  it('shows the HR review flag after the assignment changed', () => {
    render(
      <OvertimeSiteChips
        entry={{
          siteAssignmentId: 'sa-1',
          siteName: 'Dam site',
          siteWithinScheduleHours: 2,
          siteReviewFlag: 'ASSIGNMENT_CANCELLED',
        }}
      />,
    );
    expect(screen.getByText('pages.hr.overtime.siteReviewFlag')).toBeInTheDocument();
  });
});
