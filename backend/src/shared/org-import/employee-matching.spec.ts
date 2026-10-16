import { matchKey } from './name-normalise';
import {
  dedupeRepeatedParts,
  matchBucket,
  matchEmployees,
  repeatsLastName,
  type DirectoryUser,
} from './employee-matching';

describe('employee-matching', () => {
  const agegnehu: DirectoryUser = {
    id: 'u1',
    employeeId: 'CC-0001',
    firstName: 'Agegnehu',
    middleName: 'Gelaw',
    lastName: 'Gelaw',
  };

  it('matches first + middle when DB repeats the last name', () => {
    expect(repeatsLastName(agegnehu)).toBe(true);
    const hits = matchEmployees(['Agegnehu Gelaw'], [agegnehu], {});
    expect(hits[0]?.status).toBe('EXACT');
    expect(hits[0]?.userId).toBe('u1');
  });

  it('matches first + middle when DB lastName is empty', () => {
    const cleared: DirectoryUser = { ...agegnehu, lastName: '' };
    const three = matchEmployees(['Agegnehu Gelaw Tesfaye'], [cleared]);
    expect(three[0]).toMatchObject({ status: 'EXACT', rule: 'first-middle', userId: 'u1' });
    const two = matchEmployees(['Agegnehu Gelaw'], [cleared]);
    expect(two[0]).toMatchObject({ status: 'EXACT', rule: 'name', userId: 'u1' });
  });

  it('proposes fuzzy spelling variants without auto-applying', () => {
    const user: DirectoryUser = {
      id: 'u2',
      employeeId: 'CC-0002',
      firstName: 'Armias',
      middleName: 'Habtu',
      lastName: 'Mekonnen',
    };
    const hits = matchEmployees(['Aemias Habtu Mekonnen'], [user], {});
    expect(hits[0]?.status).toBe('PROPOSED');
    expect(hits[0]?.userId).toBe('u2');
  });

  it('dedupes repeated name parts', () => {
    expect(dedupeRepeatedParts(['agegnehu', 'gelaw', 'gelaw'])).toEqual([
      'agegnehu',
      'gelaw',
    ]);
  });

  it('normalises punctuation, W/ro and H/ G/ W/ prefixes', () => {
    expect(matchKey('Abebe G/Medhin')).toBe('abebe gebremedhin');
    expect(matchKey('W/ro Almaz H/Mariam')).toBe('almaz hailemariam');
    expect(matchKey('Tigist W/ Giorgis')).toBe('tigist woldegiorgis');
    expect(matchKey('Meron-Tesfaye, A.')).toBe('meron tesfaye a');
  });

  it('matches G/ abbreviations against the spelled-out DB name', () => {
    const user: DirectoryUser = {
      id: 'u3',
      employeeId: 'CC-0003',
      firstName: 'Abebe',
      middleName: null,
      lastName: 'Gebremedhin',
    };
    const hits = matchEmployees(['Abebe G/Medhin'], [user]);
    expect(hits[0]).toMatchObject({ status: 'EXACT', rule: 'name', userId: 'u3' });
  });

  describe('attendance identities', () => {
    const kebede: DirectoryUser = {
      id: 'k',
      employeeId: 'CC-0010',
      firstName: 'Kebede',
      middleName: null,
      lastName: 'Alemu',
    };
    const kebedeAlemayehu: DirectoryUser = {
      id: 'ka',
      employeeId: 'CC-0011',
      firstName: 'Kebede',
      middleName: null,
      lastName: 'Alemayehu',
    };

    it('runs after aliases and before name keys', () => {
      const hits = matchEmployees(
        ['Kebe Alem'],
        [kebede],
        {},
        [{ attendanceName: 'Kebe  Alem', userId: 'k' }],
      );
      expect(hits[0]).toMatchObject({ status: 'EXACT', rule: 'attendance', userId: 'k' });
      expect(matchBucket(hits[0]!)).toBe('attendance');

      const aliased = matchEmployees(
        ['Kebe Alem'],
        [kebede, kebedeAlemayehu],
        { 'Kebe Alem': 'CC-0011' },
        [{ attendanceName: 'Kebe Alem', userId: 'k' }],
      );
      expect(aliased[0]).toMatchObject({ status: 'ALIAS', userId: 'ka' });
    });

    it('marks CONFLICT when the name keys point at another user', () => {
      const hits = matchEmployees(
        ['Kebede Alemayehu'],
        [kebede, kebedeAlemayehu],
        {},
        [{ attendanceName: 'Kebede Alemayehu', userId: 'k' }],
      );
      expect(hits[0]?.status).toBe('CONFLICT');
      expect(hits[0]?.userId).toBeUndefined();
      expect(hits[0]?.conflict?.other).toMatchObject({ rule: 'name', userId: 'ka' });
    });

    it('marks CONFLICT when the fuzzy proposal points at another user', () => {
      const hits = matchEmployees(
        ['Kebede Alemaye'],
        [kebede, kebedeAlemayehu],
        {},
        [{ attendanceName: 'Kebede Alemaye', userId: 'k' }],
      );
      expect(hits[0]?.status).toBe('CONFLICT');
      expect(hits[0]?.conflict?.other).toMatchObject({ rule: 'fuzzy', userId: 'ka' });
    });

    it('keeps the attendance match when fuzzy agrees', () => {
      const hits = matchEmployees(
        ['Kebede Alemuu'],
        [kebede, kebedeAlemayehu],
        {},
        [{ attendanceName: 'Kebede Alemuu', userId: 'k' }],
      );
      expect(hits[0]).toMatchObject({ status: 'EXACT', rule: 'attendance', userId: 'k' });
    });
  });

  it('flags duplicate sheet rows and matches neither', () => {
    const hits = matchEmployees(['Agegnehu Gelaw', 'Agegnehu  Gelaw.'], [agegnehu]);
    expect(hits.map((h) => h.status)).toEqual(['UNMATCHED', 'UNMATCHED']);
    expect(hits.every((h) => h.duplicateRow)).toBe(true);
  });

  it('flags rows where one name is a prefix of another (2+ words)', () => {
    const hits = matchEmployees(
      ['Agegnehu Gelaw', 'Agegnehu Gelaw Tesfaye', 'Agegnehu', 'Kebede Alemu'],
      [agegnehu],
    );
    expect(hits.map((h) => Boolean(h.duplicateRow))).toEqual([true, true, false, false]);
    expect(hits[1]?.reason).toContain('prefix');
  });
});
