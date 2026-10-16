/**
 * Hover-intent state for the unpinned sidebar flyout. Framework-free so the
 * timing rules can be unit-tested with fake timers; `useSidebarFlyout` in
 * `use-sidebar-data.ts` binds it to React state.
 *
 * Rules:
 * - Hovering a rail trigger opens its panel after `openDelay`, so sweeping the
 *   cursor across the rail does not open anything.
 * - Leaving the trigger and the panel closes it after `closeDelay`, so a
 *   diagonal move from the icon into the panel keeps it open.
 * - While a panel is open, hovering another trigger switches the content
 *   after `switchDelay` (no close/reopen flicker); entering the panel first
 *   cancels the switch.
 * - A click/keyboard toggle makes the panel "sticky": pointer movement no
 *   longer closes it - only a second toggle, Escape, an outside click or
 *   navigation does (`close`). This is also what touch devices get.
 */
export interface SidebarFlyoutState {
  /** Panel shown in the flyout, or null when closed. */
  readonly openId: string | null;
  /** Opened by click/keyboard: ignores pointer leave. */
  readonly sticky: boolean;
}

export const FLYOUT_CLOSED: SidebarFlyoutState = { openId: null, sticky: false };

export interface SidebarFlyoutTiming {
  readonly openDelay: number;
  readonly closeDelay: number;
  readonly switchDelay: number;
}

export const FLYOUT_TIMING: SidebarFlyoutTiming = {
  openDelay: 150,
  closeDelay: 300,
  switchDelay: 100,
};

/**
 * Docked (pinned) panel - and the mobile drawer's open folder - after a route
 * change: follow the current page's module, like the fixed layout; Search and
 * Favorites close once the user navigates.
 */
export function nextOpenPanel(input: {
  readonly current: string | null;
  readonly navigated: boolean;
  readonly folderChanged: boolean;
  readonly activeFolderId: string | null;
  /** Panels that are tools rather than modules (search, favorites). */
  readonly transientIds: readonly string[];
}): string | null {
  const { current } = input;
  if (current !== null && input.transientIds.includes(current)) {
    return input.navigated ? null : current;
  }
  return input.folderChanged ? input.activeFolderId : current;
}

/** Pinning keeps what the flyout was showing, else the current module. */
export function panelWhenPinning(
  flyoutOpenId: string | null,
  activeFolderId: string | null,
): string | null {
  return flyoutOpenId ?? activeFolderId;
}

type TimerHandle = ReturnType<typeof setTimeout>;

export class SidebarFlyoutController {
  private state: SidebarFlyoutState = FLYOUT_CLOSED;
  private pending: TimerHandle | null = null;

  constructor(
    private readonly onChange: (state: SidebarFlyoutState) => void,
    private readonly timing: SidebarFlyoutTiming = FLYOUT_TIMING,
  ) {}

  get current(): SidebarFlyoutState {
    return this.state;
  }

  /** Pointer (mouse/pen) entered the rail item that owns panel `id`. */
  enterTrigger(id: string): void {
    this.cancel();
    if (this.state.openId === id) {
      return;
    }
    if (this.state.openId === null) {
      this.schedule(this.timing.openDelay, () => this.set({ openId: id, sticky: false }));
    } else {
      this.schedule(this.timing.switchDelay, () => this.set({ openId: id, sticky: false }));
    }
  }

  /** Pointer left a rail trigger. */
  leaveTrigger(): void {
    this.cancel();
    this.scheduleCloseUnlessSticky();
  }

  /** Pointer entered the open panel: keep it, drop any pending switch. */
  enterPanel(): void {
    this.cancel();
  }

  /** Pointer left the panel. */
  leavePanel(): void {
    this.cancel();
    this.scheduleCloseUnlessSticky();
  }

  /**
   * Click / Enter / Space on a trigger. Opens `id` sticky; a second toggle of
   * a sticky panel closes it. Returns whether the panel is now open.
   */
  toggle(id: string): boolean {
    this.cancel();
    if (this.state.openId === id && this.state.sticky) {
      this.set(FLYOUT_CLOSED);
      return false;
    }
    this.set({ openId: id, sticky: true });
    return true;
  }

  /** Opens `id` immediately as sticky (e.g. Ctrl+K opening search). */
  open(id: string): void {
    this.cancel();
    this.set({ openId: id, sticky: true });
  }

  /** Escape, outside click, navigation or pin change. */
  close(): void {
    this.cancel();
    this.set(FLYOUT_CLOSED);
  }

  dispose(): void {
    this.cancel();
  }

  private scheduleCloseUnlessSticky(): void {
    if (this.state.openId !== null && !this.state.sticky) {
      this.schedule(this.timing.closeDelay, () => this.set(FLYOUT_CLOSED));
    }
  }

  private schedule(delay: number, run: () => void): void {
    this.pending = setTimeout(() => {
      this.pending = null;
      run();
    }, delay);
  }

  private cancel(): void {
    if (this.pending !== null) {
      clearTimeout(this.pending);
      this.pending = null;
    }
  }

  private set(next: SidebarFlyoutState): void {
    if (next.openId === this.state.openId && next.sticky === this.state.sticky) {
      return;
    }
    this.state = next;
    this.onChange(next);
  }
}
