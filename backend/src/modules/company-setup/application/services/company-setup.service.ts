import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { FinancialPeriodStatus, Prisma } from '@prisma/client';
import { PaginationQueryDto } from '../../../../shared/dtos/pagination-query.dto';
import { PrismaService } from '../../../../shared/prisma/prisma.service';
import { activeOnly } from '../../../../shared/prisma/soft-delete.util';
import {
  buildOrderBy,
  buildPaginatedResult,
  buildPrismaPagination,
  PaginatedResult,
} from '../../../../shared/utils/pagination.util';
import {
  CreateBranchDto,
  CreateCompanySettingDto,
  CreateCostCentreDto,
  CreateDepartmentDto,
  CreateDisciplineDto,
  CreateDivisionDto,
  CreateFinancialYearDto,
  CreateNumberSeriesDto,
  CreatePositionDto,
  CreateSeniorityLevelDto,
  ListEngineeringDisciplinesQueryDto,
  OrgEntityListQueryDto,
  UpdateBranchDto,
  UpdateCompanyDto,
  UpdateCompanySettingDto,
  UpdateCostCentreDto,
  UpdateDepartmentDto,
  UpdateDisciplineDto,
  UpdateDivisionDto,
  UpdateFinancialYearDto,
  UpdateNumberSeriesDto,
  UpdatePositionDto,
  UpdateSeniorityLevelDto,
} from '../dtos/company.dtos';

type AuditContext = { companyId: string; userId: string };

@Injectable()
export class CompanySetupService {
  constructor(private readonly prisma: PrismaService) {}

  async getCompany(ctx: AuditContext): Promise<unknown> {
    const company = await this.prisma.company.findFirst({
      where: activeOnly({ id: ctx.companyId }),
    });
    if (!company) {
      throw new NotFoundException('Company not found');
    }
    return company;
  }

  async updateCompany(
    ctx: AuditContext,
    dto: UpdateCompanyDto,
  ): Promise<unknown> {
    return this.prisma.company.update({
      where: { id: ctx.companyId },
      data: { ...dto, updatedBy: ctx.userId },
    });
  }

  async listCompanySettings(
    ctx: AuditContext,
    query: PaginationQueryDto,
  ): Promise<PaginatedResult<unknown>> {
    const where = activeOnly({ companyId: ctx.companyId });
    const { skip, take } = buildPrismaPagination(query.page, query.limit);
    const [data, total] = await Promise.all([
      this.prisma.companySetting.findMany({
        where,
        skip,
        take,
        orderBy: buildOrderBy(query.sortBy, query.sortOrder),
      }),
      this.prisma.companySetting.count({ where }),
    ]);
    return buildPaginatedResult(data, total, query.page, query.limit);
  }

  async createCompanySetting(
    ctx: AuditContext,
    dto: CreateCompanySettingDto,
  ): Promise<unknown> {
    return this.prisma.companySetting.create({
      data: {
        companyId: ctx.companyId,
        ...dto,
        createdBy: ctx.userId,
        updatedBy: ctx.userId,
      },
    });
  }

  async updateCompanySetting(
    ctx: AuditContext,
    id: string,
    dto: UpdateCompanySettingDto,
  ): Promise<unknown> {
    await this.assertCompanySetting(id, ctx.companyId);
    return this.prisma.companySetting.update({
      where: { id },
      data: { ...dto, updatedBy: ctx.userId },
    });
  }

  async deleteCompanySetting(ctx: AuditContext, id: string): Promise<void> {
    await this.assertCompanySetting(id, ctx.companyId);
    await this.prisma.companySetting.update({
      where: { id },
      data: { deletedAt: new Date(), deletedBy: ctx.userId },
    });
  }

  async listBranches(
    ctx: AuditContext,
    query: PaginationQueryDto,
  ): Promise<PaginatedResult<unknown>> {
    return this.paginate('branch', ctx.companyId, query);
  }

  async getBranch(ctx: AuditContext, id: string): Promise<unknown> {
    return this.findOrThrow('branch', id, ctx.companyId);
  }

  async createBranch(ctx: AuditContext, dto: CreateBranchDto): Promise<unknown> {
    return this.prisma.branch.create({
      data: {
        companyId: ctx.companyId,
        ...dto,
        createdBy: ctx.userId,
        updatedBy: ctx.userId,
      },
    });
  }

  async updateBranch(
    ctx: AuditContext,
    id: string,
    dto: UpdateBranchDto,
  ): Promise<unknown> {
    await this.findOrThrow('branch', id, ctx.companyId);
    return this.prisma.branch.update({
      where: { id },
      data: { ...dto, updatedBy: ctx.userId },
    });
  }

  async deleteBranch(ctx: AuditContext, id: string): Promise<void> {
    await this.findOrThrow('branch', id, ctx.companyId);
    await this.prisma.branch.update({
      where: { id },
      data: { deletedAt: new Date(), deletedBy: ctx.userId },
    });
  }

  async listDivisions(
    ctx: AuditContext,
    query: PaginationQueryDto,
  ): Promise<PaginatedResult<unknown>> {
    return this.paginate('division', ctx.companyId, query);
  }

  async getDivision(ctx: AuditContext, id: string): Promise<unknown> {
    return this.findOrThrow('division', id, ctx.companyId);
  }

  async createDivision(
    ctx: AuditContext,
    dto: CreateDivisionDto,
  ): Promise<unknown> {
    return this.prisma.division.create({
      data: {
        companyId: ctx.companyId,
        ...dto,
        createdBy: ctx.userId,
        updatedBy: ctx.userId,
      },
    });
  }

  async updateDivision(
    ctx: AuditContext,
    id: string,
    dto: UpdateDivisionDto,
  ): Promise<unknown> {
    await this.findOrThrow('division', id, ctx.companyId);
    return this.prisma.division.update({
      where: { id },
      data: { ...dto, updatedBy: ctx.userId },
    });
  }

  async deleteDivision(ctx: AuditContext, id: string): Promise<void> {
    await this.findOrThrow('division', id, ctx.companyId);
    await this.prisma.division.update({
      where: { id },
      data: { deletedAt: new Date(), deletedBy: ctx.userId },
    });
  }

  async listDepartments(
    ctx: AuditContext,
    query: OrgEntityListQueryDto,
  ): Promise<PaginatedResult<unknown>> {
    await this.alignDepartmentCodes(ctx);
    return this.paginate('department', ctx.companyId, query);
  }

  async getDepartment(ctx: AuditContext, id: string): Promise<unknown> {
    return this.findOrThrow('department', id, ctx.companyId);
  }

  async createDepartment(
    ctx: AuditContext,
    dto: CreateDepartmentDto,
  ): Promise<unknown> {
    const divisionId =
      dto.divisionId ?? (await this.resolveDefaultDivisionId(ctx.companyId));
    const branchId =
      dto.branchId ?? (await this.resolveDefaultBranchId(ctx.companyId));
    await this.findOrThrow('division', divisionId, ctx.companyId);
    await this.findOrThrow('branch', branchId, ctx.companyId);
    await this.alignDepartmentCodes(ctx);

    const department = await this.prisma.department.create({
      data: {
        companyId: ctx.companyId,
        divisionId,
        branchId,
        name: dto.name,
        nameZh: dto.nameZh,
        code: await this.nextDepartmentCode(),
        isActive: dto.isActive ?? true,
        leaderUserId: dto.leaderUserId,
        createdBy: ctx.userId,
        updatedBy: ctx.userId,
      },
    });

    if (dto.leaderUserId) {
      await this.syncDepartmentLeaderUser(
        ctx,
        department.id,
        dto.leaderUserId,
        Boolean(dto.forceAlignLeaderDepartment),
      );
    }

    return department;
  }

  async updateDepartment(
    ctx: AuditContext,
    id: string,
    dto: UpdateDepartmentDto,
  ): Promise<unknown> {
    await this.findOrThrow('department', id, ctx.companyId);
    if (dto.divisionId) {
      await this.findOrThrow('division', dto.divisionId, ctx.companyId);
    }
    if (dto.branchId) {
      await this.findOrThrow('branch', dto.branchId, ctx.companyId);
    }

    const department = await this.prisma.department.update({
      where: { id },
      data: {
        divisionId: dto.divisionId,
        branchId: dto.branchId,
        name: dto.name,
        nameZh: dto.nameZh,
        isActive: dto.isActive,
        leaderUserId: dto.leaderUserId,
        updatedBy: ctx.userId,
      },
    });

    if (dto.leaderUserId !== undefined && dto.leaderUserId) {
      await this.syncDepartmentLeaderUser(
        ctx,
        id,
        dto.leaderUserId,
        Boolean(dto.forceAlignLeaderDepartment),
      );
    }

    return department;
  }

  async deleteDepartment(ctx: AuditContext, id: string): Promise<void> {
    await this.findOrThrow('department', id, ctx.companyId);
    const now = new Date();
    await this.prisma.$transaction(async (tx) => {
      await tx.costCentre.updateMany({
        where: activeOnly({ companyId: ctx.companyId, departmentId: id }),
        data: {
          deletedAt: now,
          deletedBy: ctx.userId,
          updatedBy: ctx.userId,
        },
      });

      await tx.user.updateMany({
        where: {
          companyId: ctx.companyId,
          departmentId: id,
          deletedAt: null,
        },
        data: { departmentId: null, updatedBy: ctx.userId },
      });

      await tx.project.updateMany({
        where: {
          companyId: ctx.companyId,
          departmentId: id,
          deletedAt: null,
        },
        data: { departmentId: null, updatedBy: ctx.userId },
      });

      await tx.department.update({
        where: { id },
        data: {
          leaderUserId: null,
          deletedAt: now,
          deletedBy: ctx.userId,
          updatedBy: ctx.userId,
        },
      });
    });
  }

  /**
   * Lists engineering disciplines for the company catalog.
   */
  async listDisciplines(
    ctx: AuditContext,
    query: ListEngineeringDisciplinesQueryDto,
  ): Promise<PaginatedResult<unknown>> {
    const where: Prisma.DisciplineWhereInput = activeOnly({
      companyId: ctx.companyId,
    });
    if (query.activeOnly === 'true') {
      where.isActive = true;
    }

    const { skip, take } = buildPrismaPagination(query.page, query.limit);
    const [data, total] = await Promise.all([
      this.prisma.discipline.findMany({
        where,
        skip,
        take,
        orderBy: { name: 'asc' },
        include: {
          leader: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              chineseName: true,
              email: true,
            },
          },
          _count: {
            select: {
              taskDisciplines: { where: { deletedAt: null } },
              users: { where: { deletedAt: null } },
            },
          },
        },
      }),
      this.prisma.discipline.count({ where }),
    ]);

    return buildPaginatedResult(data, total, query.page, query.limit);
  }

  async getDiscipline(ctx: AuditContext, id: string): Promise<unknown> {
    return this.findDisciplineOrThrow(ctx, id);
  }

  /**
   * Creates an engineering discipline catalog entry.
   */
  async createDiscipline(
    ctx: AuditContext,
    dto: CreateDisciplineDto,
  ): Promise<unknown> {
    const name = dto.name.trim();
    if (!name) {
      throw new BadRequestException('Discipline name is required');
    }

    await this.assertDisciplineNameAvailable(ctx, name);
    const leaderId = await this.resolveDisciplineLeaderId(
      ctx,
      dto.leaderId,
    );

    try {
      return await this.prisma.discipline.create({
        data: {
          companyId: ctx.companyId,
          name,
          nameZh: dto.nameZh?.trim() || null,
          isActive: dto.isActive ?? true,
          leaderId,
          createdBy: ctx.userId,
          updatedBy: ctx.userId,
        },
        include: {
          leader: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              chineseName: true,
              email: true,
            },
          },
        },
      });
    } catch (error) {
      this.rethrowDisciplineUniqueViolation(error, name);
    }
  }

  /**
   * Updates an engineering discipline. Deactivate via isActive=false.
   */
  async updateDiscipline(
    ctx: AuditContext,
    id: string,
    dto: UpdateDisciplineDto,
  ): Promise<unknown> {
    const existing = await this.findDisciplineOrThrow(ctx, id);
    const name = dto.name?.trim();

    if (name && name !== existing.name) {
      await this.assertDisciplineNameAvailable(ctx, name, id);
    }

    const data: Prisma.DisciplineUpdateInput = {
      updatedBy: ctx.userId,
    };
    if (name !== undefined) {
      data.name = name;
    }
    if (dto.nameZh !== undefined) {
      data.nameZh = dto.nameZh?.trim() || null;
    }
    if (dto.isActive !== undefined) {
      data.isActive = dto.isActive;
    }
    if (dto.leaderId !== undefined) {
      const leaderId = await this.resolveDisciplineLeaderId(ctx, dto.leaderId);
      data.leader = leaderId
        ? { connect: { id: leaderId } }
        : { disconnect: true };
    }

    try {
      return await this.prisma.discipline.update({
        where: { id },
        data,
        include: {
          leader: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              chineseName: true,
              email: true,
            },
          },
        },
      });
    } catch (error) {
      if (name) {
        this.rethrowDisciplineUniqueViolation(error, name);
      }
      throw error;
    }
  }

  /**
   * Assigns the discipline leader used as Tier 1 for leave approvals.
   * Leader must be an active user in the same company and discipline.
   */
  async assignDisciplineLeader(
    ctx: AuditContext,
    id: string,
    leaderId: string,
  ): Promise<unknown> {
    await this.findDisciplineOrThrow(ctx, id);

    const leader = await this.prisma.user.findFirst({
      where: activeOnly({
        id: leaderId,
        companyId: ctx.companyId,
        isActive: true,
        engineeringDisciplineId: id,
      }),
      select: { id: true },
    });

    if (!leader) {
      throw new BadRequestException(
        'Leader must be an active user assigned to this discipline',
      );
    }

    return this.prisma.discipline.update({
      where: { id },
      data: {
        leaderId: leader.id,
        updatedBy: ctx.userId,
      },
      include: {
        leader: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            chineseName: true,
            email: true,
          },
        },
      },
    });
  }

  /**
   * Soft-deletes a discipline and clears FK references on users and task disciplines.
   */
  async deleteDiscipline(ctx: AuditContext, id: string): Promise<void> {
    await this.findDisciplineOrThrow(ctx, id);
    const now = new Date();
    await this.prisma.$transaction(async (tx) => {
      await tx.taskDiscipline.updateMany({
        where: activeOnly({ companyId: ctx.companyId, disciplineId: id }),
        data: { disciplineId: null, updatedBy: ctx.userId },
      });
      await tx.user.updateMany({
        where: activeOnly({ companyId: ctx.companyId, engineeringDisciplineId: id }),
        data: { engineeringDisciplineId: null, updatedBy: ctx.userId },
      });
      await tx.discipline.update({
        where: { id },
        data: {
          deletedAt: now,
          deletedBy: ctx.userId,
          updatedBy: ctx.userId,
        },
      });
    });
  }

  async listCostCentres(
    ctx: AuditContext,
    query: PaginationQueryDto,
  ): Promise<PaginatedResult<unknown>> {
    return this.paginate('costCentre', ctx.companyId, query);
  }

  async getCostCentre(ctx: AuditContext, id: string): Promise<unknown> {
    return this.findOrThrow('costCentre', id, ctx.companyId);
  }

  async createCostCentre(
    ctx: AuditContext,
    dto: CreateCostCentreDto,
  ): Promise<unknown> {
    await this.findOrThrow('department', dto.departmentId, ctx.companyId);
    return this.prisma.costCentre.create({
      data: {
        companyId: ctx.companyId,
        ...dto,
        createdBy: ctx.userId,
        updatedBy: ctx.userId,
      },
    });
  }

  async updateCostCentre(
    ctx: AuditContext,
    id: string,
    dto: UpdateCostCentreDto,
  ): Promise<unknown> {
    await this.findOrThrow('costCentre', id, ctx.companyId);
    if (dto.departmentId) {
      await this.findOrThrow('department', dto.departmentId, ctx.companyId);
    }
    return this.prisma.costCentre.update({
      where: { id },
      data: { ...dto, updatedBy: ctx.userId },
    });
  }

  async deleteCostCentre(ctx: AuditContext, id: string): Promise<void> {
    await this.findOrThrow('costCentre', id, ctx.companyId);
    await this.prisma.costCentre.update({
      where: { id },
      data: { deletedAt: new Date(), deletedBy: ctx.userId },
    });
  }

  async listPositions(
    ctx: AuditContext,
    query: OrgEntityListQueryDto,
  ): Promise<PaginatedResult<unknown>> {
    return this.paginate('position', ctx.companyId, query);
  }

  async getPosition(ctx: AuditContext, id: string): Promise<unknown> {
    return this.findOrThrow('position', id, ctx.companyId);
  }

  async createPosition(
    ctx: AuditContext,
    dto: CreatePositionDto,
  ): Promise<unknown> {
    return this.prisma.position.create({
      data: {
        companyId: ctx.companyId,
        title: dto.title.trim(),
        titleZh: dto.titleZh?.trim() || null,
        isActive: dto.isActive ?? true,
        createdBy: ctx.userId,
        updatedBy: ctx.userId,
      },
    });
  }

  async updatePosition(
    ctx: AuditContext,
    id: string,
    dto: UpdatePositionDto,
  ): Promise<unknown> {
    await this.findOrThrow('position', id, ctx.companyId);
    const data: {
      title?: string;
      titleZh?: string | null;
      isActive?: boolean;
      updatedBy: string;
    } = { updatedBy: ctx.userId };
    if (dto.title !== undefined) {
      data.title = dto.title.trim();
    }
    if (dto.titleZh !== undefined) {
      data.titleZh = dto.titleZh.trim() || null;
    }
    if (dto.isActive !== undefined) {
      data.isActive = dto.isActive;
    }
    return this.prisma.position.update({
      where: { id },
      data,
    });
  }

  async deletePosition(ctx: AuditContext, id: string): Promise<void> {
    await this.findOrThrow('position', id, ctx.companyId);
    const now = new Date();
    await this.prisma.$transaction(async (tx) => {
      await tx.user.updateMany({
        where: {
          companyId: ctx.companyId,
          positionId: id,
          deletedAt: null,
        },
        data: { positionId: null, updatedBy: ctx.userId },
      });
      await tx.position.update({
        where: { id },
        data: {
          deletedAt: now,
          deletedBy: ctx.userId,
          updatedBy: ctx.userId,
        },
      });
    });
  }

  /** Whole seniority catalogue (it is short), in display order. */
  async listSeniorityLevels(
    ctx: AuditContext,
    query: OrgEntityListQueryDto,
  ): Promise<unknown[]> {
    return this.prisma.seniorityLevel.findMany({
      where: activeOnly({
        companyId: ctx.companyId,
        ...(query.isActive === 'true' || query.isActive === 'false'
          ? { isActive: query.isActive === 'true' }
          : {}),
      }),
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      include: {
        _count: { select: { users: { where: { deletedAt: null } } } },
      },
    });
  }

  async createSeniorityLevel(
    ctx: AuditContext,
    dto: CreateSeniorityLevelDto,
  ): Promise<unknown> {
    const name = dto.name.trim();
    await this.assertSeniorityNameFree(ctx.companyId, name);
    return this.prisma.seniorityLevel.create({
      data: {
        companyId: ctx.companyId,
        name,
        nameZh: dto.nameZh?.trim() || null,
        sortOrder: dto.sortOrder ?? 0,
        isActive: dto.isActive ?? true,
        createdBy: ctx.userId,
        updatedBy: ctx.userId,
      },
    });
  }

  async updateSeniorityLevel(
    ctx: AuditContext,
    id: string,
    dto: UpdateSeniorityLevelDto,
  ): Promise<unknown> {
    await this.findSeniorityLevelOrThrow(ctx.companyId, id);
    const data: Prisma.SeniorityLevelUncheckedUpdateInput = {
      updatedBy: ctx.userId,
    };
    if (dto.name !== undefined) {
      const name = dto.name.trim();
      await this.assertSeniorityNameFree(ctx.companyId, name, id);
      data.name = name;
    }
    if (dto.nameZh !== undefined) {
      data.nameZh = dto.nameZh.trim() || null;
    }
    if (dto.sortOrder !== undefined) {
      data.sortOrder = dto.sortOrder;
    }
    if (dto.isActive !== undefined) {
      data.isActive = dto.isActive;
    }
    return this.prisma.seniorityLevel.update({ where: { id }, data });
  }

  /** Soft delete; employees on this level are left without one. */
  async deleteSeniorityLevel(ctx: AuditContext, id: string): Promise<void> {
    await this.findSeniorityLevelOrThrow(ctx.companyId, id);
    const now = new Date();
    await this.prisma.$transaction(async (tx) => {
      await tx.user.updateMany({
        where: { companyId: ctx.companyId, seniorityLevelId: id, deletedAt: null },
        data: { seniorityLevelId: null, updatedBy: ctx.userId },
      });
      await tx.seniorityLevel.update({
        where: { id },
        data: { deletedAt: now, deletedBy: ctx.userId, updatedBy: ctx.userId },
      });
    });
  }

  private async findSeniorityLevelOrThrow(
    companyId: string,
    id: string,
  ): Promise<void> {
    const level = await this.prisma.seniorityLevel.findFirst({
      where: activeOnly({ id, companyId }),
      select: { id: true },
    });
    if (!level) {
      throw new NotFoundException('Seniority level not found');
    }
  }

  private async assertSeniorityNameFree(
    companyId: string,
    name: string,
    exceptId?: string,
  ): Promise<void> {
    const clash = await this.prisma.seniorityLevel.findFirst({
      where: activeOnly({
        companyId,
        name: { equals: name, mode: Prisma.QueryMode.insensitive },
        ...(exceptId ? { id: { not: exceptId } } : {}),
      }),
      select: { id: true },
    });
    if (clash) {
      throw new ConflictException(`A seniority level named "${name}" already exists`);
    }
  }

  async listFinancialYears(
    ctx: AuditContext,
    query: PaginationQueryDto,
  ): Promise<PaginatedResult<unknown>> {
    const where = { companyId: ctx.companyId };
    const { skip, take } = buildPrismaPagination(query.page, query.limit);
    const [data, total] = await Promise.all([
      this.prisma.financialYear.findMany({
        where,
        skip,
        take,
        orderBy: buildOrderBy(query.sortBy, query.sortOrder),
      }),
      this.prisma.financialYear.count({ where }),
    ]);
    return buildPaginatedResult(data, total, query.page, query.limit);
  }

  async getFinancialYear(ctx: AuditContext, id: string): Promise<unknown> {
    const year = await this.prisma.financialYear.findFirst({
      where: { id, companyId: ctx.companyId },
      include: { periods: { orderBy: { periodNumber: 'asc' } } },
    });
    if (!year) {
      throw new NotFoundException('Financial year not found');
    }
    return year;
  }

  async createFinancialYear(
    ctx: AuditContext,
    dto: CreateFinancialYearDto,
  ): Promise<unknown> {
    return this.prisma.financialYear.create({
      data: {
        companyId: ctx.companyId,
        name: dto.name,
        startDate: new Date(dto.startDate),
        endDate: new Date(dto.endDate),
        status: dto.status ?? 'OPEN',
        createdBy: ctx.userId,
        updatedBy: ctx.userId,
      },
    });
  }

  async updateFinancialYear(
    ctx: AuditContext,
    id: string,
    dto: UpdateFinancialYearDto,
  ): Promise<unknown> {
    await this.getFinancialYear(ctx, id);
    return this.prisma.financialYear.update({
      where: { id },
      data: {
        ...dto,
        startDate: dto.startDate ? new Date(dto.startDate) : undefined,
        endDate: dto.endDate ? new Date(dto.endDate) : undefined,
        updatedBy: ctx.userId,
      },
    });
  }

  async listFinancialPeriods(
    ctx: AuditContext,
    query: PaginationQueryDto,
    financialYearId?: string,
  ): Promise<PaginatedResult<unknown>> {
    const where: Prisma.FinancialPeriodWhereInput = {
      companyId: ctx.companyId,
      ...(financialYearId ? { financialYearId } : {}),
    };
    const { skip, take } = buildPrismaPagination(query.page, query.limit);
    const [data, total] = await Promise.all([
      this.prisma.financialPeriod.findMany({
        where,
        skip,
        take,
        orderBy: buildOrderBy(query.sortBy, query.sortOrder),
      }),
      this.prisma.financialPeriod.count({ where }),
    ]);
    return buildPaginatedResult(data, total, query.page, query.limit);
  }

  async getFinancialPeriod(ctx: AuditContext, id: string): Promise<unknown> {
    const period = await this.prisma.financialPeriod.findFirst({
      where: { id, companyId: ctx.companyId },
    });
    if (!period) {
      throw new NotFoundException('Financial period not found');
    }
    return period;
  }

  /**
   * Locks a financial period (OPEN → LOCKED).
   */
  async lockFinancialPeriod(ctx: AuditContext, id: string): Promise<unknown> {
    const period = await this.getFinancialPeriod(ctx, id);
    const current = period as { status: FinancialPeriodStatus };
    if (current.status !== FinancialPeriodStatus.OPEN) {
      throw new BadRequestException('Only OPEN periods can be locked');
    }
    return this.prisma.financialPeriod.update({
      where: { id },
      data: {
        status: FinancialPeriodStatus.LOCKED,
        lockedAt: new Date(),
        lockedBy: ctx.userId,
        updatedBy: ctx.userId,
      },
    });
  }

  /**
   * Closes a financial period (LOCKED → CLOSED).
   */
  async closeFinancialPeriod(ctx: AuditContext, id: string): Promise<unknown> {
    const period = await this.getFinancialPeriod(ctx, id);
    const current = period as { status: FinancialPeriodStatus };
    if (current.status !== FinancialPeriodStatus.LOCKED) {
      throw new BadRequestException('Period must be LOCKED before closing');
    }
    return this.prisma.financialPeriod.update({
      where: { id },
      data: {
        status: FinancialPeriodStatus.CLOSED,
        closedAt: new Date(),
        closedBy: ctx.userId,
        updatedBy: ctx.userId,
      },
    });
  }

  async listNumberSeries(
    ctx: AuditContext,
    query: PaginationQueryDto,
  ): Promise<PaginatedResult<unknown>> {
    return this.paginate('numberSeries', ctx.companyId, query);
  }

  async createNumberSeries(
    ctx: AuditContext,
    dto: CreateNumberSeriesDto,
  ): Promise<unknown> {
    const sequenceName = `seq_${ctx.companyId.replace(/-/g, '_')}_${dto.documentType.toLowerCase()}`;
    const existing = await this.prisma.numberSeries.findFirst({
      where: activeOnly({
        companyId: ctx.companyId,
        documentType: dto.documentType,
      }),
    });
    if (existing) {
      throw new ConflictException('Number series already exists for document type');
    }
    await this.prisma.$executeRawUnsafe(
      `CREATE SEQUENCE IF NOT EXISTS "${sequenceName}" START WITH 1 INCREMENT BY 1`,
    );
    return this.prisma.numberSeries.create({
      data: {
        companyId: ctx.companyId,
        documentType: dto.documentType,
        prefix: dto.prefix ?? '',
        suffix: dto.suffix ?? '',
        sequenceName,
        padding: dto.padding ?? 5,
        resetFrequency: dto.resetFrequency ?? 'NEVER',
        createdBy: ctx.userId,
        updatedBy: ctx.userId,
      },
    });
  }

  async updateNumberSeries(
    ctx: AuditContext,
    id: string,
    dto: UpdateNumberSeriesDto,
  ): Promise<unknown> {
    await this.findOrThrow('numberSeries', id, ctx.companyId);
    return this.prisma.numberSeries.update({
      where: { id },
      data: { ...dto, updatedBy: ctx.userId },
    });
  }

  async deleteNumberSeries(ctx: AuditContext, id: string): Promise<void> {
    await this.findOrThrow('numberSeries', id, ctx.companyId);
    await this.prisma.numberSeries.update({
      where: { id },
      data: { deletedAt: new Date(), deletedBy: ctx.userId },
    });
  }

  /**
   * Returns the next document number from the PostgreSQL sequence.
   */
  async getNextDocumentNumber(
    ctx: AuditContext,
    documentType: string,
  ): Promise<{ documentNumber: string }> {
    const series = await this.prisma.numberSeries.findFirst({
      where: activeOnly({ companyId: ctx.companyId, documentType }),
    });
    if (!series) {
      throw new NotFoundException('Number series not found');
    }
    const result = await this.prisma.$queryRawUnsafe<
      Array<{ nextval: bigint | number }>
    >(`SELECT nextval('${series.sequenceName}') as nextval`);
    const next = Number(result[0]?.nextval ?? 1);
    const padded = String(next).padStart(series.padding, '0');
    return {
      documentNumber: `${series.prefix}${padded}${series.suffix}`,
    };
  }

  private async paginate(
    model: 'branch' | 'division' | 'department' | 'costCentre' | 'position' | 'numberSeries',
    companyId: string,
    query: PaginationQueryDto | OrgEntityListQueryDto,
  ): Promise<PaginatedResult<unknown>> {
    const where: Record<string, unknown> = activeOnly({ companyId });
    if (
      (model === 'department' || model === 'position') &&
      'isActive' in query &&
      (query.isActive === 'true' || query.isActive === 'false')
    ) {
      where.isActive = query.isActive === 'true';
    }
    const { skip, take } = buildPrismaPagination(query.page, query.limit);
    const delegate = this.prisma[model] as {
      findMany: (args: object) => Promise<unknown[]>;
      count: (args: object) => Promise<number>;
    };
    const [data, total] = await Promise.all([
      delegate.findMany({
        where,
        skip,
        take,
        orderBy: buildOrderBy(query.sortBy, query.sortOrder),
      }),
      delegate.count({ where }),
    ]);
    return buildPaginatedResult(data, total, query.page, query.limit);
  }

  private async findOrThrow(
    model: 'branch' | 'division' | 'department' | 'costCentre' | 'position' | 'numberSeries',
    id: string,
    companyId: string,
  ): Promise<unknown> {
    const delegate = this.prisma[model] as {
      findFirst: (args: object) => Promise<unknown | null>;
    };
    const record = await delegate.findFirst({
      where: activeOnly({ id, companyId }),
    });
    if (!record) {
      throw new NotFoundException(`${model} not found`);
    }
    return record;
  }

  private async assertCompanySetting(
    id: string,
    companyId: string,
  ): Promise<void> {
    const setting = await this.prisma.companySetting.findFirst({
      where: activeOnly({ id, companyId }),
    });
    if (!setting) {
      throw new NotFoundException('Company setting not found');
    }
  }

  /** First active division for the company - used when org fields are omitted. */
  private async resolveDefaultDivisionId(companyId: string): Promise<string> {
    const division = await this.prisma.division.findFirst({
      where: activeOnly({ companyId }),
      orderBy: { createdAt: 'asc' },
      select: { id: true },
    });
    if (!division) {
      throw new BadRequestException(
        'No division configured - create a division or pass divisionId.',
      );
    }
    return division.id;
  }

  /** First active branch for the company - used when org fields are omitted. */
  private async resolveDefaultBranchId(companyId: string): Promise<string> {
    const branch = await this.prisma.branch.findFirst({
      where: activeOnly({ companyId }),
      orderBy: { createdAt: 'asc' },
      select: { id: true },
    });
    if (!branch) {
      throw new BadRequestException(
        'No branch configured - create a branch or pass branchId.',
      );
    }
    return branch.id;
  }

  /**
   * Next department code from the PostgreSQL sequence (DEPT-0001, DEPT-0002, …).
   */
  private async nextDepartmentCode(): Promise<string> {
    await this.ensureDepartmentCodeSequence();
    const result = await this.prisma.$queryRaw<Array<{ nextval: bigint }>>`
      SELECT nextval('department_code_seq')
    `;
    const seq = Number(result[0]?.nextval ?? 1);
    return `DEPT-${String(seq).padStart(4, '0')}`;
  }

  private async ensureDepartmentCodeSequence(): Promise<void> {
    await this.prisma.$executeRawUnsafe(
      `CREATE SEQUENCE IF NOT EXISTS "department_code_seq" START WITH 1 INCREMENT BY 1`,
    );
  }

  /**
   * Converts mnemonic department codes (IT, MTD, …) to DEPT-0001 style.
   * No-ops once every row for the company already uses a DEPT-n code.
   */
  private async alignDepartmentCodes(ctx: AuditContext): Promise<void> {
    const rows = await this.prisma.department.findMany({
      where: { companyId: ctx.companyId },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      select: { id: true, code: true },
    });
    if (rows.length === 0) {
      return;
    }

    const aligned = rows.every((row) => /^DEPT-\d+$/.test(row.code));
    if (aligned) {
      return;
    }

    await this.ensureDepartmentCodeSequence();
    await this.prisma.$transaction(async (tx) => {
      for (const row of rows) {
        await tx.department.update({
          where: { id: row.id },
          data: {
            code: `TMP-${row.id.replace(/-/g, '')}`,
            updatedBy: ctx.userId,
          },
        });
      }
      for (const [index, row] of rows.entries()) {
        await tx.department.update({
          where: { id: row.id },
          data: {
            code: this.formatDepartmentCode(index + 1),
            updatedBy: ctx.userId,
          },
        });
      }
    });

    const maxResult = await this.prisma.$queryRaw<Array<{ max: number | bigint | null }>>`
      SELECT COALESCE(MAX(CAST(substring(code FROM 6) AS INTEGER)), 0) AS max
      FROM department
      WHERE code ~ '^DEPT-[0-9]+$'
    `;
    const maxN = Number(maxResult[0]?.max ?? 0);
    if (maxN <= 0) {
      await this.prisma.$executeRaw`SELECT setval('department_code_seq', 1, false)`;
      return;
    }
    await this.prisma.$executeRaw`SELECT setval('department_code_seq', ${maxN}, true)`;
  }

  private formatDepartmentCode(sequence: number): string {
    return `DEPT-${String(sequence).padStart(4, '0')}`;
  }

  /**
   * Ensures the department leader belongs to this department.
   * When forceAlign is true, updates the user's departmentId.
   */
  private async syncDepartmentLeaderUser(
    ctx: AuditContext,
    departmentId: string,
    leaderUserId: string,
    forceAlign: boolean,
  ): Promise<void> {
    const user = await this.prisma.user.findFirst({
      where: activeOnly({ id: leaderUserId, companyId: ctx.companyId }),
      select: { id: true, departmentId: true },
    });
    if (!user) {
      throw new NotFoundException('Leader user not found');
    }

    if (user.departmentId === departmentId) {
      return;
    }

    if (user.departmentId && !forceAlign) {
      throw new BadRequestException(
        'Leader user belongs to a different department. Confirm to align their department.',
      );
    }

    await this.prisma.user.update({
      where: { id: leaderUserId },
      data: { departmentId, updatedBy: ctx.userId },
    });
  }

  private async findDisciplineOrThrow(
    ctx: AuditContext,
    id: string,
  ): Promise<{ id: string; name: string }> {
    const row = await this.prisma.discipline.findFirst({
      where: activeOnly({ id, companyId: ctx.companyId }),
      select: { id: true, name: true },
    });
    if (!row) {
      throw new NotFoundException('Discipline not found');
    }
    return row;
  }

  /**
   * Validates an optional discipline leader belongs to the company and is active.
   */
  private async resolveDisciplineLeaderId(
    ctx: AuditContext,
    leaderId: string | null | undefined,
  ): Promise<string | null> {
    if (leaderId === undefined || leaderId === null || leaderId === '') {
      return null;
    }

    const leader = await this.prisma.user.findFirst({
      where: activeOnly({
        id: leaderId,
        companyId: ctx.companyId,
        isActive: true,
      }),
      select: { id: true },
    });

    if (!leader) {
      throw new BadRequestException(
        'Leader must be an active user in this company',
      );
    }

    return leader.id;
  }

  /**
   * Rejects duplicate discipline names within a company (including soft-deleted rows).
   */
  private async assertDisciplineNameAvailable(
    ctx: AuditContext,
    name: string,
    excludeId?: string,
  ): Promise<void> {
    const existing = await this.prisma.discipline.findFirst({
      where: {
        companyId: ctx.companyId,
        name,
        ...(excludeId ? { NOT: { id: excludeId } } : {}),
      },
      select: { id: true, deletedAt: true, isActive: true },
    });

    if (!existing) {
      return;
    }

    if (existing.deletedAt) {
      throw new ConflictException(
        `A discipline named "${name}" already exists but is inactive. Reactivate it instead of creating a duplicate.`,
      );
    }

    throw new ConflictException(
      `A discipline named "${name}" already exists.`,
    );
  }

  /**
   * Maps Prisma unique violations on discipline name to a 409 response.
   */
  private rethrowDisciplineUniqueViolation(
    error: unknown,
    name: string,
  ): never {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002'
    ) {
      throw new ConflictException(
        `A discipline named "${name}" already exists.`,
      );
    }
    throw error;
  }
}


