/**
 * Wipes and reseeds purchase requests + material requisitions with 10
 * realistic records each, including full approval chains and ETB totals.
 *
 * Prerequisites: HR users (Wei Chen, Xiaoming Li, Jinxia, David Wu),
 * approval categories PURCHASE_REQUEST + MATERIAL_REQUISITION,
 * and active projects.
 *
 * Run: npx ts-node --transpile-only prisma/seeds/hr-purchase-material.seed.ts
 */
import { randomUUID } from 'crypto';
import {
  ApprovalRequestStatus,
  ApprovalTierDecision,
  MaterialRequisitionStatus,
  PrismaClient,
  PurchaseRequestStatus,
  SupportedCurrency,
  User,
} from '@prisma/client';

const prisma = new PrismaClient();

/** Status values shared across purchase / material request statuses. */
type HrRequestStatus =
  | 'DRAFT'
  | 'SUBMITTED'
  | 'IN_REVIEW'
  | 'APPROVED'
  | 'REJECTED'
  | 'RETURNED'
  | 'CANCELLED';

type UserWithDisciplineLeader = User & {
  engineeringDiscipline: { leader: User | null } | null;
};

interface ChainContext {
  xiaomingLi: User;
  jinxia: User;
  davidWu: User;
}

interface TierDraft {
  order: number;
  label: string;
  approverId: string;
  resolver: string;
  decision: ApprovalTierDecision;
  comment: string | null;
}

interface PurchaseItemDraft {
  itemName: string;
  description: string;
  quantity: number;
  unit: string;
  unitPrice: number;
  currency: SupportedCurrency;
}

interface MaterialItemDraft {
  itemName: string;
  itemCode: string;
  description: string;
  quantity: number;
  unit: string;
}

// ────────────────────────────────────────────────────────────────────────────
// Approval chain helpers
// ────────────────────────────────────────────────────────────────────────────

function buildTierDecisions(
  tiers: { order: number; label: string; approverId: string; resolver: string }[],
  finalStatus: HrRequestStatus,
): { currentTier: number; tiers: TierDraft[] } {
  if (finalStatus === 'APPROVED') {
    return {
      currentTier: tiers[tiers.length - 1].order,
      tiers: tiers.map((t) => ({
        ...t,
        decision: ApprovalTierDecision.APPROVED,
        comment: 'Approved.',
      })),
    };
  }
  if (finalStatus === 'REJECTED') {
    return {
      currentTier: tiers[0].order,
      tiers: tiers.map((t, i) => ({
        ...t,
        decision:
          i === 0 ? ApprovalTierDecision.REJECTED : ApprovalTierDecision.PENDING,
        comment: i === 0 ? 'Not authorized for this period.' : null,
      })),
    };
  }
  if (finalStatus === 'RETURNED') {
    return {
      currentTier: tiers[0].order,
      tiers: tiers.map((t, i) => ({
        ...t,
        decision:
          i === 0 ? ApprovalTierDecision.RETURNED : ApprovalTierDecision.PENDING,
        comment: i === 0 ? 'Please provide additional details.' : null,
      })),
    };
  }
  if (finalStatus === 'IN_REVIEW') {
    return {
      currentTier: tiers[1]?.order ?? tiers[0].order,
      tiers: tiers.map((t, i) => ({
        ...t,
        decision:
          i === 0 ? ApprovalTierDecision.APPROVED : ApprovalTierDecision.PENDING,
        comment: i === 0 ? 'Approved at discipline level.' : null,
      })),
    };
  }
  return {
    currentTier: tiers[0].order,
    tiers: tiers.map((t) => ({
      ...t,
      decision: ApprovalTierDecision.PENDING,
      comment: null,
    })),
  };
}

/**
 * Builds Discipline Lead → HR Officer → (optional) General Manager approval
 * request whose tier decisions already reflect the requested final status.
 */
async function createApprovalChain(
  ctx: ChainContext,
  params: {
    employeeId: string;
    categoryCode: string;
    title: string;
    status: HrRequestStatus;
    companyId: string;
    /** When false, omits the General Manager tier (purchase requests ≤ 10,000 ETB). */
    includeGm?: boolean;
  },
): Promise<{ id: string; requestNumber: string }> {
  const {
    employeeId,
    categoryCode,
    title,
    status,
    companyId,
    includeGm = true,
  } = params;

  const employee = (await prisma.user.findUnique({
    where: { id: employeeId },
    include: { engineeringDiscipline: { include: { leader: true } } },
  })) as UserWithDisciplineLeader | null;

  const disciplineLead = employee?.engineeringDiscipline?.leader;

  const draftTiers = [
    {
      order: 1,
      label: 'Discipline Lead',
      approverId: disciplineLead?.id ?? ctx.xiaomingLi.id,
      resolver: 'DISCIPLINE_LEAD',
    },
    {
      order: 2,
      label: 'HR Officer',
      approverId: ctx.jinxia.id,
      resolver: 'ROLE:HR Officer',
    },
    ...(includeGm
      ? [
          {
            order: 3,
            label: 'General Manager',
            approverId: ctx.davidWu.id,
            resolver: 'ROLE:General Manager',
          },
        ]
      : []),
  ].filter(
    (tier, index, self) =>
      self.findIndex((t) => t.approverId === tier.approverId) === index,
  );

  const category = await prisma.approvalCategory.findFirst({
    where: { code: categoryCode, companyId },
  });
  if (!category) {
    throw new Error(
      `Approval category "${categoryCode}" not found for company ${companyId}`,
    );
  }

  const seq = await prisma.$queryRaw<
    Array<{ nextval: bigint | number }>
  >`SELECT nextval('approval_request_number_seq') as nextval`;
  const requestNumber = `${category.numberPrefix}-${String(
    Number(seq[0]?.nextval ?? 1),
  ).padStart(4, '0')}`;

  const tierDecisions = buildTierDecisions(draftTiers, status);

  const approvalRequest = await prisma.approvalRequest.create({
    data: {
      companyId,
      categoryId: category.id,
      requestNumber,
      title,
      status: status as ApprovalRequestStatus,
      requestedBy: employeeId,
      currentTier: tierDecisions.currentTier,
      submittedAt: new Date(),
      completedAt: ['APPROVED', 'REJECTED'].includes(status) ? new Date() : null,
      createdBy: employeeId,
      updatedBy: employeeId,
      tiers: {
        create: tierDecisions.tiers.map((t) => ({
          id: randomUUID(),
          tierOrder: t.order,
          label: t.label,
          approverId: t.approverId,
          resolver: t.resolver,
          decision: t.decision,
          comment: t.comment,
          decidedAt:
            t.decision !== ApprovalTierDecision.PENDING ? new Date() : null,
        })),
      },
    },
  });

  return { id: approvalRequest.id, requestNumber: approvalRequest.requestNumber };
}

// ────────────────────────────────────────────────────────────────────────────
// Exchange rate helper (standalone - no Nest DI)
// ────────────────────────────────────────────────────────────────────────────

function todayDateOnly(): Date {
  const now = new Date();
  return new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  );
}

/**
 * Returns conversion rate to ETB. Prefers today's cached row, then Frankfurter v2,
 * then a last-known DB rate, then a static fallback.
 */
async function getExchangeRate(
  fromCurrency: SupportedCurrency,
  companyId: string,
): Promise<number> {
  if (fromCurrency === SupportedCurrency.ETB) {
    return 1;
  }

  const today = todayDateOnly();
  const cached = await prisma.exchangeRate.findFirst({
    where: {
      companyId,
      fromCurrency,
      toCurrency: SupportedCurrency.ETB,
      fetchedAt: today,
    },
  });
  if (cached) {
    return Number(cached.rate);
  }

  try {
    const res = await fetch(
      `https://api.frankfurter.dev/v2/rate/${fromCurrency}/ETB`,
    );
    if (res.ok) {
      const data = (await res.json()) as { rate?: number };
      if (typeof data.rate === 'number' && Number.isFinite(data.rate)) {
        await prisma.exchangeRate.upsert({
          where: {
            companyId_fromCurrency_toCurrency_fetchedAt: {
              companyId,
              fromCurrency,
              toCurrency: SupportedCurrency.ETB,
              fetchedAt: today,
            },
          },
          create: {
            id: randomUUID(),
            companyId,
            fromCurrency,
            toCurrency: SupportedCurrency.ETB,
            rate: data.rate,
            fetchedAt: today,
          },
          update: { rate: data.rate },
        });
        return data.rate;
      }
    }
  } catch {
    // Fall through to last-known / static fallback.
  }

  const lastKnown = await prisma.exchangeRate.findFirst({
    where: {
      companyId,
      fromCurrency,
      toCurrency: SupportedCurrency.ETB,
    },
    orderBy: { fetchedAt: 'desc' },
  });
  if (lastKnown) {
    console.warn(
      `⚠ Using last-known ${fromCurrency}->ETB rate ${Number(lastKnown.rate)} (API unavailable)`,
    );
    return Number(lastKnown.rate);
  }

  const fallback =
    fromCurrency === SupportedCurrency.USD
      ? 120
      : fromCurrency === SupportedCurrency.CNY
        ? 16.5
        : 1;
  console.warn(
    `⚠ Using static fallback ${fromCurrency}->ETB rate ${fallback}`,
  );
  return fallback;
}

function parseDateOnly(value: string): Date {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  if (!match) {
    throw new Error(`Invalid date: ${value}`);
  }
  return new Date(
    Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])),
  );
}

// ────────────────────────────────────────────────────────────────────────────
// Wipe
// ────────────────────────────────────────────────────────────────────────────

async function wipePurchaseAndMaterial(companyId: string): Promise<void> {
  console.log('Wiping existing purchase request + material requisition data...');

  const categoryScope = {
    category: {
      companyId,
      code: { in: ['PURCHASE_REQUEST', 'MATERIAL_REQUISITION'] },
    },
  };

  // Domain rows first (they FK to approval_request).
  await prisma.purchaseRequestItem.deleteMany({
    where: { request: { companyId } },
  });
  await prisma.purchaseRequest.deleteMany({ where: { companyId } });
  await prisma.materialRequisitionItem.deleteMany({
    where: { requisition: { companyId } },
  });
  await prisma.materialRequisition.deleteMany({ where: { companyId } });

  await prisma.approvalResponse.deleteMany({
    where: { request: categoryScope },
  });
  await prisma.approvalComment.deleteMany({
    where: { request: categoryScope },
  });
  await prisma.approvalTier.deleteMany({ where: { request: categoryScope } });
  await prisma.approvalRequest.deleteMany({ where: categoryScope });

  console.log('Wipe complete.');
}

// ────────────────────────────────────────────────────────────────────────────
// Purchase requests
// ────────────────────────────────────────────────────────────────────────────

async function seedPurchaseRequests(
  ctx: ChainContext,
  companyId: string,
  weiChen: User,
  xiaomingLi: User,
  otherEmployees: User[],
  activeProjects: Array<{ id: string }>,
  usdRate: number,
  cnyRate: number,
): Promise<void> {
  console.log('Seeding purchase requests...');

  const purchaseRequests: Array<{
    employee: User;
    title: string;
    justification: string;
    vendorName: string;
    vendorEmail?: string;
    vendorPhone?: string;
    requiredByDate: string | null;
    projectId: string | null | undefined;
    status: HrRequestStatus;
    items: PurchaseItemDraft[];
  }> = [
    {
      employee: weiChen,
      title: 'Structural Drawing Supplies, August 2026',
      justification:
        'Required for ongoing structural design work. Current stock depleted.',
      vendorName: 'Addis Office Supplies Ltd',
      vendorPhone: '+251 911 000 000',
      requiredByDate: '2026-08-20',
      projectId: activeProjects[0]?.id,
      status: 'APPROVED',
      items: [
        {
          itemName: 'A0 Drawing Paper Roll',
          description: '90gsm plotting paper',
          quantity: 10,
          unit: 'Roll',
          unitPrice: 850,
          currency: SupportedCurrency.ETB,
        },
        {
          itemName: 'Technical Drawing Pens Set',
          description: 'Rotring Isograph set',
          quantity: 5,
          unit: 'Set',
          unitPrice: 25,
          currency: SupportedCurrency.USD,
        },
        {
          itemName: 'Scale Ruler Set',
          description: '1:100 and 1:200 scale rulers',
          quantity: 3,
          unit: 'Pcs',
          unitPrice: 450,
          currency: SupportedCurrency.ETB,
        },
      ],
    },
    {
      employee: weiChen,
      title: 'CAD Software License Renewal',
      justification:
        'Annual AutoCAD license renewal for structural design team.',
      vendorName: 'Autodesk Reseller Ethiopia',
      vendorPhone: '+251 922 000 000',
      requiredByDate: '2026-09-01',
      projectId: null,
      status: 'IN_REVIEW',
      items: [
        {
          itemName: 'AutoCAD License 1 Year',
          description: 'Single user license',
          quantity: 3,
          unit: 'License',
          unitPrice: 400,
          currency: SupportedCurrency.USD,
        },
      ],
    },
    {
      employee: weiChen,
      title: 'Site Safety Equipment',
      justification:
        'Safety equipment required for upcoming site visits per HSE policy.',
      vendorName: 'Safety First Ethiopia',
      vendorPhone: '+251 933 000 000',
      requiredByDate: '2026-08-15',
      projectId: activeProjects[0]?.id,
      status: 'SUBMITTED',
      items: [
        {
          itemName: 'Safety Helmet',
          description: 'EN397 certified hard hat',
          quantity: 5,
          unit: 'Pcs',
          unitPrice: 850,
          currency: SupportedCurrency.ETB,
        },
        {
          itemName: 'Safety Vest',
          description: 'High visibility vest class 2',
          quantity: 5,
          unit: 'Pcs',
          unitPrice: 450,
          currency: SupportedCurrency.ETB,
        },
        {
          itemName: 'Safety Boots',
          description: 'Steel toe cap boots',
          quantity: 3,
          unit: 'Pair',
          unitPrice: 35,
          currency: SupportedCurrency.USD,
        },
      ],
    },
    {
      employee: xiaomingLi,
      title: 'Structural Analysis Software',
      justification:
        'Advanced structural analysis software needed for complex project calculations.',
      vendorName: 'CSI Software Distributor',
      vendorPhone: '+251 944 000 000',
      requiredByDate: '2026-09-15',
      projectId: activeProjects[1]?.id,
      status: 'APPROVED',
      items: [
        {
          itemName: 'ETABS License',
          description: 'Structural analysis software 1 year',
          quantity: 2,
          unit: 'License',
          unitPrice: 800,
          currency: SupportedCurrency.USD,
        },
        {
          itemName: 'SAFE License',
          description: 'Foundation design software 1 year',
          quantity: 1,
          unit: 'License',
          unitPrice: 600,
          currency: SupportedCurrency.USD,
        },
      ],
    },
    {
      employee: xiaomingLi,
      title: 'Office Furniture - Engineering Room',
      justification:
        'New engineering room requires furniture for 3 additional staff.',
      vendorName: 'Addis Furniture Center',
      vendorPhone: '+251 955 000 000',
      requiredByDate: '2026-09-10',
      projectId: null,
      status: 'RETURNED',
      items: [
        {
          itemName: 'Engineering Desk',
          description: 'Large format desk for drawings',
          quantity: 3,
          unit: 'Pcs',
          unitPrice: 8500,
          currency: SupportedCurrency.ETB,
        },
        {
          itemName: 'Ergonomic Chair',
          description: 'Adjustable office chair',
          quantity: 3,
          unit: 'Pcs',
          unitPrice: 4200,
          currency: SupportedCurrency.ETB,
        },
        {
          itemName: 'Filing Cabinet',
          description: '4 drawer steel cabinet',
          quantity: 2,
          unit: 'Pcs',
          unitPrice: 3800,
          currency: SupportedCurrency.ETB,
        },
      ],
    },
    {
      employee: otherEmployees[0],
      title: 'Survey Equipment',
      justification:
        'Topographic survey equipment required for site boundary determination.',
      vendorName: 'Geo Instruments Ltd',
      vendorPhone: '+251 966 000 000',
      requiredByDate: '2026-08-25',
      projectId: activeProjects[0]?.id,
      status: 'APPROVED',
      items: [
        {
          itemName: 'Total Station',
          description: 'Leica TS06 5 arcsec',
          quantity: 1,
          unit: 'Unit',
          unitPrice: 2500,
          currency: SupportedCurrency.USD,
        },
        {
          itemName: 'Survey Tripod',
          description: 'Heavy duty aluminum tripod',
          quantity: 2,
          unit: 'Pcs',
          unitPrice: 150,
          currency: SupportedCurrency.USD,
        },
        {
          itemName: 'Reflector Prism Set',
          description: 'Single prism with pole',
          quantity: 3,
          unit: 'Set',
          unitPrice: 80,
          currency: SupportedCurrency.USD,
        },
      ],
    },
    {
      employee: otherEmployees[0],
      title: 'Printing and Plotting Supplies',
      justification:
        'Monthly replenishment of plotter consumables for drawing production.',
      vendorName: 'Tech Supplies Ethiopia',
      vendorPhone: '+251 977 000 000',
      requiredByDate: '2026-08-10',
      projectId: null,
      status: 'APPROVED',
      items: [
        {
          itemName: 'Plotter Ink Cartridge Set',
          description: 'HP DesignJet 6 color set',
          quantity: 2,
          unit: 'Set',
          unitPrice: 12500,
          currency: SupportedCurrency.ETB,
        },
        {
          itemName: 'Plotter Paper Roll A1',
          description: '80gsm bond paper 50m roll',
          quantity: 20,
          unit: 'Roll',
          unitPrice: 380,
          currency: SupportedCurrency.ETB,
        },
      ],
    },
    {
      employee: otherEmployees[1],
      title: 'Laboratory Testing Equipment',
      justification:
        'Soil testing equipment for geotechnical investigation on new project.',
      vendorName: 'Lab Equipment International',
      vendorPhone: '+251 988 000 000',
      requiredByDate: '2026-09-20',
      projectId: activeProjects[1]?.id,
      status: 'SUBMITTED',
      items: [
        {
          itemName: 'Sieve Set ASTM',
          description: 'Full set including pan and cover',
          quantity: 1,
          unit: 'Set',
          unitPrice: 350,
          currency: SupportedCurrency.USD,
        },
        {
          itemName: 'Atterberg Limits Equipment',
          description: 'Casagrande apparatus set',
          quantity: 1,
          unit: 'Set',
          unitPrice: 280,
          currency: SupportedCurrency.USD,
        },
        {
          itemName: 'Compaction Mould Set',
          description: 'Standard and modified proctor',
          quantity: 2,
          unit: 'Set',
          unitPrice: 120,
          currency: SupportedCurrency.USD,
        },
      ],
    },
    {
      employee: otherEmployees[2],
      title: 'IT Equipment - Engineering Department',
      justification:
        'Replacement laptops for engineers whose machines are over 5 years old.',
      vendorName: 'Techno Computers Addis',
      vendorPhone: '+251 999 000 000',
      requiredByDate: '2026-09-05',
      projectId: null,
      status: 'REJECTED',
      items: [
        {
          itemName: 'Laptop Dell Precision',
          description: 'Workstation laptop 32GB RAM 1TB SSD',
          quantity: 3,
          unit: 'Pcs',
          unitPrice: 1800,
          currency: SupportedCurrency.USD,
        },
        {
          itemName: 'External Monitor 27"',
          description: '4K IPS display',
          quantity: 3,
          unit: 'Pcs',
          unitPrice: 400,
          currency: SupportedCurrency.USD,
        },
      ],
    },
    {
      employee: otherEmployees[3],
      title: 'Site Communication Equipment',
      justification:
        'Two-way radios for site team communication during construction phase.',
      vendorName: 'Radio Communications Ethiopia',
      vendorPhone: '+251 900 000 000',
      requiredByDate: '2026-08-30',
      projectId: activeProjects[2]?.id,
      status: 'IN_REVIEW',
      items: [
        {
          itemName: 'Two-Way Radio Motorola',
          description: 'DP4800e UHF digital radio',
          quantity: 6,
          unit: 'Pcs',
          unitPrice: 250,
          currency: SupportedCurrency.USD,
        },
        {
          itemName: 'Radio Charger Multiunit',
          description: '6-way charging station',
          quantity: 1,
          unit: 'Unit',
          unitPrice: 180,
          currency: SupportedCurrency.USD,
        },
        {
          itemName: 'Spare Battery Pack',
          description: 'High capacity Li-ion battery',
          quantity: 6,
          unit: 'Pcs',
          unitPrice: 45,
          currency: SupportedCurrency.USD,
        },
      ],
    },
  ];

  for (const pr of purchaseRequests) {
    let totalEtb = 0;
    const processedItems = pr.items.map((item) => {
      const rate =
        item.currency === SupportedCurrency.USD
          ? usdRate
          : item.currency === SupportedCurrency.CNY
            ? cnyRate
            : 1;
      const totalPrice = item.quantity * item.unitPrice;
      const totalPriceEtb = totalPrice * rate;
      totalEtb += totalPriceEtb;
      return { ...item, totalPrice, totalPriceEtb, exchangeRate: rate };
    });

    const includeGm = totalEtb > 10_000;
    const approvalRequest = await createApprovalChain(ctx, {
      employeeId: pr.employee.id,
      categoryCode: 'PURCHASE_REQUEST',
      title: pr.title,
      status: pr.status,
      companyId,
      includeGm,
    });

    const seq = await prisma.$queryRaw<Array<{ nextval: bigint | number }>>`
      SELECT nextval('purchase_request_number_seq') as nextval
    `;
    const requestNumber = `PR-${String(Number(seq[0]?.nextval ?? 1)).padStart(4, '0')}`;

    await prisma.purchaseRequest.create({
      data: {
        id: randomUUID(),
        companyId,
        requestNumber,
        employeeId: pr.employee.id,
        title: pr.title,
        justification: pr.justification,
        vendorName: pr.vendorName,
        vendorPhone: pr.vendorPhone,
        requiredByDate: pr.requiredByDate
          ? parseDateOnly(pr.requiredByDate)
          : null,
        totalEstimatedCost: totalEtb,
        currency: SupportedCurrency.ETB,
        totalEstimatedEtb: totalEtb,
        status: pr.status as PurchaseRequestStatus,
        approvalRequestId: approvalRequest.id,
        submittedAt: new Date(),
        completedAt: ['APPROVED', 'REJECTED'].includes(pr.status)
          ? new Date()
          : null,
        createdBy: pr.employee.id,
        updatedBy: pr.employee.id,
        items: {
          create: processedItems.map((item) => ({
            id: randomUUID(),
            itemName: item.itemName,
            description: item.description,
            quantity: item.quantity,
            unit: item.unit,
            unitPrice: item.unitPrice,
            currency: item.currency,
            totalPrice: item.totalPrice,
            totalPriceEtb: item.totalPriceEtb,
            exchangeRate: item.exchangeRate,
          })),
        },
      },
    });

    console.log(
      `✓ PR ${requestNumber} - ${pr.title} - ETB ${totalEtb.toFixed(2)} - ${pr.status} - ${includeGm ? '3 tiers' : '2 tiers'}`,
    );
  }
}

// ────────────────────────────────────────────────────────────────────────────
// Material requisitions
// ────────────────────────────────────────────────────────────────────────────

async function seedMaterialRequisitions(
  ctx: ChainContext,
  companyId: string,
  weiChen: User,
  xiaomingLi: User,
  otherEmployees: User[],
  activeProjects: Array<{ id: string }>,
): Promise<void> {
  console.log('Seeding material requisitions...');

  const materialRequisitions: Array<{
    employee: User;
    title: string;
    purpose: string;
    requiredByDate: string | null;
    projectId: string | null | undefined;
    warehouseLocation: string;
    status: HrRequestStatus;
    items: MaterialItemDraft[];
  }> = [
    {
      employee: weiChen,
      title: 'Structural Materials - August 2026',
      purpose:
        'Foundation reinforcement materials for Hawassa site project phase 2.',
      requiredByDate: '2026-08-18',
      projectId: activeProjects[0]?.id,
      warehouseLocation: 'Main Warehouse - Addis Ababa',
      status: 'APPROVED',
      items: [
        {
          itemName: 'Steel Rebar 12mm',
          itemCode: 'STL-RB-012',
          description: 'High tensile steel for foundation reinforcement',
          quantity: 500,
          unit: 'kg',
        },
        {
          itemName: 'Portland Cement',
          itemCode: 'CEM-PC-001',
          description: 'OPC 42.5N grade cement',
          quantity: 50,
          unit: 'Bag',
        },
        {
          itemName: 'Binding Wire',
          itemCode: 'WIR-BD-001',
          description: 'Galvanized binding wire',
          quantity: 20,
          unit: 'Roll',
        },
        {
          itemName: 'Concrete Spacers 20mm',
          itemCode: 'SPC-CN-020',
          description: 'Plastic spacers for rebar cover',
          quantity: 200,
          unit: 'Pcs',
        },
      ],
    },
    {
      employee: weiChen,
      title: 'Formwork Materials - September 2026',
      purpose: 'Formwork for column and beam casting on Bahir Dar project.',
      requiredByDate: '2026-09-05',
      projectId: activeProjects[1]?.id,
      warehouseLocation: 'Main Warehouse - Addis Ababa',
      status: 'IN_REVIEW',
      items: [
        {
          itemName: 'Plywood 18mm',
          itemCode: 'PLY-18-244',
          description: '2440x1220mm formwork grade',
          quantity: 30,
          unit: 'Sheet',
        },
        {
          itemName: 'Timber 50x100mm',
          itemCode: 'TBR-50100',
          description: 'Sawn timber for form supports',
          quantity: 200,
          unit: 'm',
        },
        {
          itemName: 'Form Release Oil',
          itemCode: 'OIL-FR-001',
          description: 'Mould release agent',
          quantity: 10,
          unit: 'Litre',
        },
      ],
    },
    {
      employee: weiChen,
      title: 'Survey Equipment Consumables',
      purpose:
        'Consumable materials for topographic survey of new project site.',
      requiredByDate: '2026-08-12',
      projectId: activeProjects[0]?.id,
      warehouseLocation: 'Engineering Store',
      status: 'SUBMITTED',
      items: [
        {
          itemName: 'Survey Pegs',
          itemCode: 'PEG-SRV-001',
          description: 'Wooden survey pegs 500mm',
          quantity: 100,
          unit: 'Pcs',
        },
        {
          itemName: 'Flagging Tape',
          itemCode: 'TPE-FLG-001',
          description: 'Bright orange marking tape',
          quantity: 10,
          unit: 'Roll',
        },
        {
          itemName: 'Paint Spray Cans',
          itemCode: 'SPR-PNT-YLW',
          description: 'Yellow marking paint',
          quantity: 20,
          unit: 'Can',
        },
      ],
    },
    {
      employee: xiaomingLi,
      title: 'Electrical Testing Materials',
      purpose:
        'Materials required for electrical installation testing on completed floors.',
      requiredByDate: '2026-08-22',
      projectId: activeProjects[1]?.id,
      warehouseLocation: 'Main Warehouse - Addis Ababa',
      status: 'APPROVED',
      items: [
        {
          itemName: 'Cable 2.5mm2 Twin & Earth',
          itemCode: 'CBL-25-TE',
          description: 'PVC insulated twin and earth cable',
          quantity: 500,
          unit: 'm',
        },
        {
          itemName: 'Junction Boxes 86x86mm',
          itemCode: 'JBX-86-001',
          description: 'Plastic surface mount junction box',
          quantity: 50,
          unit: 'Pcs',
        },
        {
          itemName: 'Cable Ties 300mm',
          itemCode: 'CTI-300-BLK',
          description: 'Black nylon cable ties',
          quantity: 500,
          unit: 'Pcs',
        },
      ],
    },
    {
      employee: xiaomingLi,
      title: 'Concrete Testing Equipment',
      purpose: 'Equipment for concrete cube testing and quality control.',
      requiredByDate: '2026-09-01',
      projectId: activeProjects[0]?.id,
      warehouseLocation: 'Site Laboratory Store',
      status: 'RETURNED',
      items: [
        {
          itemName: 'Concrete Cube Mould 150mm',
          itemCode: 'MLD-CNC-150',
          description: 'Steel cube mould for compressive strength test',
          quantity: 20,
          unit: 'Pcs',
        },
        {
          itemName: 'Slump Cone',
          itemCode: 'SLP-CON-001',
          description: 'Standard slump test apparatus',
          quantity: 3,
          unit: 'Set',
        },
        {
          itemName: 'Tamping Rod',
          itemCode: 'ROD-TMP-001',
          description: 'Steel tamping rod 600mm',
          quantity: 5,
          unit: 'Pcs',
        },
      ],
    },
    {
      employee: otherEmployees[0],
      title: 'Waterproofing Materials',
      purpose: 'Waterproofing membrane and accessories for basement slab.',
      requiredByDate: '2026-08-28',
      projectId: activeProjects[2]?.id,
      warehouseLocation: 'Main Warehouse - Addis Ababa',
      status: 'APPROVED',
      items: [
        {
          itemName: 'Bituminous Membrane 4mm',
          itemCode: 'MBR-BIT-004',
          description: 'SBS modified bitumen sheet',
          quantity: 200,
          unit: 'm²',
        },
        {
          itemName: 'Primer Bituminous',
          itemCode: 'PRM-BIT-001',
          description: 'Bituminous primer for concrete',
          quantity: 20,
          unit: 'Litre',
        },
        {
          itemName: 'Protection Board 6mm',
          itemCode: 'BRD-PRO-006',
          description: 'XPS protection board',
          quantity: 100,
          unit: 'm²',
        },
      ],
    },
    {
      employee: otherEmployees[0],
      title: 'Office Consumables - Engineering',
      purpose: 'Monthly replenishment of engineering office consumables.',
      requiredByDate: '2026-08-08',
      projectId: null,
      warehouseLocation: 'Office Store',
      status: 'APPROVED',
      items: [
        {
          itemName: 'A4 Paper',
          itemCode: 'PPR-A4-80G',
          description: '80gsm copy paper',
          quantity: 10,
          unit: 'Ream',
        },
        {
          itemName: 'Whiteboard Markers',
          itemCode: 'MRK-WB-BLK',
          description: 'Black dry erase markers',
          quantity: 20,
          unit: 'Pcs',
        },
        {
          itemName: 'Stapler Cartridges',
          itemCode: 'STP-CRT-26',
          description: '26/6 staple cartridges',
          quantity: 10,
          unit: 'Box',
        },
      ],
    },
    {
      employee: otherEmployees[1],
      title: 'Drainage Materials',
      purpose: 'Storm drainage pipes and fittings for site drainage works.',
      requiredByDate: '2026-09-12',
      projectId: activeProjects[1]?.id,
      warehouseLocation: 'Main Warehouse - Addis Ababa',
      status: 'SUBMITTED',
      items: [
        {
          itemName: 'HDPE Pipe 200mm',
          itemCode: 'PIP-HDPE-200',
          description: 'SN8 corrugated drainage pipe',
          quantity: 100,
          unit: 'm',
        },
        {
          itemName: 'Inspection Chamber 450mm',
          itemCode: 'CHM-INS-450',
          description: 'Precast concrete inspection chamber',
          quantity: 5,
          unit: 'Pcs',
        },
        {
          itemName: 'Gully Grating CI',
          itemCode: 'GRT-GLY-CI',
          description: 'Cast iron gully grating frame and cover',
          quantity: 10,
          unit: 'Set',
        },
      ],
    },
    {
      employee: otherEmployees[2],
      title: 'Painting Materials - Interior Finish',
      purpose:
        'Interior paint and accessories for completed residential floors.',
      requiredByDate: '2026-09-18',
      projectId: activeProjects[2]?.id,
      warehouseLocation: 'Main Warehouse - Addis Ababa',
      status: 'REJECTED',
      items: [
        {
          itemName: 'Emulsion Paint White 20L',
          itemCode: 'PNT-EMU-WHT',
          description: 'Interior vinyl emulsion',
          quantity: 30,
          unit: 'Tin',
        },
        {
          itemName: 'Paint Roller Set',
          itemCode: 'RLR-PNT-SET',
          description: '9 inch roller frame tray and cover',
          quantity: 10,
          unit: 'Set',
        },
        {
          itemName: 'Masking Tape 50mm',
          itemCode: 'TPE-MSK-050',
          description: 'Crepe paper masking tape',
          quantity: 30,
          unit: 'Roll',
        },
        {
          itemName: 'Sandpaper Assorted',
          itemCode: 'SDP-AST-001',
          description: 'Mixed grit sandpaper pack',
          quantity: 20,
          unit: 'Pack',
        },
      ],
    },
    {
      employee: otherEmployees[3],
      title: 'Welding Consumables',
      purpose:
        'Welding rods and accessories for structural steel connections.',
      requiredByDate: '2026-08-25',
      projectId: activeProjects[0]?.id,
      warehouseLocation: 'Main Warehouse - Addis Ababa',
      status: 'IN_REVIEW',
      items: [
        {
          itemName: 'Welding Rod E6013 3.2mm',
          itemCode: 'WLD-E6013-32',
          description: 'General purpose mild steel electrode',
          quantity: 50,
          unit: 'kg',
        },
        {
          itemName: 'Welding Rod E7018 3.2mm',
          itemCode: 'WLD-E7018-32',
          description: 'Low hydrogen electrode for structural steel',
          quantity: 30,
          unit: 'kg',
        },
        {
          itemName: 'Grinding Disc 115mm',
          itemCode: 'DSC-GRD-115',
          description: 'Metal grinding disc',
          quantity: 50,
          unit: 'Pcs',
        },
        {
          itemName: 'Welding Gloves',
          itemCode: 'GLV-WLD-001',
          description: 'Heavy duty leather welding gloves',
          quantity: 10,
          unit: 'Pair',
        },
      ],
    },
  ];

  for (const mr of materialRequisitions) {
    const approvalRequest = await createApprovalChain(ctx, {
      employeeId: mr.employee.id,
      categoryCode: 'MATERIAL_REQUISITION',
      title: mr.title,
      status: mr.status,
      companyId,
      includeGm: true,
    });

    const seq = await prisma.$queryRaw<Array<{ nextval: bigint | number }>>`
      SELECT nextval('material_requisition_number_seq') as nextval
    `;
    const requestNumber = `MR-${String(Number(seq[0]?.nextval ?? 1)).padStart(4, '0')}`;

    await prisma.materialRequisition.create({
      data: {
        id: randomUUID(),
        companyId,
        requestNumber,
        employeeId: mr.employee.id,
        title: mr.title,
        purpose: mr.purpose,
        requiredByDate: mr.requiredByDate
          ? parseDateOnly(mr.requiredByDate)
          : null,
        projectId: mr.projectId ?? null,
        warehouseLocation: mr.warehouseLocation,
        status: mr.status as MaterialRequisitionStatus,
        approvalRequestId: approvalRequest.id,
        submittedAt: new Date(),
        completedAt: ['APPROVED', 'REJECTED'].includes(mr.status)
          ? new Date()
          : null,
        createdBy: mr.employee.id,
        updatedBy: mr.employee.id,
        items: {
          create: mr.items.map((item) => ({
            id: randomUUID(),
            itemName: item.itemName,
            itemCode: item.itemCode,
            description: item.description,
            quantity: item.quantity,
            unit: item.unit,
          })),
        },
      },
    });

    console.log(
      `✓ MR ${requestNumber} - ${mr.title} - ${mr.items.length} items - ${mr.status}`,
    );
  }
}

// ────────────────────────────────────────────────────────────────────────────
// Main
// ────────────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  console.log('Starting purchase request + material requisition seed...');

  const weiChen = await prisma.user.findFirst({
    where: {
      firstName: { contains: 'Wei', mode: 'insensitive' },
      lastName: { contains: 'Chen', mode: 'insensitive' },
    },
    include: { engineeringDiscipline: { include: { leader: true } } },
  });
  if (!weiChen) throw new Error('Wei Chen not found');

  const xiaomingLi = await prisma.user.findFirst({
    where: { firstName: { contains: 'Xiaoming', mode: 'insensitive' } },
  });
  if (!xiaomingLi) throw new Error('Xiaoming Li not found');

  const jinxia = await prisma.user.findFirst({
    where: { firstName: { contains: 'Jinxia', mode: 'insensitive' } },
  });
  if (!jinxia) throw new Error('Jinxia not found');

  const davidWu = await prisma.user.findFirst({
    where: {
      firstName: { contains: 'David', mode: 'insensitive' },
      lastName: { contains: 'Wu', mode: 'insensitive' },
    },
  });
  if (!davidWu) throw new Error('David Wu not found');

  const companyId = weiChen.companyId;

  const otherEmployees = await prisma.user.findMany({
    where: {
      companyId,
      deletedAt: null,
      isActive: true,
      id: { notIn: [weiChen.id, xiaomingLi.id, jinxia.id, davidWu.id] },
      engineeringDisciplineId: { not: null },
    },
    include: { engineeringDiscipline: { include: { leader: true } } },
    take: 4,
  });
  if (otherEmployees.length < 4) {
    throw new Error(
      `Need at least 4 other employees with an engineering discipline assigned, found ${otherEmployees.length}`,
    );
  }

  const activeProjects = await prisma.project.findMany({
    where: { companyId, deletedAt: null },
    take: 3,
    orderBy: { createdAt: 'asc' },
    select: { id: true, name: true },
  });
  if (activeProjects.length === 0) {
    console.warn('⚠ No projects found - projectId will be null on all records');
  }

  const usdRate = await getExchangeRate(SupportedCurrency.USD, companyId);
  const cnyRate = await getExchangeRate(SupportedCurrency.CNY, companyId);
  console.log(`Exchange rates - USD/ETB: ${usdRate}, CNY/ETB: ${cnyRate}`);

  const ctx: ChainContext = { xiaomingLi, jinxia, davidWu };

  await wipePurchaseAndMaterial(companyId);
  await seedPurchaseRequests(
    ctx,
    companyId,
    weiChen,
    xiaomingLi,
    otherEmployees,
    activeProjects,
    usdRate,
    cnyRate,
  );
  await seedMaterialRequisitions(
    ctx,
    companyId,
    weiChen,
    xiaomingLi,
    otherEmployees,
    activeProjects,
  );

  const prCount = await prisma.purchaseRequest.count({ where: { companyId } });
  const prItemCount = await prisma.purchaseRequestItem.count({
    where: { request: { companyId } },
  });
  const mrCount = await prisma.materialRequisition.count({
    where: { companyId },
  });
  const mrItemCount = await prisma.materialRequisitionItem.count({
    where: { requisition: { companyId } },
  });

  console.log('\n✓ Purchase Request + Material Requisition seed complete');
  console.log(`  Purchase Requests:      ${prCount} (${prItemCount} line items)`);
  console.log(`  Material Requisitions:  ${mrCount} (${mrItemCount} line items)`);
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
