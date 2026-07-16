import { PrismaService } from '../../../../../shared/prisma/prisma.service';
import { TaskAccessScopeService } from '../task-access-scope.service';
import { MyWorkService } from '../my-work.service';
import { PmContext } from '../../types/pm-context.type';

describe('MyWorkService', () => {
  const ctx: PmContext = { companyId: 'company-1', userId: 'user-lead' };

  let prisma: {
    taskDiscipline: { findMany: jest.Mock };
    designPackage: { findMany: jest.Mock; groupBy: jest.Mock };
    task: { findMany: jest.Mock };
  };
  let taskAccessScopeService: {
    getVisibleProjectIds: jest.Mock;
  };
  let service: MyWorkService;

  beforeEach(() => {
    prisma = {
      taskDiscipline: { findMany: jest.fn().mockResolvedValue([]) },
      designPackage: {
        findMany: jest.fn().mockResolvedValue([]),
        groupBy: jest.fn().mockResolvedValue([]),
      },
      task: { findMany: jest.fn().mockResolvedValue([]) },
    };
    taskAccessScopeService = {
      getVisibleProjectIds: jest.fn().mockResolvedValue(null),
    };
    service = new MyWorkService(
      prisma as unknown as PrismaService,
      taskAccessScopeService as unknown as TaskAccessScopeService,
    );
  });

  it('returns discipline-lead and subtask-role items sorted by project', async () => {
    prisma.taskDiscipline.findMany.mockResolvedValue([
      {
        id: 'discipline-1',
        taskId: 'task-1',
        disciplineName: 'Highway',
        task: {
          projectId: 'project-b',
          name: 'Task B',
          nameZh: null,
          project: {
            id: 'project-b',
            name: 'Beta Project',
            nameZh: null,
            projectCode: 'B-001',
          },
        },
      },
    ]);
    prisma.designPackage.findMany.mockResolvedValue([
      {
        id: 'package-1',
        name: 'Layout drawings',
        projectedStatus: 'IN_PROGRESS',
        packageStatus: 'OPEN',
        designerUserId: ctx.userId,
        reviewerUserId: null,
        disciplinaryLeaderUserId: null,
        deptDeputyChiefUserId: null,
        instituteChiefUserId: null,
        disciplineOwnerUserId: null,
        supportingDesignerUserId: null,
        taskDiscipline: {
          id: 'discipline-2',
          disciplineName: 'Structure',
          task: {
            id: 'task-2',
            projectId: 'project-a',
            name: 'Task A',
            nameZh: null,
            project: {
              id: 'project-a',
              name: 'Alpha Project',
              nameZh: null,
              projectCode: 'A-001',
            },
          },
        },
      },
    ]);

    const items = await service.getMyWork(ctx);

    expect(items).toHaveLength(2);
    expect(items[0]?.projectName).toBe('Alpha Project');
    expect(items[0]?.kind).toBe('SUBTASK_ROLE');
    expect(items[0]?.roleLabel).toContain('Designer');
    expect(items[1]?.projectName).toBe('Beta Project');
    expect(items[1]?.kind).toBe('DISCIPLINE_LEAD');
  });

  it('scopes subtask query to a project when projectId is provided', async () => {
    await service.getMyWork(ctx, 'project-a');

    expect(prisma.designPackage.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          taskDiscipline: expect.objectContaining({
            task: expect.objectContaining({ projectId: 'project-a' }),
          }),
        }),
      }),
    );
  });
});
