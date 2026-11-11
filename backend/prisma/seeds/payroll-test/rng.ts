/**
 * Deterministic mulberry32-style PRNG for reproducible payroll test data.
 */
export type SeededRng = () => number;

export function createSeededRng(seed: number): SeededRng {
  let state = seed >>> 0;
  return (): number => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function pickOne<T>(rng: SeededRng, items: readonly T[]): T {
  if (items.length === 0) {
    throw new Error('pickOne: empty array');
  }
  const index = Math.floor(rng() * items.length);
  return items[index] as T;
}

export function pickInt(rng: SeededRng, min: number, max: number): number {
  return Math.floor(rng() * (max - min + 1)) + min;
}

export function roundTo(value: number, step: number): number {
  return Math.round(value / step) * step;
}
