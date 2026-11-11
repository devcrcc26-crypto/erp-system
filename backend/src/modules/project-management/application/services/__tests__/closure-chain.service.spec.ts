import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import {
  DesignPackageStatus,
  EdvStatus,
  ProjectStatus,
  TaskStatus,
} from '@prisma/client';
import { PrismaService } from '../../../../../shared/prisma/prisma.service';
import {
  DesignPackageRepository,
  TaskDisciplineScopeRepository,
} from '../../../infrastructure/repositories/epc-storage.repository';
import { PmContext } from '../../types/pm-context.type';
import { DesignPackagesService } from '../design-packages.service';
import { DisciplineScopeService } from '../discipline-scope.service';
import { EngineeringDocumentFolderService } from '../engineering-document-folder.service';
import { ProjectScopeService } from '../project-scope.service';
import { ProjectsService } from '../projects.service';
import { ScheduleService } from '../schedule.service';

describe('Closure chain (closure-chain)', () => {
  const companyId = 'company-1';
  const projectId = 'project-1';
  const taskId = 'task-1';
  const taskDisciplineId = 'discipline-1';
  const packageId = 'package-1';
  const disciplineId = 'discipline-1';
  const leaderUserId = 'user-lead';
  const nonLeaderUserId = 'user-designer';
  const dispatcherUserId = 'dispatcher-1';

  const leaderCtx: PmContext = { companyId, userId: leaderUserId };
  const nonLeaderCtx: PmContext = { companyId, userId: nonLeaderUserId };
  const pmCtx: PmContext = { companyId, userId: 'user-pm' };

  describe('DesignPackagesService.closeDesignPackage', () => {
    let designPackageRepository: {
      findForClose: jest.Mock;
      countPendingRevisionTriggersForPackage: jest.Mock;
      countOpenLinkedEntitiesForPackage: jest.Mock;
      closePackage: jest.Mock;
    };
    let taskDisciplineScopeRepository: { findScoped: jest.Mock };
    let service: DesignPackagesService;

    function buildPackageForClose(
      overrides: Record<string, unknown> = {},
    ): Record<string, unknown> {
      return {
        id: packageId,
        companyId,
        taskDisciplineId,
        name: 'Foundation Package',
        packageStatus: DesignPackageStatus.OPEN,
        sourceEntityType: null,
        sourceEntityId: null,
        taskDiscipline: {
          id: taskDisciplineId,
          disciplineLeadUserId: leaderUserId,
          taskId,
        },
        items: [
          {
            id: 'item-1',
            companyId,
            designPackageId: packageId,
            engineeringDocumentVersionId: 'edv-1',
            sortOrder: 0,
            createdAt: new Date('2026-01-01T00:00:00.000Z'),
            createdBy: leaderUserId,
            engineeringDocumentVersion: {
              id: 'edv-1',
              status: EdvStatus.LOCKED,
              engineeringDocument: { title: 'Drawing A' },
            },
          },
        ],
        ...overrides,
      };
    }

    beforeEach(() => {
      designPackageRepository = {
        findForClose: jest.fn(),
        countPendingRevisionTriggersForPackage: jest.fn().mockResolvedValue(0),
        countOpenLinkedEntitiesForPackage: jest
          .fn()
          .mockResolvedValue({ openRfis: 0, openIssues: 0, openChangeRequests: 0 }),
        closePackage: jest.fn(),
      };
      taskDisciplineScopeRepository = {
        findScoped: jest.fn().mockResolvedValue({
          id: taskDisciplineId,
          disciplineName: 'Structural',
          taskId,
        }),
      };

      service = new DesignPackagesService(
        designPackageRepository as unknown as DesignPackageRepository,
        {} as never,
        taskDisciplineScopeRepository as unknown as TaskDisciplineScopeRepository,
        {} as never,
        {} as never,
        {} as never,
        {} as never,
        {} as never,
        {
          projectTeam: {
            findFirst: jest.fn().mockResolvedValue({ id: 'team-1' }),
          },
        } as never,
        {
          assertDisciplineReadable: jest.fn().mockResolvedValue(undefined),
          resolveProfile: jest.fn().mockResolvedValue({
            hasFullProjectAccess: true,
            isProjectAdmin: false,
            canManageSubtasks: true,
            ledDepartmentIds: [],
            isDepartmentLeader: false,
          }),
        } as never,
        { notifySubtaskRolesAssigned: jest.fn() } as never,
        { getNextNumber: jest.fn() } as never,
        { hasPermission: jest.fn().mockResolvedValue(false) } as never,
      );
    });

    it('1. close package all EDVs LOCKED no open items → succeeds', async () => {
      const pkg = buildPackageForClose();
      designPackageRepository.findForClose.mockResolvedValue(pkg);
      designPackageRepository.closePackage.mockResolvedValue({
        ...pkg,
        packageStatus: DesignPackageStatus.CLOSED,
        packageClosedAt: new Date('2026-06-26T12:00:00.000Z'),
        packageClosedBy: leaderUserId,
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
        updatedAt: new Date('2026-06-26T12:00:00.000Z'),
        createdBy: leaderUserId,
        updatedBy: leaderUserId,
        projectedStatus: 'LOCKED',
        projectionPending: false,
        submittedAt: null,
        approvedAt: null,
      });

      const result = await service.closeDesignPackage(
        leaderCtx,
        projectId,
        taskDisciplineId,
        packageId,
      );

      expect(designPackageRepository.closePackage).toHaveBeenCalledWith(
        packageId,
        leaderUserId,
        expect.any(Number),
      );
      expect(result.packageStatus).toBe(DesignPackageStatus.CLOSED);
    });

    it('2. close package non-leader → ForbiddenException', async () => {
      designPackageRepository.findForClose.mockResolvedValue(buildPackageForClose());

      await expect(
        service.closeDesignPackage(
          nonLeaderCtx,
          projectId,
          taskDisciplineId,
          packageId,
        ),
      ).rejects.toThrow(
        new ForbiddenException(
          'Only the discipline leader can close a design package.',
        ),
      );
    });

    it('3. close package already CLOSED → ConflictException', async () => {
      designPackageRepository.findForClose.mockResolvedValue(
        buildPackageForClose({ packageStatus: DesignPackageStatus.CLOSED }),
      );

      await expect(
        service.closeDesignPackage(
          leaderCtx,
          projectId,
          taskDisciplineId,
          packageId,
        ),
      ).rejects.toThrow(new ConflictException('Package is already closed.'));
    });

    it('4. close package any EDV not LOCKED → BadRequestException with doc names', async () => {
      designPackageRepository.findForClose.mockResolvedValue(
        buildPackageForClose({
          items: [
            {
              id: 'item-1',
              engineeringDocumentVersion: {
                id: 'edv-1',
                status: EdvStatus.APPROVED,
                engineeringDocument: { title: 'Drawing A' },
              },
            },
            {
              id: 'item-2',
              engineeringDocumentVersion: {
                id: 'edv-2',
                status: EdvStatus.LOCKED,
                engineeringDocument: { title: 'Drawing B' },
              },
            },
          ],
        }),
      );

      await expect(
        service.closeDesignPackage(
          leaderCtx,
          projectId,
          taskDisciplineId,
          packageId,
        ),
      ).rejects.toThrow(
        new BadRequestException(
          'Cannot close package: 1 document(s) not yet locked: [Drawing A]',
        ),
      );
    });

    it('5. close package open linked RFI → BadRequestException with count', async () => {
      designPackageRepository.findForClose.mockResolvedValue(
        buildPackageForClose({
          sourceEntityType: 'RFI',
          sourceEntityId: 'rfi-1',
        }),
      );
      designPackageRepository.countOpenLinkedEntitiesForPackage.mockResolvedValue({
        openRfis: 1,
        openIssues: 0,
        openChangeRequests: 0,
      });

      await expect(
        service.closeDesignPackage(
          leaderCtx,
          projectId,
          taskDisciplineId,
          packageId,
        ),
      ).rejects.toThrow(
        new BadRequestException(
          'Cannot close package: Open RFIs: 1, Open Issues: 0, Open Change Requests: 0.',
        ),
      );
    });

    it('6. close package open linked Issue → BadRequestException', async () => {
      designPackageRepository.findForClose.mockResolvedValue(
        buildPackageForClose({
          sourceEntityType: 'ISSUE',
          sourceEntityId: 'issue-1',
        }),
      );
      designPackageRepository.countOpenLinkedEntitiesForPackage.mockResolvedValue({
        openRfis: 0,
        openIssues: 1,
        openChangeRequests: 0,
      });

      await expect(
        service.closeDesignPackage(
          leaderCtx,
          projectId,
          taskDisciplineId,
          packageId,
        ),
      ).rejects.toThrow(
        new BadRequestException(
          'Cannot close package: Open RFIs: 0, Open Issues: 1, Open Change Requests: 0.',
        ),
      );
    });

    it('7. close package pending revision trigger → BadRequestException', async () => {
      designPackageRepository.findForClose.mockResolvedValue(buildPackageForClose());
      designPackageRepository.countPendingRevisionTriggersForPackage.mockResolvedValue(
        2,
      );

      await expect(
        service.closeDesignPackage(
          leaderCtx,
          projectId,
          taskDisciplineId,
          packageId,
        ),
      ).rejects.toThrow(
        new BadRequestException(
          'Cannot close package: 2 pending revision trigger(s) remain.',
        ),
      );
    });
  });

  describe('ScheduleService.closeTaskDiscipline', () => {
    let prisma: {
      task: { findFirst: jest.Mock };
      taskDiscipline: { findFirst: jest.Mock; update: jest.Mock };
    };
    let service: ScheduleService;

    beforeEach(() => {
      prisma = {
        task: {
          findFirst: jest.fn().mockResolvedValue({ id: taskId }),
        },
        taskDiscipline: {
          findFirst: jest.fn(),
          update: jest.fn(),
        },
      };

      service = new ScheduleService(
        prisma as unknown as PrismaService,
        {
          getProjectOrThrow: jest.fn().mockResolvedValue({ id: projectId }),
        } as unknown as ProjectScopeService,
        {} as never,
        {} as never,
        {} as never,
      );
    });

    it('8. close discipline all packages CLOSED → succeeds isClosed=true', async () => {
      prisma.taskDiscipline.findFirst
        .mockResolvedValueOnce({ id: disciplineId })
        .mockResolvedValueOnce({
          id: disciplineId,
          disciplineLeadUserId: leaderUserId,
          isClosed: false,
          designPackages: [
            { name: 'Package A', packageStatus: DesignPackageStatus.CLOSED },
          ],
        });
      prisma.taskDiscipline.update.mockResolvedValue({
        id: disciplineId,
        isClosed: true,
        closedAt: new Date('2026-06-26T12:00:00.000Z'),
        closedBy: leaderUserId,
      });

      const result = await service.closeTaskDiscipline(
        leaderCtx,
        projectId,
        taskId,
        disciplineId,
      );

      expect(prisma.taskDiscipline.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: disciplineId },
          data: expect.objectContaining({
            isClosed: true,
            closedBy: leaderUserId,
          }),
        }),
      );
      expect(result.isClosed).toBe(true);
    });

    it('9. close discipline non-leader → ForbiddenException', async () => {
      prisma.taskDiscipline.findFirst
        .mockResolvedValueOnce({ id: disciplineId })
        .mockResolvedValueOnce({
          id: disciplineId,
          disciplineLeadUserId: leaderUserId,
          isClosed: false,
          designPackages: [],
        });

      await expect(
        service.closeTaskDiscipline(
          nonLeaderCtx,
          projectId,
          taskId,
          disciplineId,
        ),
      ).rejects.toThrow(
        new ForbiddenException(
          'Only the discipline leader can close a task discipline.',
        ),
      );
    });

    it('10. close discipline any package not CLOSED → BadRequestException with names', async () => {
      prisma.taskDiscipline.findFirst
        .mockResolvedValueOnce({ id: disciplineId })
        .mockResolvedValueOnce({
          id: disciplineId,
          disciplineLeadUserId: leaderUserId,
          isClosed: false,
          designPackages: [
            { name: 'Open Package', packageStatus: DesignPackageStatus.OPEN },
            { name: 'Closed Package', packageStatus: DesignPackageStatus.CLOSED },
          ],
        });

      await expect(
        service.closeTaskDiscipline(
          leaderCtx,
          projectId,
          taskId,
          disciplineId,
        ),
      ).rejects.toThrow(
        new BadRequestException(
          'Cannot close discipline: 1 package(s) still open: [Open Package]',
        ),
      );
    });

    it('11. close discipline already closed → ConflictException', async () => {
      prisma.taskDiscipline.findFirst
        .mockResolvedValueOnce({ id: disciplineId })
        .mockResolvedValueOnce({
          id: disciplineId,
          disciplineLeadUserId: leaderUserId,
          isClosed: true,
          designPackages: [],
        });

      await expect(
        service.closeTaskDiscipline(
          leaderCtx,
          projectId,
          taskId,
          disciplineId,
        ),
      ).rejects.toThrow(
        new ConflictException('Discipline is already closed.'),
      );
    });
  });

  describe('ScheduleService.updateTask completion gate', () => {
    let prisma: {
      task: { findFirst: jest.Mock; update: jest.Mock };
      taskDiscipline: { findMany: jest.Mock };
      projectTeam: { count: jest.Mock };
    };
    let service: ScheduleService;

    beforeEach(() => {
      prisma = {
        task: {
          findFirst: jest.fn(),
          update: jest.fn(),
        },
        taskDiscipline: {
          findMany: jest.fn(),
        },
        projectTeam: {
          count: jest.fn().mockResolvedValue(1),
        },
      };

      service = new ScheduleService(
        prisma as unknown as PrismaService,
        {
          getProjectOrThrow: jest.fn().mockResolvedValue({ id: projectId }),
        } as unknown as ProjectScopeService,
        {} as never,
        {} as never,
        {} as never,
      );
    });

    function mockTaskTransition(fromStatus: TaskStatus): void {
      prisma.task.findFirst.mockImplementation(
        (args: { select?: { status?: boolean } }) => {
          if (args?.select?.status) {
            return Promise.resolve({ status: fromStatus });
          }
          return Promise.resolve({ id: taskId });
        },
      );
      prisma.task.update.mockResolvedValue({
        id: taskId,
        status: TaskStatus.COMPLETED,
      });
    }

    it('12. complete task no disciplines → succeeds freely', async () => {
      mockTaskTransition(TaskStatus.IN_PROGRESS);
      prisma.taskDiscipline.findMany.mockResolvedValue([]);

      await service.updateTask(leaderCtx, projectId, taskId, {
        status: TaskStatus.COMPLETED,
        dispatcherUserId,
      });

      expect(prisma.task.update).toHaveBeenCalled();
    });

    it('13. complete task all disciplines closed → succeeds', async () => {
      mockTaskTransition(TaskStatus.IN_PROGRESS);
      prisma.taskDiscipline.findMany.mockResolvedValue([
        { disciplineName: 'Structural', isClosed: true },
        { disciplineName: 'Electrical', isClosed: true },
      ]);

      await service.updateTask(leaderCtx, projectId, taskId, {
        status: TaskStatus.COMPLETED,
        dispatcherUserId,
      });

      expect(prisma.task.update).toHaveBeenCalled();
    });

    it('14. complete task any discipline open → BadRequestException with names', async () => {
      mockTaskTransition(TaskStatus.IN_PROGRESS);
      prisma.taskDiscipline.findMany.mockResolvedValue([
        { disciplineName: 'Structural', isClosed: true },
        { disciplineName: 'Electrical', isClosed: false },
      ]);

      await expect(
        service.updateTask(leaderCtx, projectId, taskId, {
          status: TaskStatus.COMPLETED,
          dispatcherUserId,
        }),
      ).rejects.toThrow(
        new BadRequestException(
          'Task cannot be completed: 1 discipline(s) still open: [Electrical]',
        ),
      );
      expect(prisma.task.update).not.toHaveBeenCalled();
    });
  });

  describe('ProjectsService.updateProject completion gate', () => {
    let prisma: {
      project: { findFirst: jest.Mock; update: jest.Mock };
      task: { count: jest.Mock };
      issue: { count: jest.Mock };
      rfi: { count: jest.Mock };
      punchItem: { count: jest.Mock };
      deliverable: { count: jest.Mock };
    };
    let service: ProjectsService;

    beforeEach(() => {
      prisma = {
        project: {
          findFirst: jest.fn().mockResolvedValue({ status: ProjectStatus.IN_PROGRESS }),
          update: jest.fn().mockResolvedValue({
            id: projectId,
            status: ProjectStatus.COMPLETED,
          }),
        },
        task: { count: jest.fn().mockResolvedValue(0) },
        issue: { count: jest.fn().mockResolvedValue(0) },
        rfi: { count: jest.fn().mockResolvedValue(0) },
        punchItem: { count: jest.fn().mockResolvedValue(0) },
        deliverable: { count: jest.fn().mockResolvedValue(0) },
      };

      service = new ProjectsService(
        prisma as unknown as PrismaService,
        {
          getProjectOrThrow: jest.fn().mockResolvedValue({ id: projectId }),
        } as unknown as ProjectScopeService,
        {
          hasDisciplineScopeBypass: jest.fn().mockResolvedValue(true),
        } as unknown as DisciplineScopeService,
        {} as unknown as EngineeringDocumentFolderService,
      );
    });

    it('15. complete project all done no open items → succeeds', async () => {
      await service.updateProject(pmCtx, projectId, {
        status: ProjectStatus.COMPLETED,
      });

      expect(prisma.project.update).toHaveBeenCalled();
    });

    it('16. complete project open tasks → BadRequestException with counts', async () => {
      prisma.task.count.mockResolvedValue(3);

      await expect(
        service.updateProject(pmCtx, projectId, {
          status: ProjectStatus.COMPLETED,
        }),
      ).rejects.toThrow(
        new BadRequestException(
          'Project cannot be completed: 3 tasks, 0 issues, 0 RFIs, 0 punch items, 0 deliverables still open.',
        ),
      );
      expect(prisma.project.update).not.toHaveBeenCalled();
    });

    it('17. complete project open RFIs → BadRequestException with counts', async () => {
      prisma.rfi.count.mockResolvedValue(2);

      await expect(
        service.updateProject(pmCtx, projectId, {
          status: ProjectStatus.COMPLETED,
        }),
      ).rejects.toThrow(
        new BadRequestException(
          'Project cannot be completed: 0 tasks, 0 issues, 2 RFIs, 0 punch items, 0 deliverables still open.',
        ),
      );
    });

    it('18. complete project mix of open items → single error with all counts', async () => {
      prisma.task.count.mockResolvedValue(1);
      prisma.issue.count.mockResolvedValue(2);
      prisma.rfi.count.mockResolvedValue(3);
      prisma.punchItem.count.mockResolvedValue(4);
      prisma.deliverable.count.mockResolvedValue(5);

      await expect(
        service.updateProject(pmCtx, projectId, {
          status: ProjectStatus.COMPLETED,
        }),
      ).rejects.toThrow(
        new BadRequestException(
          'Project cannot be completed: 1 tasks, 2 issues, 3 RFIs, 4 punch items, 5 deliverables still open.',
        ),
      );
    });
  });
});
