/**
 * Upserts the OFFICIAL_SEAL_USAGE and PROJECT_SEAL_USAGE approval categories
 * for one company: any employee may submit; single approval step, Managing Director.
 *
 * Touches only these two rows: no deletes, no changes to other categories or
 * to existing approval requests. On an existing row it updates only the
 * approval chain, requestability, active flag and permission module - name,
 * form schema, numbering and icon stay as they are.
 *
 * Run: cd backend && npx ts-node --transpile-only prisma/scripts/seed-seal-categories.ts
 * Set COMPANY_ID=<uuid> when more than one company exists.
 */
import { Prisma, PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const SYSTEM_ADMINISTRATOR_ROLE = 'System Administrator';

const tier = (label: string, role: string, order: number) => ({
  label,
  resolver: 'ROLE' as const,
  role,
  order,
});

/** Same as the seal entries in prisma/seeds/approval-categories.seed.ts. */
const MANAGING_DIRECTOR_RULES = [
  {
    name: 'Default',
    tiers: [tier('Managing Director', 'MANAGING_DIRECTOR', 1)],
  },
];

interface SealCategoryDef {
  code: string;
  name: string;
  description: string;
  module: string;
  numberPrefix: string;
  icon: string;
  sortOrder: number;
  permissionModule: string;
  formSchema: { fields: Array<Record<string, unknown>> };
}

const SEAL_CATEGORIES: SealCategoryDef[] = [
  {
    code: 'OFFICIAL_SEAL_USAGE',
    name: 'Official Seal Usage',
    description: 'Request to apply the company official seal to documents.',
    module: 'ADMIN',
    numberPrefix: 'OSU',
    icon: 'SafetyCertificateOutlined',
    sortOrder: 80,
    permissionModule: 'official-seal',
    formSchema: {
      fields: [
        { name: 'documentTitle', label: 'Document Title', type: 'text', required: true },
        { name: 'documentType', label: 'Document Type', type: 'text', required: true },
        { name: 'purpose', label: 'Purpose', type: 'textarea', required: true },
        { name: 'dateRequired', label: 'Date Required', type: 'date', required: true },
      ],
    },
  },
  {
    code: 'PROJECT_SEAL_USAGE',
    name: 'Project Seal Usage',
    description: 'Request to apply a project seal to project documents.',
    module: 'PROJECTS',
    numberPrefix: 'PSU',
    icon: 'FileProtectOutlined',
    sortOrder: 90,
    permissionModule: 'project-seal',
    formSchema: {
      fields: [
        { name: 'projectName', label: 'Project Name', type: 'text', required: true },
        { name: 'documentTitle', label: 'Document Title', type: 'text', required: true },
        { name: 'purpose', label: 'Purpose', type: 'textarea', required: true },
        { name: 'dateRequired', label: 'Date Required', type: 'date', required: true },
      ],
    },
  },
];

async function resolveCompanyId(): Promise<string> {
  const fromEnv = process.env.COMPANY_ID?.trim();
  if (fromEnv) {
    const company = await prisma.company.findFirst({
      where: { id: fromEnv, deletedAt: null },
      select: { id: true },
    });
    if (!company) {
      throw new Error(`Company ${fromEnv} (COMPANY_ID) not found`);
    }
    return company.id;
  }

  const companies = await prisma.company.findMany({
    where: { deletedAt: null },
    orderBy: { createdAt: 'asc' },
    select: { id: true },
    take: 2,
  });
  if (companies.length === 0) {
    throw new Error('No company found. Run the core seed first.');
  }
  if (companies.length > 1) {
    throw new Error('More than one company exists. Set COMPANY_ID to choose one.');
  }
  return companies[0].id;
}

async function resolveActorUserId(companyId: string): Promise<string> {
  const admin = await prisma.user.findFirst({
    where: {
      companyId,
      deletedAt: null,
      userRoles: {
        some: {
          deletedAt: null,
          role: { name: SYSTEM_ADMINISTRATOR_ROLE, companyId, deletedAt: null },
        },
      },
    },
    orderBy: { createdAt: 'asc' },
    select: { id: true },
  });
  if (!admin) {
    throw new Error(`No ${SYSTEM_ADMINISTRATOR_ROLE} user found for company ${companyId}`);
  }
  return admin.id;
}

async function main(): Promise<void> {
  const companyId = await resolveCompanyId();
  const actorUserId = await resolveActorUserId(companyId);
  const approvalRules = MANAGING_DIRECTOR_RULES as unknown as Prisma.InputJsonValue;

  for (const def of SEAL_CATEGORIES) {
    const chainFields = {
      isActive: true,
      isUserRequestable: true,
      permissionModule: def.permissionModule,
      approvalRules,
      updatedBy: actorUserId,
      deletedAt: null,
      deletedBy: null,
    };

    const saved = await prisma.approvalCategory.upsert({
      where: { companyId_code: { companyId, code: def.code } },
      create: {
        companyId,
        code: def.code,
        name: def.name,
        description: def.description,
        module: def.module,
        numberPrefix: def.numberPrefix,
        icon: def.icon,
        sortOrder: def.sortOrder,
        allowAttachments: true,
        formSchema: def.formSchema as unknown as Prisma.InputJsonValue,
        createdBy: actorUserId,
        ...chainFields,
      },
      update: chainFields,
      select: { code: true, isUserRequestable: true, permissionModule: true, approvalRules: true },
    });

    console.log(
      `${saved.code} upserted (company ${companyId}): requestable=${saved.isUserRequestable}, ` +
        `permissionModule=${saved.permissionModule}, rules=${JSON.stringify(saved.approvalRules)}`,
    );
  }
}

main()
  .catch((error: unknown) => {
    console.error('Seal category upsert failed:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
