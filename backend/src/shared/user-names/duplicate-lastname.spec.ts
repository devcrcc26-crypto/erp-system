import {
  lastNameRepeatsMiddle,
  parseLastNameBackupCsv,
  toLastNameBackupCsv,
} from './duplicate-lastname';

describe('duplicate-lastname', () => {
  it('matches lastName = middleName ignoring case and spaces', () => {
    expect(lastNameRepeatsMiddle({ middleName: 'Gelaw', lastName: ' gelaw ' })).toBe(true);
    expect(lastNameRepeatsMiddle({ middleName: 'Habte  Mariam', lastName: 'habte mariam' })).toBe(true);
    expect(lastNameRepeatsMiddle({ middleName: 'Gelaw', lastName: 'Tesfaye' })).toBe(false);
    expect(lastNameRepeatsMiddle({ middleName: null, lastName: '' })).toBe(false);
    expect(lastNameRepeatsMiddle({ middleName: '', lastName: '' })).toBe(false);
  });

  it('round-trips the backup CSV, including quotes and commas', () => {
    const rows = [
      { userId: 'u1', employeeId: 'CC-0001', lastName: 'Gelaw' },
      { userId: 'u2', employeeId: '', lastName: 'O"Neil, Jr' },
    ];
    const csv = toLastNameBackupCsv(rows);
    expect(parseLastNameBackupCsv(csv)).toEqual(rows);
    expect(parseLastNameBackupCsv(csv.replace(/\n/g, '\r\n'))).toEqual(rows);
  });

  it('rejects a CSV with the wrong header', () => {
    expect(() => parseLastNameBackupCsv('id,name\nu1,x\n')).toThrow(/header/);
  });
});
