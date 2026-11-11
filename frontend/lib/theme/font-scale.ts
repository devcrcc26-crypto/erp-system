/** Default body font size (px) - matches Ant Design Pro base. */
export const FONT_SIZE_BASE_PX = 14;

/** Minimum readable font size (px). */
export const FONT_SIZE_MIN_PX = 13;

/** Maximum font size (px). */
export const FONT_SIZE_MAX_PX = 18;

/** Step size when increasing or decreasing font (px). */
export const FONT_SIZE_STEP_PX = 1;

export const UI_PREFERENCES_PERSIST_KEY = 'erp-ui-preferences';

/**
 * Clamps a font size value to the allowed range.
 */
export function clampFontSizePx(value: number): number {
  return Math.min(FONT_SIZE_MAX_PX, Math.max(FONT_SIZE_MIN_PX, value));
}

/**
 * Returns the scale factor relative to the design-system base font size.
 */
export function getFontScale(fontSizePx: number): number {
  return fontSizePx / FONT_SIZE_BASE_PX;
}

/**
 * Increases font size by one step.
 */
export function increaseFontSizePx(current: number): number {
  return clampFontSizePx(current + FONT_SIZE_STEP_PX);
}

/**
 * Decreases font size by one step.
 */
export function decreaseFontSizePx(current: number): number {
  return clampFontSizePx(current - FONT_SIZE_STEP_PX);
}
