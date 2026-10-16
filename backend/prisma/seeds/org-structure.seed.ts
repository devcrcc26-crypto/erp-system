import type { PrismaClient } from '@prisma/client';

const BRANCH_NAME = 'Ethiopia Regional HQ';

const DIVISIONS = [
  {
    name: 'Production Department',
    code: 'PROD',
    description: 'Production division - design and engineering departments',
  },
  {
    name: 'Functional Department',
    code: 'FUNC',
    description: 'Functional division - finance, HR, operations, and support',
  },
] as const;

type DivisionSeedKey = (typeof DIVISIONS)[number]['code'];

/**
 * Departments keyed by division code.
 *
 * Survey Department sits under Municipal Transport Department in the real org
 * chart image, but is seeded as a sibling under Production because Department
 * has no parentDepartmentId. Enforce via parentDepartmentId if the schema is
 * extended later.
 */
const DEPARTMENTS: ReadonlyArray<{
  name: string;
  nameZh: string;
  divisionCode: DivisionSeedKey;
  surveySiblingNote?: boolean;
}> = [
  {
    name: 'Municipal Transport Department',
    nameZh: '市政交通部',
    divisionCode: 'PROD',
  },
  {
    name: 'Survey Department',
    nameZh: '勘测部',
    divisionCode: 'PROD',
    surveySiblingNote: true,
  },
  {
    name: 'Architectural Design Department',
    nameZh: '建筑设计部',
    divisionCode: 'PROD',
  },
  {
    name: 'Engineering Management Department',
    nameZh: '工程管理部',
    divisionCode: 'PROD',
  },
  {
    name: 'Finance Department',
    nameZh: '财务部',
    divisionCode: 'FUNC',
  },
  {
    name: 'General HR Department',
    nameZh: '综合人力部',
    divisionCode: 'FUNC',
  },
  {
    name: 'Operations Department',
    nameZh: '经营部',
    divisionCode: 'FUNC',
  },
  {
    name: 'Technology Centre',
    nameZh: '技术中心',
    divisionCode: 'FUNC',
  },
  {
    name: 'Production Management Department',
    nameZh: '生产管理部',
    divisionCode: 'FUNC',
  },
];

async function nextDepartmentCode(prisma: PrismaClient): Promise<string> {
  await prisma.$executeRawUnsafe(
    `CREATE SEQUENCE IF NOT EXISTS "department_code_seq" START WITH 1 INCREMENT BY 1`,
  );
  const result = await prisma.$queryRaw<Array<{ nextval: bigint }>>`
    SELECT nextval('department_code_seq')
  `;
  const seq = Number(result[0]?.nextval ?? 1);
  return `DEPT-${String(seq).padStart(4, '0')}`;
}

async function ensureBranch(
  prisma: PrismaClient,
  params: { companyId: string; createdBy: string },
): Promise<{ id: string; name: string; created: boolean }> {
  const existing = await prisma.branch.findFirst({
    where: {
      companyId: params.companyId,
      name: BRANCH_NAME,
      deletedAt: null,
    },
    select: { id: true, name: true },
  });
  if (existing) {
    return { ...existing, created: false };
  }

  const created = await prisma.branch.create({
    data: {
      companyId: params.companyId,
      name: BRANCH_NAME,
      country: 'Ethiopia',
      isHeadOffice: false,
      isActive: true,
      createdBy: params.createdBy,
      updatedBy: params.createdBy,
    },
    select: { id: true, name: true },
  });
  return { ...created, created: true };
}

/**
 * Idempotent division ensure: match companyId+name first, else companyId+code.
 */
async function ensureDivision(
  prisma: PrismaClient,
  params: {
    companyId: string;
    createdBy: string;
    name: string;
    code: string;
    description: string;
  },
): Promise<{ id: string; name: string; code: string; created: boolean }> {
  const byName = await prisma.division.findFirst({
    where: {
      companyId: params.companyId,
      name: params.name,
      deletedAt: null,
    },
    select: { id: true, name: true, code: true },
  });
  if (byName) {
    await prisma.division.update({
      where: { id: byName.id },
      data: {
        description: params.description,
        isActive: true,
        updatedBy: params.createdBy,
      },
    });
    return { ...byName, created: false };
  }

  const byCode = await prisma.division.findFirst({
    where: {
      companyId: params.companyId,
      code: params.code,
      deletedAt: null,
    },
    select: { id: true, name: true, code: true },
  });
  if (byCode) {
    await prisma.division.update({
      where: { id: byCode.id },
      data: {
        name: params.name,
        description: params.description,
        isActive: true,
        updatedBy: params.createdBy,
      },
    });
    return {
      id: byCode.id,
      name: params.name,
      code: byCode.code,
      created: false,
    };
  }

  const created = await prisma.division.create({
    data: {
      companyId: params.companyId,
      name: params.name,
      code: params.code,
      description: params.description,
      isActive: true,
      createdBy: params.createdBy,
      updatedBy: params.createdBy,
    },
    select: { id: true, name: true, code: true },
  });
  return { ...created, created: true };
}

/** Legacy names that should be renamed into the Ethiopia org chart names. */
const DEPARTMENT_NAME_ALIASES: Readonly<Record<string, string[]>> = {
  'Municipal Transport Department': ['Municipal Transportation Department'],
};

async function ensureDepartment(
  prisma: PrismaClient,
  params: {
    companyId: string;
    divisionId: string;
    branchId: string;
    name: string;
    nameZh: string;
    createdBy: string;
  },
): Promise<{ id: string; name: string; code: string; created: boolean }> {
  const aliasNames = DEPARTMENT_NAME_ALIASES[params.name] ?? [];
  const existing = await prisma.department.findFirst({
    where: {
      companyId: params.companyId,
      deletedAt: null,
      OR: [
        { name: params.name },
        ...(aliasNames.length > 0 ? [{ name: { in: aliasNames } }] : []),
      ],
    },
    select: { id: true, name: true, code: true },
  });
  if (existing) {
    await prisma.department.update({
      where: { id: existing.id },
      data: {
        name: params.name,
        nameZh: params.nameZh,
        divisionId: params.divisionId,
        branchId: params.branchId,
        isActive: true,
        // leaderUserId intentionally left untouched - set when Q1 employee data arrives
        updatedBy: params.createdBy,
      },
    });
    return { id: existing.id, name: params.name, code: existing.code, created: false };
  }

  const created = await prisma.department.create({
    data: {
      companyId: params.companyId,
      divisionId: params.divisionId,
      branchId: params.branchId,
      name: params.name,
      nameZh: params.nameZh,
      code: await nextDepartmentCode(prisma),
      isActive: true,
      // leaderUserId omitted - populated when Q1 employee data arrives
      createdBy: params.createdBy,
      updatedBy: params.createdBy,
    },
    select: { id: true, name: true, code: true },
  });
  return { ...created, created: true };
}

export interface SeedOrgStructureParams {
  companyId: string;
  createdBy: string;
}

/**
 * Seeds Ethiopia Regional HQ org chart: 2 divisions × 9 departments.
 * Idempotent on Branch/Division/Department name within companyId.
 */
export async function seedOrgStructure(
  prisma: PrismaClient,
  params: SeedOrgStructureParams,
): Promise<void> {
  console.log('Seeding org structure (Ethiopia Regional HQ)…');

  const branch = await ensureBranch(prisma, params);

  const divisionByCode = new Map<
    DivisionSeedKey,
    { id: string; name: string; code: string; created: boolean }
  >();

  for (const def of DIVISIONS) {
    const division = await ensureDivision(prisma, {
      companyId: params.companyId,
      createdBy: params.createdBy,
      name: def.name,
      code: def.code,
      description: def.description,
    });
    divisionByCode.set(def.code, division);
  }

  const departmentResults: Array<{
    name: string;
    nameZh: string;
    code: string;
    divisionName: string;
    created: boolean;
    surveySiblingNote?: boolean;
  }> = [];

  for (const def of DEPARTMENTS) {
    const division = divisionByCode.get(def.divisionCode);
    if (!division) {
      throw new Error(`Missing division for code ${def.divisionCode}`);
    }

    // Survey Department: in the real org chart it sits under Municipal Transport
    // Department. Schema has no parentDepartmentId, so it is seeded as a sibling
    // under the Production Department division. Enforce hierarchy via
    // parentDepartmentId if/when the schema is extended.
    const department = await ensureDepartment(prisma, {
      companyId: params.companyId,
      divisionId: division.id,
      branchId: branch.id,
      name: def.name,
      nameZh: def.nameZh,
      createdBy: params.createdBy,
    });

    departmentResults.push({
      name: department.name,
      nameZh: def.nameZh,
      code: department.code,
      divisionName: division.name,
      created: department.created,
      surveySiblingNote: def.surveySiblingNote,
    });
  }

  console.log('Org structure seed summary:');
  console.log(
    `  Branch: ${branch.name} (${branch.created ? 'created' : 'already existed'})`,
  );
  for (const division of divisionByCode.values()) {
    console.log(
      `  Division: ${division.name} [${division.code}] (${division.created ? 'created' : 'already existed'})`,
    );
    for (const dept of departmentResults.filter(
      (row) => row.divisionName === division.name,
    )) {
      const note = dept.surveySiblingNote
        ? ' - sibling of Municipal Transport (no parentDepartmentId yet)'
        : '';
      console.log(
        `    · ${dept.name} / ${dept.nameZh} [${dept.code}] (${dept.created ? 'created' : 'already existed'})${note}`,
      );
    }
  }
}
