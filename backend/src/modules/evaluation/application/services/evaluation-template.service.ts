import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import { PrismaService } from '../../../../shared/prisma/prisma.service';
import type {
  CreateEvaluationTemplateDto,
  UpdateEvaluationTemplateDto,
} from '../dtos/evaluation-template.dtos';

interface ServiceContext {
  userId: string;
  companyId: string;
}

@Injectable()
export class EvaluationTemplateService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Lists all non-deleted evaluation templates for a company.
   */
  async listTemplates(companyId: string): Promise<unknown> {
    return this.prisma.evaluationTemplate.findMany({
      where: { companyId, deletedAt: null },
      include: {
        sections: {
          orderBy: { sortOrder: 'asc' },
          include: {
            criteria: {
              where: { isActive: true },
              orderBy: { sortOrder: 'asc' },
            },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Returns a single evaluation template by id.
   */
  async getTemplate(id: string, companyId: string): Promise<unknown> {
    const template = await this.prisma.evaluationTemplate.findFirst({
      where: { id, companyId, deletedAt: null },
      include: {
        sections: {
          orderBy: { sortOrder: 'asc' },
          include: {
            criteria: {
              orderBy: { sortOrder: 'asc' },
            },
          },
        },
      },
    });
    if (!template) {
      throw new NotFoundException('Evaluation template not found');
    }
    return template;
  }

  /**
   * Returns the active evaluation template for a company.
   */
  async getActiveTemplate(companyId: string): Promise<unknown> {
    const template = await this.prisma.evaluationTemplate.findFirst({
      where: { companyId, isActive: true, deletedAt: null },
      include: {
        sections: {
          orderBy: { sortOrder: 'asc' },
          include: {
            criteria: {
              where: { isActive: true },
              orderBy: { sortOrder: 'asc' },
            },
          },
        },
      },
    });
    if (!template) {
      throw new NotFoundException(
        'No active evaluation template found. Please create one first.',
      );
    }
    return template;
  }

  /**
   * Creates a new evaluation template with nested sections and criteria.
   */
  async createTemplate(
    dto: CreateEvaluationTemplateDto,
    ctx: ServiceContext,
  ): Promise<unknown> {
    const totalWeight = dto.sections.reduce((sum, s) => sum + s.weight, 0);
    if (Math.abs(totalWeight - 100) > 0.01) {
      throw new BadRequestException(
        `Section weights must sum to 100. Current sum: ${totalWeight}`,
      );
    }

    return this.prisma.evaluationTemplate.create({
      data: {
        id: randomUUID(),
        companyId: ctx.companyId,
        name: dto.name,
        description: dto.description,
        isActive: true,
        createdBy: ctx.userId,
        updatedBy: ctx.userId,
        sections: {
          create: dto.sections.map((section) => ({
            id: randomUUID(),
            name: section.name,
            nameZh: section.nameZh,
            description: section.description,
            weight: section.weight,
            sortOrder: section.sortOrder,
            createdBy: ctx.userId,
            updatedBy: ctx.userId,
            criteria: {
              create: section.criteria.map((criterion) => ({
                id: randomUUID(),
                name: criterion.name,
                nameZh: criterion.nameZh,
                description: criterion.description,
                weight: criterion.weight,
                sortOrder: criterion.sortOrder,
                createdBy: ctx.userId,
                updatedBy: ctx.userId,
              })),
            },
          })),
        },
      },
      include: {
        sections: {
          include: { criteria: true },
        },
      },
    });
  }

  /**
   * Updates template metadata. Nested section/criteria edits are handled separately.
   */
  async updateTemplate(
    id: string,
    dto: UpdateEvaluationTemplateDto,
    ctx: ServiceContext,
  ): Promise<unknown> {
    const template = (await this.getTemplate(id, ctx.companyId)) as {
      id: string;
      name: string;
      description: string | null;
    };

    if (dto.sections) {
      const totalWeight = dto.sections.reduce(
        (sum, s) => sum + (s.weight ?? 0),
        0,
      );
      if (Math.abs(totalWeight - 100) > 0.01) {
        throw new BadRequestException(
          `Section weights must sum to 100. Current sum: ${totalWeight}`,
        );
      }
    }

    return this.prisma.evaluationTemplate.update({
      where: { id: template.id },
      data: {
        name: dto.name ?? template.name,
        description: dto.description ?? template.description,
        updatedBy: ctx.userId,
      },
      include: {
        sections: {
          include: { criteria: true },
        },
      },
    });
  }

  /**
   * Adds a criterion to an existing section.
   */
  async addCriteria(
    sectionId: string,
    dto: {
      name: string;
      nameZh?: string;
      description?: string;
      weight: number;
      sortOrder: number;
    },
    ctx: ServiceContext,
  ): Promise<unknown> {
    const section = await this.prisma.evaluationSection.findFirst({
      where: { id: sectionId },
      include: { template: true },
    });
    if (!section || section.template.companyId !== ctx.companyId) {
      throw new NotFoundException('Section not found');
    }

    return this.prisma.evaluationCriteria.create({
      data: {
        id: randomUUID(),
        sectionId,
        name: dto.name,
        nameZh: dto.nameZh,
        description: dto.description,
        weight: dto.weight,
        sortOrder: dto.sortOrder,
        createdBy: ctx.userId,
        updatedBy: ctx.userId,
      },
    });
  }

  /**
   * Updates an existing criterion.
   */
  async updateCriteria(
    criteriaId: string,
    dto: {
      name?: string;
      nameZh?: string;
      description?: string;
      weight?: number;
      isActive?: boolean;
    },
    ctx: ServiceContext,
  ): Promise<unknown> {
    const criteria = await this.prisma.evaluationCriteria.findFirst({
      where: { id: criteriaId },
      include: { section: { include: { template: true } } },
    });
    if (
      !criteria ||
      criteria.section.template.companyId !== ctx.companyId
    ) {
      throw new NotFoundException('Criteria not found');
    }

    return this.prisma.evaluationCriteria.update({
      where: { id: criteriaId },
      data: {
        ...dto,
        updatedBy: ctx.userId,
      },
    });
  }
}
