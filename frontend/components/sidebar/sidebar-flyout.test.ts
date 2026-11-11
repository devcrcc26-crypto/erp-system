import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  SidebarFlyoutController,
  nextOpenPanel,
  panelWhenPinning,
  type SidebarFlyoutState,
} from '@/components/sidebar/sidebar-flyout';

describe('pinned panel rules', () => {
  const base = {
    current: null,
    navigated: true,
    folderChanged: false,
    activeFolderId: 'hr',
    transientIds: ['search', 'favorites'],
  } as const;

  it('follows the current module when the route enters a new one', () => {
    expect(nextOpenPanel({ ...base, current: 'org', folderChanged: true })).toBe('hr');
  });

  it('keeps a panel the user closed closed while staying in the module', () => {
    expect(nextOpenPanel({ ...base, current: null, folderChanged: false })).toBeNull();
  });

  it('closes search and favorites after navigation only', () => {
    expect(nextOpenPanel({ ...base, current: 'search' })).toBeNull();
    expect(nextOpenPanel({ ...base, current: 'favorites', navigated: false })).toBe('favorites');
  });

  it('pinning keeps the flyout panel, else opens the current module', () => {
    expect(panelWhenPinning('org', 'hr')).toBe('org');
    expect(panelWhenPinning(null, 'hr')).toBe('hr');
    expect(panelWhenPinning(null, null)).toBeNull();
  });
});

describe('SidebarFlyoutController (hover intent)', () => {
  let states: SidebarFlyoutState[];
  let flyout: SidebarFlyoutController;
  const openId = (): string | null => flyout.current.openId;

  beforeEach(() => {
    vi.useFakeTimers();
    states = [];
    flyout = new SidebarFlyoutController((state) => states.push(state));
  });

  afterEach(() => {
    flyout.dispose();
    vi.useRealTimers();
  });

  it('opens only after the 150ms hover delay', () => {
    flyout.enterTrigger('hr');
    vi.advanceTimersByTime(149);
    expect(openId()).toBeNull();
    vi.advanceTimersByTime(1);
    expect(openId()).toBe('hr');
  });

  it('does not open when the cursor just passes over the rail', () => {
    flyout.enterTrigger('hr');
    vi.advanceTimersByTime(80);
    flyout.leaveTrigger();
    flyout.enterTrigger('org');
    vi.advanceTimersByTime(80);
    flyout.leaveTrigger();
    vi.advanceTimersByTime(1000);
    expect(states).toEqual([]);
  });

  it('stays open while moving from the icon into the panel', () => {
    flyout.enterTrigger('hr');
    vi.advanceTimersByTime(150);
    flyout.leaveTrigger();
    vi.advanceTimersByTime(250); // diagonal move takes a moment
    flyout.enterPanel();
    vi.advanceTimersByTime(1000);
    expect(openId()).toBe('hr');
  });

  it('closes 300ms after leaving both the icon and the panel', () => {
    flyout.enterTrigger('hr');
    vi.advanceTimersByTime(150);
    flyout.enterPanel();
    flyout.leavePanel();
    vi.advanceTimersByTime(299);
    expect(openId()).toBe('hr');
    vi.advanceTimersByTime(1);
    expect(openId()).toBeNull();
  });

  it('switches between rail icons without closing in between', () => {
    flyout.enterTrigger('hr');
    vi.advanceTimersByTime(150);
    flyout.leaveTrigger();
    flyout.enterTrigger('org');
    vi.advanceTimersByTime(100);
    expect(openId()).toBe('org');
    // Never passed through a closed state.
    expect(states.map((state) => state.openId)).toEqual(['hr', 'org']);
  });

  it('cancels a pending switch when the cursor reaches the panel', () => {
    flyout.enterTrigger('hr');
    vi.advanceTimersByTime(150);
    flyout.enterTrigger('org'); // brushed past another icon on the way
    flyout.enterPanel();
    vi.advanceTimersByTime(500);
    expect(openId()).toBe('hr');
  });

  it('click toggles a sticky panel that pointer-leave does not close', () => {
    expect(flyout.toggle('hr')).toBe(true);
    flyout.leaveTrigger();
    flyout.leavePanel();
    vi.advanceTimersByTime(1000);
    expect(flyout.current).toEqual({ openId: 'hr', sticky: true });
    expect(flyout.toggle('hr')).toBe(false);
    expect(openId()).toBeNull();
  });

  it('a click on a hover-opened panel keeps it open (makes it sticky)', () => {
    flyout.enterTrigger('hr');
    vi.advanceTimersByTime(150);
    expect(flyout.toggle('hr')).toBe(true);
    expect(flyout.current.sticky).toBe(true);
  });

  it('close() wins over any pending timer', () => {
    flyout.enterTrigger('hr');
    flyout.close();
    vi.advanceTimersByTime(1000);
    expect(openId()).toBeNull();
  });
});
