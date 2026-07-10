import { render, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import BulkReviewActionBar from '@/components/modules/projects/review/BulkReviewActionBar';

describe('BulkReviewActionBar', () => {
  const handlers = {
    onSelectAll: vi.fn(),
    onClearSelection: vi.fn(),
    onApproveAll: vi.fn(),
  };

  function renderBar(
    props: Partial<React.ComponentProps<typeof BulkReviewActionBar>> = {},
  ) {
    return render(
      <BulkReviewActionBar
        selectedCount={0}
        totalCount={3}
        {...handlers}
        {...props}
      />,
    );
  }

  function getBar(container: HTMLElement): HTMLElement {
    const bar = container.querySelector('[data-testid="bulk-review-action-bar"]');
    if (!bar) {
      throw new Error('bulk-review-action-bar not found');
    }
    return bar as HTMLElement;
  }

  it('shows select-all label with total count when nothing is selected', () => {
    const { container } = renderBar({ totalCount: 3 });
    const bar = getBar(container);
    expect(within(bar).getByText('Select all (3)')).toBeInTheDocument();
  });

  it('disables batch actions until at least one EDV is selected', () => {
    const { container } = renderBar({ selectedCount: 0, totalCount: 2 });
    const bar = getBar(container);

    expect(within(bar).getByRole('button', { name: 'Approve All' })).toBeDisabled();
  });

  it('calls onApproveAll when Approve All is clicked', async () => {
    const user = userEvent.setup();
    const { container } = renderBar({ selectedCount: 2, totalCount: 2 });
    const bar = getBar(container);

    await user.click(within(bar).getByRole('button', { name: 'Approve All' }));
    expect(handlers.onApproveAll).toHaveBeenCalledTimes(1);
  });

  it('calls onSelectAll when the checkbox is checked', async () => {
    const user = userEvent.setup();
    const { container } = renderBar({ selectedCount: 0, totalCount: 4 });
    const bar = getBar(container);

    await user.click(within(bar).getByRole('checkbox'));
    expect(handlers.onSelectAll).toHaveBeenCalledTimes(1);
  });
});
