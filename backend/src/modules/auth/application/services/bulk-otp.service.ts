import {
  ForbiddenException,
  Injectable,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../../../../shared/prisma/prisma.service';
import { SYSTEM_ADMINISTRATOR_ROLE } from '../../../../shared/constants/protected-accounts';
import { isTrueSystemAdministrator } from '../../../../shared/permissions/system-admin.util';
import { generateOneTimePassword } from '../utils/password-policy.util';
import { PasswordService } from './password.service';

export type BulkOtpRow = {
  employeeId: string;
  fullName: string;
  otp: string;
};

export type BulkOtpResult = {
  rows: BulkOtpRow[];
  csv: string;
};

const BULK_OTP_ROLES = new Set([SYSTEM_ADMINISTRATOR_ROLE, 'HR Manager']);

/**
 * HR/admin bulk issuance of one-time passwords for active employees.
 * Plaintext OTPs are returned once and never stored or logged.
 */
@Injectable()
export class BulkOtpService {
  private readonly logger = new Logger(BulkOtpService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly passwordService: PasswordService,
  ) {}

  /**
   * Generates a unique OTP for every active employee in the company.
   * Existing password hashes are left unchanged until an employee logs in with the OTP.
   */
  async generateForCompany(input: {
    companyId: string;
    actorUserId: string;
  }): Promise<BulkOtpResult> {
    await this.assertActorAllowed(input.actorUserId, input.companyId);

    const employees = await this.prisma.user.findMany({
      where: {
        companyId: input.companyId,
        deletedAt: null,
        isActive: true,
        employmentStatus: { not: 'SEPARATED' },
      },
      select: {
        id: true,
        employeeId: true,
        firstName: true,
        middleName: true,
        lastName: true,
        chineseName: true,
      },
      orderBy: [{ employeeId: 'asc' }, { lastName: 'asc' }, { firstName: 'asc' }],
    });

    const usedOtps = new Set<string>();
    const rows: BulkOtpRow[] = [];
    const updates: Array<{ id: string; oneTimePasswordHash: string }> = [];

    for (const employee of employees) {
      let otp = generateOneTimePassword(8);
      while (usedOtps.has(otp)) {
        otp = generateOneTimePassword(8);
      }
      usedOtps.add(otp);

      const oneTimePasswordHash = await this.passwordService.hash(otp);
      updates.push({ id: employee.id, oneTimePasswordHash });
      rows.push({
        employeeId: employee.employeeId?.trim() || employee.id,
        fullName: this.formatFullName(employee),
        otp,
      });
    }

    await this.prisma.$transaction(
      updates.map((update) =>
        this.prisma.user.update({
          where: { id: update.id },
          data: {
            oneTimePassword: update.oneTimePasswordHash,
            mustChangePassword: true,
            updatedBy: input.actorUserId,
          },
        }),
      ),
    );

    this.logger.log(`OTP generated for ${rows.length} employees`);

    return {
      rows,
      csv: this.toCsv(rows),
    };
  }

  private async assertActorAllowed(
    actorUserId: string,
    companyId: string,
  ): Promise<void> {
    const assignments = await this.prisma.userRole.findMany({
      where: {
        userId: actorUserId,
        deletedAt: null,
        role: {
          companyId,
          deletedAt: null,
          isActive: true,
        },
      },
      select: { role: { select: { name: true } } },
    });

    const roleNames = assignments.map((row) => row.role.name);
    const allowed =
      isTrueSystemAdministrator(roleNames) ||
      roleNames.some((name) => BULK_OTP_ROLES.has(name));

    if (!allowed) {
      throw new ForbiddenException(
        'Only System Administrator or HR Manager can generate one-time passwords',
      );
    }
  }

  private formatFullName(user: {
    firstName: string;
    middleName: string | null;
    lastName: string;
    chineseName: string | null;
  }): string {
    const english = [user.firstName, user.middleName, user.lastName]
      .filter((part) => Boolean(part?.trim()))
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim();
    const chinese = user.chineseName?.trim();
    if (english && chinese) {
      return `${english} (${chinese})`;
    }
    return english || chinese || 'Unknown';
  }

  private toCsv(rows: BulkOtpRow[]): string {
    const header = 'Employee ID,Full Name,One-Time Password';
    const lines = rows.map(
      (row) =>
        `${this.csvEscape(row.employeeId)},${this.csvEscape(row.fullName)},${this.csvEscape(row.otp)}`,
    );
    return [header, ...lines].join('\n');
  }

  private csvEscape(value: string): string {
    if (/[",\n\r]/.test(value)) {
      return `"${value.replace(/"/g, '""')}"`;
    }
    return value;
  }
}
