import { describe, expect, it, jest } from '@jest/globals';
import {
  PAYROLL_CONSIDER_ATTENDANCE_KEY,
  PayrollCompanySettingsService,
  parseConsiderAttendance,
} from './payroll-company-settings.service';

describe('consider attendance default', () => {
  it('is on unless stored as "false"', () => {
    expect(parseConsiderAttendance(undefined)).toBe(true);
    expect(parseConsiderAttendance('true')).toBe(true);
    expect(parseConsiderAttendance(' FALSE ')).toBe(false);
  });

  it('reads and writes the company_setting row as a boolean', async () => {
    const rows: Array<{ key: string; value: string }> = [];
    const prisma = {
      companySetting: {
        findMany: jest.fn(async () => rows),
        findFirst: jest.fn(async () => null),
        create: jest.fn(async ({ data }: { data: { key: string; value: string } }) => {
          rows.push({ key: data.key, value: data.value });
          return data;
        }),
        update: jest.fn(),
      },
    };
    const service = new PayrollCompanySettingsService(prisma as never);

    expect((await service.getSettings('c1')).considerAttendanceDefault).toBe(true);

    const saved = await service.updateSettings('c1', 'u1', {
      considerAttendanceDefault: false,
    });
    expect(prisma.companySetting.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        key: PAYROLL_CONSIDER_ATTENDANCE_KEY,
        value: 'false',
        dataType: 'BOOLEAN',
      }),
    });
    expect(saved.considerAttendanceDefault).toBe(false);
  });
});
