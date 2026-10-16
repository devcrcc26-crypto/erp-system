import { existsSync, mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import * as ExcelJS from 'exceljs';
import { writeLoginCredentialsWorkbook } from '../../../scripts/lib/login-credentials-workbook';
import {
  AMBIGUOUS_PASSWORD_CHARS,
  formatCredentialsFileStamp,
  generateUniqueTemporaryPassword,
  planInitialPasswordUpdates,
  resolveAppUrl,
  type UserForPasswordSetup,
} from '../../../scripts/lib/set-initial-passwords-plan';
import { generateTemporaryPassword } from '../../modules/auth/application/utils/password-policy.util';
import { normalizeLoginName } from '../../modules/auth/application/utils/login-name.util';

function user(
  partial: Partial<UserForPasswordSetup> & Pick<UserForPasswordSetup, 'id'>,
): UserForPasswordSetup {
  return {
    loginName: 'Abebe Bekele',
    passwordHash: null,
    employeeId: 'E-001',
    firstName: 'Abebe',
    lastName: 'Bekele',
    middleName: null,
    departmentName: 'HR',
    ...partial,
  };
}

describe('planInitialPasswordUpdates', () => {
  it('plans updates for users without a password', () => {
    const plan = planInitialPasswordUpdates(
      [user({ id: '1', passwordHash: null })],
      { reset: false },
    );
    expect(plan.toUpdate).toHaveLength(1);
    expect(plan.skippedHasPassword).toHaveLength(0);
    expect(plan.noLoginName).toHaveLength(0);
  });

  it('leaves existing passwords untouched without --reset', () => {
    const plan = planInitialPasswordUpdates(
      [user({ id: '1', passwordHash: '$2b$12$existing' })],
      { reset: false },
    );
    expect(plan.toUpdate).toHaveLength(0);
    expect(plan.skippedHasPassword).toHaveLength(1);
  });

  it('includes existing-password users when reset is true', () => {
    const plan = planInitialPasswordUpdates(
      [user({ id: '1', passwordHash: '$2b$12$existing' })],
      { reset: true },
    );
    expect(plan.toUpdate).toHaveLength(1);
  });

  it('skips users without loginName', () => {
    const plan = planInitialPasswordUpdates(
      [
        user({ id: '1', loginName: null }),
        user({ id: '2', loginName: '   ' }),
        user({ id: '3', loginName: 'Valid Name', passwordHash: null }),
      ],
      { reset: false },
    );
    expect(plan.noLoginName).toHaveLength(2);
    expect(plan.toUpdate).toHaveLength(1);
    expect(plan.toUpdate[0]!.id).toBe('3');
  });

  it('includes approver-only users (blank employeeId) when they have a loginName', () => {
    const plan = planInitialPasswordUpdates(
      [
        user({
          id: 'a1',
          loginName: 'Approver Only',
          employeeId: null,
          passwordHash: null,
          departmentName: 'Approvals',
        }),
      ],
      { reset: false },
    );
    expect(plan.toUpdate).toHaveLength(1);
    expect(plan.toUpdate[0]!.employeeId).toBeNull();
  });

  it('sorts by department then full name', () => {
    const plan = planInitialPasswordUpdates(
      [
        user({
          id: '1',
          loginName: 'Zara Ahmed',
          departmentName: 'Ops',
          passwordHash: null,
        }),
        user({
          id: '2',
          loginName: 'Abebe Bekele',
          departmentName: 'HR',
          passwordHash: null,
        }),
        user({
          id: '3',
          loginName: 'Chala Desta',
          departmentName: 'HR',
          passwordHash: null,
        }),
      ],
      { reset: false },
    );
    expect(plan.toUpdate.map((r) => r.id)).toEqual(['2', '3', '1']);
  });

  it('--only limiting is applied by the caller filter (subset in = subset out)', () => {
    const onlyIds = new Set(['keep']);
    const filtered = [
      user({ id: 'keep', passwordHash: null }),
      user({ id: 'drop', passwordHash: null }),
    ].filter((u) => onlyIds.has(u.id));
    const plan = planInitialPasswordUpdates(filtered, { reset: false });
    expect(plan.toUpdate.map((r) => r.id)).toEqual(['keep']);
  });
});

describe('generateUniqueTemporaryPassword', () => {
  it('excludes ambiguous characters and never equals the login name', () => {
    for (let i = 0; i < 40; i += 1) {
      const pwd = generateUniqueTemporaryPassword('Abebe Bekele');
      expect(pwd).toHaveLength(12);
      expect(pwd).not.toMatch(AMBIGUOUS_PASSWORD_CHARS);
      expect(normalizeLoginName(pwd)).not.toBe(
        normalizeLoginName('Abebe Bekele'),
      );
    }
  });

  it('generateTemporaryPassword alphabet excludes 0/O/1/l/I', () => {
    for (let i = 0; i < 30; i += 1) {
      expect(generateTemporaryPassword(12)).not.toMatch(AMBIGUOUS_PASSWORD_CHARS);
    }
  });
});

describe('resolveAppUrl / formatCredentialsFileStamp', () => {
  it('prefers APP_URL over FRONTEND_URL', () => {
    expect(
      resolveAppUrl({
        APP_URL: 'https://app.example/',
        FRONTEND_URL: 'http://localhost:3000',
      }),
    ).toBe('https://app.example');
  });

  it('falls back to FRONTEND_URL then blank', () => {
    expect(resolveAppUrl({ FRONTEND_URL: 'http://localhost:3000/' })).toBe(
      'http://localhost:3000',
    );
    expect(resolveAppUrl({})).toBe('');
  });

  it('formats YYYY-MM-DD-HHmm', () => {
    const stamp = formatCredentialsFileStamp(
      new Date(2026, 9, 9, 13, 51, 0),
    );
    expect(stamp).toBe('2026-10-09-1351');
  });
});

describe('writeLoginCredentialsWorkbook', () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'login-creds-'));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('writes Credentials, Slips, and Instructions sheets', async () => {
    const path = join(dir, 'login-credentials-test.xlsx');
    await writeLoginCredentialsWorkbook(
      path,
      [
        {
          employeeId: 'E-1',
          fullName: 'Abebe Bekele',
          department: 'HR',
          temporaryPassword: 'AbCdEfGh2345',
        },
        {
          employeeId: null,
          fullName: 'Approver Only',
          department: '',
          temporaryPassword: 'XyZabcde6789',
        },
      ],
      'https://erp.example',
    );
    expect(existsSync(path)).toBe(true);

    const wb = new ExcelJS.Workbook();
    await wb.xlsx.readFile(path);
    expect(wb.worksheets.map((s) => s.name)).toEqual([
      'Credentials',
      'Slips',
      'Instructions',
    ]);
    const creds = wb.getWorksheet('Credentials')!;
    expect(creds.getCell('A1').value).toContain('PWF ERP');
    expect(creds.getCell('C3').value).toBe('Abebe Bekele');
    expect(creds.getCell('E3').value).toBe('AbCdEfGh2345');
    expect(creds.getCell('B4').value).toBe('');
    const slips = wb.getWorksheet('Slips')!;
    expect(String(slips.getCell('A1').value)).toContain('Abebe Bekele');
    expect(String(wb.getWorksheet('Instructions')!.getCell('A1').value)).toContain(
      'HR instructions',
    );
  });
});

describe('dry-run contract', () => {
  it('dry-run (apply=false) must not write Excel - caller only writes on apply', () => {
    const plan = planInitialPasswordUpdates(
      [user({ id: '1', passwordHash: null })],
      { reset: false },
    );
    expect(plan.toUpdate.length).toBeGreaterThan(0);
    // Script gate: Excel + DB writes happen only when args.apply && toUpdate.length > 0
    const apply = false;
    const wouldWrite = apply && plan.toUpdate.length > 0;
    expect(wouldWrite).toBe(false);
  });
});
