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
   * Returns active destination categories from an existing rate row only.
   * Does not create default rates — empty means the employee enters the rate.
   */
  async getMyActiveCategories(
    companyId: string,
    employeeId: string,
  ): Promise<unknown> {
    const row = await this.prisma.employeePerDiemRate.findFirst({
      where: activeOnly({ companyId, employeeId }),
    });
    if (!row) {
      return [];
    }
    return listActiveEmployeePerDiemCategories(row);
  }

  /**
   * Looks up a seeded company rate for the employee + destination category.
   * Returns null when no active rate row/category exists (no auto-create).
   */
  async findActiveCategoryRate(
    companyId: string,
    employeeId: string,
    destinationCategory: string,
  ): Promise<{
    employeePerDiemRateId: string;
    dailyRate: number;
    currency: SupportedCurrency;
  } | null> {
    const row = await this.prisma.employeePerDiemRate.findFirst({
      where: activeOnly({ companyId, employeeId }),
    });
    if (!row) {
      return null;
    }
    const resolved = resolveEmployeePerDiemCategoryRate(
      row,
      destinationCategory,
    );
    if (!resolved || !resolved.isActive) {
      return null;
    }
    return {
      employeePerDiemRateId: row.id,
      dailyRate: resolved.dailyRate,
      currency: resolved.currency,
    };
  }

  /**
   * Returns the full employee rate row for HR profile management.
   * Does not auto-create defaults (cleared rates stay cleared until HR upserts).
   */
  async getForEmployee(
    employeeId: string,
    companyId: string,
  ): Promise<EmployeePerDiemRateResponse | null> {
    await this.assertEmployeeInCompany(employeeId, companyId);
    const row = await this.prisma.employeePerDiemRate.findFirst({
      where: activeOnly({ companyId, employeeId }),
    });
    if (!row) {
      return null;
    }
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

    // Include soft-deleted so HR re-seed can revive a cleared row.
    const existing = await this.prisma.employeePerDiemRate.findFirst({
      where: { companyId, employeeId },
    });

    const rateFields = this.buildRateFields(dto);

    const row = existing
      ? await this.prisma.employeePerDiemRate.update({
          where: { id: existing.id },
          data: {
            ...rateFields,
            deletedAt: null,
            deletedBy: null,
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
   * Resolves a seeded rate for settlement fallbacks. Does not create defaults.
   */
  async resolveRateForSubmission(
    companyId: string,
    employeeId: string,
    destinationCategory: string,
    _actorUserId: string,
  ): Promise<{
    employeePerDiemRateId: string;
    dailyRate: number;
    currency: SupportedCurrency;
  }> {
    const resolved = await this.findActiveCategoryRate(
      companyId,
      employeeId,
      destinationCategory,
    );
    if (!resolved) {
      throw new BadRequestException(
        `No per diem rate configured for "${destinationCategory}"`,
      );
    }
    return resolved;
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
