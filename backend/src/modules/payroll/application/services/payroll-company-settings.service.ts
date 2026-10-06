import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../shared/prisma/prisma.service';

export interface PayrollCompanySettings {
  orgNameTax: string;
  tin: string;
  taxAccountNo: string;
  region: string;
  zone: string;
  woreda: string;
  kebele: string;
  houseNo: string;
  phone: string;
  fax: string;
  taxCollectorOffice: string;
  salaryBankName: string;
  bankBranch: string;
  companyAccountNumber: string;
  bankLetterRefPrefix: string;
}

export const PAYROLL_SETTING_DEFAULTS: PayrollCompanySettings = {
  orgNameTax:
    'CRCC INTERNATIONAL ENGINEERING CONSULTING CO. LTD ETHIOPIAN BRANCH',
  tin: '0026112353',
  taxAccountNo: '',
  region: '',
  zone: '',
  woreda: '',
  kebele: '',
  houseNo: '',
  phone: '',
  fax: '',
  taxCollectorOffice: '',
  salaryBankName: 'Commercial Bank of Ethiopia',
  bankBranch: 'Addis Ababa Branch',
  companyAccountNumber: '',
  bankLetterRefPrefix: 'CRIECC-FZY',
};

const KEY_MAP: Record<keyof PayrollCompanySettings, string> = {
  orgNameTax: 'org_name_tax',
  tin: 'tin',
  taxAccountNo: 'tax_account_no',
  region: 'region',
  zone: 'zone',
  woreda: 'woreda',
  kebele: 'kebele',
  houseNo: 'house_no',
  phone: 'phone',
  fax: 'fax',
  taxCollectorOffice: 'tax_collector_office',
  salaryBankName: 'salary_bank_name',
  bankBranch: 'bank_branch',
  companyAccountNumber: 'company_account_number',
  bankLetterRefPrefix: 'bank_letter_ref_prefix',
};

/**
 * Loads payroll letterhead / tax-form company settings (module = payroll).
 */
@Injectable()
export class PayrollCompanySettingsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Returns company payroll settings with seeded defaults for missing keys.
   */
  async getSettings(companyId: string): Promise<PayrollCompanySettings> {
    const rows = await this.prisma.companySetting.findMany({
      where: {
        companyId,
        module: 'payroll',
        deletedAt: null,
      },
      select: { key: true, value: true },
    });
    const byKey = new Map(rows.map((r) => [r.key, r.value]));
    const result = { ...PAYROLL_SETTING_DEFAULTS };
    for (const [field, key] of Object.entries(KEY_MAP) as Array<
      [keyof PayrollCompanySettings, string]
    >) {
      const raw = byKey.get(key);
      if (raw != null && raw.trim() !== '') {
        result[field] = raw.trim();
      }
    }
    return result;
  }

  /**
   * Ensures default payroll settings exist for a company (idempotent upsert).
   */
  async ensureDefaults(companyId: string, userId: string): Promise<void> {
    for (const [field, key] of Object.entries(KEY_MAP) as Array<
      [keyof PayrollCompanySettings, string]
    >) {
      const existing = await this.prisma.companySetting.findFirst({
        where: {
          companyId,
          module: 'payroll',
          key,
          deletedAt: null,
        },
        select: { id: true },
      });
      if (existing) {
        continue;
      }
      await this.prisma.companySetting.create({
        data: {
          companyId,
          module: 'payroll',
          key,
          value: PAYROLL_SETTING_DEFAULTS[field],
          dataType: 'STRING',
          isPublic: false,
          createdBy: userId,
          updatedBy: userId,
        },
      });
    }
  }

  /**
   * Upserts payroll company settings (module = payroll). Empty strings clear to default on read.
   */
  async updateSettings(
    companyId: string,
    userId: string,
    patch: Partial<PayrollCompanySettings>,
  ): Promise<PayrollCompanySettings> {
    for (const [field, key] of Object.entries(KEY_MAP) as Array<
      [keyof PayrollCompanySettings, string]
    >) {
      if (!(field in patch) || patch[field] === undefined) {
        continue;
      }
      const value = String(patch[field] ?? '').trim();
      const existing = await this.prisma.companySetting.findFirst({
        where: { companyId, module: 'payroll', key, deletedAt: null },
        select: { id: true },
      });
      if (existing) {
        await this.prisma.companySetting.update({
          where: { id: existing.id },
          data: { value, updatedBy: userId },
        });
      } else {
        await this.prisma.companySetting.create({
          data: {
            companyId,
            module: 'payroll',
            key,
            value,
            dataType: 'STRING',
            isPublic: false,
            createdBy: userId,
            updatedBy: userId,
          },
        });
      }
    }
    return this.getSettings(companyId);
  }

  /**
   * Allocates the next bank-letter sequence number for a company+year.
   */
  async nextBankLetterSequence(
    companyId: string,
    year: number,
    userId: string,
  ): Promise<number> {
    const key = `bank_letter_seq_${year}`;
    return this.prisma.$transaction(async (tx) => {
      const existing = await tx.companySetting.findFirst({
        where: { companyId, module: 'payroll', key, deletedAt: null },
      });
      if (!existing) {
        await tx.companySetting.create({
          data: {
            companyId,
            module: 'payroll',
            key,
            value: '1',
            dataType: 'NUMBER',
            isPublic: false,
            createdBy: userId,
            updatedBy: userId,
          },
        });
        return 1;
      }
      const next = Math.max(1, Number(existing.value) || 0) + 1;
      await tx.companySetting.update({
        where: { id: existing.id },
        data: { value: String(next), updatedBy: userId },
      });
      return next;
    });
  }
}
