import { NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import * as ExcelJS from 'exceljs';
import { PrismaService } from '../../../../../shared/prisma/prisma.service';
import { ProjectExportService } from '../project-export.service';
import { ProjectScopeService } from '../project-scope.service';

describe('ProjectExportService', () => {
  const ctx = { companyId: 'company-1', userId: 'user-1' };
  const projectId = 'project-1';

  let prisma: {
    project: { findMany: jest.Mock; findFirst: jest.Mock };
    task: { findMany: jest.Mock };
    projectChangeRequest: { findMany: jest.Mock };
    user: { findMany: jest.Mock };
  };
  let projectScopeService: { getProjectOrThrow: jest.Mock };
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

    projectScopeService = {
      getProjectOrThrow: jest.fn().mockResolvedValue({ id: projectId }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ProjectExportService,
        { provide: PrismaService, useValue: prisma },
        { provide: ProjectScopeService, useValue: projectScopeService },
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
        contractType: 'Email commission',
        commissioningMethod: null,
        startDate: new Date('2026-01-15'),
        projectType: 'RAILWAY',
        designProperties: 'Design-build',
        designStage: 'DETAILED_DESIGN',
        railwayLengthKm: 120.5,
        urbanRailLengthKm: null,
        roadLengthKm: null,
        grossFloorAreaM2: null,
        budget: { toString: () => '5000000' },
        description: 'Main note',
        responsibleDepartment: { name: 'Transport Dept' },
        projectManager: {
          firstName: 'Alex',
          lastName: 'PM',
          email: 'alex@example.com',
        },
        responsiblePerson: null,
      },
    ]);

    const buffer = await service.exportProjectList(ctx);
    const sheet = await readWorksheet(buffer, 'Project list');
    const dataRow = sheet.getRow(3);

    expect(sheet.getRow(1).getCell(13).value).toBe('铁路长度(km)');
    expect(sheet.getRow(2).getCell(13).value).toBe('Length of Railway (km)');
    expect(dataRow.getCell(13).value).toBe(120.5);
    expect(dataRow.getCell(14).value).toBe('');
    expect(dataRow.getCell(15).value).toBe('');
    expect(dataRow.getCell(16).value).toBe('');
    expect(dataRow.getCell(17).value).toBe(5000000);
    expect(dataRow.getCell(18).value).toBe('');
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
        contractType: null,
        commissioningMethod: null,
        startDate: null,
        projectType: 'BUILDING',
        designProperties: null,
        designStage: null,
        railwayLengthKm: null,
        urbanRailLengthKm: null,
        roadLengthKm: null,
        grossFloorAreaM2: 85000,
        budget: null,
        description: null,
        responsibleDepartment: null,
        projectManager: null,
        responsiblePerson: null,
      },
    ]);

    const buffer = await service.exportProjectList(ctx);
    const sheet = await readWorksheet(buffer, 'Project list');
    expect(sheet.getRow(3).getCell(2).value).toBe('Marina Tower (滨海大厦)');
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
        designStage: 'DETAILED_DESIGN',
        urgencyLevel: 'URGENT',
        hasCustomSchedule: true,
        language: 'CHINESE',
        approvalLevel: 'DEPARTMENT',
        dispatcherUserId: 'user-dispatcher',
        actualCompletionTime: null,
        completionStatus: null,
        remark: null,
        durationDays: 45,
        project: {
          name: 'Highway project',
          nameZh: null,
          projectCode: 'PRJ-HWY',
          contractType: 'Lump sum',
          commissioningMethod: null,
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
        id: 'user-chief',
        firstName: 'C',
        lastName: 'Chief',
        email: 'c@example.com',
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
    const dataRow = sheet.getRow(3);

    expect(dataRow.getCell(1).value).toBe('TASK-001');
    expect(dataRow.getCell(5).value).toBe('Yes');
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
        designStage: null,
        urgencyLevel: 'NORMAL',
        hasCustomSchedule: false,
        language: 'ENGLISH',
        approvalLevel: null,
        dispatcherUserId: null,
        actualCompletionTime: null,
        completionStatus: null,
        remark: 'Note',
        durationDays: null,
        project: {
          name: 'Office',
          nameZh: null,
          projectCode: 'PRJ-OFF',
          contractType: null,
          commissioningMethod: null,
        },
        disciplines: [],
      },
    ]);

    const buffer = await service.exportTaskList(ctx, projectId);
    const sheet = await readWorksheet(buffer, 'task list');
    const dataRow = sheet.getRow(3);

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
