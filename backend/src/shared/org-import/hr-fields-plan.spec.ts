import type { DirectoryHrFieldRow } from './directory-sheet';
import {
  planHrFieldImport,
  type HrFieldUser,
  type HrValueMap,
} from './hr-fields-plan';

const valueMap: HrValueMap = {
  seniority: {
    levels: [{ name: 'Junior' }, { name: 'Senior' }],
    map: { Junior: 'Junior', Senior: 'Senior' },
  },
  education: { map: { University: 'BSC', Technician: 'TECHNICIAN' } },
};
const educationLevels = new Set(['BSC', 'MSC', 'TECHNICIAN']);

function row(rowIndex: number, cells: Partial<DirectoryHrFieldRow> = {}): DirectoryHrFieldRow {
  return {
    rowIndex,
    seniorityRaw: null,
    phoneRaw: null,
    secondaryPhoneRaw: null,
    educationRaw: null,
    ...cells,
  };
}

function user(id: string, values: Partial<HrFieldUser> = {}): HrFieldUser {
  return {
    id,
    phone: null,
    secondaryPhone: null,
    seniorityLevelName: null,
    educationLevel: null,
    ...values,
  };
}

describe('planHrFieldImport', () => {
  it('fills empty fields with normalised and mapped values', () => {
    const plan = planHrFieldImport(
      [row(5, { phoneRaw: '(+2519)11111111', secondaryPhoneRaw: '0722222222', seniorityRaw: ' senior ', educationRaw: 'university' })],
      new Map([[5, user('u1')]]),
      valueMap,
      educationLevels,
    );
    expect(plan.fills).toEqual([
      {
        userId: 'u1',
        rowIndex: 5,
        phone: '+251911111111',
        secondaryPhone: '+251722222222',
        seniorityLevelName: 'Senior',
        educationLevel: 'BSC',
      },
    ]);
    expect(plan.findings.every((f) => f.kind === 'fill')).toBe(true);
  });

  it('applies the doubled-prefix fix and notes it', () => {
    const plan = planHrFieldImport(
      [row(5, { phoneRaw: '(+2519)911111111' })],
      new Map([[5, user('u1')]]),
      valueMap,
      educationLevels,
    );
    expect(plan.fills[0]?.phone).toBe('+251911111111');
    expect(plan.findings[0]?.note).toMatch(/doubled/);
  });

  it('reports a different existing value instead of overwriting it', () => {
    const plan = planHrFieldImport(
      [row(5, { phoneRaw: '0911111111', educationRaw: 'Technician' })],
      new Map([[5, user('u1', { phone: '+251933333333', educationLevel: 'TECHNICIAN' })]]),
      valueMap,
      educationLevels,
    );
    expect(plan.fills).toEqual([]);
    expect(plan.findings.map((f) => [f.field, f.kind])).toEqual([
      ['phone', 'difference'],
      ['education', 'same'],
    ]);
  });

  it('skips a number used on several rows, in either column', () => {
    const plan = planHrFieldImport(
      [
        row(5, { phoneRaw: '0911111111' }),
        row(6, { phoneRaw: '0922222222', secondaryPhoneRaw: '0911111111' }),
      ],
      new Map([[5, user('u1')], [6, user('u2')]]),
      valueMap,
      educationLevels,
    );
    expect(plan.fills).toEqual([{ userId: 'u2', rowIndex: 6, phone: '+251922222222' }]);
    expect(
      plan.findings.filter((f) => f.kind === 'skipped').map((f) => [f.rowIndex, f.field]),
    ).toEqual([
      [5, 'phone'],
      [6, 'secondaryPhone'],
    ]);
  });

  it('imports only the primary when both columns hold the same number', () => {
    const plan = planHrFieldImport(
      [row(5, { phoneRaw: '0911111111', secondaryPhoneRaw: '+251 911 111 111' })],
      new Map([[5, user('u1')]]),
      valueMap,
      educationLevels,
    );
    expect(plan.fills).toEqual([{ userId: 'u1', rowIndex: 5, phone: '+251911111111' }]);
    expect(plan.findings.find((f) => f.field === 'secondaryPhone')?.kind).toBe('skipped');
  });

  it('keeps an unparseable number as written and says so', () => {
    const plan = planHrFieldImport(
      [row(5, { phoneRaw: '12345' })],
      new Map([[5, user('u1')]]),
      valueMap,
      educationLevels,
    );
    expect(plan.fills[0]?.phone).toBe('12345');
    expect(plan.findings[0]?.note).toMatch(/original/);
  });

  it('skips unmapped values, unmatched rows and users matched twice', () => {
    const plan = planHrFieldImport(
      [
        row(5, { educationRaw: 'Grade 12' }),
        row(6, { phoneRaw: '0911111111' }),
        row(7, { seniorityRaw: 'Junior' }),
        row(8, { seniorityRaw: 'Senior' }),
      ],
      new Map([[5, user('u1')], [7, user('u3')], [8, user('u3')]]),
      valueMap,
      educationLevels,
    );
    expect(plan.fills).toEqual([]);
    expect(plan.duplicateMatchRows).toEqual([7, 8]);
    expect(plan.findings).toEqual([
      expect.objectContaining({ rowIndex: 5, field: 'education', kind: 'skipped' }),
    ]);
  });
});
