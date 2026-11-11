import {
  NotificationChannel,
  Prisma,
  ProjectTeamRole,
  TaskAttributes,
  TaskStatus,
  UrgencyLevel,
} from '@prisma/client';
import { sid } from './seed-epc-demo';
import type { PmSeedContext } from './seed-pm-demo';

/** Phase-1 HR departments (stable IDs from migration). */
const DEPT_MTD_ID = 'e0000000-0000-4000-8000-000000000001';
const DEPT_ADD_ID = 'e0000000-0000-4000-8000-000000000002';

/** Engineering discipline catalog IDs (phase-2 migration). */
const DISCIPLINE_IDS = {
  architecture: 'd1000000-0000-4000-8000-00000007',
  structural: 'd1000000-0000-4000-8000-0000000a',
  civil: 'd1000000-0000-4000-8000-00000101',
  mep: 'd1000000-0000-4000-8000-00000102',
} as const;

/** Demo persona user IDs (080–08f from seed-pm-demo / seed-demo-projects). */
const U = {
  pm: '00000000-0000-4000-8000-000000000080',
  engineer: '00000000-0000-4000-8000-000000000081',
  safety: '00000000-0000-4000-8000-000000000082',
  docs: '00000000-0000-4000-8000-000000000083',
  reviewer: '00000000-0000-4000-8000-000000000084',
  lead: '00000000-0000-4000-8000-000000000085',
  deptChief: '00000000-0000-4000-8000-000000000086',
  deputy: '00000000-0000-4000-8000-000000000087',
  siteCoord: '00000000-0000-4000-8000-000000000088',
  owner: '00000000-0000-4000-8000-000000000089',
  consultant: '00000000-0000-4000-8000-00000000008a',
  designer: '00000000-0000-4000-8000-00000000008b',
  supportingDesigner: '00000000-0000-4000-8000-00000000008c',
  dispatcher: '00000000-0000-4000-8000-00000000008d',
  instituteChief: '00000000-0000-4000-8000-00000000008e',
  generalManager: '00000000-0000-4000-8000-00000000008f',
} as const;

const SUBTASK_ROLE_ASSIGNMENTS: Prisma.DesignPackageUncheckedUpdateInput = {
  designerUserId: U.designer,
  supportingDesignerUserId: U.supportingDesigner,
  reviewerUserId: U.reviewer,
  disciplinaryLeaderUserId: U.lead,
  deptDeputyChiefUserId: U.deputy,
  instituteChiefUserId: U.instituteChief,
  disciplineOwnerUserId: U.owner,
};

const WALKTHROUGH_PROJECTS = {
  ljz: { index: 11, code: 'LJZ-2024-001', departmentId: DEPT_MTD_ID },
  pdr: { index: 12, code: 'PDR-2025-003', departmentId: DEPT_ADD_ID },
  demo001: { index: 1, code: 'DEMO-001', departmentId: DEPT_MTD_ID },
  demo002: { index: 2, code: 'DEMO-002', departmentId: DEPT_ADD_ID },
} as const;

function d(iso: string): Date {
  return new Date(iso);
}

/**
 * Ensures MTD / ADD departments exist and assigns department leaders for scoping demos.
 */
async function ensureHrDepartments(ctx: PmSeedContext): Promise<void> {
  const { prisma: db, companyId, branchId, adminUserId } = ctx;

  const division = await db.division.findFirst({
    where: { companyId, deletedAt: null },
    orderBy: { createdAt: 'asc' },
  });
  if (!division) {
    throw new Error('Comment 8 walkthrough seed requires at least one division');
  }

  const deptSpecs = [
    {
      id: DEPT_MTD_ID,
      name: 'Municipal Transportation Department',
      nameZh: '市政交通部',
      leaderUserId: U.deptChief,
    },
    {
      id: DEPT_ADD_ID,
      name: 'Architectural Design Department',
      nameZh: '建筑设计部',
      leaderUserId: U.owner,
    },
  ] as const;

  for (const spec of deptSpecs) {
    const existing = await db.department.findFirst({
      where: { id: spec.id, companyId },
      select: { id: true },
    });
    if (existing) {
      await db.department.update({
        where: { id: spec.id },
        data: {
          name: spec.name,
          nameZh: spec.nameZh,
          leaderUserId: spec.leaderUserId,
          isActive: true,
          updatedBy: adminUserId,
        },
      });
      continue;
    }

    await db.$executeRawUnsafe(
      `CREATE SEQUENCE IF NOT EXISTS "department_code_seq" START WITH 1 INCREMENT BY 1`,
    );
    const next = await db.$queryRaw<Array<{ nextval: bigint }>>`
      SELECT nextval('department_code_seq')
    `;
    const code = `DEPT-${String(Number(next[0]?.nextval ?? 1)).padStart(4, '0')}`;
    await db.department.create({
      data: {
        id: spec.id,
        companyId,
        divisionId: division.id,
        branchId,
        name: spec.name,
        nameZh: spec.nameZh,
        code,
        isActive: true,
        leaderUserId: spec.leaderUserId,
        createdBy: adminUserId,
        updatedBy: adminUserId,
      },
    });
  }

  console.log('  ✓ HR departments with leaders (Rania → MTD, Hassan → ADD)');
}

/**
 * Links flagship task disciplines to the engineering discipline catalog.
 */
async function linkTaskDisciplineCatalog(
  ctx: PmSeedContext,
  projectIndex: number,
): Promise<void> {
  const { prisma: db, adminUserId } = ctx;
  const taskId = sid(projectIndex, 30);

  const mappings: Array<{ entity: number; disciplineId: string }> = [
    { entity: 200, disciplineId: DISCIPLINE_IDS.civil },
    { entity: 201, disciplineId: DISCIPLINE_IDS.structural },
    { entity: 202, disciplineId: DISCIPLINE_IDS.mep },
    { entity: 203, disciplineId: DISCIPLINE_IDS.architecture },
  ];

  for (const row of mappings) {
    await db.taskDiscipline.updateMany({
      where: { id: sid(projectIndex, row.entity), taskId, deletedAt: null },
      data: { disciplineId: row.disciplineId, updatedBy: adminUserId },
    });
  }
}

/**
 * Patches flagship LJZ task with Comment 8 schedule / commissioning fields.
 */
async function patchLjzFlagshipTask(ctx: PmSeedContext): Promise<void> {
  const { prisma: db, adminUserId } = ctx;
  const taskId = sid(WALKTHROUGH_PROJECTS.ljz.index, 30);

  await db.task.update({
    where: { id: taskId },
    data: {
      overseasTaskNumber: 'OS-LJZ-2024-8842',
      commissionMode: 'CONTRACT',
      supervisingChiefUserId: U.instituteChief,
      assignedPersonUserId: U.designer,
      dispatcherUserId: U.dispatcher,
      urgencyLevel: UrgencyLevel.VERY_URGENT,
      approvalLevel: 'DESIGN_INSTITUTE_REVIEW',
      taskAttributes: TaskAttributes.COMBINE2,
      contactFormNumber: 'CF-LJZ-C8-001',
      onSiteReceivingTime: d('2024-11-01'),
      assignmentToHqTime: d('2024-11-08'),
      requiresArchiving: true,
      hasCustomSchedule: true,
      language: 'ENGLISH',
      designStage: 'CONSTRUCTION_DRAWING_DESIGN_CD_IFC',
      remark:
        'Comment 8 flagship task - use for task detail, My Work, exports, and subtask role walkthrough.',
      status: TaskStatus.IN_PROGRESS,
      progressPct: 58,
      updatedBy: adminUserId,
    },
  });

  console.log('  ✓ LJZ flagship task patched with Comment 8 fields (OS-LJZ-2024-8842)');
}

/**
 * Applies all seven subtask role FKs to design packages under a project task.
 */
async function patchSubtaskRolesForTask(
  ctx: PmSeedContext,
  taskId: string,
): Promise<number> {
  const { prisma: db, companyId, adminUserId } = ctx;

  const result = await db.designPackage.updateMany({
    where: {
      companyId,
      deletedAt: null,
      taskDiscipline: { taskId, deletedAt: null },
    },
    data: { ...SUBTASK_ROLE_ASSIGNMENTS, updatedBy: adminUserId },
  });

  return result.count;
}

/**
 * Adds workflow personas to the LJZ project team for project-scoped views.
 */
async function ensureLjzWorkflowTeam(ctx: PmSeedContext): Promise<void> {
  const { prisma: db, adminUserId } = ctx;
  const projectId = sid(WALKTHROUGH_PROJECTS.ljz.index, 1);

  const extraMembers: Array<{
    entity: number;
    userId: string;
    roleOnProject: ProjectTeamRole;
  }> = [
    { entity: 20, userId: U.designer, roleOnProject: ProjectTeamRole.OTHER },
    { entity: 21, userId: U.dispatcher, roleOnProject: ProjectTeamRole.DISPATCHER },
    { entity: 22, userId: U.reviewer, roleOnProject: ProjectTeamRole.OTHER },
    { entity: 23, userId: U.lead, roleOnProject: ProjectTeamRole.OTHER },
    { entity: 24, userId: U.deptChief, roleOnProject: ProjectTeamRole.DEPARTMENT_CHIEF },
    { entity: 25, userId: U.deputy, roleOnProject: ProjectTeamRole.DEPUTY_CHIEF },
    { entity: 26, userId: U.owner, roleOnProject: ProjectTeamRole.OTHER },
    { entity: 27, userId: U.instituteChief, roleOnProject: ProjectTeamRole.INSTITUTE_CHIEF },
    { entity: 28, userId: U.generalManager, roleOnProject: ProjectTeamRole.OTHER },
    { entity: 29, userId: U.supportingDesigner, roleOnProject: ProjectTeamRole.OTHER },
  ];

  const p = WALKTHROUGH_PROJECTS.ljz.index;
  for (const member of extraMembers) {
    await db.projectTeam.upsert({
      where: {
        project_team_member_unique: {
          projectId,
          userId: member.userId,
        },
      },
      update: {
        roleOnProject: member.roleOnProject,
        updatedBy: adminUserId,
      },
      create: {
        id: sid(p, member.entity),
        projectId,
        userId: member.userId,
        roleOnProject: member.roleOnProject,
        createdBy: adminUserId,
        updatedBy: adminUserId,
      },
    });
  }

  console.log('  ✓ LJZ project team extended with workflow personas');
}

/**
 * Binds engineering discipline FK on key demo users (Settings → Users).
 */
async function assignUserEngineeringDisciplines(ctx: PmSeedContext): Promise<void> {
  const { prisma: db, adminUserId } = ctx;

  const userDisciplineMap: Array<{ userId: string; disciplineId: string }> = [
    { userId: U.lead, disciplineId: DISCIPLINE_IDS.structural },
    { userId: U.designer, disciplineId: DISCIPLINE_IDS.architecture },
    { userId: U.supportingDesigner, disciplineId: DISCIPLINE_IDS.architecture },
    { userId: U.owner, disciplineId: DISCIPLINE_IDS.structural },
    { userId: U.reviewer, disciplineId: DISCIPLINE_IDS.civil },
  ];

  for (const row of userDisciplineMap) {
    await db.user.update({
      where: { id: row.userId },
      data: {
        engineeringDisciplineId: row.disciplineId,
        updatedBy: adminUserId,
      },
    });
  }

  console.log('  ✓ Engineering discipline FK assigned on key demo users');
}

/**
 * Seeds in-app notification templates for Comment 8 assignment events.
 */
async function seedComment8NotificationTemplates(ctx: PmSeedContext): Promise<void> {
  const { prisma: db, companyId, adminUserId } = ctx;

  const templates: Array<{
    eventType: string;
    subjectTemplate: string;
    bodyTemplate: string;
  }> = [
    {
      eventType: 'task.discipline_leader_assigned',
      subjectTemplate: 'Discipline lead assignment: {{taskName}}',
      bodyTemplate:
        'You were assigned as discipline lead on {{taskName}} ({{projectCode}}).',
    },
    {
      eventType: 'subtask.role_assigned',
      subjectTemplate: 'Subtask role assignment: {{subtaskName}}',
      bodyTemplate:
        'You were assigned as {{roleLabel}} on subtask {{subtaskName}} ({{projectCode}}).',
    },
  ];

  for (const tpl of templates) {
    await db.notificationTemplate.upsert({
      where: {
        companyId_eventType_channel: {
          companyId,
          eventType: tpl.eventType,
          channel: NotificationChannel.IN_APP,
        },
      },
      update: {
        subjectTemplate: tpl.subjectTemplate,
        bodyTemplate: tpl.bodyTemplate,
        isActive: true,
        updatedBy: adminUserId,
      },
      create: {
        companyId,
        eventType: tpl.eventType,
        channel: NotificationChannel.IN_APP,
        subjectTemplate: tpl.subjectTemplate,
        bodyTemplate: tpl.bodyTemplate,
        isActive: true,
        createdBy: adminUserId,
        updatedBy: adminUserId,
      },
    });
  }

  console.log('  ✓ Comment 8 notification templates (discipline lead + subtask role)');
}

/**
 * Patches project department FKs for department-leader scoping walkthrough.
 */
async function patchProjectDepartments(ctx: PmSeedContext): Promise<void> {
  const { prisma: db, companyId, adminUserId } = ctx;

  for (const spec of Object.values(WALKTHROUGH_PROJECTS)) {
    await db.project.updateMany({
      where: { companyId, projectCode: spec.code, deletedAt: null },
      data: { departmentId: spec.departmentId, updatedBy: adminUserId },
    });
  }

  console.log('  ✓ Project department FKs: LJZ/DEMO-001 → MTD, PDR/DEMO-002 → ADD');
}

/**
 * Ensures discipline-lead FK is set on all LJZ task disciplines for My Work.
 */
async function reinforceDisciplineLeads(ctx: PmSeedContext): Promise<void> {
  const { prisma: db, adminUserId } = ctx;
  const taskId = sid(WALKTHROUGH_PROJECTS.ljz.index, 30);

  await db.taskDiscipline.updateMany({
    where: { taskId, deletedAt: null },
    data: {
      disciplineLeadUserId: U.lead,
      designerUserId: U.designer,
      supportingDesignerUserId: U.supportingDesigner,
      ownerUserId: U.owner,
      reviewerUserId: U.reviewer,
      chiefUserId: U.deptChief,
      instituteChiefUserId: U.instituteChief,
      updatedBy: adminUserId,
    },
  });
}

function printWalkthroughSummary(): void {
  console.log(
    '\n=== Comment 8 Walkthrough - Demo Accounts (password: (from SEED_ADMIN_PASSWORD)) ===',
  );
  console.table([
    { account: 'admin@company.local', focus: 'Settings → Departments, Disciplines, full access' },
    { account: 'pm@company.local', focus: 'LJZ-2024-001 project hub, schedule, exports' },
    { account: 'demo.seed.designer@company.local', focus: 'My Work → subtask designer; LJZ subtasks' },
    { account: 'demo.seed.dispatcher@company.local', focus: 'My Work → dispatcher on LJZ flagship task' },
    { account: 'lead@company.local', focus: 'My Work → discipline lead on LJZ disciplines' },
    { account: 'reviewer@company.local', focus: 'Review inbox + subtask reviewer role' },
    { account: 'owner@company.local', focus: 'Owner tier - PDR-2025-003; ADD dept leader' },
    { account: 'deptchief@company.local', focus: 'Dept chief tier - DEMO-002; MTD dept leader (LJZ only)' },
    { account: 'deputychief@company.local', focus: 'Deputy chief subtask role on LJZ packages' },
    { account: 'demo.seed.institute@company.local', focus: 'Institute tier - LJZ; supervising chief on task' },
    { account: 'demo.seed.gm@company.local', focus: 'Executive portfolio + LJZ team member' },
    { account: 'engineer@company.local', focus: 'Site PM data - RFIs, daily logs on LJZ' },
    { account: 'docs@company.local', focus: 'Document control folders on LJZ' },
    { account: 'safety@company.local', focus: 'Safety inspections on demo projects' },
    { account: 'sitecoord@company.local', focus: 'Site coordination on DEMO projects' },
    { account: 'consultant@company.local', focus: 'Client consultant on project teams' },
  ]);
  console.log('  Guide: docs/COMMENT8_WALKTHROUGH.md');
}

/**
 * Post-processes rich demo data for Comment 8 (departments, task fields, subtask roles, My Work).
 */
export async function seedComment8Walkthrough(ctx: PmSeedContext): Promise<void> {
  console.log('\nSeeding Comment 8 walkthrough data...');

  await ensureHrDepartments(ctx);
  await patchProjectDepartments(ctx);
  await patchLjzFlagshipTask(ctx);
  await linkTaskDisciplineCatalog(ctx, WALKTHROUGH_PROJECTS.ljz.index);
  await linkTaskDisciplineCatalog(ctx, WALKTHROUGH_PROJECTS.pdr.index);
  await reinforceDisciplineLeads(ctx);

  const ljzTaskId = sid(WALKTHROUGH_PROJECTS.ljz.index, 30);
  const pdrTaskId = sid(WALKTHROUGH_PROJECTS.pdr.index, 30);
  const ljzPackages = await patchSubtaskRolesForTask(ctx, ljzTaskId);
  const pdrPackages = await patchSubtaskRolesForTask(ctx, pdrTaskId);

  await ensureLjzWorkflowTeam(ctx);
  await assignUserEngineeringDisciplines(ctx);
  await seedComment8NotificationTemplates(ctx);

  console.log(`  ✓ Subtask roles on ${ljzPackages} LJZ + ${pdrPackages} PDR design packages`);
  printWalkthroughSummary();
}
