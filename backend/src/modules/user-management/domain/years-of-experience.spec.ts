import {
  calculateYearsOfExperienceFromDates,
  currentYearsOfExperience,
  yearsOfExperienceUpdate,
} from './years-of-experience';

function d(iso: string): Date {
  return new Date(`${iso}T00:00:00.000Z`);
}

describe('calculateYearsOfExperienceFromDates', () => {
  it('returns null when no dates exist', () => {
    expect(calculateYearsOfExperienceFromDates(null, [], d('2026-10-16'))).toBeNull();
  });

  it('uses employmentDate alone when there is no prior employment', () => {
    expect(
      calculateYearsOfExperienceFromDates(d('2024-10-16'), [], d('2026-10-16')),
    ).toBe(2);
  });

  it('uses the earliest of prior employment and employmentDate', () => {
    expect(
      calculateYearsOfExperienceFromDates(
        d('2024-10-16'),
        [d('2020-04-16'), d('2022-01-01')],
        d('2026-10-16'),
      ),
    ).toBe(6.5);
  });
});

describe('currentYearsOfExperience (legacy)', () => {
  it('returns null when nothing was recorded', () => {
    expect(currentYearsOfExperience(null, null, d('2026-10-16'))).toBeNull();
  });

  it('grows by elapsed time since as-of', () => {
    expect(currentYearsOfExperience(5, d('2025-10-16'), d('2026-10-16'))).toBe(6);
    expect(currentYearsOfExperience(5, d('2026-04-16'), d('2026-10-16'))).toBe(5.5);
  });

  it('does not go backwards when as-of is in the future', () => {
    expect(currentYearsOfExperience(3, d('2026-11-01'), d('2026-10-16'))).toBe(3);
  });
});

describe('yearsOfExperienceUpdate (legacy)', () => {
  const today = d('2026-10-16');
  const recorded = { yearsOfExperience: 5, yearsOfExperienceAsOf: d('2025-10-16') };
  const empty = { yearsOfExperience: null, yearsOfExperienceAsOf: null };

  it('ignores undefined', () => {
    expect(yearsOfExperienceUpdate(undefined, recorded, today)).toEqual({});
  });

  it('keeps the as-of date when the shown value is unchanged', () => {
    expect(yearsOfExperienceUpdate(6, recorded, today)).toEqual({});
  });

  it('records a new as-of when the value changes', () => {
    expect(yearsOfExperienceUpdate(8, recorded, today)).toEqual({
      yearsOfExperience: 8,
      yearsOfExperienceAsOf: today,
    });
  });

  it('rounds to one decimal on write', () => {
    expect(yearsOfExperienceUpdate(2.46, empty, today)).toEqual({
      yearsOfExperience: 2.5,
      yearsOfExperienceAsOf: today,
    });
  });

  it('clears both columns on null', () => {
    expect(yearsOfExperienceUpdate(null, recorded, today)).toEqual({
      yearsOfExperience: null,
      yearsOfExperienceAsOf: null,
    });
    expect(yearsOfExperienceUpdate(null, empty, today)).toEqual({});
  });
});
