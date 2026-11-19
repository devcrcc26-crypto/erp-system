import { EducationLevel } from '@prisma/client';
import {
  deriveEducationLevel,
  deriveFieldOfStudy,
} from './derived-education';

describe('deriveEducationLevel', () => {
  it('returns null when there are no certificates', () => {
    expect(deriveEducationLevel([])).toBeNull();
    expect(deriveEducationLevel([null, '', '  '])).toBeNull();
  });

  it('picks the highest certificate (PhD > MSc > MA > BSc > BA > Diploma)', () => {
    expect(deriveEducationLevel(['Diploma', 'BSc', 'PhD'])).toBe(
      EducationLevel.PHD,
    );
    expect(deriveEducationLevel(['ba', 'MA'])).toBe(EducationLevel.MSC);
    expect(deriveEducationLevel(['Diploma'])).toBe(EducationLevel.DIPLOMA);
  });

  it('maps BA to BSC and MA to MSC for the EducationLevel enum', () => {
    expect(deriveEducationLevel(['BA'])).toBe(EducationLevel.BSC);
    expect(deriveEducationLevel(['MA'])).toBe(EducationLevel.MSC);
  });
});

describe('deriveFieldOfStudy', () => {
  it('returns the subjectMajor of the most recent record', () => {
    expect(
      deriveFieldOfStudy([
        {
          subjectMajor: 'Civil',
          graduationYear: 2018,
          createdAt: new Date('2018-06-01'),
        },
        {
          subjectMajor: 'Construction Mgmt',
          graduationYear: 2022,
          createdAt: new Date('2022-06-01'),
        },
      ]),
    ).toBe('Construction Mgmt');
  });

  it('skips blank majors and returns null when none exist', () => {
    expect(
      deriveFieldOfStudy([
        { subjectMajor: '  ', graduationYear: 2020, createdAt: new Date() },
      ]),
    ).toBeNull();
    expect(deriveFieldOfStudy([])).toBeNull();
  });
});
