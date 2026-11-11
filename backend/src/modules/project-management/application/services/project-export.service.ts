import { Injectable, NotFoundException } from '@nestjs/common';
import * as ExcelJS from 'exceljs';
import {
  Prisma,
  Project,
  ProjectChangeRequest,
  ProjectStatus,
  Task,
  TaskDiscipline,
  User,
  Department,
} from '@prisma/client';
import { PrismaService } from '../../../../shared/prisma/prisma.service';
import { activeOnly } from '../../../../shared/prisma/soft-delete.util';
import { formatUserDisplayName } from '../../../../shared/utils/user-display.util';
import {
  buildTaskListExportColumns,
  EXPORT_DISCIPLINES,
  PROJECT_LIST_EXPORT_COLUMNS,
  TASK_LIST_SUMMARY_EXPORT_COLUMNS,
} from '../constants/project-export.constants';
import { ProjectExportListQueryDto } from '../dtos/pm.dtos';
import { parseStatusFilter } from '../utils/parse-status-filter.util';
import {
  applyBilingualHeaders,
  finishProjectExportSheet,
  workbookToBuffer,
} from '../utils/project-export-excel.util';
import type { DocumentSheetMeta } from '../../../../shared/utils/excel-document.util';
import {
  formatExportApprovalLevel,
  formatExportCommissionMode,
  formatExportCompletionStatus,
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
import { TaskAccessScopeService } from './task-access-scope.service';
import { PmContext } from '../types/pm-context.type';

type ProjectExportRow = Project & {
  responsiblePerson: Pick<User, 'firstName' | 'lastName' | 'email'> | null;
  department: Pick<Department, 'name' | 'nameZh'> | null;
};

type TaskStandardExportRow = Task & {
  project: Pick<Project, 'name' | 'nameZh' | 'projectCode'>;
};

type TaskExportRow = TaskStandardExportRow & {
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
    private readonly taskAccessScopeService: TaskAccessScopeService,
  ) {}

  /**
   * Generates a bilingual project list workbook scoped to the caller's company.
   */
  async exportProjectList(
    ctx: PmContext,
    query: ProjectExportListQueryDto = {},
  ): Promise<Buffer> {
    const base: Prisma.ProjectWhereInput = activeOnly({
      companyId: ctx.companyId,
    });

    if (query.projectIds?.length) {
      base.id = { in: query.projectIds };
    }
    const statusFilter = parseStatusFilter<ProjectStatus>(query.status);
    if (statusFilter) {
      base.status = statusFilter;
    }
    if (query.projectType) {
      base.projectType = query.projectType;
    }
    if (query.responsibleDepartment) {
      base.responsibleDepartment = query.responsibleDepartment;
    }
    if (query.designProperties) {
      base.designProperties = query.designProperties;
    }
    if (query.designStage) {
      base.designStage = query.designStage;
    }
    if (query.search?.trim()) {
      const term = query.search.trim();
      base.OR = [
        { projectCode: { contains: term, mode: 'insensitive' } },
        { name: { contains: term, mode: 'insensitive' } },
        { nameZh: { contains: term, mode: 'insensitive' } },
      ];
    }

    const where = await this.taskAccessScopeService.buildProjectListWhere(
      ctx,
      base,
    );

    const projects = await this.prisma.project.findMany({
      where,
      include: {
        responsiblePerson: {
          select: { firstName: true, lastName: true, chineseName: true, email: true },
        },
        department: {
          select: { name: true, nameZh: true },
        },
      },
      orderBy: { createdAt: 'asc' },
    });

    return this.buildProjectListWorkbook(
      projects,
      await this.exportMeta(ctx, 'Project List'),
    );
  }

  /**
   * Generates a bilingual project list workbook for a single project.
   */
  async exportProjectListForProject(
    ctx: PmContext,
    projectId: string,
  ): Promise<Buffer> {
    const project = await this.loadProjectExportRow(ctx, projectId);
    return this.buildProjectListWorkbook(
      [project],
      await this.exportMeta(
        ctx,
        `Project - ${formatExportLocalizedName(project.name, project.nameZh)}`,
      ),
    );
  }

  /**
   * Generates a bilingual task list workbook for all tasks in a project.
   */
  async exportTaskList(ctx: PmContext, projectId: string): Promise<Buffer> {
    const taskWhere = await this.taskAccessScopeService.buildTaskListWhere(
      ctx,
      projectId,
    );

    const tasks = await this.prisma.task.findMany({
      where: taskWhere,
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
      await this.exportMeta(ctx, await this.taskListTitle(ctx, projectId, 'Task List')),
    );
  }

  /**
   * Generates a bilingual task list workbook with only the 17 standard
   * task columns (Overseas Task Number through Task Supervising Company
   * Chief Engineer / Department Chief Engineer) - no disciplines or
   * change-request/commercial columns.
   */
  async exportTaskListSummary(
    ctx: PmContext,
    projectId: string,
  ): Promise<Buffer> {
    const taskWhere = await this.taskAccessScopeService.buildTaskListWhere(
      ctx,
      projectId,
    );

    const tasks = await this.prisma.task.findMany({
      where: taskWhere,
      include: {
        project: {
          select: { name: true, nameZh: true, projectCode: true },
        },
      },
      orderBy: { createdAt: 'asc' },
    });

    const userIds = new Set<string>();
    for (const task of tasks) {
      if (task.supervisingChiefUserId) {
        userIds.add(task.supervisingChiefUserId);
      }
      if (task.assignedPersonUserId) {
        userIds.add(task.assignedPersonUserId);
      }
      if (task.dispatcherUserId) {
        userIds.add(task.dispatcherUserId);
      }
    }

    const userNameMap = await loadUserDisplayNameMap(
      this.prisma,
      ctx.companyId,
      [...userIds],
    );

    return this.buildTaskListSummaryWorkbook(
      tasks,
      userNameMap,
      await this.exportMeta(
        ctx,
        await this.taskListTitle(ctx, projectId, 'Task List (Summary)'),
      ),
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
        department: {
          select: { name: true, nameZh: true },
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
    meta: DocumentSheetMeta,
  ): Promise<Buffer> {
    const workbook = new ExcelJS.Workbook();
    workbook.creator = meta.companyName;
    const sheet = workbook.addWorksheet('Project list');
    const layout = applyBilingualHeaders(sheet, PROJECT_LIST_EXPORT_COLUMNS, meta);

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
        formatExportDate(project.startDate),
        formatExportProjectType(project.projectType),
        project.department
          ? formatExportLocalizedName(
              project.department.name,
              project.department.nameZh,
            )
          : formatExportResponsibleDepartment(project.responsibleDepartment),
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

    finishProjectExportSheet(sheet, layout);
    return workbookToBuffer(workbook);
  }

  private buildTaskListWorkbook(
    tasks: TaskExportRow[],
    changeRequests: Pick<
      ProjectChangeRequest,
      'id' | 'sourceEntityId' | 'originEntityId'
    >[],
    userNameMap: Map<string, string>,
    meta: DocumentSheetMeta,
  ): Promise<Buffer> {
    const workbook = new ExcelJS.Workbook();
    workbook.creator = meta.companyName;
    const sheet = workbook.addWorksheet('task list');
    const columns = buildTaskListExportColumns();
    const layout = applyBilingualHeaders(sheet, columns, meta);

    for (const task of tasks) {
      sheet.addRow(this.buildTaskExportRow(task, changeRequests, userNameMap));
    }

    finishProjectExportSheet(sheet, layout);
    return workbookToBuffer(workbook);
  }

  private buildTaskListSummaryWorkbook(
    tasks: TaskStandardExportRow[],
    userNameMap: Map<string, string>,
    meta: DocumentSheetMeta,
  ): Promise<Buffer> {
    const workbook = new ExcelJS.Workbook();
    workbook.creator = meta.companyName;
    const sheet = workbook.addWorksheet('task list (summary)');
    const layout = applyBilingualHeaders(
      sheet,
      TASK_LIST_SUMMARY_EXPORT_COLUMNS,
      meta,
    );

    for (const task of tasks) {
      sheet.addRow(this.buildTaskStandardRow(task, userNameMap));
    }

    finishProjectExportSheet(sheet, layout);
    return workbookToBuffer(workbook);
  }

  /**
   * Company and caller names for the export's document header. A failed
   * lookup falls back to defaults - the header must never block an export.
   */
  private async exportMeta(
    ctx: PmContext,
    title: string,
  ): Promise<DocumentSheetMeta> {
    let companyName = '';
    let preparedBy: string | null = null;
    try {
      const [company, user] = await Promise.all([
        this.prisma.company.findUnique({
          where: { id: ctx.companyId },
          select: { legalName: true },
        }),
        this.prisma.user.findUnique({
          where: { id: ctx.userId },
          select: { firstName: true, lastName: true, email: true },
        }),
      ]);
      companyName = company?.legalName ?? '';
      preparedBy = user ? formatUserDisplayName(user) : null;
    } catch {
      // Defaults below.
    }
    return {
      companyName: companyName || 'CRCC International Consulting',
      title,
      preparedBy,
      generatedAt: new Date(),
    };
  }

  /** `Task List - Marina Tower (滨海大厦)`, or just the label if not found. */
  private async taskListTitle(
    ctx: PmContext,
    projectId: string,
    label: string,
  ): Promise<string> {
    try {
      const project = await this.prisma.project.findFirst({
        where: activeOnly({ id: projectId, companyId: ctx.companyId }),
        select: { name: true, nameZh: true },
      });
      return project
        ? `${label} - ${formatExportLocalizedName(project.name, project.nameZh)}`
        : label;
    } catch {
      return label;
    }
  }

  /** The 17 standard task columns shared by the full and summary exports. */
  private buildTaskStandardRow(
    task: TaskStandardExportRow,
    userNameMap: Map<string, string>,
  ): Array<string | number> {
    const commissionMode = formatExportCommissionMode(task.commissionMode);

    return [
      task.overseasTaskNumber ?? '',
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
      this.resolveUserName(userNameMap, task.supervisingChiefUserId),
    ];
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

    const row = [
      ...this.buildTaskStandardRow(task, userNameMap),
      this.resolveUserName(userNameMap, task.assignedPersonUserId),
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
      if (task.supervisingChiefUserId) {
        userIds.push(task.supervisingChiefUserId);
      }
      if (task.assignedPersonUserId) {
        userIds.push(task.assignedPersonUserId);
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
