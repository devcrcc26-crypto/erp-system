import { Injectable } from '@nestjs/common';
import {
  DesignPackage,
  DesignPackageDependency,
  DesignPackageItem,
  EngineeringDocument,
  EngineeringDocumentVersion,
  Prisma,
  WorkflowEventLog,
} from '@prisma/client';
import { PrismaService } from '../../../../shared/prisma/prisma.service';
import { activeOnly } from '../../../../shared/prisma/soft-delete.util';

@Injectable()
export class EngineeringDocumentRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findMany(
    companyId: string,
    taskDisciplineId: string,
    skip: number,
    take: number,
  ): Promise<EngineeringDocument[]> {
    return this.prisma.engineeringDocument.findMany({
      where: activeOnly({ companyId, taskDisciplineId }),
      skip,
      take,
      orderBy: { createdAt: 'desc' },
      include: {
        versions: {
          where: activeOnly({}),
          orderBy: { createdAt: 'desc' },
        },
      },
    });
  }

  async count(companyId: string, taskDisciplineId: string): Promise<number> {
    return this.prisma.engineeringDocument.count({
      where: activeOnly({ companyId, taskDisciplineId }),
    });
  }

  async findById(
    companyId: string,
    id: string,
  ): Promise<
    | (EngineeringDocument & { versions: EngineeringDocumentVersion[] })
    | null
  > {
    return this.prisma.engineeringDocument.findFirst({
      where: activeOnly({ id, companyId }),
      include: {
        versions: {
          where: activeOnly({}),
          orderBy: { createdAt: 'desc' },
        },
      },
    });
  }

  async create(
    data: Prisma.EngineeringDocumentCreateInput,
  ): Promise<EngineeringDocument> {
    return this.prisma.engineeringDocument.create({ data });
  }

  async update(
    id: string,
    data: Prisma.EngineeringDocumentUpdateInput,
  ): Promise<EngineeringDocument> {
    return this.prisma.engineeringDocument.update({ where: { id }, data });
  }

  async softDelete(
    id: string,
    deletedBy: string,
  ): Promise<EngineeringDocument> {
    return this.prisma.engineeringDocument.update({
      where: { id },
      data: { deletedAt: new Date(), deletedBy },
    });
  }
}

@Injectable()
export class EngineeringDocumentVersionRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findById(
    companyId: string,
    id: string,
  ): Promise<EngineeringDocumentVersion | null> {
    return this.prisma.engineeringDocumentVersion.findFirst({
      where: activeOnly({ id, companyId }),
    });
  }

  async findByDocumentId(
    companyId: string,
    engineeringDocumentId: string,
  ): Promise<EngineeringDocumentVersion[]> {
    return this.prisma.engineeringDocumentVersion.findMany({
      where: activeOnly({ companyId, engineeringDocumentId }),
      orderBy: { createdAt: 'desc' },
    });
  }

  async countByDocument(engineeringDocumentId: string): Promise<number> {
    return this.prisma.engineeringDocumentVersion.count({
      where: activeOnly({ engineeringDocumentId }),
    });
  }

  async create(
    data: Prisma.EngineeringDocumentVersionCreateInput,
  ): Promise<EngineeringDocumentVersion> {
    return this.prisma.engineeringDocumentVersion.create({ data });
  }

  async update(
    id: string,
    data: Prisma.EngineeringDocumentVersionUpdateInput,
  ): Promise<EngineeringDocumentVersion> {
    return this.prisma.engineeringDocumentVersion.update({ where: { id }, data });
  }
}

@Injectable()
export class DesignPackageRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findMany(
    companyId: string,
    taskDisciplineId: string,
  ): Promise<(DesignPackage & { items: DesignPackageItem[] })[]> {
    return this.prisma.designPackage.findMany({
      where: activeOnly({ companyId, taskDisciplineId }),
      orderBy: { createdAt: 'desc' },
      include: { items: { orderBy: { sortOrder: 'asc' } } },
    });
  }

  async findById(
    companyId: string,
    id: string,
  ): Promise<(DesignPackage & { items: DesignPackageItem[] }) | null> {
    return this.prisma.designPackage.findFirst({
      where: activeOnly({ id, companyId }),
      include: { items: { orderBy: { sortOrder: 'asc' } } },
    });
  }

  async create(data: Prisma.DesignPackageCreateInput): Promise<DesignPackage> {
    return this.prisma.designPackage.create({ data });
  }

  async update(
    id: string,
    data: Prisma.DesignPackageUpdateInput,
  ): Promise<DesignPackage> {
    return this.prisma.designPackage.update({ where: { id }, data });
  }

  async softDelete(id: string, deletedBy: string): Promise<DesignPackage> {
    return this.prisma.designPackage.update({
      where: { id },
      data: { deletedAt: new Date(), deletedBy },
    });
  }

  async addItem(
    data: Prisma.DesignPackageItemCreateInput,
  ): Promise<DesignPackageItem> {
    return this.prisma.designPackageItem.create({ data });
  }

  async removeItem(companyId: string, itemId: string): Promise<void> {
    await this.prisma.designPackageItem.deleteMany({
      where: { id: itemId, companyId },
    });
  }

  async createDependency(
    data: Prisma.DesignPackageDependencyCreateInput,
  ): Promise<DesignPackageDependency> {
    return this.prisma.designPackageDependency.create({ data });
  }

  async listDependencies(
    companyId: string,
    designPackageId: string,
  ): Promise<DesignPackageDependency[]> {
    return this.prisma.designPackageDependency.findMany({
      where: { companyId, designPackageId },
      orderBy: { createdAt: 'asc' },
    });
  }

  async deleteDependency(companyId: string, id: string): Promise<void> {
    await this.prisma.designPackageDependency.deleteMany({
      where: { id, companyId },
    });
  }
}

@Injectable()
export class WorkflowEventLogRepository {
  constructor(private readonly prisma: PrismaService) {}

  async append(data: Prisma.WorkflowEventLogCreateInput): Promise<WorkflowEventLog> {
    return this.prisma.workflowEventLog.create({ data });
  }

  async findByEntity(
    companyId: string,
    entityType: WorkflowEventLog['entityType'],
    entityId: string,
    skip: number,
    take: number,
  ): Promise<WorkflowEventLog[]> {
    return this.prisma.workflowEventLog.findMany({
      where: { companyId, entityType, entityId },
      skip,
      take,
      orderBy: { createdAt: 'desc' },
    });
  }

  async countByEntity(
    companyId: string,
    entityType: WorkflowEventLog['entityType'],
    entityId: string,
  ): Promise<number> {
    return this.prisma.workflowEventLog.count({
      where: { companyId, entityType, entityId },
    });
  }
}

@Injectable()
export class TaskDisciplineScopeRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findScoped(
    companyId: string,
    taskDisciplineId: string,
    projectId: string,
  ): Promise<{ id: string; disciplineName: string; taskId: string } | null> {
    const row = await this.prisma.taskDiscipline.findFirst({
      where: activeOnly({
        id: taskDisciplineId,
        companyId,
        task: { projectId, deletedAt: null },
      }),
      select: { id: true, disciplineName: true, taskId: true },
    });
    return row;
  }

  async findDocumentVersion(
    companyId: string,
    documentVersionId: string,
  ): Promise<{ id: string; documentId: string } | null> {
    const row = await this.prisma.documentVersion.findFirst({
      where: {
        id: documentVersionId,
        document: activeOnly({ companyId }),
      },
      select: { id: true, documentId: true },
    });
    return row;
  }
}
