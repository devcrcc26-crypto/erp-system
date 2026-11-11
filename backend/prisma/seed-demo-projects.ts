import {
  AuditLogSource,
  CommentSeverity,
  CommentStatus,
  DeliverableStatus,
  DesignPackageDependencyType,
  DesignPackageProjectedStatus,
  DesignPackageStatus,
  EdvStatus,
  EngineeringDocumentType,
  ExternalReviewTriggerStatus,
  ExternalReviewTriggerType,
  FolderContextType,
  NotificationChannel,
  NotificationStatus,
  Prisma,
  PrismaClient,
  ProjectChangeRequestSource,
  ProjectChangeRequestStatus,
  ProjectContractType,
  ProjectStatus,
  ProjectType,
  RfiPriority,
  RfiStatus,
  MilestoneStatus,
  TaskStatus,
  ReviewSessionOutcome,
  ReviewSessionStatus,
  ReviewTier,
  RiskStatus,
  SubmittalItemType,
  TaskAttributes,
  TaskDisciplineProjectedStatus,
  TaskDisciplineReviewStatus,
  WorkflowEntityType,
  WorkflowEventPhase,
} from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { clearAllProjectData } from './clear-pm-data';
import { createSeedPdfFiles, type SeedPdfEntry } from './seed-files/create-seed-pdfs';
import { uploadAllSeedFilesToMinio } from './seed-files/upload-seed-files-to-storage';
import { sid } from './seed-epc-demo';
import {
  type DemoProjectDef,
  type PmSeedContext,
  seedLocalizedNames,
  seedDemoUsers,
  seedProjectBundle,
} from './seed-pm-demo';
import { buildPmSeedContextFromDb } from './seed-project-full';
import { seedRichProjectAssets } from './seed-demo-rich-assets';
import { computeRequiredTiers } from '../src/modules/project-management/domain/required-tiers.util';

const prisma = new PrismaClient();

/** Demo user IDs (080–08a from seed-pm-demo). */
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

const ALL_DEMO_USER_IDS: string[] = Object.values(U);

const TASK_ATTRIBUTES_CYCLE: TaskAttributes[] = [
  'CHINA',
  'ETHIOPIA',
  'COMBINE1',
  'COMBINE2',
];

const PROJECT_1_DEF: DemoProjectDef = {
  index: 10,
  code: 'ZMC-2023-002',
  name: 'Zhongshan Medical Centre - Phase 2 Expansion',
  nameZh: '中山医疗中心二期扩建',
  location: 'Zhongshan, Guangdong',
  projectType: ProjectType.COMMERCIAL,
  status: ProjectStatus.COMPLETED,
  budget: 68_500_000,
  startDate: '2023-03-01',
  plannedFinishDate: '2025-06-30',
  actualFinishDate: '2025-05-28',
  contractType: ProjectContractType.CONTRACT,
  grossFloorAreaM2: 112_000,
  designProperties: 'IMPLEMENTATION_DB' as const,
  designStage: 'AS_BUILT_DRAWINGS',
};

const PROJECT_2_DEF: DemoProjectDef = {
  index: 11,
  code: 'LJZ-2024-001',
  name: 'Lujiazui Mixed-Use Tower',
  nameZh: '陆家嘴综合用途塔楼',
  location: 'Lujiazui, Shanghai',
  projectType: ProjectType.COMMERCIAL,
  status: ProjectStatus.IN_PROGRESS,
  budget: 142_000_000,
  startDate: '2024-04-15',
  plannedFinishDate: '2027-12-31',
  contractType: ProjectContractType.CONTRACT,
  grossFloorAreaM2: 198_500,
  designProperties: 'IMPLEMENTATION_DB' as const,
  designStage: 'DETAILED_DESIGN_DD',
};

const PROJECT_3_DEF: DemoProjectDef = {
  index: 12,
  code: 'PDR-2025-003',
  name: 'Pudong Residential Complex - Block C',
  nameZh: '浦东住宅综合体C栋',
  location: 'Pudong, Shanghai',
  projectType: ProjectType.RESIDENTIAL,
  status: ProjectStatus.IN_PROGRESS,
  budget: 38_750_000,
  startDate: '2025-11-01',
  plannedFinishDate: '2028-04-30',
  contractType: ProjectContractType.CONTRACT,
  grossFloorAreaM2: 48_200,
  designProperties: 'IMPLEMENTATION_DBB' as const,
  designStage: 'PRELIMINARY_DESIGN_PD',
};

let pdfRegistry: Map<string, SeedPdfEntry> = new Map();

function d(iso: string): Date {
  return new Date(iso);
}

function slaDaysFromNow(days: number): Date {
  const deadline = new Date();
  deadline.setDate(deadline.getDate() + days);
  return deadline;
}

function pdfSize(fileKey: string, fallback = 256_000): number {
  return pdfRegistry.get(fileKey)?.fileSizeBytes ?? fallback;
}

interface DisciplineSeedInput {
  id: string;
  taskId: string;
  disciplineName: string;
  projectedStatus: TaskDisciplineProjectedStatus;
  designerUserId?: string;
  supportingDesignerUserId?: string;
  ownerUserId?: string;
  reviewerUserId?: string;
  disciplineLeadUserId?: string;
  chiefUserId?: string;
  instituteChiefUserId?: string;
  designerName?: string;
  reviewerName?: string;
  disciplinaryLeader?: string;
  deptChiefEngineer?: string;
  disciplineOwnerName?: string;
  actualCompletionTime?: Date;
  isClosed?: boolean;
  closedAt?: Date;
  closedBy?: string;
}

async function ensureExtraUsers(ctx: PmSeedContext): Promise<void> {
  const { prisma: db, companyId, branchId, departmentId, positionId, adminUserId, defaultPassword, roleMap } =
    ctx;
  const passwordHash = await bcrypt.hash(defaultPassword, 12);

  const extras: Array<{
    id: string;
    email: string;
    firstName: string;
    lastName: string;
    roleName: string;
    phone: string;
  }> = [
    {
      id: U.designer,
      email: 'demo.seed.designer@company.local',
      firstName: 'Wei',
      lastName: 'Chen',
      roleName: 'Designer',
      phone: '+86-138-0000-0001',
    },
    {
      id: U.supportingDesigner,
      email: 'demo.seed.supporting@company.local',
      firstName: 'Mei',
      lastName: 'Lin',
      roleName: 'Designer',
      phone: '+86-138-0000-0002',
    },
    {
      id: U.dispatcher,
      email: 'demo.seed.dispatcher@company.local',
      firstName: 'Jun',
      lastName: 'Wang',
      roleName: 'Dispatcher',
      phone: '+86-138-0000-0003',
    },
    {
      id: U.instituteChief,
      email: 'demo.seed.institute@company.local',
      firstName: 'Li',
      lastName: 'Zhang',
      roleName: 'Institute Chief',
      phone: '+86-138-0000-0004',
    },
    {
      id: U.generalManager,
      email: 'demo.seed.gm@company.local',
      firstName: 'David',
      lastName: 'Wu',
      roleName: 'General Manager',
      phone: '+86-138-0000-0005',
    },
  ];

  for (const user of extras) {
    const roleId = roleMap.get(user.roleName);
    if (!roleId) {
      throw new Error(`Missing role for extra demo user: ${user.roleName}`);
    }

    const row = await db.user.upsert({
      where: { id: user.id },
      update: {
        email: user.email,
        passwordHash,
        firstName: user.firstName,
        lastName: user.lastName,
        phone: user.phone,
        updatedBy: adminUserId,
      },
      create: {
        id: user.id,
        companyId,
        branchId,
        departmentId,
        positionId,
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        phone: user.phone,
        passwordHash,
        emailVerifiedAt: new Date(),
        isActive: true,
        createdBy: adminUserId,
        updatedBy: adminUserId,
      },
    });

    await db.userRole.upsert({
      where: { userId_roleId: { userId: row.id, roleId } },
      update: {},
      create: {
        userId: row.id,
        roleId,
        assignedBy: adminUserId,
        createdBy: adminUserId,
        updatedBy: adminUserId,
      },
    });
  }

  console.log('✓ Created extra demo users (designer, supporting designer, dispatcher, institute chief, GM)');
}

type ProjectLifecycle = 'closed' | 'mid' | 'early';

/**
 * Extends seedProjectBundle with additional milestones, tasks, dependencies, RFIs, and team members.
 */
async function seedExtendedProjectData(
  ctx: PmSeedContext,
  p: number,
  projectId: string,
  projectCode: string,
  lifecycle: ProjectLifecycle,
): Promise<void> {
  const { prisma: db, companyId, adminUserId } = ctx;
  const prefix = projectCode.replace(/-/g, '');

  const milestoneDefs: Array<{
    entity: number;
    name: string;
    plannedDate: string;
    actualDate?: string;
    status: MilestoneStatus;
  }> = [
    { entity: 22, name: 'Design Development Complete', plannedDate: '2025-09-30', status: 'PLANNED' },
    { entity: 23, name: 'Topping Out', plannedDate: '2026-06-30', status: 'PLANNED' },
    { entity: 24, name: 'MEP Testing & Commissioning', plannedDate: '2027-03-31', status: 'PLANNED' },
  ];

  if (lifecycle === 'closed') {
    milestoneDefs[0].status = 'ACHIEVED';
    milestoneDefs[0].actualDate = '2025-09-15';
    milestoneDefs[1].status = 'ACHIEVED';
    milestoneDefs[1].actualDate = '2026-05-20';
    milestoneDefs[2].status = 'ACHIEVED';
    milestoneDefs[2].actualDate = '2027-02-28';
  } else if (lifecycle === 'mid') {
    milestoneDefs[0].status = 'ACHIEVED';
    milestoneDefs[0].actualDate = '2025-08-20';
    milestoneDefs[1].status = 'IN_PROGRESS';
    milestoneDefs[2].status = 'PLANNED';
  }

  for (const ms of milestoneDefs) {
    await db.milestone.upsert({
      where: { id: sid(p, ms.entity) },
      update: {
        name: ms.name,
        status: ms.status,
        actualDate: ms.actualDate ? d(ms.actualDate) : null,
        updatedBy: adminUserId,
      },
      create: {
        id: sid(p, ms.entity),
        projectId,
        name: ms.name,
        plannedDate: d(ms.plannedDate),
        actualDate: ms.actualDate ? d(ms.actualDate) : undefined,
        status: ms.status,
        createdBy: adminUserId,
        updatedBy: adminUserId,
      },
    });
  }

  const parentTaskId = sid(p, 33);
  await db.task.upsert({
    where: { id: parentTaskId },
    update: { updatedBy: adminUserId },
    create: {
      id: parentTaskId,
      projectId,
      milestoneId: sid(p, 22),
      dispatcherUserId: U.dispatcher,
      taskIdCode: `${prefix}-T300`,
      ...seedLocalizedNames('Design coordination package', '设计协调包'),
      description: 'Parent task grouping all discipline design deliverables.',
      startDate: d('2025-01-15'),
      finishDate: d('2026-12-31'),
      durationDays: 500,
      progressPct: lifecycle === 'closed' ? 100 : lifecycle === 'mid' ? 55 : 10,
      status: lifecycle === 'closed' ? TaskStatus.COMPLETED : lifecycle === 'mid' ? TaskStatus.IN_PROGRESS : TaskStatus.NOT_STARTED,
      isCritical: true,
      commissioningMethod: 'Joint commissioning with client',
      requiresArchiving: true,
      taskAttributes: 'COMBINE1',
      onSiteReceivingTime: d('2025-02-01'),
      assignmentToHqTime: d('2025-02-05'),
      contactFormNumber: `CF-${prefix}-001`,
      designStage: 'DETAILED_DESIGN_DD',
      urgencyLevel: 'NORMAL',
      hasCustomSchedule: true,
      language: 'ENGLISH',
      approvalLevel: 'DESIGN_INSTITUTE_REVIEW',
      actualCompletionTime: lifecycle === 'closed' ? d('2026-11-30') : undefined,
      actualWorkdays: lifecycle === 'closed' ? 420 : lifecycle === 'mid' ? 210 : undefined,
      completionStatus: lifecycle === 'closed' ? 'AHEAD' : lifecycle === 'mid' ? 'NORMAL' : undefined,
      remark: 'Coordinated through HQ design centre.',
      createdBy: adminUserId,
      updatedBy: adminUserId,
    },
  });

  const childTaskStatuses: TaskStatus[] =
    lifecycle === 'closed'
      ? ['COMPLETED', 'COMPLETED', 'COMPLETED', 'COMPLETED', 'COMPLETED', 'COMPLETED', 'COMPLETED', 'COMPLETED', 'COMPLETED', 'COMPLETED']
      : lifecycle === 'mid'
        ? ['COMPLETED', 'COMPLETED', 'COMPLETED', 'IN_PROGRESS', 'IN_PROGRESS', 'IN_PROGRESS', 'IN_PROGRESS', 'IN_PROGRESS', 'NOT_STARTED', 'NOT_STARTED']
        : ['NOT_STARTED', 'NOT_STARTED', 'NOT_STARTED', 'NOT_STARTED', 'NOT_STARTED', 'NOT_STARTED', 'NOT_STARTED', 'NOT_STARTED', 'NOT_STARTED', 'IN_PROGRESS'];

  const childNamesZh = [
    '岩土勘察',
    '地下室开挖',
    '核心筒施工',
    '幕墙安装',
    '十层机电预埋',
    '消防系统测试',
    '大堂室内装修',
    '景观硬质铺装',
    '一期调试',
    '竣工图编制',
  ];

  const childNames = [
    'Geotechnical investigation',
    'Basement excavation',
    'Core wall construction',
    'Curtain wall installation',
    'MEP rough-in level 10',
    'Fire protection testing',
    'Interior fit-out lobby',
    'Landscape hardscape',
    'Commissioning phase 1',
    'As-built documentation',
  ];

  for (let i = 0; i < childNames.length; i += 1) {
    const entity = 34 + i;
    const status = childTaskStatuses[i] ?? TaskStatus.NOT_STARTED;
    const progress =
      status === TaskStatus.COMPLETED ? 100 : status === TaskStatus.IN_PROGRESS ? 35 + i * 5 : 0;

    await db.task.upsert({
      where: { id: sid(p, entity) },
      update: { status, progressPct: progress, updatedBy: adminUserId },
      create: {
        id: sid(p, entity),
        projectId,
        parentTaskId,
        milestoneId: i < 3 ? sid(p, 20) : sid(p, 21),
        dispatcherUserId: U.dispatcher,
        taskIdCode: `${prefix}-T${310 + i}`,
        ...seedLocalizedNames(childNames[i], childNamesZh[i]),
        description: `${childNames[i]} for ${projectCode}.`,
        startDate: d('2025-03-01'),
        finishDate: d('2027-06-30'),
        durationDays: 90 + i * 10,
        progressPct: progress,
        status,
        isCritical: i < 3,
        commissioningMethod: i > 7 ? 'Witness testing' : 'Standard',
        requiresArchiving: i > 8,
        taskAttributes: TASK_ATTRIBUTES_CYCLE[Math.floor(i / 3) % TASK_ATTRIBUTES_CYCLE.length]!,
        contactFormNumber: `CF-${prefix}-${String(i + 2).padStart(3, '0')}`,
        designStage: i < 4 ? 'CONSTRUCTION_SUPPORT' : 'AS_BUILT_DRAWINGS',
        urgencyLevel: i === 3 ? 'URGENT' : 'NORMAL',
        hasCustomSchedule: i % 2 === 0,
        language: i % 3 === 0 ? 'ENGLISH' : 'CHINESE',
        approvalLevel: i > 5 ? 'COMPANY_REVIEW' : 'DESIGN_INSTITUTE_REVIEW',
        actualCompletionTime: status === TaskStatus.COMPLETED ? d('2026-08-15') : undefined,
        actualWorkdays: status === TaskStatus.COMPLETED ? 75 + i : undefined,
        completionStatus: status === TaskStatus.COMPLETED ? 'NORMAL' : status === TaskStatus.IN_PROGRESS ? 'BEHIND' : undefined,
        remark: `Child task ${i + 1} notes.`,
        createdBy: adminUserId,
        updatedBy: adminUserId,
      },
    });
  }

  const depPairs: Array<[number, number, number]> = [
    [34, 35, 350],
    [35, 36, 351],
    [36, 37, 352],
  ];
  for (const [pred, succ, depEntity] of depPairs) {
    await db.taskDependency.upsert({
      where: { id: sid(p, depEntity) },
      update: {},
      create: {
        id: sid(p, depEntity),
        predecessorTaskId: sid(p, pred),
        successorTaskId: sid(p, succ),
        dependencyType: 'FS',
        lagDays: 3,
        createdBy: adminUserId,
      },
    });
  }

  const rfiDefs: Array<{
    entity: number;
    number: string;
    title: string;
    status: RfiStatus;
    priority: RfiPriority;
    response?: boolean;
  }> = [
    { entity: 43, number: '003', title: 'Facade anchor bolt embedment depth', status: 'CLOSED', priority: 'MEDIUM', response: true },
    { entity: 44, number: '004', title: 'Elevator pit waterproofing detail', status: 'DRAFT', priority: 'LOW' },
    { entity: 45, number: '005', title: 'Roof drainage capacity verification', status: 'SUBMITTED', priority: 'HIGH' },
  ];

  if (lifecycle === 'mid') {
    rfiDefs[0].status = 'CLOSED';
    rfiDefs[1].status = 'DRAFT';
    rfiDefs[2].status = 'UNDER_REVIEW';
  } else if (lifecycle === 'early') {
    rfiDefs[0].status = 'DRAFT';
    rfiDefs[1].status = 'DRAFT';
    rfiDefs[2].status = 'DRAFT';
  }

  for (const rfi of rfiDefs) {
    await db.rfi.upsert({
      where: { id: sid(p, rfi.entity) },
      update: { status: rfi.status, updatedBy: adminUserId },
      create: {
        id: sid(p, rfi.entity),
        companyId,
        projectId,
        raisedBy: U.engineer,
        assignedTo: U.pm,
        rfiNumber: `RFI-${prefix}-${rfi.number}`,
        title: rfi.title,
        description: `${rfi.title} - clarification required for ${projectCode}.`,
        discipline: 'Structural',
        priority: rfi.priority,
        status: rfi.status,
        dateRaised: d('2026-01-10'),
        dueDate: d('2026-02-10'),
        dateAnswered: rfi.response ? d('2026-01-25') : undefined,
        sourceEntityType: 'meeting',
        sourceEntityId: sid(p, 80),
        createdBy: adminUserId,
        updatedBy: adminUserId,
      },
    });

    if (rfi.response) {
      await db.rfiResponse.upsert({
        where: { id: sid(p, rfi.entity + 100) },
        update: {},
        create: {
          id: sid(p, rfi.entity + 100),
          rfiId: sid(p, rfi.entity),
          respondedBy: U.pm,
          responseText: `Approved detail per drawing revision. Reference ${projectCode}-STR-Rev-C.`,
          respondedAt: d('2026-01-25'),
        },
      });
    }
  }

  await db.projectTeam.upsert({
    where: { id: sid(p, 9) },
    update: { updatedBy: adminUserId },
    create: {
      id: sid(p, 9),
      projectId,
      userId: U.designer,
      roleOnProject: 'Designer',
      visibleModules: ['schedule', 'drawings', 'design_packages', 'engineering_documents'],
      createdBy: adminUserId,
      updatedBy: adminUserId,
    },
  });

  await db.projectTeam.upsert({
    where: { id: sid(p, 150) },
    update: { updatedBy: adminUserId },
    create: {
      id: sid(p, 150),
      projectId,
      userId: U.generalManager,
      roleOnProject: 'Executive Sponsor',
      visibleModules: ['projects', 'reports', 'risks', 'meetings'],
      createdBy: adminUserId,
      updatedBy: adminUserId,
    },
  });

  console.log(`✓ Created extended schedule, RFIs, and team for ${projectCode}`);
}

async function seedNestedDocumentFolders(
  ctx: PmSeedContext,
  p: number,
  projectId: string,
  projectCode: string,
): Promise<void> {
  const { prisma: db, companyId, adminUserId } = ctx;
  const rootFolderId = sid(p, 10);

  const subfolders: Array<{
    entity: number;
    name: string;
    contextType: FolderContextType;
    contextId: string | null;
    parentId: string;
  }> = [
    {
      entity: 15,
      name: 'Contracts',
      contextType: FolderContextType.PROJECT,
      contextId: projectId,
      parentId: rootFolderId,
    },
    {
      entity: 16,
      name: 'Design',
      contextType: FolderContextType.PROJECT,
      contextId: projectId,
      parentId: rootFolderId,
    },
    {
      entity: 17,
      name: 'Site Records',
      contextType: FolderContextType.PROJECT,
      contextId: projectId,
      parentId: rootFolderId,
    },
    {
      entity: 18,
      name: 'RFI Attachments',
      contextType: FolderContextType.RFI,
      contextId: sid(p, 40),
      parentId: rootFolderId,
    },
    {
      entity: 19,
      name: 'Closeout Archive',
      contextType: FolderContextType.PROJECT,
      contextId: projectId,
      parentId: rootFolderId,
    },
  ];

  for (const folder of subfolders) {
    await db.documentFolder.upsert({
      where: { id: sid(p, folder.entity) },
      update: { name: folder.name, updatedBy: adminUserId },
      create: {
        id: sid(p, folder.entity),
        companyId,
        parentId: folder.parentId,
        name: folder.name,
        path: `/projects/${projectId}/${folder.name.toLowerCase().replace(/\s+/g, '-')}`,
        contextType: folder.contextType,
        contextId: folder.contextId,
        isSystem: false,
        createdBy: adminUserId,
        updatedBy: adminUserId,
      },
    });
  }

  const nestedDocId = sid(p, 140);
  const fileKey = `demo/${projectCode}/Closeout-Handover-Pack.pdf`;
  await db.document.upsert({
    where: { id: nestedDocId },
    update: { fileKey, fileSizeBytes: pdfSize(fileKey), updatedBy: adminUserId },
    create: {
      id: nestedDocId,
      folderId: sid(p, 19),
      companyId,
      name: 'Closeout Handover Pack.pdf',
      fileKey,
      fileType: 'application/pdf',
      fileSizeBytes: pdfSize(fileKey),
      version: 1,
      isCurrent: true,
      createdBy: adminUserId,
      updatedBy: adminUserId,
    },
  });

  await db.documentVersion.upsert({
    where: { id: sid(p, 141) },
    update: {},
    create: {
      id: sid(p, 141),
      documentId: nestedDocId,
      uploadedBy: adminUserId,
      versionNumber: 1,
      fileKey,
      fileSizeBytes: pdfSize(fileKey),
      changeNote: 'Nested folder closeout reference document',
    },
  });

  console.log(`✓ Created nested document folders for ${projectCode}`);
}

async function seedTaskDisciplineRow(
  ctx: PmSeedContext,
  input: DisciplineSeedInput,
): Promise<string[]> {
  const { prisma: db, companyId, adminUserId } = ctx;

  await db.taskDiscipline.upsert({
    where: { id: input.id },
    update: {
      disciplineName: input.disciplineName,
      projectedStatus: input.projectedStatus,
      designerUserId: input.designerUserId ?? null,
      supportingDesignerUserId: input.supportingDesignerUserId ?? null,
      ownerUserId: input.ownerUserId ?? null,
      reviewerUserId: input.reviewerUserId ?? null,
      disciplineLeadUserId: input.disciplineLeadUserId ?? null,
      chiefUserId: input.chiefUserId ?? null,
      instituteChiefUserId: input.instituteChiefUserId ?? null,
      designerName: input.designerName ?? null,
      reviewerName: input.reviewerName ?? null,
      disciplinaryLeader: input.disciplinaryLeader ?? null,
      deptChiefEngineer: input.deptChiefEngineer ?? null,
      disciplineOwnerName: input.disciplineOwnerName ?? null,
      actualCompletionTime: input.actualCompletionTime ?? null,
      isClosed: input.isClosed ?? false,
      closedAt: input.closedAt ?? null,
      closedBy: input.closedBy ?? null,
      updatedBy: adminUserId,
    },
    create: {
      id: input.id,
      taskId: input.taskId,
      companyId,
      disciplineName: input.disciplineName,
      projectedStatus: input.projectedStatus,
      designerName: input.designerName ?? 'Wei Chen',
      disciplineOwnerName: input.disciplineOwnerName ?? 'Hassan Al-Rashid',
      reviewerName: input.reviewerName ?? 'Nadia Saleh',
      disciplinaryLeader: input.disciplinaryLeader ?? 'Khalid Nasser',
      deptChiefEngineer: input.deptChiefEngineer ?? 'Rania Aziz',
      designerUserId: input.designerUserId ?? U.designer,
      supportingDesignerUserId: input.supportingDesignerUserId ?? U.supportingDesigner,
      ownerUserId: input.ownerUserId ?? U.owner,
      reviewerUserId: input.reviewerUserId ?? U.reviewer,
      disciplineLeadUserId: input.disciplineLeadUserId ?? U.lead,
      chiefUserId: input.chiefUserId ?? U.deptChief,
      instituteChiefUserId: input.instituteChiefUserId ?? U.instituteChief,
      actualCompletionTime: input.actualCompletionTime,
      isClosed: input.isClosed ?? false,
      closedAt: input.closedAt,
      closedBy: input.closedBy,
      createdBy: adminUserId,
      updatedBy: adminUserId,
    },
  });

  const tiers = computeRequiredTiers({
    designerUserId: input.designerUserId ?? U.designer,
    supportingDesignerUserId: input.supportingDesignerUserId ?? U.supportingDesigner,
    ownerUserId: input.ownerUserId ?? U.owner,
    reviewerUserId: input.reviewerUserId ?? U.reviewer,
    disciplineLeadUserId: input.disciplineLeadUserId ?? U.lead,
    chiefUserId: input.chiefUserId ?? U.deptChief,
    instituteChiefUserId: input.instituteChiefUserId ?? U.instituteChief,
  });

  return tiers;
}

interface EdvSeedSpec {
  edvId: string;
  engDocId: string;
  docVersionId: string;
  documentId: string;
  projectCode: string;
  fileName: string;
  docNumber: string;
  title: string;
  revisionLabel: string;
  status: EdvStatus;
  versionNumber: number;
  isCurrent?: boolean;
}

async function seedEdvChain(
  ctx: PmSeedContext,
  p: number,
  disciplineId: string,
  spec: EdvSeedSpec,
): Promise<void> {
  const { prisma: db, companyId, adminUserId } = ctx;
  const fileKey = `demo/${spec.projectCode}/${spec.fileName}`;

  await db.document.upsert({
    where: { id: spec.documentId },
    update: {
      fileKey,
      fileType: 'application/pdf',
      fileSizeBytes: pdfSize(fileKey),
      version: spec.versionNumber,
      updatedBy: adminUserId,
    },
    create: {
      id: spec.documentId,
      folderId: sid(p, 16),
      companyId,
      name: spec.fileName,
      fileKey,
      fileType: 'application/pdf',
      fileSizeBytes: pdfSize(fileKey),
      version: spec.versionNumber,
      isCurrent: true,
      createdBy: adminUserId,
      updatedBy: adminUserId,
    },
  });

  await db.documentVersion.upsert({
    where: { id: spec.docVersionId },
    update: {
      fileKey,
      fileSizeBytes: pdfSize(fileKey),
    },
    create: {
      id: spec.docVersionId,
      documentId: spec.documentId,
      uploadedBy: U.designer,
      versionNumber: spec.versionNumber,
      fileKey,
      fileSizeBytes: pdfSize(fileKey),
      changeNote: `${spec.title} - ${spec.revisionLabel}`,
    },
  });

  await db.engineeringDocument.upsert({
    where: { id: spec.engDocId },
    update: { title: spec.title, updatedBy: adminUserId },
    create: {
      id: spec.engDocId,
      companyId,
      taskDisciplineId: disciplineId,
      documentType: EngineeringDocumentType.DRAWING,
      documentNumber: spec.docNumber,
      title: spec.title,
      metadata: { sheet: spec.docNumber, discipline: disciplineId },
      createdBy: adminUserId,
      updatedBy: adminUserId,
    },
  });

  await db.engineeringDocumentVersion.upsert({
    where: { id: spec.edvId },
    update: {
      status: spec.status,
      isCurrent: spec.isCurrent ?? spec.status !== EdvStatus.SUPERSEDED,
      updatedBy: adminUserId,
    },
    create: {
      id: spec.edvId,
      companyId,
      engineeringDocumentId: spec.engDocId,
      documentVersionId: spec.docVersionId,
      revisionLabel: spec.revisionLabel,
      status: spec.status,
      isCurrent: spec.isCurrent ?? spec.status !== EdvStatus.SUPERSEDED,
      createdBy: adminUserId,
      updatedBy: adminUserId,
    },
  });
}

interface PackageSeedSpec {
  packageId: string;
  disciplineId: string;
  name: string;
  projectedStatus: DesignPackageProjectedStatus;
  packageStatus: DesignPackageStatus;
  requiredTiers: ReviewTier[];
  edvIds: string[];
  itemEntityStart: number;
  submittedAt?: string;
  approvedAt?: string;
  packageClosedAt?: string;
  packageClosedBy?: string;
  briefText?: string;
  sourceEntityType?: string;
  sourceEntityId?: string;
}

async function seedDesignPackageRow(
  ctx: PmSeedContext,
  p: number,
  projectCode: string,
  spec: PackageSeedSpec,
): Promise<void> {
  const { prisma: db, companyId, adminUserId } = ctx;
  const packageCode = `SUB-${parseInt(spec.packageId.slice(-12), 16)
    .toString()
    .padStart(5, '0')}`;

  await db.designPackage.upsert({
    where: { id: spec.packageId },
    update: {
      name: spec.name,
      projectedStatus: spec.projectedStatus,
      packageStatus: spec.packageStatus,
      requiredTiers: spec.requiredTiers,
      submittedAt: spec.submittedAt ? d(spec.submittedAt) : null,
      approvedAt: spec.approvedAt ? d(spec.approvedAt) : null,
      packageClosedAt: spec.packageClosedAt ? d(spec.packageClosedAt) : null,
      packageClosedBy: spec.packageClosedBy ?? null,
      briefText: spec.briefText ?? null,
      sourceEntityType: spec.sourceEntityType ?? null,
      sourceEntityId: spec.sourceEntityId ?? null,
      designerUserId: U.designer,
      supportingDesignerUserId: U.supportingDesigner,
      disciplineOwnerUserId: U.owner,
      reviewerUserId: U.reviewer,
      disciplinaryLeaderUserId: U.lead,
      deptDeputyChiefUserId: U.deputy,
      instituteChiefUserId: U.instituteChief,
      updatedBy: adminUserId,
    },
    create: {
      id: spec.packageId,
      packageCode,
      companyId,
      taskDisciplineId: spec.disciplineId,
      name: spec.name,
      projectedStatus: spec.projectedStatus,
      packageStatus: spec.packageStatus,
      requiredTiers: spec.requiredTiers,
      submittedAt: spec.submittedAt ? d(spec.submittedAt) : null,
      approvedAt: spec.approvedAt ? d(spec.approvedAt) : null,
      packageClosedAt: spec.packageClosedAt ? d(spec.packageClosedAt) : null,
      packageClosedBy: spec.packageClosedBy ?? null,
      briefText: spec.briefText ?? `${spec.name} review brief for ${projectCode}.`,
      sourceEntityType: spec.sourceEntityType ?? null,
      sourceEntityId: spec.sourceEntityId ?? null,
      designerUserId: U.designer,
      supportingDesignerUserId: U.supportingDesigner,
      disciplineOwnerUserId: U.owner,
      reviewerUserId: U.reviewer,
      disciplinaryLeaderUserId: U.lead,
      deptDeputyChiefUserId: U.deputy,
      instituteChiefUserId: U.instituteChief,
      createdBy: adminUserId,
      updatedBy: adminUserId,
    },
  });

  for (const [index, edvId] of spec.edvIds.entries()) {
    const itemId = sid(p, spec.itemEntityStart + index);
    await db.designPackageItem.upsert({
      where: { id: itemId },
      update: { sortOrder: index },
      create: {
        id: itemId,
        companyId,
        designPackageId: spec.packageId,
        engineeringDocumentVersionId: edvId,
        sortOrder: index,
        createdBy: adminUserId,
      },
    });
  }
}

async function seedReviewSessionRow(
  ctx: PmSeedContext,
  spec: {
    sessionId: string;
    snapshotId: string;
    packageId: string;
    disciplineId: string;
    status: ReviewSessionStatus;
    outcome: ReviewSessionOutcome;
    currentTier: ReviewTier;
    assignedToUserId: string;
    edvIds: string[];
    openedAt: string;
    closedAt?: string;
    closedReason?: string;
    slaDays?: number;
    createdBy?: string;
    updatedBy?: string;
  },
): Promise<void> {
  const { prisma: db, companyId, adminUserId } = ctx;

  await db.reviewSession.upsert({
    where: { id: spec.sessionId },
    update: {
      status: spec.status,
      outcome: spec.outcome,
      currentTier: spec.currentTier,
      assignedToUserId: spec.assignedToUserId,
      closedAt: spec.closedAt ? d(spec.closedAt) : null,
      closedReason: spec.closedReason ?? null,
      slaDeadlineAt: spec.slaDays !== undefined ? slaDaysFromNow(spec.slaDays) : null,
      updatedBy: spec.updatedBy ?? adminUserId,
    },
    create: {
      id: spec.sessionId,
      companyId,
      designPackageId: spec.packageId,
      taskDisciplineId: spec.disciplineId,
      status: spec.status,
      outcome: spec.outcome,
      currentTier: spec.currentTier,
      assignedToUserId: spec.assignedToUserId,
      openedAt: d(spec.openedAt),
      closedAt: spec.closedAt ? d(spec.closedAt) : null,
      closedReason: spec.closedReason ?? null,
      slaDeadlineAt: spec.slaDays !== undefined ? slaDaysFromNow(spec.slaDays) : null,
      createdBy: spec.createdBy ?? adminUserId,
      updatedBy: spec.updatedBy ?? adminUserId,
    },
  });

  await db.reviewContextSnapshot.upsert({
    where: { id: spec.snapshotId },
    update: {
      referencedVersionIds: spec.edvIds,
      contentHash: `snapshot-${spec.sessionId.slice(-8)}`,
    },
    create: {
      id: spec.snapshotId,
      companyId,
      reviewSessionId: spec.sessionId,
      referencedVersionIds: spec.edvIds,
      contentHash: `snapshot-${spec.sessionId.slice(-8)}`,
      capturedBy: spec.assignedToUserId,
    },
  });
}

async function seedReviewCommentRow(
  ctx: PmSeedContext,
  spec: {
    id: string;
    sessionId: string;
    edvId: string;
    body: string;
    severity: CommentSeverity;
    status: CommentStatus;
    assignedToUserId: string;
    createdBy: string;
    resolvedAt?: string;
    resolutionNote?: string;
    verifiedAt?: string;
    closedAt?: string;
  },
): Promise<void> {
  const { prisma: db, companyId } = ctx;

  await db.reviewComment.upsert({
    where: { id: spec.id },
    update: {
      body: spec.body,
      status: spec.status,
      resolutionNote: spec.resolutionNote ?? null,
      resolvedAt: spec.resolvedAt ? d(spec.resolvedAt) : null,
      verifiedAt: spec.verifiedAt ? d(spec.verifiedAt) : null,
      closedAt: spec.closedAt ? d(spec.closedAt) : null,
      updatedBy: spec.createdBy,
    },
    create: {
      id: spec.id,
      companyId,
      reviewSessionId: spec.sessionId,
      engineeringDocumentVersionId: spec.edvId,
      body: spec.body,
      severity: spec.severity,
      status: spec.status,
      assignedToUserId: spec.assignedToUserId,
      createdBy: spec.createdBy,
      resolvedAt: spec.resolvedAt ? d(spec.resolvedAt) : null,
      resolutionNote: spec.resolutionNote ?? null,
      verifiedAt: spec.verifiedAt ? d(spec.verifiedAt) : null,
      closedAt: spec.closedAt ? d(spec.closedAt) : null,
      updatedBy: spec.createdBy,
    },
  });
}

async function seedWorkflowEvents(
  ctx: PmSeedContext,
  events: Array<{
    id: string;
    entityType: WorkflowEntityType;
    entityId: string;
    actorId: string;
    action: string;
    phase: WorkflowEventPhase;
    createdAt: string;
    reason?: string;
  }>,
): Promise<void> {
  const { prisma: db, companyId } = ctx;

  for (const event of events) {
    await db.workflowEventLog.upsert({
      where: { id: event.id },
      update: {
        action: event.action,
        phase: event.phase,
        actorId: event.actorId,
        reason: event.reason ?? null,
      },
      create: {
        id: event.id,
        companyId,
        entityType: event.entityType,
        entityId: event.entityId,
        actorId: event.actorId,
        action: event.action,
        phase: event.phase,
        reason: event.reason ?? null,
        createdAt: d(event.createdAt),
      },
    });
  }
}

async function seedTaskDisciplineReviews(
  ctx: PmSeedContext,
  p: number,
  disciplineId: string,
  tiers: Array<{
    tier: ReviewTier;
    status: TaskDisciplineReviewStatus;
    reviewedBy?: string;
    reviewedAt?: string;
    notes?: string;
  }>,
  idEntityBase = 270,
): Promise<void> {
  const { prisma: db, companyId, adminUserId } = ctx;

  for (const [index, tierRow] of tiers.entries()) {
    await db.taskDisciplineReview.upsert({
      where: {
        taskDisciplineId_reviewTier: {
          taskDisciplineId: disciplineId,
          reviewTier: tierRow.tier,
        },
      },
      update: {
        status: tierRow.status,
        reviewedBy: tierRow.reviewedBy ?? null,
        reviewedAt: tierRow.reviewedAt ? d(tierRow.reviewedAt) : null,
        notes: tierRow.notes ?? null,
        updatedBy: adminUserId,
      },
      create: {
        id: sid(p, idEntityBase + index),
        companyId,
        taskDisciplineId: disciplineId,
        reviewTier: tierRow.tier,
        status: tierRow.status,
        reviewedBy: tierRow.reviewedBy ?? null,
        reviewedAt: tierRow.reviewedAt ? d(tierRow.reviewedAt) : null,
        notes: tierRow.notes ?? null,
        createdBy: adminUserId,
        updatedBy: adminUserId,
      },
    });
  }
}

async function seedPackageAttachment(
  ctx: PmSeedContext,
  p: number,
  entity: number,
  packageId: string,
  documentId: string,
  attachedBy: string,
  purpose: string,
  note: string,
): Promise<void> {
  const { prisma: db, companyId } = ctx;
  await db.designPackageAttachment.upsert({
    where: { id: sid(p, entity) },
    update: { purpose, note },
    create: {
      id: sid(p, entity),
      companyId,
      designPackageId: packageId,
      documentId,
      attachedBy,
      purpose,
      note,
    },
  });
}

async function seedSessionAttachment(
  ctx: PmSeedContext,
  p: number,
  entity: number,
  sessionId: string,
  documentId: string,
  tier: ReviewTier,
  attachedByUserId: string,
  purpose: string,
  note: string,
): Promise<void> {
  const { prisma: db, companyId } = ctx;
  await db.reviewSessionAttachment.upsert({
    where: { id: sid(p, entity) },
    update: { purpose, note },
    create: {
      id: sid(p, entity),
      companyId,
      reviewSessionId: sessionId,
      tier,
      attachedByUserId,
      documentId,
      purpose,
      note,
    },
  });
}

async function seedCrossCuttingPmData(
  ctx: PmSeedContext,
  p: number,
  projectId: string,
  projectCode: string,
  packageId: string,
  disciplineId: string,
  engDocId: string,
): Promise<void> {
  const { prisma: db, companyId, adminUserId } = ctx;

  await db.deliverable.upsert({
    where: { id: sid(p, 282) },
    update: {
      status: DeliverableStatus.IN_PROGRESS,
      updatedBy: adminUserId,
    },
    create: {
      id: sid(p, 282),
      companyId,
      projectId,
      taskDisciplineId: disciplineId,
      designPackageId: packageId,
      engineeringDocumentId: engDocId,
      name: `${projectCode} design deliverable bundle`,
      status: DeliverableStatus.IN_PROGRESS,
      dueDate: d('2026-09-30'),
      createdBy: adminUserId,
      updatedBy: adminUserId,
    },
  });

  await db.deliverable.upsert({
    where: { id: sid(p, 283) },
    update: {
      status: DeliverableStatus.SUBMITTED,
      updatedBy: adminUserId,
    },
    create: {
      id: sid(p, 283),
      companyId,
      projectId,
      taskDisciplineId: disciplineId,
      designPackageId: packageId,
      name: `${projectCode} coordination memo`,
      status: DeliverableStatus.SUBMITTED,
      dueDate: d('2026-08-15'),
      createdBy: adminUserId,
      updatedBy: adminUserId,
    },
  });

  await db.externalReviewTrigger.upsert({
    where: { id: sid(p, 284) },
    update: { status: ExternalReviewTriggerStatus.PROCESSED },
    create: {
      id: sid(p, 284),
      companyId,
      projectId,
      triggerType: ExternalReviewTriggerType.RFI,
      sourceEntityType: 'rfi',
      sourceEntityId: sid(p, 40),
      submittalId: sid(p, 50),
      submittalItemIds: [],
      linkedDesignPackageId: packageId,
      payload: { rfiNumber: `RFI-${projectCode.replace(/-/g, '')}-001`, projectCode },
      status: ExternalReviewTriggerStatus.PROCESSED,
      createdBy: adminUserId,
    },
  });

  await db.externalReviewTrigger.upsert({
    where: { id: sid(p, 285) },
    update: { status: ExternalReviewTriggerStatus.PENDING },
    create: {
      id: sid(p, 285),
      companyId,
      projectId,
      triggerType: ExternalReviewTriggerType.CHANGE_REQUEST,
      sourceEntityType: 'project_change_request',
      sourceEntityId: sid(p, 286),
      submittalItemIds: [],
      linkedDesignPackageId: packageId,
      payload: { changeNumber: `CR-${projectCode}-001` },
      status: ExternalReviewTriggerStatus.PENDING,
      createdBy: adminUserId,
    },
  });

  await db.projectChangeRequest.upsert({
    where: { id: sid(p, 286) },
    update: {
      status: ProjectChangeRequestStatus.SUBMITTED,
      updatedBy: adminUserId,
    },
    create: {
      id: sid(p, 286),
      companyId,
      projectId,
      changeNumber: `CR-${projectCode}-001`,
      title: 'Design coordination change from RFI response',
      description: 'Formalizes scope clarification raised during structural review.',
      status: ProjectChangeRequestStatus.SUBMITTED,
      sourceType: ProjectChangeRequestSource.RFI,
      sourceEntityId: sid(p, 40),
      externalReviewTriggerId: sid(p, 284),
      linkedDesignPackageId: packageId,
      originEntityType: 'rfi',
      originEntityId: sid(p, 40),
      createdBy: adminUserId,
      updatedBy: adminUserId,
    },
  });

  await db.projectChangeRequest.upsert({
    where: { id: sid(p, 287) },
    update: {
      status: ProjectChangeRequestStatus.APPROVED,
      updatedBy: adminUserId,
    },
    create: {
      id: sid(p, 287),
      companyId,
      projectId,
      changeNumber: `CR-${projectCode}-002`,
      title: 'Facade panel specification revision',
      description: 'Approved change to curtain wall anchor detail per consultant review.',
      status: ProjectChangeRequestStatus.APPROVED,
      sourceType: ProjectChangeRequestSource.MANUAL,
      linkedDesignPackageId: packageId,
      originEntityType: 'design_package',
      originEntityId: packageId,
      createdBy: adminUserId,
      updatedBy: adminUserId,
    },
  });

  await db.submittalItem.upsert({
    where: { id: sid(p, 56) },
    update: {
      snapshotCaptured: true,
      snapshotEdvIds: [sid(p, 502)],
      contentHash: `${projectCode}-submittal-snapshot-v1`,
      capturedAt: d('2026-03-12'),
      capturedBy: U.docs,
    },
    create: {
      id: sid(p, 56),
      companyId,
      submittalId: sid(p, 50),
      designPackageId: packageId,
      itemType: SubmittalItemType.DESIGN_PACKAGE,
      sortOrder: 0,
      snapshotCaptured: true,
      snapshotEdvIds: [sid(p, 502)],
      contentHash: `${projectCode}-submittal-snapshot-v1`,
      capturedAt: d('2026-03-12'),
      capturedBy: U.docs,
      createdBy: U.docs,
    },
  });

  console.log(`✓ Created deliverables, change requests, and external review triggers for ${projectCode}`);
}

async function seedAuditLogsForProject(
  ctx: PmSeedContext,
  p: number,
  projectId: string,
  projectCode: string,
): Promise<void> {
  const { prisma: db, companyId } = ctx;

  await db.auditLog.deleteMany({
    where: { companyId, correlationId: `seed-${projectCode}` },
  });

  const entries: Array<{
    entity: number;
    module: string;
    action: string;
    recordType: string;
    recordId: string;
    recordReference: string;
    userId: string;
    afterValue: Prisma.InputJsonValue;
  }> = [
    {
      entity: 1901,
      module: 'project-management',
      action: 'CREATE',
      recordType: 'Project',
      recordId: projectId,
      recordReference: projectCode,
      userId: U.pm,
      afterValue: { status: 'IN_PROGRESS' },
    },
    {
      entity: 1902,
      module: 'project-management',
      action: 'UPDATE',
      recordType: 'Task',
      recordId: sid(p, 30),
      recordReference: `${projectCode}-T100`,
      userId: U.dispatcher,
      afterValue: { progressPct: 65 },
    },
    {
      entity: 1903,
      module: 'documents',
      action: 'UPLOAD',
      recordType: 'Document',
      recordId: sid(p, 11),
      recordReference: 'Contract Agreement.pdf',
      userId: U.docs,
      afterValue: { version: 1 },
    },
    {
      entity: 1904,
      module: 'epc',
      action: 'SUBMIT_PACKAGE',
      recordType: 'DesignPackage',
      recordId: sid(p, 210),
      recordReference: `${projectCode}-PKG-CIVIL`,
      userId: U.designer,
      afterValue: { packageStatus: 'SUBMITTED' },
    },
    {
      entity: 1905,
      module: 'epc',
      action: 'APPROVE_SESSION',
      recordType: 'ReviewSession',
      recordId: sid(p, 220),
      recordReference: `${projectCode}-RS-001`,
      userId: U.lead,
      afterValue: { outcome: 'APPROVED' },
    },
    {
      entity: 1906,
      module: 'project-management',
      action: 'CREATE',
      recordType: 'Rfi',
      recordId: sid(p, 40),
      recordReference: `RFI-${projectCode}-001`,
      userId: U.engineer,
      afterValue: { priority: 'HIGH' },
    },
  ];

  for (const entry of entries) {
    await db.auditLog.create({
      data: {
        companyId,
        userId: entry.userId,
        source: AuditLogSource.USER_ACTION,
        module: entry.module,
        action: entry.action,
        recordType: entry.recordType,
        recordId: entry.recordId,
        recordReference: entry.recordReference,
        afterValue: entry.afterValue,
        ipAddress: '127.0.0.1',
        deviceInfo: 'seed-demo-projects',
        correlationId: `seed-${projectCode}`,
        batchId: `batch-${p}`,
      },
    });
  }

  console.log(`✓ Created audit logs for ${projectCode}`);
}

async function seedNotificationsForProject(
  ctx: PmSeedContext,
  p: number,
  projectCode: string,
): Promise<void> {
  const { prisma: db, companyId } = ctx;

  await db.notification.deleteMany({
    where: { companyId, subject: { contains: projectCode } },
  });

  const subjects = [
    'Review assigned',
    'Package submitted',
    'Comment requires response',
  ];

  let entityCounter = 950;
  for (const userId of ALL_DEMO_USER_IDS) {
    for (let i = 0; i < subjects.length; i += 1) {
      await db.notification.create({
        data: {
          companyId,
          recipientId: userId,
          channel: NotificationChannel.IN_APP,
          subject: `${subjects[i]} - ${projectCode}`,
          body: `Demo notification ${i + 1} for ${projectCode}. Action may be required on your review inbox.`,
          status: i === 0 ? NotificationStatus.SENT : NotificationStatus.PENDING,
          sentAt: i === 0 ? new Date() : null,
          readAt: null,
        },
      });
      entityCounter += 1;
    }
  }

  console.log(`✓ Created notifications (${subjects.length} per user) for ${projectCode}`);
}

async function removeCloseoutAndPunch(ctx: PmSeedContext, projectId: string): Promise<void> {
  const { prisma: db } = ctx;
  const closeout = await db.closeout.findUnique({ where: { projectId } });
  if (closeout) {
    await db.closeoutChecklistItem.deleteMany({ where: { closeoutId: closeout.id } });
    await db.warranty.deleteMany({ where: { closeoutId: closeout.id } });
    await db.closeout.delete({ where: { id: closeout.id } });
  }
  await db.punchItem.deleteMany({ where: { projectId } });
  console.log('✓ Removed closeout and punch items (early-stage project)');
}

async function finalizeClosedProject(ctx: PmSeedContext, p: number, def: DemoProjectDef): Promise<void> {
  const { prisma: db, adminUserId } = ctx;
  const projectId = sid(p, 1);

  await db.project.update({
    where: { id: projectId },
    data: {
      status: ProjectStatus.COMPLETED,
      actualFinishDate: d(def.actualFinishDate ?? def.plannedFinishDate),
      updatedBy: adminUserId,
    },
  });

  await db.task.updateMany({
    where: { projectId },
    data: { status: 'COMPLETED', progressPct: 100, updatedBy: adminUserId },
  });

  await db.milestone.updateMany({
    where: { projectId },
    data: { status: 'ACHIEVED', updatedBy: adminUserId },
  });

  await db.risk.updateMany({
    where: { projectId },
    data: {
      status: RiskStatus.CLOSED,
      mitigationPlan: 'Risk closed at project handover.',
      updatedBy: adminUserId,
    },
  });

  await db.rfi.updateMany({
    where: { projectId },
    data: { status: 'CLOSED', updatedBy: adminUserId },
  });

  await db.issue.updateMany({
    where: { projectId },
    data: { status: 'CLOSED', updatedBy: adminUserId },
  });

  await db.punchItem.updateMany({
    where: { projectId },
    data: { status: 'CLOSED', updatedBy: adminUserId },
  });

  const closeout = await db.closeout.findUniqueOrThrow({ where: { projectId } });
  await db.closeout.update({
    where: { id: closeout.id },
    data: {
      status: 'DEFECTS_LIABILITY_PERIOD',
      practicalCompletionDate: d(def.actualFinishDate ?? def.plannedFinishDate),
      updatedBy: adminUserId,
    },
  });

  await db.closeoutChecklistItem.updateMany({
    where: { closeoutId: closeout.id },
    data: {
      isComplete: true,
      completedAt: d(def.actualFinishDate ?? def.plannedFinishDate),
      verifiedBy: U.pm,
      updatedBy: adminUserId,
    },
  });

  console.log(`✓ Finalized closed project state for ${def.code}`);
}

async function seedProject1Epc(ctx: PmSeedContext): Promise<void> {
  const p = PROJECT_1_DEF.index;
  const code = PROJECT_1_DEF.code;
  const taskId = sid(p, 30);

  const civilDisciplineId = sid(p, 200);
  const structuralDisciplineId = sid(p, 201);
  const mepDisciplineId = sid(p, 202);

  await seedTaskDisciplineRow(ctx, {
    id: civilDisciplineId,
    taskId,
    disciplineName: 'Civil',
    projectedStatus: TaskDisciplineProjectedStatus.APPROVED,
    isClosed: true,
    closedAt: d('2025-04-01'),
    closedBy: U.lead,
    actualCompletionTime: d('2025-03-28'),
  });

  await seedTaskDisciplineRow(ctx, {
    id: structuralDisciplineId,
    taskId,
    disciplineName: 'Structural',
    projectedStatus: TaskDisciplineProjectedStatus.APPROVED,
    isClosed: true,
    closedAt: d('2025-04-15'),
    closedBy: U.lead,
    actualCompletionTime: d('2025-04-10'),
  });

  await seedTaskDisciplineRow(ctx, {
    id: mepDisciplineId,
    taskId,
    disciplineName: 'MEP',
    projectedStatus: TaskDisciplineProjectedStatus.APPROVED,
    isClosed: true,
    closedAt: d('2025-05-01'),
    closedBy: U.deptChief,
    actualCompletionTime: d('2025-04-28'),
  });

  const civilEdv = sid(p, 501);
  const structuralEdv = sid(p, 502);
  const mepEdv = sid(p, 503);

  await seedEdvChain(ctx, p, civilDisciplineId, {
    edvId: civilEdv,
    engDocId: sid(p, 301),
    docVersionId: sid(p, 401),
    documentId: sid(p, 170),
    projectCode: code,
    fileName: 'Civil-Grading-Locked.pdf',
    docNumber: 'CIV-GRD-001',
    title: 'Site Grading Plan - As-Built',
    revisionLabel: 'C',
    status: EdvStatus.LOCKED,
    versionNumber: 1,
    isCurrent: true,
  });

  await seedEdvChain(ctx, p, structuralDisciplineId, {
    edvId: structuralEdv,
    engDocId: sid(p, 302),
    docVersionId: sid(p, 402),
    documentId: sid(p, 171),
    projectCode: code,
    fileName: 'As-Built-Structural.pdf',
    docNumber: 'STR-ABS-001',
    title: 'Structural As-Built Package',
    revisionLabel: 'F',
    status: EdvStatus.LOCKED,
    versionNumber: 1,
    isCurrent: true,
  });

  await seedEdvChain(ctx, p, mepDisciplineId, {
    edvId: mepEdv,
    engDocId: sid(p, 303),
    docVersionId: sid(p, 403),
    documentId: sid(p, 172),
    projectCode: code,
    fileName: 'O-and-M-Manual-Sample.pdf',
    docNumber: 'MEP-O&M-001',
    title: 'MEP O&M Manual Extract',
    revisionLabel: 'B',
    status: EdvStatus.LOCKED,
    versionNumber: 1,
    isCurrent: true,
  });

  const civilPkg = sid(p, 210);
  const structuralPkg = sid(p, 211);
  const mepPkg = sid(p, 212);

  await seedDesignPackageRow(ctx, p, code, {
    packageId: civilPkg,
    disciplineId: civilDisciplineId,
    name: 'Civil Works - Final Issue',
    projectedStatus: DesignPackageProjectedStatus.LOCKED,
    packageStatus: DesignPackageStatus.CLOSED,
    requiredTiers: computeRequiredTiers({
      designerUserId: U.designer,
      supportingDesignerUserId: U.supportingDesigner,
      ownerUserId: U.owner,
      reviewerUserId: U.reviewer,
      disciplineLeadUserId: U.lead,
      chiefUserId: U.deptChief,
      instituteChiefUserId: U.instituteChief,
    }),
    edvIds: [civilEdv],
    itemEntityStart: 211,
    submittedAt: '2025-02-01',
    approvedAt: '2025-03-15',
    packageClosedAt: '2025-03-20',
    packageClosedBy: U.lead,
  });

  await seedDesignPackageRow(ctx, p, code, {
    packageId: structuralPkg,
    disciplineId: structuralDisciplineId,
    name: 'Structural IFC - Closed',
    projectedStatus: DesignPackageProjectedStatus.LOCKED,
    packageStatus: DesignPackageStatus.CLOSED,
    requiredTiers: computeRequiredTiers({
      designerUserId: U.designer,
      supportingDesignerUserId: U.supportingDesigner,
      ownerUserId: U.owner,
      reviewerUserId: U.reviewer,
      disciplineLeadUserId: U.lead,
      chiefUserId: U.deptChief,
      instituteChiefUserId: U.instituteChief,
    }),
    edvIds: [structuralEdv],
    itemEntityStart: 212,
    submittedAt: '2025-03-01',
    approvedAt: '2025-04-05',
    packageClosedAt: '2025-04-10',
    packageClosedBy: U.deptChief,
  });

  await seedDesignPackageRow(ctx, p, code, {
    packageId: mepPkg,
    disciplineId: mepDisciplineId,
    name: 'MEP Commissioning Package',
    projectedStatus: DesignPackageProjectedStatus.APPROVED,
    packageStatus: DesignPackageStatus.CLOSED,
    requiredTiers: computeRequiredTiers({
      designerUserId: U.designer,
      supportingDesignerUserId: U.supportingDesigner,
      ownerUserId: U.owner,
      reviewerUserId: U.reviewer,
      disciplineLeadUserId: U.lead,
      chiefUserId: U.deptChief,
      instituteChiefUserId: U.instituteChief,
    }),
    edvIds: [mepEdv],
    itemEntityStart: 213,
    submittedAt: '2025-04-01',
    approvedAt: '2025-04-25',
    packageClosedAt: '2025-05-01',
    packageClosedBy: U.instituteChief,
  });

  const civilSession = sid(p, 220);
  await seedReviewSessionRow(ctx, {
    sessionId: civilSession,
    snapshotId: sid(p, 240),
    packageId: civilPkg,
    disciplineId: civilDisciplineId,
    status: ReviewSessionStatus.APPROVED,
    outcome: ReviewSessionOutcome.APPROVED,
    currentTier: ReviewTier.INSTITUTE_CHIEF,
    assignedToUserId: U.instituteChief,
    edvIds: [civilEdv],
    openedAt: '2025-02-05T09:00:00Z',
    closedAt: '2025-03-15T16:00:00Z',
  });

  await seedReviewSessionRow(ctx, {
    sessionId: sid(p, 221),
    snapshotId: sid(p, 241),
    packageId: structuralPkg,
    disciplineId: structuralDisciplineId,
    status: ReviewSessionStatus.APPROVED,
    outcome: ReviewSessionOutcome.APPROVED,
    currentTier: ReviewTier.DEPT_CHIEF,
    assignedToUserId: U.deptChief,
    edvIds: [structuralEdv],
    openedAt: '2025-03-05T09:00:00Z',
    closedAt: '2025-04-05T14:00:00Z',
  });

  await seedTaskDisciplineReviews(ctx, p, civilDisciplineId, [
    { tier: ReviewTier.DISCIPLINE_OWNER, status: TaskDisciplineReviewStatus.APPROVED, reviewedBy: U.owner, reviewedAt: '2025-02-10' },
    { tier: ReviewTier.REVIEWER, status: TaskDisciplineReviewStatus.APPROVED, reviewedBy: U.reviewer, reviewedAt: '2025-02-15' },
    { tier: ReviewTier.DISCIPLINE_LEAD, status: TaskDisciplineReviewStatus.APPROVED, reviewedBy: U.lead, reviewedAt: '2025-03-01' },
    { tier: ReviewTier.DEPT_CHIEF, status: TaskDisciplineReviewStatus.APPROVED, reviewedBy: U.deptChief, reviewedAt: '2025-03-10' },
    { tier: ReviewTier.INSTITUTE_CHIEF, status: TaskDisciplineReviewStatus.APPROVED, reviewedBy: U.instituteChief, reviewedAt: '2025-03-15' },
  ]);

  await seedPackageAttachment(ctx, p, 150, civilPkg, sid(p, 12), U.docs, 'REFERENCE', 'Approved civil grading reference set');
  await seedSessionAttachment(ctx, p, 151, civilSession, sid(p, 13), ReviewTier.DISCIPLINE_LEAD, U.lead, 'MARKUP', 'Lead review markup PDF');

  await seedWorkflowEvents(ctx, [
    {
      id: sid(p, 297),
      entityType: WorkflowEntityType.EngineeringDocumentVersion,
      entityId: civilEdv,
      actorId: U.designer,
      action: 'LOCK_FOR_ISSUE',
      phase: WorkflowEventPhase.COMMITTED,
      createdAt: '2025-03-15T10:00:00Z',
    },
    {
      id: sid(p, 298),
      entityType: WorkflowEntityType.DesignPackage,
      entityId: civilPkg,
      actorId: U.lead,
      action: 'PACKAGE_CLOSED',
      phase: WorkflowEventPhase.COMMITTED,
      createdAt: '2025-03-20T11:00:00Z',
    },
    {
      id: sid(p, 299),
      entityType: WorkflowEntityType.ReviewSession,
      entityId: civilSession,
      actorId: U.instituteChief,
      action: 'SESSION_APPROVED',
      phase: WorkflowEventPhase.COMMITTED,
      createdAt: '2025-03-15T16:00:00Z',
    },
  ]);

  console.log(`✓ Created EPC workflow (3 disciplines, locked packages) for ${code}`);
}

async function seedProject2Epc(ctx: PmSeedContext): Promise<void> {
  const p = PROJECT_2_DEF.index;
  const code = PROJECT_2_DEF.code;
  const taskId = sid(p, 30);

  const civilId = sid(p, 200);
  const structuralId = sid(p, 201);
  const mepId = sid(p, 202);
  const archId = sid(p, 203);

  await seedTaskDisciplineRow(ctx, { id: civilId, taskId, disciplineName: 'Civil', projectedStatus: TaskDisciplineProjectedStatus.APPROVED });
  await seedTaskDisciplineRow(ctx, { id: structuralId, taskId, disciplineName: 'Structural', projectedStatus: TaskDisciplineProjectedStatus.PENDING_LEAD });
  await seedTaskDisciplineRow(ctx, { id: mepId, taskId, disciplineName: 'MEP', projectedStatus: TaskDisciplineProjectedStatus.PENDING_LEAD });
  await seedTaskDisciplineRow(ctx, { id: archId, taskId, disciplineName: 'Architecture', projectedStatus: TaskDisciplineProjectedStatus.REWORK_REQUIRED });

  const tiers = computeRequiredTiers({
    designerUserId: U.designer,
    supportingDesignerUserId: U.supportingDesigner,
    ownerUserId: U.owner,
    reviewerUserId: U.reviewer,
    disciplineLeadUserId: U.lead,
    chiefUserId: U.deptChief,
    instituteChiefUserId: U.instituteChief,
  });

  const civilEdv = sid(p, 501);
  const structuralEdv = sid(p, 502);
  const mepEdv = sid(p, 503);
  const archEdvDraft = sid(p, 504);
  const archEdvSuperseded = sid(p, 505);
  const mep2Edv = sid(p, 506);

  await seedEdvChain(ctx, p, civilId, {
    edvId: civilEdv, engDocId: sid(p, 301), docVersionId: sid(p, 401), documentId: sid(p, 170), projectCode: code,
    fileName: 'Civil-Grading-Locked.pdf', docNumber: 'CIV-001', title: 'Basement Excavation Plan',
    revisionLabel: 'C', status: EdvStatus.LOCKED, versionNumber: 1, isCurrent: true,
  });
  await seedEdvChain(ctx, p, structuralId, {
    edvId: structuralEdv, engDocId: sid(p, 302), docVersionId: sid(p, 402), documentId: sid(p, 171), projectCode: code,
    fileName: 'Structural-Steel-Rev-A.pdf', docNumber: 'STR-001', title: 'Core Wall Reinforcement',
    revisionLabel: 'B', status: EdvStatus.APPROVED, versionNumber: 1, isCurrent: true,
  });
  await seedEdvChain(ctx, p, mepId, {
    edvId: mepEdv, engDocId: sid(p, 303), docVersionId: sid(p, 403), documentId: sid(p, 172), projectCode: code,
    fileName: 'HVAC-Layout-Rev-A.pdf', docNumber: 'MEP-001', title: 'Level 12 HVAC Layout',
    revisionLabel: 'A', status: EdvStatus.IN_REVIEW, versionNumber: 1, isCurrent: true,
  });
  await seedEdvChain(ctx, p, archId, {
    edvId: archEdvSuperseded, engDocId: sid(p, 304), docVersionId: sid(p, 404), documentId: sid(p, 173), projectCode: code,
    fileName: 'Architecture-Facade-Rev-A.pdf', docNumber: 'ARC-001', title: 'Curtain Wall Elevation',
    revisionLabel: 'A', status: EdvStatus.SUPERSEDED, versionNumber: 1, isCurrent: false,
  });
  await seedEdvChain(ctx, p, archId, {
    edvId: archEdvDraft, engDocId: sid(p, 304), docVersionId: sid(p, 405), documentId: sid(p, 174), projectCode: code,
    fileName: 'Architecture-Facade-Rev-B-Draft.pdf', docNumber: 'ARC-001', title: 'Curtain Wall Elevation',
    revisionLabel: 'B', status: EdvStatus.DRAFT, versionNumber: 1, isCurrent: true,
  });
  await seedEdvChain(ctx, p, mepId, {
    edvId: mep2Edv, engDocId: sid(p, 305), docVersionId: sid(p, 406), documentId: sid(p, 175), projectCode: code,
    fileName: 'Electrical-SLD-Rev-A.pdf', docNumber: 'MEP-002', title: 'Electrical Riser Diagram',
    revisionLabel: 'A', status: EdvStatus.DRAFT, versionNumber: 1, isCurrent: true,
  });

  const pkgCivil = sid(p, 210);
  const pkgStructural = sid(p, 211);
  const pkgMep = sid(p, 212);
  const pkgArch = sid(p, 213);
  const pkgMep2 = sid(p, 214);

  await seedDesignPackageRow(ctx, p, code, {
    packageId: pkgCivil, disciplineId: civilId, name: 'Package Civil - Site Works',
    projectedStatus: DesignPackageProjectedStatus.LOCKED, packageStatus: DesignPackageStatus.CLOSED,
    requiredTiers: tiers, edvIds: [civilEdv], itemEntityStart: 211,
    submittedAt: '2025-01-10', approvedAt: '2025-02-20', packageClosedAt: '2025-02-28', packageClosedBy: U.lead,
  });
  await seedDesignPackageRow(ctx, p, code, {
    packageId: pkgStructural, disciplineId: structuralId, name: 'Package Structural - Core Walls',
    projectedStatus: DesignPackageProjectedStatus.APPROVED, packageStatus: DesignPackageStatus.SUBMITTED,
    requiredTiers: tiers, edvIds: [structuralEdv], itemEntityStart: 215,
    submittedAt: '2025-11-01', approvedAt: '2025-12-15',
  });
  await seedDesignPackageRow(ctx, p, code, {
    packageId: pkgMep, disciplineId: mepId, name: 'Package MEP - Level 12 HVAC',
    projectedStatus: DesignPackageProjectedStatus.PENDING_LEAD, packageStatus: DesignPackageStatus.OPEN,
    requiredTiers: tiers, edvIds: [mepEdv], itemEntityStart: 216,
    submittedAt: '2026-01-20',
    briefText: 'MEP coordination package under lead review - active inbox scenario.',
  });
  await seedDesignPackageRow(ctx, p, code, {
    packageId: pkgArch, disciplineId: archId, name: 'Package Architecture - Facade',
    projectedStatus: DesignPackageProjectedStatus.REWORK_REQUIRED, packageStatus: DesignPackageStatus.OPEN,
    requiredTiers: tiers, edvIds: [archEdvDraft, archEdvSuperseded], itemEntityStart: 217,
    submittedAt: '2025-12-01',
  });
  await seedDesignPackageRow(ctx, p, code, {
    packageId: pkgMep2, disciplineId: mepId, name: 'Package MEP2 - Electrical Risers',
    projectedStatus: DesignPackageProjectedStatus.IN_PROGRESS, packageStatus: DesignPackageStatus.OPEN,
    requiredTiers: tiers, edvIds: [mep2Edv], itemEntityStart: 218,
    briefText: 'Early draft package - no review session yet.',
  });

  const civilSession = sid(p, 220);
  await seedReviewSessionRow(ctx, {
    sessionId: civilSession, snapshotId: sid(p, 240), packageId: pkgCivil, disciplineId: civilId,
    status: ReviewSessionStatus.APPROVED, outcome: ReviewSessionOutcome.APPROVED,
    currentTier: ReviewTier.DISCIPLINE_LEAD, assignedToUserId: U.lead, edvIds: [civilEdv],
    openedAt: '2025-01-15T09:00:00Z', closedAt: '2025-02-20T17:00:00Z',
  });

  const structuralSession = sid(p, 221);
  await seedReviewSessionRow(ctx, {
    sessionId: structuralSession, snapshotId: sid(p, 241), packageId: pkgStructural, disciplineId: structuralId,
    status: ReviewSessionStatus.CLOSED, outcome: ReviewSessionOutcome.APPROVED,
    currentTier: ReviewTier.REVIEWER, assignedToUserId: U.reviewer, edvIds: [structuralEdv],
    openedAt: '2025-11-05T09:00:00Z', closedAt: '2025-12-15T16:30:00Z',
  });

  const mepSession = sid(p, 222);
  await seedReviewSessionRow(ctx, {
    sessionId: mepSession, snapshotId: sid(p, 242), packageId: pkgMep, disciplineId: mepId,
    status: ReviewSessionStatus.ACTIVE, outcome: ReviewSessionOutcome.PENDING,
    currentTier: ReviewTier.DISCIPLINE_LEAD, assignedToUserId: U.lead, edvIds: [mepEdv],
    openedAt: '2026-01-25T08:00:00Z', slaDays: 21,
  });

  const archSession = sid(p, 223);
  await seedReviewSessionRow(ctx, {
    sessionId: archSession, snapshotId: sid(p, 243), packageId: pkgArch, disciplineId: archId,
    status: ReviewSessionStatus.RETURNED_FOR_REWORK, outcome: ReviewSessionOutcome.RETURNED,
    currentTier: ReviewTier.REVIEWER, assignedToUserId: U.reviewer, edvIds: [archEdvDraft, archEdvSuperseded],
    openedAt: '2025-12-05T09:00:00Z', closedAt: '2025-12-20T15:00:00Z',
    closedReason: 'Facade anchor detail requires redesign - revise and resubmit.',
  });

  await seedReviewCommentRow(ctx, {
    id: sid(p, 601), sessionId: mepSession, edvId: mepEdv,
    body: 'Verify duct routing clearance at beam B12.', severity: CommentSeverity.MAJOR,
    status: CommentStatus.OPEN, assignedToUserId: U.designer, createdBy: U.lead,
  });
  await seedReviewCommentRow(ctx, {
    id: sid(p, 602), sessionId: mepSession, edvId: mepEdv,
    body: 'Equipment schedule cross-reference complete.', severity: CommentSeverity.MINOR,
    status: CommentStatus.VERIFIED, assignedToUserId: U.designer, createdBy: U.reviewer,
    resolvedAt: '2026-02-01', resolutionNote: 'Schedule matches approved equipment list.', verifiedAt: '2026-02-02',
  });
  await seedReviewCommentRow(ctx, {
    id: sid(p, 603), sessionId: mepSession, edvId: mepEdv,
    body: 'Add fire damper locations at corridor crossings.', severity: CommentSeverity.MODERATE,
    status: CommentStatus.IN_PROGRESS, assignedToUserId: U.supportingDesigner, createdBy: U.lead,
  });
  await seedReviewCommentRow(ctx, {
    id: sid(p, 604), sessionId: mepSession, edvId: mepEdv,
    body: 'Confirm ceiling void depth with architecture.', severity: CommentSeverity.MAJOR,
    status: CommentStatus.ACKNOWLEDGED, assignedToUserId: U.designer, createdBy: U.deptChief,
  });

  await seedReviewCommentRow(ctx, {
    id: sid(p, 605), sessionId: archSession, edvId: archEdvDraft,
    body: 'Anchor spacing does not match structural embed schedule.', severity: CommentSeverity.MAJOR,
    status: CommentStatus.OPEN, assignedToUserId: U.designer, createdBy: U.reviewer,
  });

  await seedPackageAttachment(ctx, p, 152, pkgMep, sid(p, 12), U.designer, 'BRIEF', 'MEP coordination brief supplement');
  await seedPackageAttachment(ctx, p, 153, pkgArch, sid(p, 170), U.supportingDesigner, 'REFERENCE', 'Previous facade iteration reference');
  await seedSessionAttachment(ctx, p, 154, mepSession, sid(p, 13), ReviewTier.DISCIPLINE_LEAD, U.lead, 'REVIEW', 'Lead tier review markup');

  await seedDesignPackageDependency(ctx, p, pkgMep, pkgStructural);
  await seedDesignPackageDependency(ctx, p, pkgArch, pkgStructural, 261);

  await seedTaskDisciplineReviews(ctx, p, mepId, [
    { tier: ReviewTier.DISCIPLINE_OWNER, status: TaskDisciplineReviewStatus.APPROVED, reviewedBy: U.owner, reviewedAt: '2026-01-20' },
    { tier: ReviewTier.REVIEWER, status: TaskDisciplineReviewStatus.APPROVED, reviewedBy: U.reviewer, reviewedAt: '2026-01-22' },
    { tier: ReviewTier.DISCIPLINE_LEAD, status: TaskDisciplineReviewStatus.IN_REVIEW, notes: 'Active lead review on MEP package.' },
    { tier: ReviewTier.DEPT_CHIEF, status: TaskDisciplineReviewStatus.PENDING },
    { tier: ReviewTier.INSTITUTE_CHIEF, status: TaskDisciplineReviewStatus.PENDING },
  ]);

  await seedWorkflowEvents(ctx, [
    { id: sid(p, 310), entityType: WorkflowEntityType.DesignPackage, entityId: pkgCivil, actorId: U.lead, action: 'PACKAGE_CLOSED', phase: WorkflowEventPhase.COMMITTED, createdAt: '2025-02-28T10:00:00Z' },
    { id: sid(p, 311), entityType: WorkflowEntityType.DesignPackage, entityId: pkgStructural, actorId: U.reviewer, action: 'PACKAGE_SUBMITTED', phase: WorkflowEventPhase.INTENT, createdAt: '2025-11-01T09:00:00Z' },
    { id: sid(p, 312), entityType: WorkflowEntityType.ReviewSession, entityId: mepSession, actorId: U.lead, action: 'SESSION_OPENED', phase: WorkflowEventPhase.COMMITTED, createdAt: '2026-01-25T08:00:00Z' },
    { id: sid(p, 313), entityType: WorkflowEntityType.ReviewSession, entityId: archSession, actorId: U.reviewer, action: 'SESSION_RETURNED', phase: WorkflowEventPhase.COMMITTED, createdAt: '2025-12-20T15:00:00Z', reason: 'Rework required on facade anchors' },
    { id: sid(p, 314), entityType: WorkflowEntityType.EngineeringDocumentVersion, entityId: archEdvSuperseded, actorId: U.designer, action: 'SUPERSEDE_REVISION', phase: WorkflowEventPhase.COMMITTED, createdAt: '2025-12-18T11:00:00Z' },
  ]);

  console.log(`✓ Created EPC scenarios (5 packages: Civil/Structural/MEP/Architecture/MEP2) for ${code}`);
  await seedLjzTierReviewInboxes(ctx, p, code, taskId);
}

interface LjzTierInboxPackageSpec {
  name: string;
  docNumber: string;
  fileName: string;
  title: string;
}

interface LjzTierInboxTierSpec {
  tier: ReviewTier;
  assigneeId: string;
  disciplineName: string;
  packages: [LjzTierInboxPackageSpec, LjzTierInboxPackageSpec];
}

const LJZ_TIER_INBOX_SPECS: LjzTierInboxTierSpec[] = [
  {
    tier: ReviewTier.DISCIPLINE_OWNER,
    assigneeId: U.owner,
    disciplineName: 'Podium Envelope',
    packages: [
      {
        name: 'Podium Envelope - Curtain Wall Stack',
        docNumber: 'LJZ-INB-O-01',
        fileName: 'Session-Tier1-Owner-Markup.pdf',
        title: 'Curtain Wall Stack - Owner Review',
      },
      {
        name: 'Podium Envelope - Lobby Atrium',
        docNumber: 'LJZ-INB-O-02',
        fileName: 'Package-Brief-Coordination-Supplement.pdf',
        title: 'Lobby Atrium - Owner Review',
      },
    ],
  },
  {
    tier: ReviewTier.REVIEWER,
    assigneeId: U.reviewer,
    disciplineName: 'Steel Connections',
    packages: [
      {
        name: 'Steel Connections - Transfer Truss',
        docNumber: 'LJZ-INB-R-01',
        fileName: 'Session-Tier2-Reviewer-Redlines.pdf',
        title: 'Transfer Truss - Reviewer Redlines',
      },
      {
        name: 'Steel Connections - Core Bracing',
        docNumber: 'LJZ-INB-R-02',
        fileName: 'Reviewer-Markup-Grid-B4.pdf',
        title: 'Core Bracing - Reviewer Redlines',
      },
    ],
  },
  {
    tier: ReviewTier.DISCIPLINE_LEAD,
    assigneeId: U.lead,
    disciplineName: 'MEP Coordination',
    packages: [
      {
        name: 'MEP Coordination - Level 18 Risers',
        docNumber: 'LJZ-INB-L-01',
        fileName: 'Session-Tier3-Lead-Approval.pdf',
        title: 'Level 18 Risers - Lead Review',
      },
      {
        name: 'MEP Coordination - Plant Room Layout',
        docNumber: 'LJZ-INB-L-02',
        fileName: 'Drawing-Markup-MEP-Level12.pdf',
        title: 'Plant Room Layout - Lead Review',
      },
    ],
  },
  {
    tier: ReviewTier.DEPT_CHIEF,
    assigneeId: U.deptChief,
    disciplineName: 'Structural Systems',
    packages: [
      {
        name: 'Structural Systems - Outrigger Level',
        docNumber: 'LJZ-INB-C-01',
        fileName: 'MEP-Coordination-Rev-A.pdf',
        title: 'Outrigger Level - Dept Chief Review',
      },
      {
        name: 'Structural Systems - Mega Column',
        docNumber: 'LJZ-INB-C-02',
        fileName: 'Structural-Steel-Rev-A.pdf',
        title: 'Mega Column - Dept Chief Review',
      },
    ],
  },
  {
    tier: ReviewTier.INSTITUTE_CHIEF,
    assigneeId: U.instituteChief,
    disciplineName: 'Tower Crown',
    packages: [
      {
        name: 'Tower Crown - Architectural Crown',
        docNumber: 'LJZ-INB-I-01',
        fileName: 'External-Release-Consultant-Cover.pdf',
        title: 'Architectural Crown - Institute Chief Review',
      },
      {
        name: 'Tower Crown - MEP Penthouse',
        docNumber: 'LJZ-INB-I-02',
        fileName: 'Electrical-SLD-Rev-A.pdf',
        title: 'MEP Penthouse - Institute Chief Review',
      },
    ],
  },
];

/**
 * Seeds two active review inbox sessions per governance tier on LJZ-2024-001.
 */
export async function seedLjzTierReviewInboxes(
  ctx: PmSeedContext,
  p: number,
  projectCode: string,
  taskId: string,
): Promise<void> {
  const tiers = computeRequiredTiers({
    designerUserId: U.designer,
    supportingDesignerUserId: U.supportingDesigner,
    ownerUserId: U.owner,
    reviewerUserId: U.reviewer,
    disciplineLeadUserId: U.lead,
    chiefUserId: U.deptChief,
    instituteChiefUserId: U.instituteChief,
  });

  const workflowEvents: Array<{
    id: string;
    entityType: WorkflowEntityType;
    entityId: string;
    actorId: string;
    action: string;
    phase: WorkflowEventPhase;
    createdAt: string;
  }> = [];

  for (const [tierIndex, tierSpec] of LJZ_TIER_INBOX_SPECS.entries()) {
    const disciplineId = sid(p, 800 + tierIndex);
    await seedTaskDisciplineRow(ctx, {
      id: disciplineId,
      taskId,
      disciplineName: tierSpec.disciplineName,
      projectedStatus: TaskDisciplineProjectedStatus.IN_PROGRESS,
    });

    for (const [packageIndex, packageSpec] of tierSpec.packages.entries()) {
      const offset = tierIndex * 2 + packageIndex;
      const packageId = sid(p, 810 + offset);
      const sessionId = sid(p, 820 + offset);
      const snapshotId = sid(p, 830 + offset);
      const edvId = sid(p, 560 + offset);
      const engDocId = sid(p, 570 + offset);
      const docVersionId = sid(p, 590 + offset);
      const documentId = sid(p, 710 + offset);
      const month = String(3 + tierIndex).padStart(2, '0');
      const day = String(10 + packageIndex * 3).padStart(2, '0');
      const openedAt = `2026-${month}-${day}T09:00:00Z`;

      await seedEdvChain(ctx, p, disciplineId, {
        edvId,
        engDocId,
        docVersionId,
        documentId,
        projectCode,
        fileName: packageSpec.fileName,
        docNumber: packageSpec.docNumber,
        title: packageSpec.title,
        revisionLabel: 'A',
        status: EdvStatus.IN_REVIEW,
        versionNumber: 1,
        isCurrent: true,
      });

      await seedDesignPackageRow(ctx, p, projectCode, {
        packageId,
        disciplineId,
        name: packageSpec.name,
        projectedStatus: DesignPackageProjectedStatus.IN_PROGRESS,
        packageStatus: DesignPackageStatus.OPEN,
        requiredTiers: tiers,
        edvIds: [edvId],
        itemEntityStart: 900 + offset,
        submittedAt: openedAt.slice(0, 10),
        briefText: `${packageSpec.name} - active ${tierSpec.tier.replace(/_/g, ' ').toLowerCase()} inbox item.`,
      });

      await seedReviewSessionRow(ctx, {
        sessionId,
        snapshotId,
        packageId,
        disciplineId,
        status: ReviewSessionStatus.ACTIVE,
        outcome: ReviewSessionOutcome.PENDING,
        currentTier: tierSpec.tier,
        assignedToUserId: tierSpec.assigneeId,
        edvIds: [edvId],
        openedAt,
        slaDays: 14 - tierIndex,
        createdBy: U.designer,
        updatedBy: U.designer,
      });

      workflowEvents.push({
        id: sid(p, 400 + offset),
        entityType: WorkflowEntityType.ReviewSession,
        entityId: sessionId,
        actorId: U.designer,
        action: 'SUBMIT_FOR_REVIEW',
        phase: WorkflowEventPhase.INTENT,
        createdAt: openedAt,
      });
    }
  }

  await seedWorkflowEvents(ctx, workflowEvents);
  console.log(
    `✓ Created ${LJZ_TIER_INBOX_SPECS.length * 2} tier review inbox sessions for ${projectCode}`,
  );
}

async function seedDesignPackageDependency(
  ctx: PmSeedContext,
  p: number,
  packageId: string,
  dependsOnPackageId: string,
  entity = 260,
): Promise<void> {
  const { prisma: db, companyId, adminUserId } = ctx;
  await db.designPackageDependency.upsert({
    where: { id: sid(p, entity) },
    update: { dependencyType: DesignPackageDependencyType.FINISH_TO_START },
    create: {
      id: sid(p, entity),
      companyId,
      designPackageId: packageId,
      dependsOnPackageId,
      dependencyType: DesignPackageDependencyType.FINISH_TO_START,
      createdBy: adminUserId,
    },
  });
}

async function seedProject3Epc(ctx: PmSeedContext): Promise<void> {
  const p = PROJECT_3_DEF.index;
  const code = PROJECT_3_DEF.code;
  const taskId = sid(p, 30);
  const disciplineId = sid(p, 200);

  await seedTaskDisciplineRow(ctx, {
    id: disciplineId,
    taskId,
    disciplineName: 'Civil',
    projectedStatus: TaskDisciplineProjectedStatus.IN_PROGRESS,
    designerUserId: U.designer,
    supportingDesignerUserId: U.supportingDesigner,
  });

  const edvId = sid(p, 501);
  await seedEdvChain(ctx, p, disciplineId, {
    edvId,
    engDocId: sid(p, 301),
    docVersionId: sid(p, 401),
    documentId: sid(p, 170),
    projectCode: code,
    fileName: 'Site-Grading-Rev-A.pdf',
    docNumber: 'CIV-MOB-001',
    title: 'Mobilization Site Layout',
    revisionLabel: 'A',
    status: EdvStatus.IN_REVIEW,
    versionNumber: 1,
    isCurrent: true,
  });

  const packageId = sid(p, 210);
  const tiers = computeRequiredTiers({
    designerUserId: U.designer,
    supportingDesignerUserId: U.supportingDesigner,
    ownerUserId: U.owner,
    reviewerUserId: U.reviewer,
    disciplineLeadUserId: U.lead,
    chiefUserId: U.deptChief,
    instituteChiefUserId: U.instituteChief,
  });

  await seedDesignPackageRow(ctx, p, code, {
    packageId,
    disciplineId,
    name: 'Mobilization Civil Package',
    projectedStatus: DesignPackageProjectedStatus.IN_PROGRESS,
    packageStatus: DesignPackageStatus.OPEN,
    requiredTiers: tiers,
    edvIds: [edvId],
    itemEntityStart: 211,
    briefText: 'Initial civil layout for site mobilization - owner review pending.',
  });

  const sessionId = sid(p, 220);
  await seedReviewSessionRow(ctx, {
    sessionId,
    snapshotId: sid(p, 240),
    packageId,
    disciplineId,
    status: ReviewSessionStatus.ACTIVE,
    outcome: ReviewSessionOutcome.PENDING,
    currentTier: ReviewTier.DISCIPLINE_OWNER,
    assignedToUserId: U.owner,
    edvIds: [edvId],
    openedAt: '2026-03-01T09:00:00Z',
    slaDays: 14,
    createdBy: U.designer,
  });

  await seedReviewCommentRow(ctx, {
    id: sid(p, 601),
    sessionId,
    edvId,
    body: 'Confirm temporary road alignment with municipal setback requirements.',
    severity: CommentSeverity.MODERATE,
    status: CommentStatus.OPEN,
    assignedToUserId: U.designer,
    createdBy: U.owner,
  });

  await seedTaskDisciplineReviews(ctx, p, disciplineId, [
    { tier: ReviewTier.DISCIPLINE_OWNER, status: TaskDisciplineReviewStatus.IN_REVIEW, notes: 'Owner reviewing mobilization layout.' },
    { tier: ReviewTier.REVIEWER, status: TaskDisciplineReviewStatus.PENDING },
    { tier: ReviewTier.DISCIPLINE_LEAD, status: TaskDisciplineReviewStatus.PENDING },
  ]);

  await seedWorkflowEvents(ctx, [
    {
      id: sid(p, 320),
      entityType: WorkflowEntityType.DesignPackage,
      entityId: packageId,
      actorId: U.designer,
      action: 'CREATE_PACKAGE',
      phase: WorkflowEventPhase.COMMITTED,
      createdAt: '2026-02-28T10:00:00Z',
    },
    {
      id: sid(p, 321),
      entityType: WorkflowEntityType.ReviewSession,
      entityId: sessionId,
      actorId: U.designer,
      action: 'SUBMIT_FOR_REVIEW',
      phase: WorkflowEventPhase.INTENT,
      createdAt: '2026-03-01T09:00:00Z',
    },
  ]);

  console.log(`✓ Created early-stage EPC (1 discipline, 1 package, owner session) for ${code}`);
}

async function seedProject1(
  ctx: PmSeedContext,
  users: Awaited<ReturnType<typeof seedDemoUsers>>,
): Promise<void> {
  const def = PROJECT_1_DEF;
  const { projectId, projectCode } = await seedProjectBundle(ctx, def, users);

  await seedExtendedProjectData(ctx, def.index, projectId, projectCode, 'closed');
  await seedNestedDocumentFolders(ctx, def.index, projectId, projectCode);
  await seedProject1Epc(ctx);
  await seedCrossCuttingPmData(ctx, def.index, projectId, projectCode, sid(def.index, 210), sid(def.index, 200), sid(def.index, 301));
  await seedRichProjectAssets({
    ctx,
    p: def.index,
    projectId,
    projectCode,
    lifecycle: 'closed',
    pdfRegistry,
    disciplineId: sid(def.index, 200),
    primaryPackageId: sid(def.index, 210),
    primaryEdvId: sid(def.index, 501),
  });
  await finalizeClosedProject(ctx, def.index, def);
  await seedAuditLogsForProject(ctx, def.index, projectId, projectCode);
  await seedNotificationsForProject(ctx, def.index, projectCode);

  console.log(`✓ Seeded project 1: ${projectCode} (${projectId}) - CLOSED / fully complete`);
}

async function seedProject2(
  ctx: PmSeedContext,
  users: Awaited<ReturnType<typeof seedDemoUsers>>,
): Promise<void> {
  const def = PROJECT_2_DEF;
  const { projectId, projectCode } = await seedProjectBundle(ctx, def, users);

  await ctx.prisma.task.update({
    where: { id: sid(def.index, 30) },
    data: { dispatcherUserId: U.dispatcher, progressPct: 58, updatedBy: ctx.adminUserId },
  });

  await seedExtendedProjectData(ctx, def.index, projectId, projectCode, 'mid');
  await seedNestedDocumentFolders(ctx, def.index, projectId, projectCode);
  await seedProject2Epc(ctx);
  await seedCrossCuttingPmData(ctx, def.index, projectId, projectCode, sid(def.index, 212), sid(def.index, 202), sid(def.index, 303));
  await seedRichProjectAssets({
    ctx,
    p: def.index,
    projectId,
    projectCode,
    lifecycle: 'mid',
    pdfRegistry,
    disciplineId: sid(def.index, 202),
    primaryPackageId: sid(def.index, 212),
    primaryEdvId: sid(def.index, 503),
  });
  await seedAuditLogsForProject(ctx, def.index, projectId, projectCode);
  await seedNotificationsForProject(ctx, def.index, projectCode);

  console.log(`✓ Seeded project 2: ${projectCode} (${projectId}) - ACTIVE with EPC scenarios`);
}

async function seedProject3(
  ctx: PmSeedContext,
  users: Awaited<ReturnType<typeof seedDemoUsers>>,
): Promise<void> {
  const def = PROJECT_3_DEF;
  const { projectId, projectCode } = await seedProjectBundle(ctx, def, users);

  await removeCloseoutAndPunch(ctx, projectId);

  await ctx.prisma.project.update({
    where: { id: projectId },
    data: { status: ProjectStatus.IN_PROGRESS, updatedBy: ctx.adminUserId },
  });
  await ctx.prisma.task.updateMany({
    where: { projectId },
    data: { progressPct: 8, status: 'IN_PROGRESS', updatedBy: ctx.adminUserId },
  });

  await seedExtendedProjectData(ctx, def.index, projectId, projectCode, 'early');
  await seedNestedDocumentFolders(ctx, def.index, projectId, projectCode);
  await seedProject3Epc(ctx);
  await seedCrossCuttingPmData(ctx, def.index, projectId, projectCode, sid(def.index, 210), sid(def.index, 200), sid(def.index, 301));
  await seedRichProjectAssets({
    ctx,
    p: def.index,
    projectId,
    projectCode,
    lifecycle: 'early',
    pdfRegistry,
    disciplineId: sid(def.index, 200),
    primaryPackageId: sid(def.index, 210),
    primaryEdvId: sid(def.index, 501),
  });
  await seedAuditLogsForProject(ctx, def.index, projectId, projectCode);
  await seedNotificationsForProject(ctx, def.index, projectCode);

  console.log(`✓ Seeded project 3: ${projectCode} (${projectId}) - IN_PROGRESS / early stage`);
}

async function verifySeed(ctx: PmSeedContext): Promise<void> {
  const { prisma: db, companyId } = ctx;
  const codes = [PROJECT_1_DEF.code, PROJECT_2_DEF.code, PROJECT_3_DEF.code];

  const rows: Array<Record<string, string | number>> = [];

  for (const code of codes) {
    const project = await db.project.findFirstOrThrow({
      where: { companyId, projectCode: code },
      select: { id: true, status: true },
    });

    const [
      tasks,
      disciplines,
      packages,
      sessions,
      comments,
      edvs,
      deliverables,
      changeRequests,
      triggers,
      drawings,
      auditLogs,
      notifications,
      punchItems,
      closeouts,
      folders,
      submittals,
      constructionSubmittals,
      externalReleases,
      packageAttachments,
      sessionAttachments,
      submittalReviews,
    ] = await Promise.all([
      db.task.count({ where: { projectId: project.id } }),
      db.taskDiscipline.count({ where: { companyId, task: { projectId: project.id } } }),
      db.designPackage.count({ where: { companyId, taskDiscipline: { task: { projectId: project.id } } } }),
      db.reviewSession.count({ where: { companyId, taskDiscipline: { task: { projectId: project.id } } } }),
      db.reviewComment.count({ where: { companyId, reviewSession: { taskDiscipline: { task: { projectId: project.id } } } } }),
      db.engineeringDocumentVersion.count({ where: { companyId, engineeringDocument: { taskDiscipline: { task: { projectId: project.id } } } } }),
      db.deliverable.count({ where: { projectId: project.id } }),
      db.projectChangeRequest.count({ where: { projectId: project.id } }),
      db.externalReviewTrigger.count({ where: { projectId: project.id } }),
      db.drawing.count({ where: { projectId: project.id } }),
      db.auditLog.count({ where: { companyId, correlationId: `seed-${code}` } }),
      db.notification.count({ where: { companyId, subject: { contains: code } } }),
      db.punchItem.count({ where: { projectId: project.id } }),
      db.closeout.count({ where: { projectId: project.id } }),
      db.documentFolder.count({ where: { companyId, contextId: project.id } }),
      db.submittal.count({ where: { projectId: project.id } }),
      db.submittal.count({
        where: { projectId: project.id, submittalPurpose: 'IN_CONSTRUCTION' },
      }),
      db.submittal.count({
        where: {
          projectId: project.id,
          submittalPurpose: { in: ['DISCIPLINE_SITE', 'DISCIPLINE_CONSULTANT'] },
        },
      }),
      db.designPackageAttachment.count({
        where: { companyId, designPackage: { taskDiscipline: { task: { projectId: project.id } } } },
      }),
      db.reviewSessionAttachment.count({
        where: { companyId, reviewSession: { taskDiscipline: { task: { projectId: project.id } } } },
      }),
      db.submittalReview.count({
        where: { submittal: { projectId: project.id } },
      }),
    ]);

    rows.push({
      project: code,
      status: project.status,
      tasks,
      disciplines,
      packages,
      sessions,
      comments,
      edvs,
      submittals,
      constructionSubmittals,
      externalReleases,
      packageAttachments,
      sessionAttachments,
      submittalReviews,
      deliverables,
      changeRequests,
      triggers,
      drawings,
      auditLogs,
      notifications,
      punchItems,
      closeouts,
      folders,
    });
  }

  console.log('\n=== Demo Projects Seed Verification ===');
  console.table(rows);
}

/**
 * Appends ZMC / LJZ / PDR rich demo projects without clearing existing DEMO-* data.
 */
export async function appendRichDemoProjects(ctx: PmSeedContext): Promise<void> {
  console.log('Appending rich demo projects (ZMC-2023-002, LJZ-2024-001, PDR-2025-003)...');

  await ensureExtraUsers(ctx);

  pdfRegistry = createSeedPdfFiles();
  console.log(`  Created ${pdfRegistry.size} seed PDF files on disk`);

  const users = await seedDemoUsers(ctx);
  const userIds = {
    pmUserId: U.pm,
    engineerUserId: U.engineer,
    safetyUserId: U.safety,
    docsUserId: U.docs,
  };

  await seedProject1(ctx, users);
  await seedProject2(ctx, users);
  await seedProject3(ctx, users);

  try {
    console.log('  Uploading seed files to object storage...');
    await uploadAllSeedFilesToMinio(ctx.prisma, pdfRegistry);
    console.log('  Seed file upload complete');
  } catch (error: unknown) {
    const reason = error instanceof Error ? error.message : String(error);
    console.warn(`  Seed file upload skipped or failed: ${reason}`);
  }
}

/**
 * Standalone demo seed: 3 construction projects with full PM + EPC data.
 */
export async function seedDemoProjects(): Promise<void> {
  console.log('Starting demo projects seed...\n');

  const ctx = await buildPmSeedContextFromDb(prisma);
  await seedDemoUsers(ctx);
  await ensureExtraUsers(ctx);

  const cleared = await clearAllProjectData(ctx.companyId);
  console.log(`✓ Cleared ${cleared.projectCount} existing project(s): ${cleared.projectCodes.join(', ') || '(none)'}\n`);

  pdfRegistry = createSeedPdfFiles();
  console.log(`✓ Created ${pdfRegistry.size} seed PDF files on disk\n`);

  const users = {
    pmUserId: U.pm,
    engineerUserId: U.engineer,
    safetyUserId: U.safety,
    docsUserId: U.docs,
  };

  await seedProject1(ctx, users);
  await seedProject2(ctx, users);
  await seedProject3(ctx, users);

  console.log('\nUploading seed files to MinIO...');
  await uploadAllSeedFilesToMinio(prisma, pdfRegistry);

  await verifySeed(ctx);

  console.log('\nDemo projects seed completed successfully.');
}

if (require.main === module) {
  seedDemoProjects()
    .catch((error: unknown) => {
      console.error('Demo projects seed failed:', error);
      process.exit(1);
    })
    .finally(async () => {
      await prisma.$disconnect();
    });
}

