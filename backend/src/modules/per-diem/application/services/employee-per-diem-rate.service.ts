import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, SupportedCurrency } from '@prisma/client';
import { randomUUID } from 'crypto';
import { PrismaService } from '../../../../shared/prisma/prisma.service';
import { activeOnly } from '../../../../shared/prisma/soft-delete.util';
import {
  listActiveEmployeePerDiemCategories,
  resolveEmployeePerDiemCategoryRate,
} from '../../domain/per-diem-destination-categories';
import { UpsertEmployeePerDiemRateDto } from '../dtos/employee-per-diem-rate.dtos';

const DEFAULT_RATES: Omit<
  UpsertEmployeePerDiemRateDto,
  'currency'
> & { currency: 'ETB' | 'USD' } = {
  domesticRate: 500,
  eastAfricaRate: 30,
  otherAfricaRate: 50,
  middleEastRate: 60,
  asiaRate: 70,
  europeRate: 80,
  americasRate: 80,
  currency: 'ETB',
};

/**
 * HR-managed per-employee per diem destination rates.
 */
@Injectable()
export class EmployeePerDiemRateService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Returns the authenticated employee's rate row with active categories only.
   */
  async getMyActiveCategories(
    companyId: string,
    employeeId: string,
  ): Promise<unknown> {
    const row = await this.findOrCreateForEmployee(
      companyId,
      employeeId,
      employeeId,
    );
    return listActiveEmployeePerDiemCategories(row);
  }

  /**
   * Returns the full employee rate row for HR profile management.
   */
  async getForEmployee(
    employeeId: string,
    companyId: string,
  ): Promise<unknown> {
    await this.assertEmployeeInCompany(employeeId, companyId);
    return this.findOrCreateForEmployee(companyId, employeeId, employeeId);
  }

  /**
   * Creates or updates an employee's per diem rates (HR).
   */
  async upsertForEmployee(
    employeeId: string,
    dto: UpsertEmployeePerDiemRateDto,
    companyId: string,
    userId: string,
  ): Promise<unknown> {
    await this.assertEmployeeInCompany(employeeId, companyId);

    const existing = await this.prisma.employeePerDiemRate.findFirst({
      where: activeOnly({ companyId, employeeId }),
    });

    const rateFields = this.buildRateFields(dto);

    if (existing) {
      return this.prisma.employeePerDiemRate.update({
        where: { id: existing.id },
        data: {
          ...rateFields,
          updatedBy: userId,
        },
      });
    }

    return this.prisma.employeePerDiemRate.create({
      data: {
        id: randomUUID(),
        companyId,
        employeeId,
        createdBy: userId,
        updatedBy: userId,
        ...rateFields,
      },
    });
  }

  /**
   * Resolves the daily rate for a category when submitting a per diem request.
   */
  async resolveRateForSubmission(
    companyId: string,
    employeeId: string,
    destinationCategory: string,
    actorUserId: string,
  ): Promise<{
    employeePerDiemRateId: string;
    dailyRate: number;
    currency: SupportedCurrency;
  }> {
    const row = await this.findOrCreateForEmployee(
      companyId,
      employeeId,
      actorUserId,
    );
    const resolved = resolveEmployeePerDiemCategoryRate(row, destinationCategory);
    if (!resolved) {
      throw new BadRequestException(
        `No per diem rate configured for "${destinationCategory}"`,
      );
    }
    if (!resolved.isActive) {
      throw new BadRequestException(
        `Per diem rate for "${destinationCategory}" is inactive for this employee`,
      );
    }

    return {
      employeePerDiemRateId: row.id,
      dailyRate: resolved.dailyRate,
      currency: resolved.currency,
    };
  }

  private async findOrCreateForEmployee(
    companyId: string,
    employeeId: string,
    actorUserId: string,
  ) {
    const existing = await this.prisma.employeePerDiemRate.findFirst({
      where: activeOnly({ companyId, employeeId }),
    });
    if (existing) {
      return existing;
    }

    return this.prisma.employeePerDiemRate.create({
      data: {
        id: randomUUID(),
        companyId,
        employeeId,
        domesticRate: new Prisma.Decimal(DEFAULT_RATES.domesticRate ?? 0),
        eastAfricaRate: new Prisma.Decimal(DEFAULT_RATES.eastAfricaRate ?? 0),
        otherAfricaRate: new Prisma.Decimal(DEFAULT_RATES.otherAfricaRate ?? 0),
        middleEastRate: new Prisma.Decimal(DEFAULT_RATES.middleEastRate ?? 0),
        asiaRate: new Prisma.Decimal(DEFAULT_RATES.asiaRate ?? 0),
        europeRate: new Prisma.Decimal(DEFAULT_RATES.europeRate ?? 0),
        americasRate: new Prisma.Decimal(DEFAULT_RATES.americasRate ?? 0),
        currency: DEFAULT_RATES.currency,
        createdBy: actorUserId,
        updatedBy: actorUserId,
      },
    });
  }

  private buildRateFields(
    dto: UpsertEmployeePerDiemRateDto,
  ): Pick<
    Prisma.EmployeePerDiemRateUncheckedCreateInput,
    | 'americasRate'
    | 'asiaRate'
    | 'domesticRate'
    | 'eastAfricaRate'
    | 'europeRate'
    | 'middleEastRate'
    | 'otherAfricaRate'
    | 'americasActive'
    | 'asiaActive'
    | 'domesticActive'
    | 'eastAfricaActive'
    | 'europeActive'
    | 'middleEastActive'
    | 'otherAfricaActive'
    | 'currency'
  > {
    const data: Pick<
      Prisma.EmployeePerDiemRateUncheckedCreateInput,
      | 'americasRate'
      | 'asiaRate'
      | 'domesticRate'
      | 'eastAfricaRate'
      | 'europeRate'
      | 'middleEastRate'
      | 'otherAfricaRate'
      | 'americasActive'
      | 'asiaActive'
      | 'domesticActive'
      | 'eastAfricaActive'
      | 'europeActive'
      | 'middleEastActive'
      | 'otherAfricaActive'
      | 'currency'
    > = {};

    const rateFields = [
      'americasRate',
      'asiaRate',
      'domesticRate',
      'eastAfricaRate',
      'europeRate',
      'middleEastRate',
      'otherAfricaRate',
    ] as const;

    for (const field of rateFields) {
      if (dto[field] !== undefined) {
        data[field] =
          dto[field] == null ? null : new Prisma.Decimal(dto[field]);
      }
    }

    const activeFields = [
      'americasActive',
      'asiaActive',
      'domesticActive',
      'eastAfricaActive',
      'europeActive',
      'middleEastActive',
      'otherAfricaActive',
    ] as const;

    for (const field of activeFields) {
      if (dto[field] !== undefined) {
        data[field] = dto[field];
      }
    }

    if (dto.currency !== undefined) {
      data.currency = dto.currency;
    }

    return data;
  }

  private async assertEmployeeInCompany(
    employeeId: string,
    companyId: string,
  ): Promise<void> {
    const employee = await this.prisma.user.findFirst({
      where: activeOnly({ id: employeeId, companyId }),
      select: { id: true },
    });
    if (!employee) {
      throw new NotFoundException('Employee not found');
    }
  }
}
