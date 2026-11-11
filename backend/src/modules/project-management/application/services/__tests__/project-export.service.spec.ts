import { NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import * as ExcelJS from 'exceljs';
import { PrismaService } from '../../../../../shared/prisma/prisma.service';
import { ProjectExportService } from '../project-export.service';
import { TaskAccessScopeService } from '../task-access-scope.service';

describe('ProjectExportService', () => {
  const ctx = { companyId: 'company-1', userId: 'user-1' };
  const projectId = 'project-1';

  let prisma: {
    project: { findMany: jest.Mock; findFirst: jest.Mock };
    task: { findMany: jest.Mock };
    projectChangeRequest: { findMany: jest.Mock };
    user: { findMany: jest.Mock };
  };
  let taskAccessScopeService: {
    buildProjectListWhere: jest.Mock;
    buildTaskListWhere: jest.Mock;
  };
  let service: ProjectExportService;

  beforeEach(async () => {
    prisma = {
      project: {
        findMany: jest.fn(),
        findFirst: jest.fn(),
      },
      task: {
        findMany: jest.fn(),
      },
      projectChangeRequest: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      user: {
        findMany: jest.fn().mockResolvedValue([]),
      },
    };

    taskAccessScopeService = {
      buildProjectListWhere: jest.fn((_ctx, base) => Promise.resolve(base)),
      buildTaskListWhere: jest.fn().mockResolvedValue({ projectId }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ProjectExportService,
        { provide: PrismaService, useValue: prisma },
        { provide: TaskAccessScopeService, useValue: taskAccessScopeService },
      ],
    }).compile();

    service = module.get(ProjectExportService);
  });

  async function readWorksheet(
    buffer: Buffer,
    sheetName: string,
  ): Promise<ExcelJS.Worksheet> {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer as never);
    const sheet = workbook.getWorksheet(sheetName);
    if (!sheet) {
      throw new Error(`Worksheet ${sheetName} not found`);
    }
    return sheet;
  }

  it('exports project list with type-specific fields populated', async () => {
    prisma.project.findMany.mockResolvedValue([
      {
        id: projectId,
        companyId: ctx.companyId,
        projectCode: 'PRJ-001',
        name: 'Rail corridor',
        nameZh: null,
        client: 'Client A',
        contractType: 'EMAIL',
        startDate: new Date('2026-01-15'),
        projectType: 'RAILWAY',
        designProperties: 'IMPLEMENTATION_DB',
        designStage: 'DETAILED_DESIGN_DD',
        status: 'IN_PROGRESS',
        railwayLengthKm: 120.5,
        urbanRailLengthKm: null,
        roadLengthKm: null,
        grossFloorAreaM2: null,
        budget: { toString: () => '5000000' },
        description: 'Main note',
        responsibleDepartment: 'MUNICIPAL_TRANSPORTATION_DEPARTMENT',
        department: {
          name: 'Municipal Transportation Department',
          nameZh: '市政交通部',
        },
        responsiblePerson: {
          firstName: 'Alex',
          lastName: 'Lead',
          email: 'alex@example.com',
        },
      },
    ]);

    const buffer = await service.exportProjectList(ctx);
    const sheet = await readWorksheet(buffer, 'Project list');
    const dataRow = sheet.getRow(7);

    expect(sheet.getRow(5).getCell(4).value).toBe('项目状态');
    expect(sheet.getRow(6).getCell(4).value).toBe('Project Status');
    expect(dataRow.getCell(4).value).toBe('In Progress');
    expect(dataRow.getCell(6).value).toBe('Email');
    expect(dataRow.getCell(9).value).toBe(
      'Municipal Transportation Department (市政交通部)',
    );
    expect(dataRow.getCell(10).value).toBe('Implementation（DB）');
    expect(dataRow.getCell(11).value).toBe('Detailed Design (DD)');
    expect(sheet.getRow(5).getCell(14).value).toBe('铁路长度(km)');
    expect(sheet.getRow(6).getCell(14).value).toBe('Length of Railway (km)');
    expect(dataRow.getCell(14).value).toBe(120.5);
    expect(dataRow.getCell(15).value).toBe('');
    expect(dataRow.getCell(16).value).toBe('');
    expect(dataRow.getCell(17).value).toBe('');
    expect(dataRow.getCell(18).value).toBe(5000000);
    expect(dataRow.getCell(19).value).toBe('');
  });

  it('exports project list with bilingual project name format', async () => {
    prisma.project.findMany.mockResolvedValue([
      {
        id: projectId,
        companyId: ctx.companyId,
        projectCode: 'PRJ-002',
        name: 'Marina Tower',
        nameZh: '滨海大厦',
        client: null,
        contractType: 'NO_ASSIGNMENT',
        status: 'NOT_STARTED',
        startDate: null,
        projectType: 'BUILDING',
        designProperties: 'PRELIMINARY',
        designStage: 'TENDER',
        railwayLengthKm: null,
        urbanRailLengthKm: null,
        roadLengthKm: null,
        grossFloorAreaM2: 85000,
        budget: null,
        description: null,
        responsibleDepartment: 'ARCHITECTURAL_DESIGN_DEPARTMENT',
        responsiblePerson: null,
      },
    ]);

    const buffer = await service.exportProjectList(ctx);
    const sheet = await readWorksheet(buffer, 'Project list');
    expect(sheet.getRow(7).getCell(2).value).toBe('Marina Tower (滨海大厦)');
  });

  it('exports task list with populated discipline blocks for matching disciplines', async () => {
    prisma.task.findMany.mockResolvedValue([
      {
        id: 'task-1',
        projectId,
        taskIdCode: 'TASK-001',
        description: 'Highway design package',
        requiresArchiving: true,
        taskAttributes: 'Urgent delivery',
        onSiteReceivingTime: new Date('2026-02-01T08:00:00.000Z'),
        assignmentToHqTime: new Date('2026-02-02T09:00:00.000Z'),
        finishDate: new Date('2026-06-30'),
        contactFormNumber: 'CF-001',
        designStage: 'DETAILED_DESIGN_DD',
        urgencyLevel: 'URGENT',
        hasCustomSchedule: true,
        language: 'CHINESE',
        approvalLevel: 'DESIGN_INSTITUTE_REVIEW',
        supervisingChiefUserId: 'user-supervising',
        assignedPersonUserId: 'user-assigned',
        dispatcherUserId: 'user-dispatcher',
        overseasTaskNumber: 'OS-2026-001',
        commissionMode: 'EMAIL',
        actualCompletionTime: null,
        completionStatus: null,
        remark: null,
        durationDays: 45,
        project: {
          name: 'Highway project',
          nameZh: null,
          projectCode: 'PRJ-HWY',
          contractType: 'CONTRACT',
        },
        disciplines: [
          {
            id: 'disc-1',
            disciplineName: 'Highway',
            designerUserId: 'user-designer',
            reviewerUserId: 'user-reviewer',
            disciplineLeadUserId: 'user-lead',
            chiefUserId: 'user-chief',
            instituteChiefUserId: 'user-institute',
            designerName: null,
            reviewerName: null,
            disciplinaryLeader: null,
            deptChiefEngineer: null,
            disciplineOwnerName: null,
          },
          {
            id: 'disc-2',
            disciplineName: 'Survey',
            designerUserId: 'user-survey',
            reviewerUserId: null,
            disciplineLeadUserId: null,
            chiefUserId: null,
            instituteChiefUserId: null,
            designerName: null,
            reviewerName: null,
            disciplinaryLeader: null,
            deptChiefEngineer: null,
            disciplineOwnerName: null,
          },
          {
            id: 'disc-3',
            disciplineName: 'Architecture',
            designerUserId: 'user-arch',
            reviewerUserId: null,
            disciplineLeadUserId: null,
            chiefUserId: null,
            instituteChiefUserId: null,
            designerName: null,
            reviewerName: null,
            disciplinaryLeader: null,
            deptChiefEngineer: null,
            disciplineOwnerName: null,
          },
        ],
      },
    ]);

    prisma.user.findMany.mockResolvedValue([
      {
        id: 'user-dispatcher',
        firstName: 'Disp',
        lastName: 'Atcher',
        email: 'd@example.com',
      },
      {
        id: 'user-supervising',
        firstName: 'Super',
        lastName: 'Chief',
        email: 'super@example.com',
      },
      {
        id: 'user-chief',
        firstName: 'C',
        lastName: 'Chief',
        email: 'c@example.com',
      },
      {
        id: 'user-assigned',
        firstName: 'On',
        lastName: 'Site',
        email: 'site@example.com',
      },
      {
        id: 'user-designer',
        firstName: 'D',
        lastName: 'Designer',
        email: 'd@example.com',
      },
      {
        id: 'user-reviewer',
        firstName: 'R',
        lastName: 'Reviewer',
        email: 'r@example.com',
      },
      {
        id: 'user-lead',
        firstName: 'L',
        lastName: 'Lead',
        email: 'l@example.com',
      },
      {
        id: 'user-institute',
        firstName: 'I',
        lastName: 'Chief',
        email: 'i@example.com',
      },
      {
        id: 'user-survey',
        firstName: 'S',
        lastName: 'Survey',
        email: 's@example.com',
      },
      {
        id: 'user-arch',
        firstName: 'A',
        lastName: 'Arch',
        email: 'a@example.com',
      },
    ]);

    const buffer = await service.exportTaskList(ctx, projectId);
    const sheet = await readWorksheet(buffer, 'task list');
    const dataRow = sheet.getRow(7);

    expect(taskAccessScopeService.buildTaskListWhere).toHaveBeenCalledWith(
      ctx,
      projectId,
    );
    expect(dataRow.getCell(1).value).toBe('OS-2026-001');
    expect(dataRow.getCell(5).value).toBe('Yes');
    expect(dataRow.getCell(16).value).toBe('Design Institute Review (院审)');
    expect(dataRow.getCell(17).value).toBe('Super Chief');
    expect(dataRow.getCell(18).value).toBe('On Site');
    expect(dataRow.getCell(19).value).toBe('Disp Atcher');
    expect(dataRow.getCell(20).value).toBe('D Designer');
    expect(dataRow.getCell(21).value).toBe('R Reviewer');

    const surveyDesignerColumn = 19 + 5 * 5 + 1;
    expect(dataRow.getCell(surveyDesignerColumn).value).toBe('S Survey');

    const hydrologyDesignerColumn = 19 + 5 * 1 + 1;
    expect(dataRow.getCell(hydrologyDesignerColumn).value).toBe('');
  });

  it('exports task list with blank discipline blocks when none are configured', async () => {
    prisma.task.findMany.mockResolvedValue([
      {
        id: 'task-2',
        projectId,
        taskIdCode: 'TASK-002',
        description: 'General coordination',
        requiresArchiving: false,
        taskAttributes: null,
        onSiteReceivingTime: null,
        assignmentToHqTime: null,
        finishDate: null,
        contactFormNumber: null,
        designStage: 'TENDER',
        urgencyLevel: 'NORMAL',
        hasCustomSchedule: false,
        language: 'ENGLISH',
        overseasTaskNumber: 'TASK-002',
        commissionMode: 'NO_ASSIGNMENT',
        approvalLevel: null,
        supervisingChiefUserId: null,
        assignedPersonUserId: null,
        dispatcherUserId: null,
        actualCompletionTime: null,
        completionStatus: null,
        remark: 'Note',
        durationDays: null,
        project: {
          name: 'Office',
          nameZh: null,
          projectCode: 'PRJ-OFF',
          contractType: 'NO_ASSIGNMENT',
        status: 'NOT_STARTED',
          commissioningMethod: null,
        },
        disciplines: [],
      },
    ]);

    const buffer = await service.exportTaskList(ctx, projectId);
    const sheet = await readWorksheet(buffer, 'task list');
    const dataRow = sheet.getRow(7);

    expect(dataRow.getCell(1).value).toBe('TASK-002');
    expect(dataRow.getCell(4).value).toBe('General coordination');
    expect(dataRow.getCell(20).value).toBe('');
    expect(dataRow.getCell(87).value).toBe('Note');
  });

  it('rejects export for projects outside the caller company', async () => {
    prisma.project.findFirst.mockResolvedValue(null);

    await expect(
      service.exportProjectListForProject(ctx, 'other-company-project'),
    ).rejects.toThrow(NotFoundException);
  });
});
