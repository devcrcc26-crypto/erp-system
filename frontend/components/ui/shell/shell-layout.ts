/** Domain rail (icon column) width (px). */
export const NAV_DOMAIN_RAIL_WIDTH = 56;

/** Module panel (per-domain link list) width (px). */
export const NAV_MODULE_PANEL_WIDTH = 236;

/** Icon rail layout widths (px) — collapsed hides the module panel. */
export const RAIL_COLLAPSED_WIDTH = NAV_DOMAIN_RAIL_WIDTH;
export const RAIL_EXPANDED_WIDTH =
  NAV_DOMAIN_RAIL_WIDTH + NAV_MODULE_PANEL_WIDTH;

/**
 * Shared utility-bar height (px). Aligns the sidebar brand band, the sidebar
 * domain-title band, and the main content utility bar on one horizontal seam.
 */
export const SHELL_TOP_HEADER_HEIGHT = 56;

/** Project context sidebar width (px). */
export const CONTEXT_SIDEBAR_WIDTH = 220;

/** Hover-peek overlay width when covering the context sidebar beside a collapsed rail. */
export const RAIL_PEEK_OVERLAY_WITH_CONTEXT =
  RAIL_COLLAPSED_WIDTH + CONTEXT_SIDEBAR_WIDTH;
