import { Injectable } from '@nestjs/common';
import {
  DesignPackage,
  DesignPackageDependency,
  DesignPackageItem,
  DesignPackageStatus,
  EdvStatus,
  EngineeringDocument,
  EngineeringDocumentVersion,
  ExternalReviewTriggerStatus,
  IssueStatus,
  Prisma,
  ProjectChangeRequestStatus,
  RfiStatus,
  WorkflowEventLog,
} from '@prisma/client';
import { PrismaService } from '../../../../shared/prisma/prisma.service';
import { activeOnly } from '../../../../shared/prisma/soft-delete.util';

const edvFileInclude = {
  documentVersion: {
    select: {
      versionNumber: true,
      document: { select: { name: true } },
    },
  },
} as const;

const packageItemInclude = {
  orderBy: { sortOrder: 'asc' as const },
  include: {
    engineeringDocumentVersion: {
      include: {
        ...edvFileInclude,
        engineeringDocument: { select: { id: true, title: true } },
      },
    },
  },
};

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
          include: edvFileInclude,
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
          include: edvFileInclude,
        },
      },
    });
  }

  async create(
    data: Prisma.EngineeringDocumentCreateInput,
  ): Promise<EngineeringDocument> {
    return this.prisma.engineeringDocument.create({ data });
  }

  /**
   * Creates an engineering document with its first EDV marked isCurrent=true.
   */
  async createWithInitialCurrentVersion(
    documentData: Omit<Prisma.EngineeringDocumentCreateInput, 'versions'>,
    versionData: Omit<
      Prisma.EngineeringDocumentVersionCreateWithoutEngineeringDocumentInput,
      'isCurrent'
    >,
  ): Promise<EngineeringDocument & { versions: EngineeringDocumentVersion[] }> {
    return this.prisma.engineeringDocument.create({
      data: {
        ...documentData,
        versions: {
          create: {
            ...versionData,
            isCurrent: true,
          },
        },
      },
      include: { versions: true },
    });
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

  /**
   * Creates a new EDV and marks it current; clears isCurrent on sibling versions.
   */
  async createAsCurrent(
    data: Prisma.EngineeringDocumentVersionCreateInput,
    companyId: string,
    engineeringDocumentId: string,
    updatedBy: string,
  ): Promise<EngineeringDocumentVersion> {
    return this.prisma.$transaction(async (tx) => {
      await tx.engineeringDocumentVersion.updateMany({
        where: activeOnly({ companyId, engineeringDocumentId }),
        data: { isCurrent: false, updatedBy },
      });
      return tx.engineeringDocumentVersion.create({
        data: { ...data, isCurrent: true },
      });
    });
  }

  /**
   * Points package items at the new EDV when older revisions of the same document
   * are superseded by a designer upload.
   */
  async retargetPackageItemsToNewEdv(
    companyId: string,
    previousEdvIds: readonly string[],
    newEdvId: string,
  ): Promise<void> {
    if (previousEdvIds.length === 0) {
      return;
    }
    await this.prisma.designPackageItem.updateMany({
      where: {
        companyId,
        engineeringDocumentVersionId: { in: [...previousEdvIds] },
      },
      data: { engineeringDocumentVersionId: newEdvId },
    });
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
    extraWhere?: Prisma.DesignPackageWhereInput,
  ): Promise<
    (DesignPackage & {
      items: DesignPackageItem[];
      siteRepresentative: {
        firstName: string;
        lastName: string;
        chineseName: string | null;
        email: string | null;
      } | null;
    })[]
  > {
    return this.prisma.designPackage.findMany({
      where: activeOnly({ companyId, taskDisciplineId, ...extraWhere }),
      orderBy: { createdAt: 'desc' },
      include: {
        items: packageItemInclude,
        siteRepresentative: {
          select: {
            firstName: true,
            lastName: true,
            chineseName: true,
            email: true,
          },
        },
      },
    });
  }

  async findById(
    companyId: string,
    id: string,
  ): Promise<
    | (DesignPackage & {
        items: DesignPackageItem[];
        siteRepresentative: {
          firstName: string;
          lastName: string;
          chineseName: string | null;
          email: string | null;
        } | null;
      })
    | null
  > {
    return this.prisma.designPackage.findFirst({
      where: activeOnly({ id, companyId }),
      include: {
        items: packageItemInclude,
        siteRepresentative: {
          select: {
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
   * Loads a design package with discipline and EDV details for closure validation.
   */
  async findForClose(
    companyId: string,
    id: string,
  ): Promise<
    | (DesignPackage & {
        taskDiscipline: {
          id: string;
          disciplineLeadUserId: string | null;
          taskId: string;
        };
        items: Array<
          DesignPackageItem & {
            engineeringDocumentVersion: {
              id: string;
              status: EdvStatus;
              engineeringDocument: { title: string };
            };
          }
        >;
      })
    | null
  > {
    return this.prisma.designPackage.findFirst({
      where: activeOnly({ id, companyId }),
      include: {
        taskDiscipline: {
          select: {
            id: true,
            disciplineLeadUserId: true,
            taskId: true,
          },
        },
        items: {
          orderBy: { sortOrder: 'asc' },
          include: {
            engineeringDocumentVersion: {
              select: {
                id: true,
                status: true,
                engineeringDocument: { select: { title: true } },
              },
            },
          },
        },
      },
    });
  }

  /**
   * Counts PENDING external review triggers linked to a design package.
   */
  async countPendingRevisionTriggersForPackage(
    companyId: string,
    designPackageId: string,
  ): Promise<number> {
    const submittalItems = await this.prisma.submittalItem.findMany({
      where: { companyId, designPackageId },
      select: { id: true },
    });
    const itemIds = submittalItems.map((item) => item.id);

    return this.prisma.externalReviewTrigger.count({
      where: {
        companyId,
        status: ExternalReviewTriggerStatus.PENDING,
        OR: [
          { linkedDesignPackageId: designPackageId },
          {
            sourceEntityType: 'DesignPackage',
            sourceEntityId: designPackageId,
          },
          ...(itemIds.length > 0
            ? [{ submittalItemIds: { hasSome: itemIds } }]
            : []),
        ],
      },
    });
  }

  /**
   * Counts open source entities linked to a design package via sourceEntity fields.
   */
  async countOpenLinkedEntitiesForPackage(
    companyId: string,
    sourceEntityType: string | null,
    sourceEntityId: string | null,
  ): Promise<{
    openRfis: number;
    openIssues: number;
    openChangeRequests: number;
  }> {
    const counts = { openRfis: 0, openIssues: 0, openChangeRequests: 0 };
    if (!sourceEntityType || !sourceEntityId) {
      return counts;
    }

    if (sourceEntityType === 'RFI') {
      const rfi = await this.prisma.rfi.findFirst({
        where: activeOnly({ id: sourceEntityId, companyId }),
        select: { status: true },
      });
      if (rfi && rfi.status !== RfiStatus.CLOSED) {
        counts.openRfis = 1;
      }
      return counts;
    }

    if (sourceEntityType === 'ISSUE') {
      const issue = await this.prisma.issue.findFirst({
        where: activeOnly({ id: sourceEntityId, companyId }),
        select: { status: true },
      });
      if (issue && issue.status !== IssueStatus.CLOSED) {
        counts.openIssues = 1;
      }
      return counts;
    }

    if (sourceEntityType === 'CHANGE_REQUEST') {
      const changeRequest = await this.prisma.projectChangeRequest.findFirst({
        where: activeOnly({ id: sourceEntityId, companyId }),
        select: { status: true },
      });
      if (
        changeRequest &&
        changeRequest.status !== ProjectChangeRequestStatus.CLOSED
      ) {
        counts.openChangeRequests = 1;
      }
    }

    return counts;
  }

  /**
   * Marks a design package as closed.
   */
  async closePackage(
    id: string,
    closedBy: string,
    actualWorkDays: number | null,
  ): Promise<DesignPackage> {
    return this.prisma.designPackage.update({
      where: { id },
      data: {
        packageStatus: DesignPackageStatus.CLOSED,
        packageClosedAt: new Date(),
        packageClosedBy: closedBy,
        updatedBy: closedBy,
        actualWorkDays: actualWorkDays ?? undefined,
      },
    });
  }

  /**
   * Reopens a closed design package for unlock / further work.
   */
  async reopenPackage(id: string, reopenedBy: string): Promise<DesignPackage> {
    return this.prisma.designPackage.update({
      where: { id },
      data: {
        packageStatus: DesignPackageStatus.OPEN,
        packageClosedAt: null,
        packageClosedBy: null,
        updatedBy: reopenedBy,
      },
    });
  }

  /**
   * Creates an empty revision design package from an external review trigger.
   */
  async createRevisionPackageFromTrigger(input: {
    companyId: string;
    taskDisciplineId: string;
    packageCode: string;
    name: string;
    sourceEntityType: string;
    sourceEntityId: string;
    createdBy: string;
  }): Promise<DesignPackage> {
    return this.prisma.designPackage.create({
      data: {
        company: { connect: { id: input.companyId } },
        taskDiscipline: { connect: { id: input.taskDisciplineId } },
        packageCode: input.packageCode,
        name: input.name,
        sourceEntityType: input.sourceEntityType,
        sourceEntityId: input.sourceEntityId,
        packageStatus: DesignPackageStatus.OPEN,
        requiredTiers: [],
        createdBy: input.createdBy,
        updatedBy: input.createdBy,
      },
    });
  }

  async create(data: Prisma.DesignPackageCreateInput): Promise<DesignPackage> {
    return this.prisma.designPackage.create({ data });
  }

  /**
   * Creates a design package and optional brief attachments in one transaction.
   */
  async createWithBriefAttachments(input: {
    packageData: Prisma.DesignPackageCreateInput;
    briefAttachments?: Array<{
      companyId: string;
      documentId: string;
      attachedBy: string;
    }>;
  }): Promise<DesignPackage> {
    return this.prisma.$transaction(async (tx) => {
      const pkg = await tx.designPackage.create({ data: input.packageData });
      if (input.briefAttachments && input.briefAttachments.length > 0) {
        await tx.designPackageAttachment.createMany({
          data: input.briefAttachments.map((attachment) => ({
            companyId: attachment.companyId,
            designPackageId: pkg.id,
            documentId: attachment.documentId,
            attachedBy: attachment.attachedBy,
            purpose: 'BRIEF',
          })),
        });
      }
      return pkg;
    });
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
  ): Promise<
    Array<
      DesignPackageDependency & {
        dependsOnPackage: { name: string };
      }
    >
  > {
    return this.prisma.designPackageDependency.findMany({
      where: { companyId, designPackageId },
      include: {
        dependsOnPackage: { select: { name: true } },
      },
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

export type DesignPackageSourceEntityType =
  | 'TASK'
  | 'RFI'
  | 'ISSUE'
  | 'CHANGE_REQUEST';

export interface TaskDisciplineReviewRoles {
  id: string;
  disciplineName: string;
  taskId: string;
  designerUserId: string | null;
  supportingDesignerUserId: string | null;
  ownerUserId: string | null;
  reviewerUserId: string | null;
  disciplineLeadUserId: string | null;
  chiefUserId: string | null;
  instituteChiefUserId: string | null;
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

  /**
   * Loads discipline review-role FKs scoped to a project.
   */
  async findWithReviewRoles(
    companyId: string,
    taskDisciplineId: string,
    projectId: string,
  ): Promise<TaskDisciplineReviewRoles | null> {
    return this.prisma.taskDiscipline.findFirst({
      where: activeOnly({
        id: taskDisciplineId,
        companyId,
        task: { projectId, deletedAt: null },
      }),
      select: {
        id: true,
        disciplineName: true,
        taskId: true,
        designerUserId: true,
        supportingDesignerUserId: true,
        ownerUserId: true,
        reviewerUserId: true,
        disciplineLeadUserId: true,
        chiefUserId: true,
        instituteChiefUserId: true,
      },
    });
  }

  /**
   * True when the user is designer or supporting designer on any active
   * design package (subtask) under the discipline.
   */
  async hasPackageDesignerAssignment(
    companyId: string,
    taskDisciplineId: string,
    userId: string,
  ): Promise<boolean> {
    const row = await this.prisma.designPackage.findFirst({
      where: activeOnly({
        companyId,
        taskDisciplineId,
        OR: [{ designerUserId: userId }, { supportingDesignerUserId: userId }],
      }),
      select: { id: true },
    });
    return row !== null;
  }

  /**
   * Verifies a source entity exists within the given project and company.
   */
  async findSourceEntityInProject(
    companyId: string,
    projectId: string,
    sourceEntityType: DesignPackageSourceEntityType,
    sourceEntityId: string,
  ): Promise<boolean> {
    switch (sourceEntityType) {
      case 'TASK': {
        const row = await this.prisma.task.findFirst({
          where: activeOnly({
            id: sourceEntityId,
            projectId,
            project: { companyId, deletedAt: null },
          }),
          select: { id: true },
        });
        return row !== null;
      }
      case 'RFI': {
        const row = await this.prisma.rfi.findFirst({
          where: activeOnly({
            id: sourceEntityId,
            projectId,
            project: { companyId, deletedAt: null },
          }),
          select: { id: true },
        });
        return row !== null;
      }
      case 'ISSUE': {
        const row = await this.prisma.issue.findFirst({
          where: activeOnly({
            id: sourceEntityId,
            projectId,
            project: { companyId, deletedAt: null },
          }),
          select: { id: true },
        });
        return row !== null;
      }
      case 'CHANGE_REQUEST': {
        const row = await this.prisma.projectChangeRequest.findFirst({
          where: activeOnly({
            id: sourceEntityId,
            projectId,
            companyId,
          }),
          select: { id: true },
        });
        return row !== null;
      }
      default:
        return false;
    }
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
