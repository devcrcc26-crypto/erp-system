import { buildPrismaPagination } from '../pagination.util';

describe('buildPrismaPagination', () => {
  it('coerces string query params to integers for Prisma take/skip', () => {
    expect(buildPrismaPagination('2', '200')).toEqual({
      skip: 200,
      take: 200,
    });
  });

  it('falls back to defaults for invalid values', () => {
    expect(buildPrismaPagination('', '')).toEqual({
      skip: 0,
      take: 20,
    });
  });
});
