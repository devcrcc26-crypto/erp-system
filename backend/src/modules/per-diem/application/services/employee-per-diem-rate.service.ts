import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, SupportedCurrency } from '@prisma/client';
import { randomUUID } from 'crypto';
import { PrismaService } from '../../../../shared/prisma/prisma.service';
import {
  buildPaginatedResult,
  buildPrismaPagination,
  buildOrderBy,
} from '../../../../shared/utils/pagination.util';
import { activeOnly } from '../../../../shared/prisma/soft-delete.util';
import {
  listActiveEmployeePerDiemCategories,
  resolveEmployeePerDiemCategoryRate,
} from '../../domain/per-diem-destination-categories';
import {
  ListEmployeePerDiemRatesQueryDto,
  UpsertEmployeePerDiemRateDto,
} from '../dtos/employee-per-diem-rate.dtos';
import {
  EmployeePerDiemRateResponse,
  mapEmployeePerDiemRateResponse,
} from '../../infrastructure/mappers/employee-per-diem-rate.mapper';

const DEFAULT_RATES = {
  domesticRate: 500,
  regionalRate: 80,
  internationalRate: 150,
  currency: 'ETB' as const,
};

/**
 * HR-managed per-employee per diem destination rates.
 */
@Injectable()
export class EmployeePerDiemRateService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Paginated list of employees with their per diem rate configuration (HR).
   */
  async listForHr(
    companyId: string,
    query: ListEmployeePerDiemRatesQueryDto,
  ): Promise<{
    data: Array<{
      employeeId: string;
      employee: {
        id: string;
        firstName: string;
        lastName: string;
        email: string | null;
        department: { id: string; name: string } | null;
      };
      rate: EmployeePerDiemRateResponse | null;
    }>;
    meta: { total: number; page: number; limit: number; pages: number };
  }> {
    const page = Math.max(1, query.page ?? 1);
    const limit = Math.max(1, query.limit ?? 20);
    const { skip, take } = buildPrismaPagination(page, limit);
    const search = query.search?.trim();

    const where: Prisma.UserWhereInput = activeOnly({
      companyId,
      isActive: true,
      ...(search
        ? {
            OR: [
              {
                firstName: { contains: search, mode: 'insensitive' },
              },
              {
                lastName: { contains: search, mode: 'insensitive' },
              },
              {
                email: { contains: search, mode: 'insensitive' },
              },
            ],
          }
        : {}),
    });

    const orderBy = buildOrderBy(
      query.sortBy ?? 'lastName',
      query.sortOrder ?? 'asc',
    );

    const [total, users] = await Promise.all([
      this.prisma.user.count({ where }),
      this.prisma.user.findMany({
        where,
        skip,
        take,
        orderBy,
        select: {
          id: true,
          firstName: true,
          lastName: true,
          email: true,
          department: {
            select: { id: true, name: true },
          },
          employeePerDiemRate: true,
        },
      }),
    ]);

    const data = users.map((user) => ({
      employeeId: user.id,
      employee: {
        id: user.id,
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        department: user.department,
      },
      rate:
        user.employeePerDiemRate &&
        user.employeePerDiemRate.deletedAt == null
          ? mapEmployeePerDiemRateResponse(user.employeePerDiemRate)
          : null,
    }));

    return buildPaginatedResult(data, total, page, limit);
  }

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
  ): Promise<EmployeePerDiemRateResponse> {
    await this.assertEmployeeInCompany(employeeId, companyId);
    const row = await this.findOrCreateForEmployee(
      companyId,
      employeeId,
      employeeId,
    );
    return mapEmployeePerDiemRateResponse(row);
  }

  /**
   * Creates or updates an employee's per diem rates (HR).
   */
  async upsertForEmployee(
    employeeId: string,
    dto: UpsertEmployeePerDiemRateDto,
    companyId: string,
    userId: string,
  ): Promise<EmployeePerDiemRateResponse> {
    await this.assertEmployeeInCompany(employeeId, companyId);

    const existing = await this.prisma.employeePerDiemRate.findFirst({
      where: activeOnly({ companyId, employeeId }),
    });

    const rateFields = this.buildRateFields(dto);

    const row = existing
      ? await this.prisma.employeePerDiemRate.update({
          where: { id: existing.id },
          data: {
            ...rateFields,
            updatedBy: userId,
          },
        })
      : await this.prisma.employeePerDiemRate.create({
          data: {
            id: randomUUID(),
            companyId,
            employeeId,
            createdBy: userId,
            updatedBy: userId,
            ...rateFields,
          },
        });

    return mapEmployeePerDiemRateResponse(row);
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
    const resolved = resolveEmployeePerDiemCategoryRate(
      row,
      destinationCategory,
    );
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
        domesticRate: new Prisma.Decimal(DEFAULT_RATES.domesticRate),
        regionalRate: new Prisma.Decimal(DEFAULT_RATES.regionalRate),
        internationalRate: new Prisma.Decimal(DEFAULT_RATES.internationalRate),
        domesticActive: true,
        regionalActive: true,
        internationalActive: true,
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
    | 'domesticRate'
    | 'regionalRate'
    | 'internationalRate'
    | 'domesticActive'
    | 'regionalActive'
    | 'internationalActive'
    | 'currency'
  > {
    const data: Pick<
      Prisma.EmployeePerDiemRateUncheckedCreateInput,
      | 'domesticRate'
      | 'regionalRate'
      | 'internationalRate'
      | 'domesticActive'
      | 'regionalActive'
      | 'internationalActive'
      | 'currency'
    > = {};

    const rateFields = [
      'domesticRate',
      'regionalRate',
      'internationalRate',
    ] as const;

    for (const field of rateFields) {
      if (dto[field] !== undefined) {
        data[field] =
          dto[field] == null ? null : new Prisma.Decimal(dto[field]);
      }
    }

    const activeFields = [
      'domesticActive',
      'regionalActive',
      'internationalActive',
    ] as const;

    for (const field of activeFields) {
      if (dto[field] !== undefined) {
        data[field] = dto[field];
      }
    }

    data.currency = SupportedCurrency.ETB;

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
