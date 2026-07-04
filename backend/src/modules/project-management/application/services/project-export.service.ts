import { Injectable, NotFoundException } from '@nestjs/common';
import * as ExcelJS from 'exceljs';
import {
  Prisma,
  Project,
  ProjectChangeRequest,
  Task,
  TaskDiscipline,
  User,
} from '@prisma/client';
import { PrismaService } from '../../../../shared/prisma/prisma.service';
import { activeOnly } from '../../../../shared/prisma/soft-delete.util';
import { formatUserDisplayName } from '../../../../shared/utils/user-display.util';
import {
  buildTaskListExportColumns,
  EXPORT_DISCIPLINES,
  PROJECT_LIST_EXPORT_COLUMNS,
} from '../constants/project-export.constants';
import { ProjectExportListQueryDto } from '../dtos/pm.dtos';
import {
  applyBilingualHeaders,
  workbookToBuffer,
} from '../utils/project-export-excel.util';
import {
  formatExportApprovalLevel,
  formatExportCompletionStatus,
  formatExportContractType,
  formatExportDesignProperties,
  formatExportDesignStage,
  formatExportDate,
  formatExportDateTime,
  formatExportLanguage,
  formatExportLocalizedName,
  formatExportNumber,
  formatExportProjectStatus,
  formatExportProjectType,
  formatExportResponsibleDepartment,
  formatExportUrgency,
  formatExportYesNo,
  normalizeDisciplineName,
} from '../utils/project-export-format.util';
import { loadUserDisplayNameMap } from '../utils/pm-user-names.util';
import { ProjectScopeService } from './project-scope.service';
import { PmContext } from '../types/pm-context.type';

type ProjectExportRow = Project & {
  responsiblePerson: Pick<User, 'firstName' | 'lastName' | 'email'> | null;
};

type TaskExportRow = Task & {
  project: Pick<
    Project,
    'name' | 'nameZh' | 'projectCode' | 'contractType'
  >;
  disciplines: TaskDiscipline[];
};

@Injectable()
export class ProjectExportService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly projectScopeService: ProjectScopeService,
  ) {}

  /**
   * Generates a bilingual project list workbook scoped to the caller's company.
   */
  async exportProjectList(
    ctx: PmContext,
    query: ProjectExportListQueryDto = {},
  ): Promise<Buffer> {
    const where: Prisma.ProjectWhereInput = activeOnly({
      companyId: ctx.companyId,
    });

    if (query.projectIds?.length) {
      where.id = { in: query.projectIds };
    }
    if (query.status) {
      where.status = query.status;
    }
    if (query.projectType) {
      where.projectType = query.projectType;
    }
    if (query.responsibleDepartment) {
      where.responsibleDepartment = query.responsibleDepartment;
    }
    if (query.designProperties) {
      where.designProperties = query.designProperties;
    }
    if (query.designStage) {
      where.designStage = query.designStage;
    }
    if (query.search?.trim()) {
      const term = query.search.trim();
      where.OR = [
        { projectCode: { contains: term, mode: 'insensitive' } },
        { name: { contains: term, mode: 'insensitive' } },
        { nameZh: { contains: term, mode: 'insensitive' } },
      ];
    }

    const projects = await this.prisma.project.findMany({
      where,
      include: {
        responsiblePerson: {
          select: { firstName: true, lastName: true, chineseName: true, email: true },
        },
      },
      orderBy: { createdAt: 'asc' },
    });

    return this.buildProjectListWorkbook(projects);
  }

  /**
   * Generates a bilingual project list workbook for a single project.
   */
  async exportProjectListForProject(
    ctx: PmContext,
    projectId: string,
  ): Promise<Buffer> {
    const project = await this.loadProjectExportRow(ctx, projectId);
    return this.buildProjectListWorkbook([project]);
  }

  /**
   * Generates a bilingual task list workbook for all tasks in a project.
   */
  async exportTaskList(ctx: PmContext, projectId: string): Promise<Buffer> {
    await this.projectScopeService.getProjectOrThrow(ctx, projectId);

    const tasks = await this.prisma.task.findMany({
      where: activeOnly({ projectId }),
      include: {
        project: {
          select: {
            name: true,
            nameZh: true,
            projectCode: true,
            contractType: true,
          },
        },
        disciplines: {
          where: activeOnly({ companyId: ctx.companyId }),
        },
      },
      orderBy: { createdAt: 'asc' },
    });

    const changeRequests = await this.prisma.projectChangeRequest.findMany({
      where: activeOnly({ companyId: ctx.companyId, projectId }),
      select: {
        id: true,
        sourceEntityId: true,
        originEntityId: true,
      },
    });

    const userNameMap = await this.loadTaskExportUserNameMap(ctx.companyId, tasks);

    return this.buildTaskListWorkbook(
      tasks,
      changeRequests,
      userNameMap,
    );
  }

  private async loadProjectExportRow(
    ctx: PmContext,
    projectId: string,
  ): Promise<ProjectExportRow> {
    const project = await this.prisma.project.findFirst({
      where: activeOnly({ id: projectId, companyId: ctx.companyId }),
      include: {
        responsiblePerson: {
          select: { firstName: true, lastName: true, chineseName: true, email: true },
        },
      },
    });

    if (!project) {
      throw new NotFoundException('Project not found');
    }

    return project;
  }

  private buildProjectListWorkbook(
    projects: ProjectExportRow[],
  ): Promise<Buffer> {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Project list');
    applyBilingualHeaders(sheet, PROJECT_LIST_EXPORT_COLUMNS);

    projects.forEach((project, index) => {
      const onSitePerson =
        project.responsiblePerson != null
          ? formatUserDisplayName(project.responsiblePerson)
          : '';

      sheet.addRow([
        index + 1,
        formatExportLocalizedName(project.name, project.nameZh),
        project.projectCode,
        formatExportProjectStatus(project.status),
        project.client ?? '',
        formatExportContractType(project.contractType),
        formatExportDate(project.startDate),
        formatExportProjectType(project.projectType),
        formatExportResponsibleDepartment(project.responsibleDepartment),
        formatExportDesignProperties(project.designProperties),
        formatExportDesignStage(project.designStage),
        '',
        onSitePerson,
        formatExportNumber(project.railwayLengthKm),
        formatExportNumber(project.urbanRailLengthKm),
        formatExportNumber(project.roadLengthKm),
        formatExportNumber(project.grossFloorAreaM2),
        formatExportNumber(project.budget),
        '',
        project.description ?? '',
      ]);
    });

    return workbookToBuffer(workbook);
  }

  private buildTaskListWorkbook(
    tasks: TaskExportRow[],
    changeRequests: Pick<
      ProjectChangeRequest,
      'id' | 'sourceEntityId' | 'originEntityId'
    >[],
    userNameMap: Map<string, string>,
  ): Promise<Buffer> {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('task list');
    const columns = buildTaskListExportColumns();
    applyBilingualHeaders(sheet, columns);

    for (const task of tasks) {
      sheet.addRow(this.buildTaskExportRow(task, changeRequests, userNameMap));
    }

    return workbookToBuffer(workbook);
  }

  private buildTaskExportRow(
    task: TaskExportRow,
    changeRequests: Pick<
      ProjectChangeRequest,
      'id' | 'sourceEntityId' | 'originEntityId'
    >[],
    userNameMap: Map<string, string>,
  ): Array<string | number> {
    const disciplineIds = new Set(task.disciplines.map((item) => item.id));
    const hasLinkedChange = changeRequests.some(
      (change) =>
        (change.sourceEntityId != null &&
          disciplineIds.has(change.sourceEntityId)) ||
        (change.originEntityId != null &&
          disciplineIds.has(change.originEntityId)),
    );

    const commissionMode = formatExportContractType(task.project.contractType);

    const row: Array<string | number> = [
      task.taskIdCode,
      formatExportLocalizedName(task.project.name, task.project.nameZh),
      task.project.projectCode,
      task.description ?? '',
      formatExportYesNo(task.requiresArchiving),
      commissionMode,
      task.taskAttributes ?? '',
      formatExportDateTime(task.onSiteReceivingTime),
      formatExportDateTime(task.assignmentToHqTime),
      formatExportDate(task.finishDate),
      task.contactFormNumber ?? '',
      task.designStage != null ? formatExportDesignStage(task.designStage) : '',
      formatExportUrgency(task.urgencyLevel),
      formatExportYesNo(task.hasCustomSchedule),
      formatExportLanguage(task.language),
      formatExportApprovalLevel(task.approvalLevel),
      '',
      '',
      this.resolveUserName(userNameMap, task.dispatcherUserId),
    ];

    for (const disciplineDef of EXPORT_DISCIPLINES) {
      const discipline = this.findMatchingDiscipline(
        task.disciplines,
        disciplineDef.aliases,
      );
      row.push(
        this.resolveDisciplineUserName(discipline, userNameMap, 'designerUserId'),
        this.resolveDisciplineUserName(discipline, userNameMap, 'reviewerUserId'),
        this.resolveDisciplineUserName(
          discipline,
          userNameMap,
          'disciplineLeadUserId',
        ),
        this.resolveDisciplineUserName(discipline, userNameMap, 'chiefUserId'),
        this.resolveDisciplineUserName(
          discipline,
          userNameMap,
          'instituteChiefUserId',
        ),
      );
    }

    row.push(
      formatExportDateTime(task.actualCompletionTime),
      formatExportCompletionStatus(task.completionStatus),
      task.remark ?? '',
      task.durationDays ?? '',
      '',
      '',
      hasLinkedChange ? 'Yes' : 'No',
      '',
      '',
      '',
      '',
      '',
      formatExportDateTime(task.actualCompletionTime),
    );

    return row;
  }

  private findMatchingDiscipline(
    disciplines: TaskDiscipline[],
    aliases: string[],
  ): TaskDiscipline | undefined {
    const normalizedAliases = new Set(
      aliases.map((alias) => normalizeDisciplineName(alias)),
    );

    return disciplines.find((discipline) => {
      const normalizedName = normalizeDisciplineName(discipline.disciplineName);
      return normalizedAliases.has(normalizedName);
    });
  }

  private resolveDisciplineUserName(
    discipline: TaskDiscipline | undefined,
    userNameMap: Map<string, string>,
    field:
      | 'designerUserId'
      | 'reviewerUserId'
      | 'disciplineLeadUserId'
      | 'chiefUserId'
      | 'instituteChiefUserId',
  ): string {
    if (!discipline) {
      return '';
    }

    const userId = discipline[field];
    if (userId) {
      return this.resolveUserName(userNameMap, userId);
    }

    const legacyNameFieldMap: Record<typeof field, keyof TaskDiscipline> = {
      designerUserId: 'designerName',
      reviewerUserId: 'reviewerName',
      disciplineLeadUserId: 'disciplinaryLeader',
      chiefUserId: 'deptChiefEngineer',
      instituteChiefUserId: 'disciplineOwnerName',
    };

    const legacyValue = discipline[legacyNameFieldMap[field]];
    return typeof legacyValue === 'string' ? legacyValue : '';
  }

  private resolveUserName(
    userNameMap: Map<string, string>,
    userId: string | null | undefined,
  ): string {
    if (!userId) {
      return '';
    }
    return userNameMap.get(userId) ?? '';
  }

  private async loadTaskExportUserNameMap(
    companyId: string,
    tasks: TaskExportRow[],
  ): Promise<Map<string, string>> {
    const userIds: string[] = [];

    for (const task of tasks) {
      if (task.dispatcherUserId) {
        userIds.push(task.dispatcherUserId);
      }
      for (const discipline of task.disciplines) {
        for (const field of [
          discipline.designerUserId,
          discipline.reviewerUserId,
          discipline.disciplineLeadUserId,
          discipline.chiefUserId,
          discipline.instituteChiefUserId,
        ]) {
          if (field) {
            userIds.push(field);
          }
        }
      }
    }

    return loadUserDisplayNameMap(this.prisma, companyId, userIds);
  }
}
