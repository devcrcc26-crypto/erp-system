import { act, fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import HorizontalScrollHint from './HorizontalScrollHint';

vi.mock('@/hooks/use-epc-translation', () => ({
  useEpcTranslation: () => ({ t: (key: string) => key, locale: 'en' }),
}));

globalThis.ResizeObserver ??= class {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
};

/** jsdom has no layout: give the scroller fixed sizes and a writable position. */
function sizeScroller(el: HTMLElement, scrollWidth: number, clientWidth: number): void {
  Object.defineProperty(el, 'scrollWidth', { configurable: true, value: scrollWidth });
  Object.defineProperty(el, 'clientWidth', { configurable: true, value: clientWidth });
}

function renderTable(scrollWidth: number, clientWidth: number): HTMLElement {
  const { container } = render(
    <HorizontalScrollHint>
      <div className="erp-table-scroll" data-testid="scroller">
        <table />
      </div>
    </HorizontalScrollHint>,
  );
  const scroller = screen.getByTestId('scroller');
  sizeScroller(scroller, scrollWidth, clientWidth);
  // Re-measure now that the scroller has a size.
  act(() => {
    fireEvent.scroll(scroller);
  });
  return container.querySelector('.erp-table-scroll') as HTMLElement;
}

describe('HorizontalScrollHint', () => {
  it('shows only the right cue when more columns are off to the right', () => {
    renderTable(1000, 400);
    expect(screen.getByRole('button', { name: 'common.scrollRight' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'common.scrollLeft' })).toBeNull();
  });

  it('flips to the left cue once scrolled to the end', () => {
    const scroller = renderTable(1000, 400);
    act(() => {
      scroller.scrollLeft = 600;
      fireEvent.scroll(scroller);
    });
    expect(screen.getByRole('button', { name: 'common.scrollLeft' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'common.scrollRight' })).toBeNull();
  });

  it('shows no cue when the table fits', () => {
    renderTable(400, 400);
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('scrolls the table when the chevron is pressed', () => {
    const scroller = renderTable(1000, 400);
    const scrollBy = vi.fn();
    scroller.scrollBy = scrollBy as unknown as typeof scroller.scrollBy;
    fireEvent.click(screen.getByRole('button', { name: 'common.scrollRight' }));
    expect(scrollBy).toHaveBeenCalledWith(
      expect.objectContaining({ left: 280, behavior: 'smooth' }),
    );
  });
});
