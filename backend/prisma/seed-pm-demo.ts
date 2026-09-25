import {
  CloseoutStatus,
  CorrespondenceDirection,
  CorrespondenceStatus,
  CorrespondenceType,
  IssueSeverity,
  IssueStatus,
  MeetingStatus,
  MeetingType,
  Prisma,
  PrismaClient,
  ProjectContractType,
  ProjectDesignProperties,
  ProjectDesignStage,
  ProjectStatus,
  ProjectTeamRole,
  ProjectType,
  PunchItemSeverity,
  PunchItemStatus,
  RfiPriority,
  RfiStatus,
  RiskCategory,
  RiskStatus,
  SubmittalStatus,
  TaskStatus,
} from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { cleanupEpcDemoData, EPC_DEMO_PROJECT_CODES, seedEpcDemoData } from './seed-epc-demo';

/** Deterministic UUID for PM demo records (project 1–9, entity 1–999). */
function sid(project: number, entity: number): string {
  const n = project * 1000 + entity;
  return `00000000-0000-4000-8000-${n.toString(16).padStart(12, '0')}`;
}

function d(iso: string): Date {
  return new Date(iso);
}

export interface PmSeedContext {
  prisma: PrismaClient;
  companyId: string;
  branchId: string;
  departmentId: string;
  positionId: string;
  adminUserId: string;
  roleMap: Map<string, string>;
  defaultPassword: string;
}

interface DemoUser {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  roleName: string;
}

const DEMO_USERS: DemoUser[] = [
  {
    id: '00000000-0000-4000-8000-000000000080',
    email: 'pm@company.local',
    firstName: 'Ahmed',
    lastName: 'Hassan',
    roleName: 'Project Manager',
  },
  {
    id: '00000000-0000-4000-8000-000000000081',
    email: 'engineer@company.local',
    firstName: 'Sara',
    lastName: 'Khalil',
    roleName: 'Site Engineer',
  },
  {
    id: '00000000-0000-4000-8000-000000000082',
    email: 'safety@company.local',
    firstName: 'Omar',
    lastName: 'Farouk',
    roleName: 'Safety Officer',
  },
  {
    id: '00000000-0000-4000-8000-000000000083',
    email: 'docs@company.local',
    firstName: 'Layla',
    lastName: 'Mansour',
    roleName: 'Document Controller',
  },
  {
    id: '00000000-0000-4000-8000-000000000084',
    email: 'reviewer@company.local',
    firstName: 'Nadia',
    lastName: 'Saleh',
    roleName: 'Reviewer',
  },
  {
    id: '00000000-0000-4000-8000-000000000085',
    email: 'lead@company.local',
    firstName: 'Khalid',
    lastName: 'Nasser',
    roleName: 'Discipline Lead',
  },
  {
    id: '00000000-0000-4000-8000-000000000086',
    email: 'deptchief@company.local',
    firstName: 'Rania',
    lastName: 'Aziz',
    roleName: 'Department Chief',
  },
  {
    id: '00000000-0000-4000-8000-000000000087',
    email: 'deputychief@company.local',
    firstName: 'Youssef',
    lastName: 'Hamdan',
    roleName: 'Deputy Chief',
  },
  {
    id: '00000000-0000-4000-8000-000000000088',
    email: 'sitecoord@company.local',
    firstName: 'Maya',
    lastName: 'Fahad',
    roleName: 'Site Coordinator',
  },
  {
    id: '00000000-0000-4000-8000-000000000089',
    email: 'owner@company.local',
    firstName: 'Hassan',
    lastName: 'Al-Rashid',
    roleName: 'Discipline Owner',
  },
  {
    id: '00000000-0000-4000-8000-00000000008a',
    email: 'consultant@company.local',
    firstName: 'Elena',
    lastName: 'Petrova',
    roleName: 'Client Consultant',
  },
];

function mapProjectTeamRole(label: string): ProjectTeamRole {
  const normalized = label.toLowerCase();
  if (normalized.includes('project manager')) {
    return ProjectTeamRole.PROJECT_MANAGER;
  }
  if (normalized.includes('dispatcher')) {
    return ProjectTeamRole.DISPATCHER;
  }
  if (normalized.includes('coordinator')) {
    return ProjectTeamRole.SITE_COORDINATOR;
  }
  if (normalized.includes('deputy')) {
    return ProjectTeamRole.DEPUTY_CHIEF;
  }
  if (normalized.includes('document')) {
    return ProjectTeamRole.DOCUMENT_CONTROLLER;
  }
  if (normalized.includes('chief')) {
    return ProjectTeamRole.DEPARTMENT_CHIEF;
  }
  return ProjectTeamRole.OTHER;
}

export function seedLocalizedNames(
  name: string,
  nameZh?: string,
): { name: string; nameZh: string | null } {
  const english = name.trim();
  const chinese = nameZh?.trim();
  return {
    name: english,
    nameZh: chinese && chinese.length > 0 ? chinese : null,
  };
}

function resolveProjectNames(def: DemoProjectDef): {
  name: string;
  nameZh: string | null;
} {
  return seedLocalizedNames(def.name, def.nameZh);
}

export interface DemoProjectDef {
  index: number;
  code: string;
  name: string;
  nameZh?: string;
  location: string;
  projectType: ProjectType;
  status: ProjectStatus;
  budget: number;
  startDate: string;
  plannedFinishDate: string;
  actualFinishDate?: string;
  contractType: ProjectContractType;
  roadLengthKm?: number;
  railwayLengthKm?: number;
  urbanRailLengthKm?: number;
  grossFloorAreaM2?: number;
  designProperties?: ProjectDesignProperties;
  designStage?: ProjectDesignStage;
}

const DEMO_PROJECTS: DemoProjectDef[] = [
  {
    index: 1,
    code: 'DEMO-001',
    name: 'Marina Tower Construction',
    location: 'Dubai Marina',
    projectType: 'COMMERCIAL',
    status: 'IN_PROGRESS',
    budget: 12_500_000,
    startDate: '2024-01-15',
    plannedFinishDate: '2026-12-31',
    contractType: ProjectContractType.CONTRACT,
    grossFloorAreaM2: 78_500,
    designProperties: 'IMPLEMENTATION_DB',
    designStage: 'CONSTRUCTION_DRAWING_DESIGN_CD_IFC',
  },
  {
    index: 2,
    code: 'DEMO-002',
    name: 'Airport Expansion Phase 2',
    location: 'Abu Dhabi',
    projectType: 'INFRASTRUCTURE',
    status: 'IN_PROGRESS',
    budget: 45_000_000,
    startDate: '2025-06-01',
    plannedFinishDate: '2028-12-31',
    contractType: ProjectContractType.CONTRACT,
    railwayLengthKm: 4.2,
    urbanRailLengthKm: 2.1,
    designProperties: 'IMPLEMENTATION_DB',
    designStage: 'DETAILED_DESIGN_DD',
  },
  {
    index: 3,
    code: 'DEMO-003',
    name: 'Riverside Residential Complex',
    location: 'Sharjah',
    projectType: 'RESIDENTIAL',
    status: 'IN_PROGRESS',
    budget: 8_200_000,
    startDate: '2026-04-01',
    plannedFinishDate: '2027-09-30',
    contractType: ProjectContractType.CONTRACT,
    grossFloorAreaM2: 34_800,
    designProperties: 'IMPLEMENTATION_DBB',
    designStage: 'PRELIMINARY_DESIGN_PD',
  },
];

export async function seedDemoUsers(ctx: PmSeedContext): Promise<{
  pmUserId: string;
  engineerUserId: string;
  safetyUserId: string;
  docsUserId: string;
}> {
  const { prisma, companyId, branchId, departmentId, positionId, defaultPassword } =
    ctx;
  const passwordHash = await bcrypt.hash(defaultPassword, 12);

  for (const demoUser of DEMO_USERS) {
    const roleId = ctx.roleMap.get(demoUser.roleName);
    if (!roleId) {
      throw new Error(`Missing role for demo user: ${demoUser.roleName}`);
    }

    const user = await prisma.user.upsert({
      where: {
        companyId_email: { companyId, email: demoUser.email },
      },
      update: {
        passwordHash,
        updatedBy: ctx.adminUserId,
      },
      create: {
        id: demoUser.id,
        companyId,
        branchId,
        departmentId,
        positionId,
        firstName: demoUser.firstName,
        lastName: demoUser.lastName,
        email: demoUser.email,
        phone: '+971-50-000-0001',
        passwordHash,
        emailVerifiedAt: new Date(),
        isActive: true,
        createdBy: ctx.adminUserId,
        updatedBy: ctx.adminUserId,
      },
    });

    await prisma.userRole.upsert({
      where: {
        userId_roleId: { userId: user.id, roleId },
      },
      update: {},
      create: {
        userId: user.id,
        roleId,
        assignedBy: ctx.adminUserId,
        createdBy: ctx.adminUserId,
        updatedBy: ctx.adminUserId,
      },
    });
  }

  return {
    pmUserId: DEMO_USERS[0].id,
    engineerUserId: DEMO_USERS[1].id,
    safetyUserId: DEMO_USERS[2].id,
    docsUserId: DEMO_USERS[3].id,
  };
}

export async function seedProjectBundle(
  ctx: PmSeedContext,
  def: DemoProjectDef,
  users: {
    pmUserId: string;
    engineerUserId: string;
    safetyUserId: string;
    docsUserId: string;
  },
): Promise<{ projectId: string; projectCode: string }> {
  const { prisma, companyId, branchId, adminUserId } = ctx;
  const p = def.index;
  const prefix = def.code.replace('DEMO-', '');

  const projectNames = resolveProjectNames(def);

  const project = await prisma.project.upsert({
    where: {
      companyId_projectCode: { companyId, projectCode: def.code },
    },
    update: {
      ...projectNames,
      status: def.status,
      roadLengthKm: def.roadLengthKm,
      railwayLengthKm: def.railwayLengthKm,
      urbanRailLengthKm: def.urbanRailLengthKm,
      grossFloorAreaM2: def.grossFloorAreaM2,
      designProperties: def.designProperties,
      designStage: def.designStage,
      updatedBy: adminUserId,
    },
    create: {
      id: sid(p, 1),
      companyId,
      branchId,
      projectCode: def.code,
      ...projectNames,
      location: def.location,
      projectType: def.projectType,
      contractType: def.contractType,
      status: def.status,
      startDate: d(def.startDate),
      plannedFinishDate: d(def.plannedFinishDate),
      actualFinishDate: def.actualFinishDate ? d(def.actualFinishDate) : undefined,
      budget: def.budget,
      currency: 'USD',
      roadLengthKm: def.roadLengthKm,
      railwayLengthKm: def.railwayLengthKm,
      urbanRailLengthKm: def.urbanRailLengthKm,
      grossFloorAreaM2: def.grossFloorAreaM2,
      designProperties: def.designProperties,
      designStage: def.designStage,
      responsiblePersonId: users.pmUserId,
      createdBy: adminUserId,
      updatedBy: adminUserId,
    },
  });

  const projectId = project.id;

  // ── Team ─────────────────────────────────────────────────────────────────
  const siteCoordUserId = '00000000-0000-4000-8000-000000000088';
  const consultantUserId = '00000000-0000-4000-8000-00000000008a';

  const teamMembers = [
    { entity: 2, userId: users.pmUserId, roleOnProject: 'Project Manager' },
    { entity: 3, userId: users.engineerUserId, roleOnProject: 'Site Engineer' },
    { entity: 4, userId: users.safetyUserId, roleOnProject: 'Safety Officer' },
    { entity: 5, userId: users.docsUserId, roleOnProject: 'Document Controller' },
    { entity: 6, userId: adminUserId, roleOnProject: 'Client Representative' },
    { entity: 7, userId: siteCoordUserId, roleOnProject: 'Site Coordinator' },
    { entity: 8, userId: consultantUserId, roleOnProject: 'Client Consultant' },
  ];

  for (const member of teamMembers) {
    const teamId = sid(p, member.entity);
    const roleOnProject = mapProjectTeamRole(member.roleOnProject);

    const createData = {
      id: teamId,
      projectId,
      userId: member.userId,
      roleOnProject,
      createdBy: adminUserId,
      updatedBy: adminUserId,
    };

    const updateData = {
      roleOnProject,
      updatedBy: adminUserId,
    };

    await prisma.projectTeam.upsert({
      where: { id: teamId },
      update: updateData as Prisma.ProjectTeamUncheckedUpdateInput,
      create: createData as Prisma.ProjectTeamUncheckedCreateInput,
    });
  }

  // ── Documents folder + sample files ──────────────────────────────────────
  const folderId = sid(p, 10);
  await prisma.documentFolder.upsert({
    where: { id: folderId },
    update: {},
    create: {
      id: folderId,
      companyId,
      name: `${def.name} Documents`,
      path: `/projects/${projectId}`,
      contextType: 'PROJECT',
      contextId: projectId,
      isSystem: false,
      createdBy: adminUserId,
      updatedBy: adminUserId,
    },
  });

  const docDefs: Array<{ name: string; fileKey: string }> = [
    { name: 'Contract Agreement.pdf', fileKey: 'Contract-Agreement.pdf' },
    { name: 'Site Safety Plan.pdf', fileKey: 'Site-Safety-Plan.pdf' },
    { name: 'Project Execution Plan.pdf', fileKey: 'Project-Execution-Plan.pdf' },
  ];
  for (let i = 0; i < docDefs.length; i += 1) {
    const doc = docDefs[i];
    const docId = sid(p, 11 + i);
    const storageKey = `demo/${def.code}/${doc.fileKey}`;
    await prisma.document.upsert({
      where: { id: docId },
      update: {
        name: doc.name,
        fileKey: storageKey,
        fileType: 'application/pdf',
        updatedBy: adminUserId,
      },
      create: {
        id: docId,
        folderId,
        companyId,
        name: doc.name,
        fileKey: storageKey,
        fileType: 'application/pdf',
        fileSizeBytes: 256_000 + i * 10_000,
        version: 1,
        isCurrent: true,
        createdBy: adminUserId,
        updatedBy: adminUserId,
      },
    });
  }

  if (!(EPC_DEMO_PROJECT_CODES as readonly string[]).includes(def.code)) {
    await prisma.documentVersion.upsert({
      where: { id: sid(p, 14) },
      update: {},
      create: {
        id: sid(p, 14),
        documentId: sid(p, 11),
        uploadedBy: adminUserId,
        versionNumber: 2,
        fileKey: `demo/${def.code}/Contract-Agreement-v2.pdf`,
        fileSizeBytes: 262_000,
        changeNote: 'Contract amendment - scope clarification',
      },
    });
  }

  // ── Schedule: milestones + tasks + dependency ────────────────────────────
  const milestone1Id = sid(p, 20);
  const milestone2Id = sid(p, 21);
  await prisma.milestone.upsert({
    where: { id: milestone1Id },
    update: {},
    create: {
      id: milestone1Id,
      projectId,
      name: 'Substructure Complete',
      plannedDate: d('2026-06-30'),
      status: p <= 2 ? 'IN_PROGRESS' : 'PLANNED',
      createdBy: adminUserId,
      updatedBy: adminUserId,
    },
  });
  await prisma.milestone.upsert({
    where: { id: milestone2Id },
    update: {},
    create: {
      id: milestone2Id,
      projectId,
      name: 'Practical Completion',
      plannedDate: d(def.plannedFinishDate),
      status:
        def.status === 'COMPLETED' ? 'ACHIEVED' : 'PLANNED',
      actualDate: def.actualFinishDate ? d(def.actualFinishDate) : undefined,
      createdBy: adminUserId,
      updatedBy: adminUserId,
    },
  });

  const task1Id = sid(p, 30);
  const task2Id = sid(p, 31);
  await prisma.task.upsert({
    where: { id: task1Id },
    update: {},
    create: {
      id: task1Id,
      projectId,
      milestoneId: milestone1Id,
      dispatcherUserId: users.pmUserId,
      taskIdCode: `${prefix}-T100`,
      ...seedLocalizedNames('Foundation and piling', '基础与桩基工程'),
      description: 'Pile caps, ground beams - blinding concrete.',
      startDate: d(def.startDate),
      finishDate: d('2026-05-31'),
      durationDays: 120,
      progressPct: def.status === 'COMPLETED' ? 100 : 65 + p * 3,
      status: (def.status === 'COMPLETED'
        ? 'COMPLETED'
        : 'IN_PROGRESS') as TaskStatus,
      isCritical: true,
      createdBy: adminUserId,
      updatedBy: adminUserId,
    },
  });
  await prisma.task.upsert({
    where: { id: task2Id },
    update: {},
    create: {
      id: task2Id,
      projectId,
      milestoneId: milestone2Id,
      dispatcherUserId: users.pmUserId,
      taskIdCode: `${prefix}-T200`,
      ...seedLocalizedNames('Superstructure and envelope', '上部结构与围护'),
      description: 'Structural frame, cladding - MEP rough-in.',
      startDate: d('2026-06-01'),
      finishDate: d(def.plannedFinishDate),
      durationDays: 240,
      progressPct: def.status === 'COMPLETED' ? 100 : 25 + p * 5,
      status: (def.status === 'COMPLETED'
        ? 'COMPLETED'
        : p % 2 === 0
          ? 'IN_PROGRESS'
          : 'NOT_STARTED') as TaskStatus,
      isCritical: true,
      createdBy: adminUserId,
      updatedBy: adminUserId,
    },
  });
  await prisma.taskDependency.upsert({
    where: { id: sid(p, 32) },
    update: {},
    create: {
      id: sid(p, 32),
      predecessorTaskId: task1Id,
      successorTaskId: task2Id,
      dependencyType: 'FS',
      lagDays: 5,
      createdBy: adminUserId,
    },
  });

  // ── RFIs ─────────────────────────────────────────────────────────────────
  const rfi1Id = sid(p, 40);
  const rfi2Id = sid(p, 41);
  await prisma.rfi.upsert({
    where: { id: rfi1Id },
    update: {},
    create: {
      id: rfi1Id,
      companyId,
      projectId,
      raisedBy: users.engineerUserId,
      assignedTo: users.pmUserId,
      rfiNumber: `RFI-${prefix}-001`,
      title: 'Clarification on reinforcement spacing',
      description: 'Please confirm bar spacing at grid B4 pile cap detail.',
      discipline: 'Structural',
      priority: 'HIGH' as RfiPriority,
      status: (p % 3 === 0 ? 'ANSWERED' : 'UNDER_REVIEW') as RfiStatus,
      dateRaised: d('2026-03-01'),
      dueDate: d('2026-03-15'),
      createdBy: adminUserId,
      updatedBy: adminUserId,
    },
  });
  await prisma.rfi.upsert({
    where: { id: rfi2Id },
    update: {},
    create: {
      id: rfi2Id,
      companyId,
      projectId,
      raisedBy: users.docsUserId,
      assignedTo: users.engineerUserId,
      rfiNumber: `RFI-${prefix}-002`,
      title: 'Facade panel fixing detail',
      description: 'Request approved shop drawing reference for curtain wall anchors.',
      discipline: 'Architectural',
      priority: 'MEDIUM' as RfiPriority,
      status: 'SUBMITTED' as RfiStatus,
      dateRaised: d('2026-03-10'),
      dueDate: d('2026-03-25'),
      createdBy: adminUserId,
      updatedBy: adminUserId,
    },
  });
  await prisma.rfiResponse.upsert({
    where: { id: sid(p, 42) },
    update: {},
    create: {
      id: sid(p, 42),
      rfiId: rfi1Id,
      respondedBy: users.pmUserId,
      responseText:
        'Use 200mm centre spacing as per drawing S-104 rev C. No change to specification.',
      respondedAt: d('2026-03-12'),
      createdAt: d('2026-03-12'),
    },
  });

  // ── Submittals ───────────────────────────────────────────────────────────
  const submittal1Id = sid(p, 50);
  const submittal2Id = sid(p, 51);
  await prisma.submittal.upsert({
    where: { id: submittal1Id },
    update: {},
    create: {
      id: submittal1Id,
      projectId,
      submittedBy: users.engineerUserId,
      reviewedBy: users.pmUserId,
      submittalNumber: `SUB-${prefix}-001`,
      category: 'Shop Drawings',
      title: 'Structural steel shop drawings',
      contractor: 'Gulf Steel LLC',
      supplier: 'Emirates Fabrication',
      specReference: 'Section 05 12 00',
      revisionNumber: 2,
      status: 'UNDER_REVIEW' as SubmittalStatus,
      submissionDate: d('2026-02-20'),
      dueDate: d('2026-03-05'),
      createdBy: adminUserId,
      updatedBy: adminUserId,
    },
  });
  await prisma.submittal.upsert({
    where: { id: submittal2Id },
    update: {},
    create: {
      id: submittal2Id,
      projectId,
      submittedBy: users.docsUserId,
      submittalNumber: `SUB-${prefix}-002`,
      category: 'Product Data',
      title: 'Waterproofing membrane system',
      contractor: 'SealPro Contracting',
      specReference: 'Section 07 10 00',
      revisionNumber: 1,
      status: 'APPROVED' as SubmittalStatus,
      submissionDate: d('2026-01-28'),
      reviewDate: d('2026-02-10'),
      createdBy: adminUserId,
      updatedBy: adminUserId,
    },
  });
  await prisma.submittalReview.upsert({
    where: { id: sid(p, 52) },
    update: {},
    create: {
      id: sid(p, 52),
      submittalId: submittal2Id,
      reviewedBy: users.pmUserId,
      revisionNumber: 1,
      status: 'APPROVED' as SubmittalStatus,
      comments: 'Approved as submitted. Proceed to site installation.',
      reviewedAt: d('2026-02-10'),
      createdAt: d('2026-02-10'),
    },
  });

  // ── Drawings ─────────────────────────────────────────────────────────────
  const drawing1Id = sid(p, 60);
  const drawing2Id = sid(p, 61);
  await prisma.drawing.upsert({
    where: { id: drawing1Id },
    update: {},
    create: {
      id: drawing1Id,
      projectId,
      folderId,
      drawingNumber: `A-${prefix}-101`,
      title: 'Ground floor layout plan',
      discipline: 'Architectural',
      revision: 'C',
      status: 'ISSUED_FOR_CONSTRUCTION',
      isLatest: true,
      dateIssued: d('2026-02-01'),
      createdBy: adminUserId,
      updatedBy: adminUserId,
    },
  });
  await prisma.drawing.upsert({
    where: { id: drawing2Id },
    update: {},
    create: {
      id: drawing2Id,
      projectId,
      folderId,
      drawingNumber: `S-${prefix}-201`,
      title: 'Foundation layout plan',
      discipline: 'Structural',
      revision: 'B',
      status: 'CURRENT',
      isLatest: true,
      dateIssued: d('2026-01-20'),
      createdBy: adminUserId,
      updatedBy: adminUserId,
    },
  });
  await prisma.drawingVersion.upsert({
    where: { id: sid(p, 62) },
    update: {
      fileKey: `demo/${def.code}/Drawing-A-101-revC.pdf`,
    },
    create: {
      id: sid(p, 62),
      drawingId: drawing1Id,
      uploadedBy: users.docsUserId,
      revision: 'C',
      fileKey: `demo/${def.code}/Drawing-A-101-revC.pdf`,
      status: 'CURRENT',
      changeNote: 'Updated lobby dimensions per client instruction.',
      createdAt: d('2026-02-01'),
    },
  });
  await prisma.drawingVersion.upsert({
    where: { id: sid(p, 635) },
    update: {
      fileKey: `demo/${def.code}/Drawing-S-201-revB.pdf`,
    },
    create: {
      id: sid(p, 635),
      drawingId: drawing2Id,
      uploadedBy: users.docsUserId,
      revision: 'B',
      fileKey: `demo/${def.code}/Drawing-S-201-revB.pdf`,
      status: 'CURRENT',
      changeNote: 'Foundation layout issued for construction.',
      createdAt: d('2026-01-20'),
    },
  });
  await prisma.drawingLink.upsert({
    where: { id: sid(p, 63) },
    update: {},
    create: {
      id: sid(p, 63),
      drawingId: drawing1Id,
      linkedEntityType: 'rfi',
      linkedEntityId: sid(p, 40),
      createdBy: adminUserId,
    },
  });

  // ── Daily logs ───────────────────────────────────────────────────────────
  const dailyLogId = sid(p, 70);
  await prisma.dailyLog.upsert({
    where: { id: dailyLogId },
    update: {},
    create: {
      id: dailyLogId,
      companyId,
      projectId,
      siteEngineerId: users.engineerUserId,
      logNumber: `DL-${def.code}-001`,
      logDate: d('2026-03-14'),
      shift: 'DAY',
      weatherCondition: 'SUNNY',
      temperatureC: 32,
      rainfallMm: 0,
      rainfallLevel: 'NONE',
      workDescription:
        'Continued pile cap reinforcement on grids A3–A6. Tower crane operational. Concrete pour scheduled tomorrow.',
      status: 'SUBMITTED',
      submittedAt: d('2026-03-14'),
      submittedBy: users.engineerUserId,
      createdBy: adminUserId,
      updatedBy: adminUserId,
    },
  });
  await prisma.dailyLogWorkforce.upsert({
    where: { id: sid(p, 71) },
    update: {},
    create: {
      id: sid(p, 71),
      dailyLogId,
      trade: 'Steel fixers',
      contractor: 'Gulf Steel LLC',
      workerCount: 18,
      createdBy: adminUserId,
    },
  });
  await prisma.dailyLogEquipment.upsert({
    where: { id: sid(p, 72) },
    update: {},
    create: {
      id: sid(p, 72),
      dailyLogId,
      equipmentType: 'Tower crane',
      quantity: 1,
      hoursUsed: 9,
      hoursDowntime: 0.5,
      createdBy: adminUserId,
    },
  });
  await prisma.dailyLogVisitor.upsert({
    where: { id: sid(p, 73) },
    update: {},
    create: {
      id: sid(p, 73),
      dailyLogId,
      visitorName: 'Client QA Inspector',
      company: 'Owner Representative',
      purpose: 'INSPECTION',
      createdBy: adminUserId,
    },
  });
  await prisma.dailyLogIncident.upsert({
    where: { id: sid(p, 74) },
    update: {},
    create: {
      id: sid(p, 74),
      dailyLogId,
      incidentType: 'NEAR_MISS',
      description: 'Unsecured ladder observed at grid B2 - corrected on site.',
      severity: 'MINOR',
      createdBy: users.safetyUserId,
    },
  });

  // ── Meetings ─────────────────────────────────────────────────────────────
  const meetingId = sid(p, 80);
  await prisma.meeting.upsert({
    where: { id: meetingId },
    update: {},
    create: {
      id: meetingId,
      projectId,
      organizerId: users.pmUserId,
      meetingNumber: `MTG-${prefix}-001`,
      meetingType: 'PROGRESS' as MeetingType,
      title: 'Weekly progress coordination meeting',
      meetingDate: d('2026-03-13T09:00:00Z'),
      location: 'Site office – level 1',
      status: (p % 2 === 0 ? 'MINUTES_ISSUED' : 'CONDUCTED') as MeetingStatus,
      minutesIssuedAt: p % 2 === 0 ? d('2026-03-13T14:00:00Z') : undefined,
      createdBy: adminUserId,
      updatedBy: adminUserId,
    },
  });
  await prisma.meetingAgendaItem.upsert({
    where: { id: sid(p, 81) },
    update: {},
    create: {
      id: sid(p, 81),
      meetingId,
      presenterId: users.engineerUserId,
      itemOrder: 1,
      topic: 'Schedule update and critical path review',
      discussionNotes: 'Foundation works tracking 5 days ahead of baseline.',
      decisionsMade: 'Approve night shift for area B next week.',
      createdBy: adminUserId,
      updatedBy: adminUserId,
    },
  });
  await prisma.meetingAttendee.upsert({
    where: { id: sid(p, 82) },
    update: {},
    create: {
      id: sid(p, 82),
      meetingId,
      userId: users.pmUserId,
      roleAtMeeting: 'Chair',
      attended: true,
      createdBy: adminUserId,
    },
  });
  await prisma.actionItem.upsert({
    where: { id: sid(p, 83) },
    update: {},
    create: {
      id: sid(p, 83),
      meetingId,
      ownerId: users.engineerUserId,
      description: 'Submit revised look-ahead schedule for weeks 12–16',
      dueDate: d('2026-03-20'),
      status: 'OPEN',
      createdBy: adminUserId,
      updatedBy: adminUserId,
    },
  });

  // ── Correspondence ───────────────────────────────────────────────────────
  await prisma.correspondence.upsert({
    where: { id: sid(p, 90) },
    update: {},
    create: {
      id: sid(p, 90),
      companyId,
      projectId,
      senderUserId: users.pmUserId,
      referenceNumber: `COR-OUT-${prefix}-001`,
      correspondenceType: 'LETTER' as CorrespondenceType,
      direction: 'OUTGOING' as CorrespondenceDirection,
      subject: 'Notice of delay – material delivery',
      senderName: 'Ahmed Hassan',
      recipientName: 'Client Project Director',
      senderCompany: 'CCECC',
      correspondenceDate: d('2026-03-01'),
      status: 'SENT' as CorrespondenceStatus,
      sentAt: d('2026-03-01'),
      sentBy: adminUserId,
      createdBy: adminUserId,
      updatedBy: adminUserId,
    },
  });
  await prisma.correspondence.upsert({
    where: { id: sid(p, 91) },
    update: {},
    create: {
      id: sid(p, 91),
      companyId,
      projectId,
      recipientUserId: users.safetyUserId,
      referenceNumber: `COR-IN-${prefix}-001`,
      correspondenceType: 'MEMO' as CorrespondenceType,
      direction: 'INCOMING' as CorrespondenceDirection,
      subject: 'Toolbox talk attendance record',
      senderName: 'Omar Farouk',
      recipientName: 'All subcontractors',
      recipientCompany: 'CCECC',
      correspondenceDate: d('2026-03-08'),
      status: 'ACKNOWLEDGED' as CorrespondenceStatus,
      acknowledgedAt: d('2026-03-08'),
      acknowledgedBy: users.safetyUserId,
      createdBy: adminUserId,
      updatedBy: adminUserId,
    },
  });

  // ── Risks ────────────────────────────────────────────────────────────────
  await prisma.risk.upsert({
    where: { id: sid(p, 100) },
    update: {},
    create: {
      id: sid(p, 100),
      projectId,
      ownerId: users.pmUserId,
      riskIdCode: `RSK-${prefix}-001`,
      title: 'Material price escalation',
      description: 'Steel and cement prices volatile due to supply chain constraints.',
      category: 'COST' as RiskCategory,
      probability: 4,
      impact: 4,
      riskScore: 16,
      mitigationPlan: 'Lock in bulk purchase agreements for Q2–Q3.',
      status: 'MONITORING' as RiskStatus,
      reviewDate: d('2026-04-01'),
      createdBy: adminUserId,
      updatedBy: adminUserId,
    },
  });
  await prisma.risk.upsert({
    where: { id: sid(p, 101) },
    update: {},
    create: {
      id: sid(p, 101),
      projectId,
      ownerId: users.safetyUserId,
      riskIdCode: `RSK-${prefix}-002`,
      title: 'Working at height – crane operations',
      description: 'Increased crane activity during superstructure phase.',
      category: 'SAFETY' as RiskCategory,
      probability: 3,
      impact: 5,
      riskScore: 15,
      mitigationPlan: 'Daily toolbox talks and third-party crane inspection.',
      status: 'OPEN' as RiskStatus,
      reviewDate: d('2026-03-25'),
      createdBy: adminUserId,
      updatedBy: adminUserId,
    },
  });

  // ── Issues ───────────────────────────────────────────────────────────────
  await prisma.issue.upsert({
    where: { id: sid(p, 110) },
    update: {},
    create: {
      id: sid(p, 110),
      companyId,
      projectId,
      raisedBy: users.engineerUserId,
      assignedTo: users.pmUserId,
      issueNumber: `ISS-${prefix}-001`,
      issueType: 'Quality',
      description: 'Honeycombing observed at column C2 – level 3.',
      location: 'Level 3 / Grid C2',
      severity: 'MEDIUM' as IssueSeverity,
      status: 'IN_PROGRESS' as IssueStatus,
      dueDate: d('2026-03-22'),
      createdBy: adminUserId,
      updatedBy: adminUserId,
    },
  });
  await prisma.issue.upsert({
    where: { id: sid(p, 111) },
    update: {},
    create: {
      id: sid(p, 111),
      companyId,
      projectId,
      raisedBy: users.safetyUserId,
      assignedTo: users.engineerUserId,
      issueNumber: `ISS-${prefix}-002`,
      issueType: 'Safety',
      description: 'Missing edge protection at slab opening – grid D5.',
      location: 'Level 2 / Grid D5',
      severity: 'HIGH' as IssueSeverity,
      status: 'OPEN' as IssueStatus,
      dueDate: d('2026-03-18'),
      createdBy: adminUserId,
      updatedBy: adminUserId,
    },
  });

  // ── Punch list ───────────────────────────────────────────────────────────
  await prisma.punchItem.upsert({
    where: { id: sid(p, 120) },
    update: {},
    create: {
      id: sid(p, 120),
      companyId,
      projectId,
      raisedBy: users.engineerUserId,
      assignedTo: users.docsUserId,
      punchNumber: `PL-${prefix}-001`,
      title: 'Touch-up paint – main lobby',
      description: 'Touch-up paint required in main lobby',
      roomOrArea: 'Ground floor lobby',
      tradeResponsible: 'Painting',
      severity: 'MINOR' as PunchItemSeverity,
      status: 'ASSIGNED' as PunchItemStatus,
      dueDate: d('2026-04-05'),
      createdBy: adminUserId,
      updatedBy: adminUserId,
    },
  });
  await prisma.punchItem.upsert({
    where: { id: sid(p, 121) },
    update: {},
    create: {
      id: sid(p, 121),
      companyId,
      projectId,
      raisedBy: users.pmUserId,
      punchNumber: `PL-${prefix}-002`,
      title: 'Door closer adjustment – FE-03',
      description: 'Door closer adjustment – fire exit FE-03',
      roomOrArea: 'Level 1 corridor',
      tradeResponsible: 'Doors & hardware',
      severity: 'MAJOR' as PunchItemSeverity,
      status: 'RAISED' as PunchItemStatus,
      dueDate: d('2026-04-10'),
      createdBy: adminUserId,
      updatedBy: adminUserId,
    },
  });

  // ── Closeout ─────────────────────────────────────────────────────────────
  {
    const closeoutStatus: CloseoutStatus =
      def.status === 'COMPLETED'
        ? 'DEFECTS_LIABILITY_PERIOD'
        : 'PRACTICAL_COMPLETION';

    const closeout = await prisma.closeout.upsert({
      where: { projectId },
      update: {},
      create: {
        id: sid(p, 130),
        projectId,
        practicalCompletionDate: def.actualFinishDate
          ? d(def.actualFinishDate)
          : d('2026-12-31'),
        defectsLiabilityEndDate: d('2026-12-31'),
        status: closeoutStatus,
        contractValue: def.budget,
        variationsTotal: def.budget * 0.05,
        finalSettlement: def.budget * 1.02,
        createdBy: adminUserId,
        updatedBy: adminUserId,
      },
    });

    const checklist: Array<{
      entity: number;
      category: string;
      description: string;
      isComplete: boolean;
    }> = [
      {
        entity: 131,
        category: 'Handover',
        description: 'As-built drawings submitted to client',
        isComplete: def.status === 'COMPLETED',
      },
      {
        entity: 132,
        category: 'Handover',
        description: 'O&M manuals received and filed',
        isComplete: def.status === 'COMPLETED',
      },
      {
        entity: 133,
        category: 'Financial',
        description: 'Final account agreed with client',
        isComplete: false,
      },
      {
        entity: 134,
        category: 'Warranties',
        description: 'Defects liability period register issued',
        isComplete: def.status === 'COMPLETED',
      },
      {
        entity: 135,
        category: 'Archive',
        description: 'Project records archived to document management',
        isComplete: false,
      },
    ];

    for (const item of checklist) {
      await prisma.closeoutChecklistItem.upsert({
        where: { id: sid(p, item.entity) },
        update: {},
        create: {
          id: sid(p, item.entity),
          closeoutId: closeout.id,
          category: item.category,
          description: item.description,
          isComplete: item.isComplete,
          completedAt: item.isComplete ? d('2026-01-15') : undefined,
          verifiedBy: item.isComplete ? users.pmUserId : undefined,
          createdBy: adminUserId,
          updatedBy: adminUserId,
        },
      });
    }

    await prisma.warranty.upsert({
      where: { id: sid(p, 136) },
      update: {},
      create: {
        id: sid(p, 136),
        closeoutId: closeout.id,
        itemDescription: 'MEP equipment manufacturer warranty',
        supplier: 'Gulf MEP Services',
        startDate: def.actualFinishDate ? d(def.actualFinishDate) : d('2026-06-30'),
        expiryDate: d('2028-06-30'),
        createdBy: adminUserId,
        updatedBy: adminUserId,
      },
    });
  }

  return { projectId, projectCode: def.code };
}

/**
 * Removes prior demo PM records so re-seeding stays idempotent.
 */
async function cleanupDemoPmData(ctx: PmSeedContext): Promise<void> {
  const { prisma, companyId } = ctx;
  const codes = DEMO_PROJECTS.map((p) => p.code);

  const projects = await prisma.project.findMany({
    where: { companyId, projectCode: { in: codes } },
    select: { id: true },
  });

  const projectIds = projects.map((p) => p.id);
  if (projectIds.length === 0) {
    return;
  }

  const taskIds = (
    await prisma.task.findMany({
      where: { projectId: { in: projectIds } },
      select: { id: true },
    })
  ).map((t) => t.id);

  const rfiIds = (
    await prisma.rfi.findMany({
      where: { projectId: { in: projectIds } },
      select: { id: true },
    })
  ).map((r) => r.id);

  const submittalIds = (
    await prisma.submittal.findMany({
      where: { projectId: { in: projectIds } },
      select: { id: true },
    })
  ).map((s) => s.id);

  const drawingIds = (
    await prisma.drawing.findMany({
      where: { projectId: { in: projectIds } },
      select: { id: true },
    })
  ).map((d) => d.id);

  const dailyLogIds = (
    await prisma.dailyLog.findMany({
      where: { projectId: { in: projectIds } },
      select: { id: true },
    })
  ).map((l) => l.id);

  const meetingIds = (
    await prisma.meeting.findMany({
      where: { projectId: { in: projectIds } },
      select: { id: true },
    })
  ).map((m) => m.id);

  const closeoutIds = (
    await prisma.closeout.findMany({
      where: { projectId: { in: projectIds } },
      select: { id: true },
    })
  ).map((c) => c.id);

  const folderIds = (
    await prisma.documentFolder.findMany({
      where: { companyId, contextType: 'PROJECT', contextId: { in: projectIds } },
      select: { id: true },
    })
  ).map((f) => f.id);

  if (taskIds.length > 0) {
    await prisma.taskDependency.deleteMany({
      where: {
        OR: [
          { predecessorTaskId: { in: taskIds } },
          { successorTaskId: { in: taskIds } },
        ],
      },
    });
  }

  if (rfiIds.length > 0) {
    await prisma.rfiResponse.deleteMany({ where: { rfiId: { in: rfiIds } } });
  }

  if (submittalIds.length > 0) {
    await prisma.submittalReview.deleteMany({
      where: { submittalId: { in: submittalIds } },
    });
  }

  if (drawingIds.length > 0) {
    await prisma.drawingVersion.deleteMany({
      where: { drawingId: { in: drawingIds } },
    });
    await prisma.drawingLink.deleteMany({
      where: { drawingId: { in: drawingIds } },
    });
  }

  if (dailyLogIds.length > 0) {
    await prisma.dailyLogWorkforce.deleteMany({
      where: { dailyLogId: { in: dailyLogIds } },
    });
    await prisma.dailyLogEquipment.deleteMany({
      where: { dailyLogId: { in: dailyLogIds } },
    });
    await prisma.dailyLogVisitor.deleteMany({
      where: { dailyLogId: { in: dailyLogIds } },
    });
    await prisma.dailyLogIncident.deleteMany({
      where: { dailyLogId: { in: dailyLogIds } },
    });
  }

  if (meetingIds.length > 0) {
    await prisma.meetingAgendaItem.deleteMany({
      where: { meetingId: { in: meetingIds } },
    });
    await prisma.meetingAttendee.deleteMany({
      where: { meetingId: { in: meetingIds } },
    });
    await prisma.actionItem.deleteMany({
      where: { meetingId: { in: meetingIds } },
    });
  }

  if (closeoutIds.length > 0) {
    await prisma.closeoutChecklistItem.deleteMany({
      where: { closeoutId: { in: closeoutIds } },
    });
    await prisma.warranty.deleteMany({
      where: { closeoutId: { in: closeoutIds } },
    });
  }

  if (folderIds.length > 0) {
    const documentIds = (
      await prisma.document.findMany({
        where: { folderId: { in: folderIds } },
        select: { id: true },
      })
    ).map((d) => d.id);

    await cleanupEpcDemoData(prisma, companyId);

    if (documentIds.length > 0) {
      await prisma.documentVersion.deleteMany({
        where: { documentId: { in: documentIds } },
      });
      await prisma.document.deleteMany({ where: { id: { in: documentIds } } });
    }
  }

  await prisma.task.deleteMany({ where: { projectId: { in: projectIds } } });
  await prisma.milestone.deleteMany({ where: { projectId: { in: projectIds } } });
  await prisma.rfi.deleteMany({ where: { projectId: { in: projectIds } } });
  await prisma.submittal.deleteMany({ where: { projectId: { in: projectIds } } });
  await prisma.drawing.deleteMany({ where: { projectId: { in: projectIds } } });
  await prisma.dailyLog.deleteMany({ where: { projectId: { in: projectIds } } });
  await prisma.meeting.deleteMany({ where: { projectId: { in: projectIds } } });
  await prisma.correspondence.deleteMany({
    where: { projectId: { in: projectIds } },
  });
  await prisma.risk.deleteMany({ where: { projectId: { in: projectIds } } });
  await prisma.issueResponse.deleteMany({
    where: { issue: { projectId: { in: projectIds } } },
  });
  await prisma.issue.deleteMany({ where: { projectId: { in: projectIds } } });
  await prisma.punchItem.deleteMany({ where: { projectId: { in: projectIds } } });
  await prisma.closeout.deleteMany({ where: { projectId: { in: projectIds } } });
  await prisma.projectTeam.deleteMany({ where: { projectId: { in: projectIds } } });

  if (folderIds.length > 0) {
    await prisma.documentFolder.deleteMany({ where: { id: { in: folderIds } } });
  }

  await prisma.project.deleteMany({ where: { id: { in: projectIds } } });
}

/**
 * Seeds multiple demo projects with full PM submodule data for UI preview.
 */
export async function seedPmDemoData(ctx: PmSeedContext): Promise<void> {
  console.log('Seeding Project Management demo data...');

  await cleanupDemoPmData(ctx);

  const users = await seedDemoUsers(ctx);
  const seeded: string[] = [];

  for (const def of DEMO_PROJECTS) {
    const result = await seedProjectBundle(ctx, def, users);
    seeded.push(result.projectCode);
  }

  await seedEpcDemoData(ctx);

  console.log(`  PM demo projects seeded: ${seeded.join(', ')}`);
  console.log('  Demo users (password same as admin):');
  for (const u of DEMO_USERS) {
    console.log(`    ${u.email} (${u.roleName})`);
  }
}
