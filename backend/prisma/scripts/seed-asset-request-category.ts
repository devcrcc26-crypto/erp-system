/**
 * Upserts the ASSET_REQUEST approval category for one company.
 * Touches only that row: no deletes, no changes to other categories or requests.
 *
 * Run: cd backend && npx ts-node --transpile-only prisma/scripts/seed-asset-request-category.ts
 * Set COMPANY_ID=<uuid> when more than one company exists.
 */
import { Prisma, PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const CODE = 'ASSET_REQUEST';
const SYSTEM_ADMINISTRATOR_ROLE = 'System Administrator';

const tier = (label: string, role: string, order: number) => ({
  label,
  resolver: 'ROLE' as const,
  role,
  order,
});

// Same as the ASSET_REQUEST entry in prisma/seeds/approval-categories.seed.ts.
const FORM_SCHEMA = {
  fields: [
    { name: 'assetCategory', label: 'Asset Category', type: 'text', required: true },
    { name: 'assetType', label: 'Asset Type / Model', type: 'text' },
    { name: 'reason', label: 'Reason', type: 'textarea', required: true },
    { name: 'requiredByDate', label: 'Required By', type: 'date' },
  ],
};

const APPROVAL_RULES = [
  {
    name: 'Default',
    tiers: [
      tier('Department Head', 'DEPARTMENT_HEAD', 1),
      tier('Warehouse Manager', 'WAREHOUSE_MANAGER', 2),
    ],
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

  const data = {
    name: 'Asset Request',
    description: 'Request for a company asset such as a laptop, phone or office furniture.',
    module: 'INVENTORY',
    numberPrefix: 'ASR',
    icon: 'LaptopOutlined',
    sortOrder: 45,
    isActive: true,
    isUserRequestable: true,
    permissionModule: 'material-requisition',
    allowAttachments: true,
    formSchema: FORM_SCHEMA as unknown as Prisma.InputJsonValue,
    approvalRules: APPROVAL_RULES as unknown as Prisma.InputJsonValue,
    updatedBy: actorUserId,
    deletedAt: null,
    deletedBy: null,
  };

  await prisma.approvalCategory.upsert({
    where: { companyId_code: { companyId, code: CODE } },
    create: { companyId, code: CODE, createdBy: actorUserId, ...data },
    update: data,
  });

  console.log(`Asset Request category upserted (company ${companyId})`);
}

main()
  .catch((error: unknown) => {
    console.error('Asset Request category upsert failed:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
