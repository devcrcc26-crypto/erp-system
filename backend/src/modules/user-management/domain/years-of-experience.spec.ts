import {
  currentYearsOfExperience,
  yearsOfExperienceUpdate,
} from './years-of-experience';

const d = (iso: string): Date => new Date(`${iso}T00:00:00.000Z`);

describe('currentYearsOfExperience', () => {
  it('returns null when nothing is recorded', () => {
    expect(currentYearsOfExperience(null, null, d('2026-10-16'))).toBeNull();
  });

  it('adds the time elapsed since the as-of date', () => {
    expect(currentYearsOfExperience(5, d('2025-10-16'), d('2026-10-16'))).toBe(6);
    expect(currentYearsOfExperience(5, d('2026-04-16'), d('2026-10-16'))).toBe(5.5);
  });

  it('never goes below the recorded value', () => {
    expect(currentYearsOfExperience(3, d('2026-11-01'), d('2026-10-16'))).toBe(3);
  });
});

describe('yearsOfExperienceUpdate', () => {
  const today = d('2026-10-16');
  const recorded = { yearsOfExperience: 5, yearsOfExperienceAsOf: d('2025-10-16') };
  const empty = { yearsOfExperience: null, yearsOfExperienceAsOf: null };

  it('ignores an omitted value', () => {
    expect(yearsOfExperienceUpdate(undefined, recorded, today)).toEqual({});
  });

  it('keeps the as-of date when the shown value is sent back unchanged', () => {
    expect(yearsOfExperienceUpdate(6, recorded, today)).toEqual({});
  });

  it('stores a changed value as of today', () => {
    expect(yearsOfExperienceUpdate(8, recorded, today)).toEqual({
      yearsOfExperience: 8,
      yearsOfExperienceAsOf: today,
    });
  });

  it('stores a first value as of today, rounded to one decimal', () => {
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
