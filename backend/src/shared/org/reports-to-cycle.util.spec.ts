import { findReportsToCycle } from './reports-to-cycle.util';

function lookup(map: Record<string, string | null>) {
  return (id: string): string | null => map[id] ?? null;
}

describe('findReportsToCycle', () => {
  it('returns null when no manager is set', async () => {
    await expect(findReportsToCycle('a', null, lookup({}))).resolves.toBeNull();
  });

  it('flags reporting to yourself', async () => {
    await expect(findReportsToCycle('a', 'a', lookup({}))).resolves.toEqual([
      'a',
      'a',
    ]);
  });

  it('returns null for a chain that ends at the top', async () => {
    await expect(
      findReportsToCycle('a', 'b', lookup({ b: 'c', c: null })),
    ).resolves.toBeNull();
  });

  it('detects a direct two-person cycle', async () => {
    await expect(
      findReportsToCycle('a', 'b', lookup({ b: 'a' })),
    ).resolves.toEqual(['a', 'b', 'a']);
  });

  it('detects a longer cycle through the subject', async () => {
    await expect(
      findReportsToCycle('a', 'b', lookup({ b: 'c', c: 'd', d: 'a' })),
    ).resolves.toEqual(['a', 'b', 'c', 'd', 'a']);
  });

  it('stops on an existing loop above the subject without looping forever', async () => {
    await expect(
      findReportsToCycle('a', 'b', lookup({ b: 'c', c: 'b' })),
    ).resolves.toBeNull();
  });

  it('accepts an async lookup', async () => {
    const map: Record<string, string | null> = { b: 'a' };
    await expect(
      findReportsToCycle('a', 'b', async (id) => map[id] ?? null),
    ).resolves.toEqual(['a', 'b', 'a']);
  });
});
