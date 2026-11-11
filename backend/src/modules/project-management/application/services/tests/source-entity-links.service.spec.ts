import { NotFoundException } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { PrismaService } from '../../../../../shared/prisma/prisma.service';
import { CreateRfiDto } from '../../dtos/pm.dtos';
import { PmContext } from '../../types/pm-context.type';
import { CorrespondenceService } from '../correspondence.service';
import { IssuesService } from '../issues.service';
import { MeetingsService } from '../meetings.service';
import { ProjectChangeRequestService } from '../project-change-request.service';
import { ProjectScopeService } from '../project-scope.service';
import { RfisService } from '../rfis.service';
import { DisciplineScopeService } from '../discipline-scope.service';
import { DocumentNumberService } from '../document-number.service';
import { EngineeringDocumentFolderService } from '../engineering-document-folder.service';
import { EpcSubmittalRepository } from '../../../infrastructure/repositories/epc-submittal.repository';

describe('Source entity links (source-entity-links)', () => {
  const ctx: PmContext = { companyId: 'company-1', userId: 'user-1' };
  const projectId = 'project-1';
  const meetingId = 'meeting-1';
  const correspondenceId = 'correspondence-1';

  let prisma: {
    meeting: { findFirst: jest.Mock };
    correspondence: { findFirst: jest.Mock };
    dailyLog: { findFirst: jest.Mock };
    submittalReview: { findFirst: jest.Mock };
    rfi: {
      create: jest.Mock;
      update: jest.Mock;
      findFirst: jest.Mock;
      findMany: jest.Mock;
      count: jest.Mock;
    };
    issue: { create: jest.Mock; findMany: jest.Mock; count: jest.Mock };
    projectChangeRequest: {
      create: jest.Mock;
      findMany: jest.Mock;
      count: jest.Mock;
      update: jest.Mock;
      findFirst: jest.Mock;
    };
    designPackage: { findFirst: jest.Mock };
    designPackageItem: { findMany: jest.Mock };
    engineeringDocumentVersion: { findMany: jest.Mock };
    project: { findFirst: jest.Mock };
    projectTeam: { findFirst: jest.Mock };
    user: { findFirst: jest.Mock };
    documentFolder: { findMany: jest.Mock };
    $transaction: jest.Mock;
  };

  let rfisService: RfisService;
  let issuesService: IssuesService;
  let changeRequestService: ProjectChangeRequestService;
  let meetingsService: MeetingsService;
  let correspondenceService: CorrespondenceService;

  beforeEach(() => {
    prisma = {
      meeting: { findFirst: jest.fn() },
      correspondence: { findFirst: jest.fn() },
      dailyLog: { findFirst: jest.fn() },
      submittalReview: { findFirst: jest.fn() },
      rfi: {
        create: jest.fn(),
        update: jest.fn(),
        findFirst: jest.fn(),
        findMany: jest.fn(),
        count: jest.fn().mockResolvedValue(0),
      },
      issue: {
        create: jest.fn(),
        findMany: jest.fn(),
        count: jest.fn().mockResolvedValue(0),
      },
      projectChangeRequest: {
        create: jest.fn(),
        findMany: jest.fn(),
        count: jest.fn().mockResolvedValue(0),
        update: jest.fn(),
        findFirst: jest.fn(),
      },
      designPackage: {
        findFirst: jest.fn().mockResolvedValue({
          subtaskIndex: 1,
          designerUserId: ctx.userId,
          taskDisciplineId: 'td-1',
          packageCode: 'PKG-001',
          name: 'Package',
          taskDiscipline: {
            disciplineIndex: 1,
            task: {
              projectId,
              overseasTaskNumber: '26-AAR-001',
            },
          },
        }),
      },
      designPackageItem: {
        findMany: jest.fn(),
      },
      engineeringDocumentVersion: {
        findMany: jest.fn(),
      },
      project: {
        findFirst: jest.fn().mockResolvedValue({
          id: projectId,
          companyId: ctx.companyId,
          projectCode: 'PRJ',
          name: 'Test Project',
        }),
      },
      projectTeam: {
        findFirst: jest.fn().mockResolvedValue({ id: 'team-1' }),
      },
      user: {
        findFirst: jest.fn().mockResolvedValue({
          firstName: 'Test',
          lastName: 'User',
          chineseName: null,
          email: 'test@example.com',
        }),
      },
      documentFolder: { findMany: jest.fn().mockResolvedValue([]) },
      $transaction: jest.fn(),
    };

    const projectScopeService = new ProjectScopeService(
      prisma as unknown as PrismaService,
      { getUserRoleNames: jest.fn().mockResolvedValue(['Employee']) } as never,
    );

    const disciplineScopeService = {
      hasDisciplineScopeBypass: jest.fn().mockResolvedValue(true),
      assertDisciplineAccess: jest.fn(),
      getAssignedDisciplineIds: jest.fn().mockResolvedValue([]),
    } as unknown as DisciplineScopeService;

    const documentNumberService = {
      getNextNumber: jest.fn().mockResolvedValue('RFI-001'),
      nextChangeRequestNumber: jest.fn().mockResolvedValue('CR-001'),
    } as unknown as DocumentNumberService;

    const engineeringDocumentFolderService = {
      ensureRfiFolder: jest.fn().mockResolvedValue({ id: 'folder-1' }),
      ensureIssueFolder: jest.fn().mockResolvedValue({ id: 'folder-2' }),
      ensureMeetingFolder: jest.fn().mockResolvedValue({ id: 'folder-3' }),
      ensureCorrespondenceFolder: jest.fn().mockResolvedValue({ id: 'folder-4' }),
      ensureChangeRequestFolder: jest.fn().mockResolvedValue({ id: 'folder-cr' }),
      ensureProjectFolder: jest.fn().mockResolvedValue({ id: 'proj-folder' }),
      findEntityFolder: jest.fn().mockResolvedValue(null),
    } as unknown as EngineeringDocumentFolderService;

    const epcSubmittalRepository = {} as EpcSubmittalRepository;

    rfisService = new RfisService(
      prisma as unknown as PrismaService,
      projectScopeService,
      disciplineScopeService,
      engineeringDocumentFolderService,
      epcSubmittalRepository,
      {
        getUserRoleNames: jest.fn().mockResolvedValue(['System Administrator']),
      } as never,
    );

    issuesService = new IssuesService(
      prisma as unknown as PrismaService,
      projectScopeService,
      disciplineScopeService,
      engineeringDocumentFolderService,
      epcSubmittalRepository,
      {
        getUserRoleNames: jest.fn().mockResolvedValue(['System Administrator']),
        getUserModulePermissions: jest.fn().mockResolvedValue({
          canView: false,
          canCreate: false,
          canEdit: false,
          canDelete: false,
          canApprove: false,
          canExport: false,
        }),
      } as never,
    );

    changeRequestService = new ProjectChangeRequestService(
      prisma as unknown as PrismaService,
      projectScopeService,
      engineeringDocumentFolderService,
      {
        getUserRoleNames: jest.fn().mockResolvedValue(['System Administrator']),
      } as never,
      { closeSessionAsSuperseded: jest.fn() } as never,
    );

    meetingsService = new MeetingsService(
      prisma as unknown as PrismaService,
      projectScopeService,
      documentNumberService,
      engineeringDocumentFolderService,
    );

    correspondenceService = new CorrespondenceService(
      prisma as unknown as PrismaService,
      projectScopeService,
      documentNumberService,
      engineeringDocumentFolderService,
    );

    prisma.project.findFirst.mockResolvedValue({
      id: projectId,
      companyId: ctx.companyId,
    });
  });

  it('1. Create RFI with sourceEntityType=MEETING and valid meetingId → stored', async () => {
    prisma.meeting.findFirst.mockResolvedValue({ id: meetingId, title: 'Weekly Progress Meeting' });
    prisma.rfi.create.mockResolvedValue({
      id: 'rfi-1',
      companyId: ctx.companyId,
      projectId,
      taskDisciplineId: 'td-1',
      raisedBy: ctx.userId,
      assignedTo: ctx.userId,
      rfiNumber: 'RFI-001',
      title: 'Clarification',
      description: null,
      discipline: null,
      priority: 'MEDIUM',
      status: 'DRAFT',
      rfiSource: 'SITE_TEAM',
      dateRaised: new Date(),
      dueDate: null,
      dateAnswered: null,
      linkedDesignPackageId: 'package-1',
      linkedCrId: null,
      linkedCrIds: [],
      sourceEntityType: 'MEETING',
      sourceEntityId: meetingId,
      createdAt: new Date(),
      updatedAt: new Date(),
      createdBy: ctx.userId,
      updatedBy: ctx.userId,
      deletedAt: null,
      deletedBy: null,
    });

    await rfisService.createRfi(ctx, projectId, {
      title: 'Clarification',
      linkedDesignPackageId: 'package-1',
      rfiSource: 'SITE_TEAM' as never,
      sourceEntityType: 'MEETING',
      sourceEntityId: meetingId,
    });

    expect(prisma.rfi.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          sourceEntityType: 'MEETING',
          sourceEntityId: meetingId,
        }),
      }),
    );
  });

  it('2. Create RFI with invalid meetingId → NotFoundException', async () => {
    prisma.meeting.findFirst.mockResolvedValue(null);

    await expect(
      rfisService.createRfi(ctx, projectId, {
        title: 'Clarification',
        linkedDesignPackageId: 'package-1',
        rfiSource: 'SITE_TEAM' as never,
        sourceEntityType: 'MEETING',
        sourceEntityId: 'missing-meeting',
      }),
    ).rejects.toThrow(NotFoundException);
  });

  it('3. Create RFI with meetingId from different project → NotFoundException', async () => {
    prisma.meeting.findFirst.mockResolvedValue(null);

    await expect(
      rfisService.createRfi(ctx, projectId, {
        title: 'Clarification',
        linkedDesignPackageId: 'package-1',
        rfiSource: 'SITE_TEAM' as never,
        sourceEntityType: 'MEETING',
        sourceEntityId: 'other-project-meeting',
      }),
    ).rejects.toThrow(NotFoundException);
  });

  it('4. Create Issue with sourceEntityType=CORRESPONDENCE and valid id → stored', async () => {
    prisma.correspondence.findFirst.mockResolvedValue({
      id: correspondenceId,
      subject: 'Letter ref 123',
    });
    prisma.issue.create.mockResolvedValue({
      id: 'issue-1',
      projectId,
      taskDisciplineId: null,
      raisedBy: ctx.userId,
      assignedTo: null,
      issueNumber: 'ISS-001',
      issueType: 'Defect',
      description: 'Crack in wall',
      location: null,
      severity: 'HIGH',
      status: 'OPEN',
      dueDate: null,
      resolvedAt: null,
      resolvedBy: null,
      resolutionNote: null,
      reopenedAt: null,
      reopenedBy: null,
      sourceEntityType: 'CORRESPONDENCE',
      sourceEntityId: correspondenceId,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    await issuesService.createIssue(ctx, projectId, {
      issueType: 'Defect',
      description: 'Crack in wall',
      severity: 'HIGH',
      sourceEntityType: 'CORRESPONDENCE',
      sourceEntityId: correspondenceId,
    });

    expect(prisma.issue.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          sourceEntityType: 'CORRESPONDENCE',
          sourceEntityId: correspondenceId,
        }),
      }),
    );
  });

  it('5. Create CR with sourceEntityType=MEETING and valid meetingId → stored', async () => {
    prisma.meeting.findFirst.mockResolvedValue({ id: meetingId, title: 'Site Meeting' });
    prisma.designPackage.findFirst.mockResolvedValue({
      id: 'pkg-1',
      packageCode: 'LJZ-GEO-001',
      designerUserId: ctx.userId,
      supportingDesignerUserId: null,
      reviewerUserId: null,
      disciplinaryLeaderUserId: null,
      deptDeputyChiefUserId: null,
      instituteChiefUserId: null,
      taskDiscipline: { task: { projectId } },
    });
    prisma.designPackageItem.findMany.mockResolvedValue([
      {
        engineeringDocumentVersion: { engineeringDocumentId: 'doc-1' },
      },
    ]);
    prisma.engineeringDocumentVersion.findMany.mockResolvedValue([
      {
        id: 'edv-1',
        revisionLabel: '1',
        engineeringDocument: { title: 'Drawing A' },
      },
    ]);
    const createdRow = {
      id: 'cr-1',
      companyId: ctx.companyId,
      projectId,
      changeNumber: 'CR-LJZ-GEO-001-001',
      title: 'Scope change',
      description: null,
      status: 'DRAFT',
      sourceType: 'MANUAL',
      sourceEntityId: null,
      originEntityType: 'MEETING',
      originEntityId: meetingId,
      externalReviewTriggerId: null,
      linkedDesignPackageId: 'pkg-1',
      changeReason: 'CLIENT_REQUEST',
      attachmentFolderId: 'folder-cr',
      assignedTo: null,
      affectedEdvIds: ['edv-1'],
      affectedEdvSnapshot: [
        { id: 'edv-1', title: 'Drawing A', revisionLabel: '1' },
      ],
      createdAt: new Date(),
      createdBy: ctx.userId,
      updatedAt: new Date(),
      updatedBy: ctx.userId,
      deletedAt: null,
      deletedBy: null,
    };
    prisma.projectChangeRequest.create.mockResolvedValue(createdRow);
    prisma.projectChangeRequest.update.mockResolvedValue(createdRow);
    prisma.designPackage.findFirst
      .mockResolvedValueOnce({
        id: 'pkg-1',
        packageCode: 'LJZ-GEO-001',
        designerUserId: ctx.userId,
        supportingDesignerUserId: null,
        reviewerUserId: null,
        disciplinaryLeaderUserId: null,
        deptDeputyChiefUserId: null,
        instituteChiefUserId: null,
        taskDiscipline: { task: { projectId } },
      })
      .mockResolvedValueOnce({
        id: 'pkg-1',
        packageCode: 'LJZ-GEO-001',
        name: 'Geotech',
      });
    prisma.$transaction.mockImplementation(
      async (work: (client: typeof prisma) => Promise<unknown>) => work(prisma),
    );

    await changeRequestService.createChangeRequest(ctx, projectId, {
      title: 'Scope change',
      linkedDesignPackageId: 'pkg-1',
      affectedEdvIds: ['edv-1'],
      changeReason: 'CLIENT_REQUEST',
      sourceEntityType: 'MEETING',
      originEntityId: meetingId,
    });

    expect(prisma.projectChangeRequest.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          originEntityType: 'MEETING',
          originEntityId: meetingId,
          linkedDesignPackageId: 'pkg-1',
          affectedEdvIds: ['edv-1'],
        }),
      }),
    );
  });

  it('6. getMeeting with linked RFIs → raisedRfis populated', async () => {
    prisma.meeting.findFirst.mockResolvedValue({
      id: meetingId,
      projectId,
      organizerId: ctx.userId,
      meetingNumber: 'MTG-001',
      meetingType: 'PROGRESS',
      title: 'Weekly Progress Meeting',
      meetingDate: new Date(),
      location: null,
      status: 'SCHEDULED',
      minutesIssuedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      agendaItems: [],
      attendees: [],
      actionItems: [],
    });
    prisma.rfi.findMany.mockResolvedValue([
      {
        id: 'rfi-1',
        rfiNumber: 'RFI-001',
        title: 'Clarification',
        status: 'DRAFT',
        priority: 'MEDIUM',
      },
    ]);
    prisma.issue.findMany.mockResolvedValue([]);
    prisma.projectChangeRequest.findMany.mockResolvedValue([]);

    const result = await meetingsService.getMeeting(ctx, projectId, meetingId);

    expect(result.raisedRfis).toHaveLength(1);
    expect(result.raisedRfis![0].subject).toBe('Clarification');
  });

  it('7. getMeeting with no linked RFIs → raisedRfis = []', async () => {
    prisma.meeting.findFirst.mockResolvedValue({
      id: meetingId,
      projectId,
      organizerId: ctx.userId,
      meetingNumber: 'MTG-001',
      meetingType: 'PROGRESS',
      title: 'Weekly Progress Meeting',
      meetingDate: new Date(),
      location: null,
      status: 'SCHEDULED',
      minutesIssuedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      agendaItems: [],
      attendees: [],
      actionItems: [],
    });
    prisma.rfi.findMany.mockResolvedValue([]);
    prisma.issue.findMany.mockResolvedValue([]);
    prisma.projectChangeRequest.findMany.mockResolvedValue([]);

    const result = await meetingsService.getMeeting(ctx, projectId, meetingId);

    expect(result.raisedRfis).toEqual([]);
  });

  it('8. getCorrespondence with linked Issues → raisedIssues populated', async () => {
    prisma.correspondence.findFirst.mockResolvedValue({
      id: correspondenceId,
      projectId,
      senderUserId: ctx.userId,
      referenceNumber: 'COR-001',
      correspondenceType: 'LETTER',
      subject: 'Formal notice',
      senderName: 'Sender',
      recipientName: 'Recipient',
      correspondenceDate: new Date(),
      status: 'DRAFT',
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    prisma.rfi.findMany.mockResolvedValue([]);
    prisma.issue.findMany.mockResolvedValue([
      {
        id: 'issue-1',
        issueNumber: 'ISS-001',
        issueType: 'Defect',
        status: 'OPEN',
        severity: 'HIGH',
      },
    ]);
    prisma.projectChangeRequest.findMany.mockResolvedValue([]);

    const result = await correspondenceService.getCorrespondence(
      ctx,
      projectId,
      correspondenceId,
    );

    expect(result.raisedIssues).toHaveLength(1);
    expect(result.raisedIssues![0].title).toBe('Defect');
  });

  it('9. Update RFI to set sourceEntityType and sourceEntityId → updated', async () => {
    const existingRfi = {
      id: 'rfi-1',
      projectId,
      taskDisciplineId: null,
      raisedBy: ctx.userId,
      assignedTo: null,
      rfiNumber: 'RFI-001',
      title: 'Clarification',
      description: null,
      discipline: null,
      priority: 'MEDIUM',
      status: 'DRAFT',
      dateRaised: new Date(),
      dueDate: null,
      dateAnswered: null,
      sourceEntityType: null,
      sourceEntityId: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    prisma.rfi.findFirst
      .mockResolvedValueOnce(existingRfi)
      .mockResolvedValueOnce({ status: 'DRAFT' });
    prisma.meeting.findFirst.mockResolvedValue({ id: meetingId, title: 'Site Meeting' });
    prisma.rfi.update.mockResolvedValue({
      ...existingRfi,
      sourceEntityType: 'MEETING',
      sourceEntityId: meetingId,
    });

    await rfisService.updateRfi(ctx, projectId, 'rfi-1', {
      sourceEntityType: 'MEETING',
      sourceEntityId: meetingId,
    });

    expect(prisma.rfi.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          sourceEntityType: 'MEETING',
          sourceEntityId: meetingId,
        }),
      }),
    );
  });

  it('10. Create RFI with sourceEntityType not in allowed list → validation error', async () => {
    const dto = plainToInstance(CreateRfiDto, {
      title: 'Clarification',
      sourceEntityType: 'INVALID_TYPE',
      sourceEntityId: meetingId,
    });

    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors.some((e) => e.property === 'sourceEntityType')).toBe(true);
  });
});
