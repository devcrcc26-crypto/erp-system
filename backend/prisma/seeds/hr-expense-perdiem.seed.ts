/**
 * Wipes and reseeds expense claims + per diem requests with 10 realistic
 * records each, including full approval chains and ETB totals.
 *
 * Prerequisites: HR users (Wei Chen, Xiaoming Li, Jinxia, David Wu),
 * approval categories EXPENSE_CLAIM + PER_DIEM, and employee per diem rates.
 *
 * Run: npx ts-node --transpile-only prisma/seeds/hr-expense-perdiem.seed.ts
 */
import { randomUUID } from 'crypto';
import {
  ApprovalRequestStatus,
  ApprovalTierDecision,
  ExpenseClaimStatus,
  PerDiemStatus,
  PrismaClient,
  SupportedCurrency,
  User,
} from '@prisma/client';

const prisma = new PrismaClient();

/** Status values shared across expense claim and per diem request statuses. */
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

interface ExpenseItemDraft {
  category: string;
  description: string;
  amount: number;
  currency: SupportedCurrency;
  date: string;
}

// ©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤
// Approval chain helpers (mirrors hr-test-data.seed.ts)
// ©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤

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
 * Builds a Discipline Lead ¡ú HR Officer ¡ú (optional) General Manager approval
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
  },
): Promise<{ id: string; requestNumber: string }> {
  const { employeeId, categoryCode, title, status, companyId } = params;

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
    {
      order: 3,
      label: 'General Manager',
      approverId: ctx.davidWu.id,
      resolver: 'ROLE:General Manager',
    },
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

// ©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤
// Exchange rate helper (standalone - no Nest DI)
// ©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤

function todayDateOnly(): Date {
  const now = new Date();
  return new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  );
}

/**
 * Returns conversion rate to ETB. Prefers today's cached row, then Frankfurter,
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
      `https://api.frankfurter.app/latest?from=${fromCurrency}&to=ETB`,
    );
    if (res.ok) {
      const data = (await res.json()) as { rates?: Record<string, number> };
      const rate = data.rates?.ETB;
      if (typeof rate === 'number') {
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
            rate,
            fetchedAt: today,
          },
          update: { rate },
        });
        return rate;
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
      `? Using last-known ${fromCurrency}->ETB rate ${Number(lastKnown.rate)} (API unavailable)`,
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
    `? Using static fallback ${fromCurrency}->ETB rate ${fallback}`,
  );
  return fallback;
}

// ©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤
// Wipe
// ©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤

async function wipeExpenseAndPerDiem(companyId: string): Promise<void> {
  console.log('Wiping existing expense claim + per diem data...');

  const categoryScope = {
    category: {
      companyId,
      code: { in: ['EXPENSE_CLAIM', 'PER_DIEM'] },
    },
  };

  // Child records first (they FK to approval requests).
  await prisma.expenseClaimItem.deleteMany({
    where: { claim: { companyId } },
  });
  await prisma.expenseClaim.deleteMany({ where: { companyId } });
  await prisma.perDiemRequest.deleteMany({ where: { companyId } });

  await prisma.approvalResponse.deleteMany({ where: { request: categoryScope } });
  await prisma.approvalComment.deleteMany({ where: { request: categoryScope } });
  await prisma.approvalTier.deleteMany({ where: { request: categoryScope } });
  await prisma.approvalRequest.deleteMany({ where: categoryScope });

  console.log('Wipe complete.');
}

// ©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤
// Expense claims
// ©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤

async function seedExpenseClaims(
  ctx: ChainContext,
  companyId: string,
  weiChen: User,
  xiaomingLi: User,
  otherEmployees: User[],
  usdRate: number,
  cnyRate: number,
): Promise<void> {
  console.log('Seeding expense claims...');

  const expenseClaims: Array<{
    employee: User;
    title: string;
    description: string;
    status: HrRequestStatus;
    items: ExpenseItemDraft[];
  }> = [
    {
      employee: weiChen,
      title: 'Site visit expenses - Hawassa July 2026',
      description: 'Travel and meal expenses during structural inspection',
      status: 'APPROVED',
      items: [
        { category: 'Transport', description: 'Taxi from airport to site', amount: 450, currency: SupportedCurrency.ETB, date: '2026-07-15' },
        { category: 'Meals', description: 'Lunch with site team', amount: 380, currency: SupportedCurrency.ETB, date: '2026-07-15' },
        { category: 'Accommodation', description: 'Hotel - 1 night', amount: 1200, currency: SupportedCurrency.ETB, date: '2026-07-15' },
        { category: 'Materials', description: 'Survey equipment rental', amount: 25, currency: SupportedCurrency.USD, date: '2026-07-16' },
      ],
    },
    {
      employee: weiChen,
      title: 'Client meeting expenses - Nairobi August 2026',
      description: 'Business expenses during Kenya client visit',
      status: 'IN_REVIEW',
      items: [
        { category: 'Transport', description: 'Airport transfer Nairobi', amount: 40, currency: SupportedCurrency.USD, date: '2026-08-15' },
        { category: 'Meals', description: 'Business dinner with client', amount: 85, currency: SupportedCurrency.USD, date: '2026-08-16' },
        { category: 'Communication', description: 'International SIM card', amount: 15, currency: SupportedCurrency.USD, date: '2026-08-15' },
        { category: 'Printing', description: 'Technical drawings printing', amount: 320, currency: SupportedCurrency.ETB, date: '2026-08-14' },
      ],
    },
    {
      employee: weiChen,
      title: 'Office supplies - July 2026',
      description: 'Stationery and drawing supplies',
      status: 'SUBMITTED',
      items: [
        { category: 'Office Supplies', description: 'Drawing paper A0 rolls', amount: 850, currency: SupportedCurrency.ETB, date: '2026-07-20' },
        { category: 'Office Supplies', description: 'Technical pens set', amount: 650, currency: SupportedCurrency.ETB, date: '2026-07-20' },
      ],
    },
    {
      employee: xiaomingLi,
      title: 'Dubai expo expenses - September 2026',
      description: 'Construction expo attendance costs',
      status: 'APPROVED',
      items: [
        { category: 'Registration', description: 'Expo registration fee', amount: 200, currency: SupportedCurrency.USD, date: '2026-09-10' },
        { category: 'Transport', description: 'Metro and taxi Dubai', amount: 150, currency: SupportedCurrency.USD, date: '2026-09-11' },
        { category: 'Meals', description: 'Business meals 4 days', amount: 320, currency: SupportedCurrency.USD, date: '2026-09-12' },
        { category: 'Materials', description: 'Expo catalog and samples', amount: 80, currency: SupportedCurrency.USD, date: '2026-09-10' },
      ],
    },
    {
      employee: xiaomingLi,
      title: 'Team training materials - August 2026',
      description: 'Technical training resources for discipline team',
      status: 'APPROVED',
      items: [
        { category: 'Training', description: 'Structural analysis software license', amount: 500, currency: SupportedCurrency.USD, date: '2026-08-01' },
        { category: 'Books', description: 'Technical reference books', amount: 1800, currency: SupportedCurrency.ETB, date: '2026-08-05' },
      ],
    },
    {
      employee: otherEmployees[0],
      title: 'Site inspection travel - July 2026',
      description: 'Expenses during Gondar site visit',
      status: 'APPROVED',
      items: [
        { category: 'Transport', description: 'Bus ticket to Gondar', amount: 580, currency: SupportedCurrency.ETB, date: '2026-07-20' },
        { category: 'Accommodation', description: 'Hotel 2 nights Gondar', amount: 2400, currency: SupportedCurrency.ETB, date: '2026-07-20' },
        { category: 'Meals', description: 'Meals during inspection', amount: 750, currency: SupportedCurrency.ETB, date: '2026-07-21' },
        { category: 'Transport', description: 'Local transport on site', amount: 280, currency: SupportedCurrency.ETB, date: '2026-07-21' },
      ],
    },
    {
      employee: otherEmployees[0],
      title: 'Software and tools - August 2026',
      description: 'Design software subscription renewal',
      status: 'RETURNED',
      items: [
        { category: 'Software', description: 'AutoCAD subscription 1 year', amount: 1200, currency: SupportedCurrency.USD, date: '2026-08-01' },
      ],
    },
    {
      employee: otherEmployees[1],
      title: 'Client entertainment - August 2026',
      description: 'Client dinner for project kickoff',
      status: 'SUBMITTED',
      items: [
        { category: 'Entertainment', description: 'Client dinner - 6 persons', amount: 4500, currency: SupportedCurrency.ETB, date: '2026-08-10' },
        { category: 'Transport', description: 'Taxi to restaurant and back', amount: 320, currency: SupportedCurrency.ETB, date: '2026-08-10' },
      ],
    },
    {
      employee: otherEmployees[2],
      title: 'Medical expenses - July 2026',
      description: 'Work-related injury treatment',
      status: 'APPROVED',
      items: [
        { category: 'Medical', description: 'Emergency clinic visit', amount: 1800, currency: SupportedCurrency.ETB, date: '2026-07-18' },
        { category: 'Medical', description: 'Prescribed medication', amount: 650, currency: SupportedCurrency.ETB, date: '2026-07-18' },
        { category: 'Medical', description: 'Follow-up consultation', amount: 900, currency: SupportedCurrency.ETB, date: '2026-07-25' },
      ],
    },
    {
      employee: otherEmployees[3],
      title: 'Conference attendance - September 2026',
      description: 'Engineering conference registration and travel',
      status: 'REJECTED',
      items: [
        { category: 'Registration', description: 'Conference registration fee', amount: 150, currency: SupportedCurrency.USD, date: '2026-09-01' },
        { category: 'Transport', description: 'Travel to conference venue', amount: 680, currency: SupportedCurrency.ETB, date: '2026-09-01' },
      ],
    },
  ];

  for (const claim of expenseClaims) {
    const approvalRequest = await createApprovalChain(ctx, {
      employeeId: claim.employee.id,
      categoryCode: 'EXPENSE_CLAIM',
      title: claim.title,
      status: claim.status,
      companyId,
    });

    const seq = await prisma.$queryRaw<
      Array<{ nextval: bigint | number }>
    >`SELECT nextval('expense_claim_number_seq') as nextval`;
    const claimNumber = `EC-${String(Number(seq[0]?.nextval ?? 1)).padStart(4, '0')}`;

    let totalEtb = 0;
    const processedItems = claim.items.map((item) => {
      const rate =
        item.currency === SupportedCurrency.USD
          ? usdRate
          : item.currency === SupportedCurrency.CNY
            ? cnyRate
            : 1;
      const amountEtb = item.amount * rate;
      totalEtb += amountEtb;
      return { ...item, amountEtb, exchangeRate: rate };
    });

    await prisma.expenseClaim.create({
      data: {
        id: randomUUID(),
        companyId,
        claimNumber,
        employeeId: claim.employee.id,
        title: claim.title,
        description: claim.description,
        status: claim.status as ExpenseClaimStatus,
        totalAmountEtb: totalEtb,
        approvalRequestId: approvalRequest.id,
        submittedAt: new Date(),
        completedAt: ['APPROVED', 'REJECTED'].includes(claim.status)
          ? new Date()
          : null,
        createdBy: claim.employee.id,
        updatedBy: claim.employee.id,
        items: {
          create: processedItems.map((item) => ({
            id: randomUUID(),
            category: item.category,
            description: item.description,
            amount: item.amount,
            currency: item.currency,
            amountEtb: item.amountEtb,
            exchangeRate: item.exchangeRate,
            expenseDate: new Date(item.date),
          })),
        },
      },
    });

    console.log(
      `? Expense claim ${claimNumber} created - ${claim.items.length} items - ETB ${totalEtb.toFixed(2)}`,
    );
  }

  console.log('? Expense claims seeded');
}

// ©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤
// Per diem requests
// ©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤

async function ensureEmployeePerDiemRate(
  companyId: string,
  employeeId: string,
  actorUserId: string,
): Promise<{ id: string; currency: SupportedCurrency }> {
  const existing = await prisma.employeePerDiemRate.findFirst({
    where: { companyId, employeeId, deletedAt: null },
  });
  if (existing) {
    return { id: existing.id, currency: existing.currency };
  }

  const created = await prisma.employeePerDiemRate.create({
    data: {
      id: randomUUID(),
      companyId,
      employeeId,
      domesticRate: 500,
      regionalRate: 80,
      internationalRate: 150,
      currency: SupportedCurrency.ETB,
      createdBy: actorUserId,
      updatedBy: actorUserId,
    },
  });
  return { id: created.id, currency: created.currency };
}

function resolveCategoryRate(
  row: {
    domesticRate: { toString(): string } | null;
    regionalRate: { toString(): string } | null;
    internationalRate: { toString(): string } | null;
    currency: SupportedCurrency;
  },
  destinationCategory: string,
): { dailyRate: number; currency: SupportedCurrency } | null {
  const map: Record<string, { toString(): string } | null> = {
    Domestic: row.domesticRate,
    Regional: row.regionalRate,
    International: row.internationalRate,
  };
  const value = map[destinationCategory];
  if (value == null) {
    return null;
  }
  return { dailyRate: Number(value), currency: row.currency };
}

async function seedPerDiemRequests(
  ctx: ChainContext,
  companyId: string,
  weiChen: User,
  xiaomingLi: User,
  otherEmployees: User[],
  usdRate: number,
  cnyRate: number,
  approvedFlights: Array<{ id: string }>,
  approvedTrips: Array<{ id: string }>,
): Promise<void> {
  console.log('Seeding per diem requests...');

  const perDiemRequests: Array<{
    employee: User;
    destinationCategory: string;
    destination: string;
    startDate: string;
    endDate: string;
    status: HrRequestStatus;
    linkedFlightId: string | null;
    linkedBusinessTripId: string | null;
    notes: string;
  }> = [
    {
      employee: weiChen,
      destinationCategory: 'Regional',
      destination: 'Nairobi, Kenya',
      startDate: '2026-08-15',
      endDate: '2026-08-20',
      status: 'APPROVED',
      linkedFlightId: approvedFlights[0]?.id ?? null,
      linkedBusinessTripId: approvedTrips[0]?.id ?? null,
      notes: 'Per diem for Nairobi client meeting trip',
    },
    {
      employee: weiChen,
      destinationCategory: 'Domestic',
      destination: 'Hawassa, Ethiopia',
      startDate: '2026-07-15',
      endDate: '2026-07-17',
      status: 'APPROVED',
      linkedFlightId: null,
      linkedBusinessTripId: null,
      notes: 'Domestic site inspection per diem',
    },
    {
      employee: weiChen,
      destinationCategory: 'International',
      destination: 'Cairo, Egypt',
      startDate: '2026-10-05',
      endDate: '2026-10-09',
      status: 'IN_REVIEW',
      linkedFlightId: null,
      linkedBusinessTripId: null,
      notes: 'Technical training per diem',
    },
    {
      employee: xiaomingLi,
      destinationCategory: 'International',
      destination: 'Dubai, UAE',
      startDate: '2026-09-10',
      endDate: '2026-09-14',
      status: 'APPROVED',
      linkedFlightId: null,
      linkedBusinessTripId: approvedTrips[1]?.id ?? null,
      notes: 'Dubai construction expo per diem',
    },
    {
      employee: xiaomingLi,
      destinationCategory: 'Domestic',
      destination: 'Bahir Dar, Ethiopia',
      startDate: '2026-08-20',
      endDate: '2026-08-22',
      status: 'APPROVED',
      linkedFlightId: approvedFlights[2]?.id ?? null,
      linkedBusinessTripId: null,
      notes: 'Project review per diem',
    },
    {
      employee: otherEmployees[0],
      destinationCategory: 'International',
      destination: 'Johannesburg, South Africa',
      startDate: '2026-09-20',
      endDate: '2026-09-25',
      status: 'SUBMITTED',
      linkedFlightId: null,
      linkedBusinessTripId: null,
      notes: 'PM conference per diem',
    },
    {
      employee: otherEmployees[0],
      destinationCategory: 'Domestic',
      destination: 'Gondar, Ethiopia',
      startDate: '2026-07-20',
      endDate: '2026-07-22',
      status: 'APPROVED',
      linkedFlightId: null,
      linkedBusinessTripId: null,
      notes: 'Site inspection per diem',
    },
    {
      employee: otherEmployees[1],
      destinationCategory: 'Regional',
      destination: 'Dar es Salaam, Tanzania',
      startDate: '2026-08-25',
      endDate: '2026-08-28',
      status: 'APPROVED',
      linkedFlightId: null,
      linkedBusinessTripId: approvedTrips[2]?.id ?? null,
      notes: 'East Africa forum per diem',
    },
    {
      employee: otherEmployees[2],
      destinationCategory: 'International',
      destination: 'Beijing, China',
      startDate: '2026-09-01',
      endDate: '2026-09-07',
      status: 'APPROVED',
      linkedFlightId: null,
      linkedBusinessTripId: null,
      notes: 'CCECC HQ annual review per diem',
    },
    {
      employee: otherEmployees[3],
      destinationCategory: 'International',
      destination: 'Lagos, Nigeria',
      startDate: '2026-08-30',
      endDate: '2026-09-03',
      status: 'REJECTED',
      linkedFlightId: null,
      linkedBusinessTripId: null,
      notes: 'West Africa market exploration per diem',
    },
  ];

  for (const pd of perDiemRequests) {
    const employeeRateRow = await prisma.employeePerDiemRate.findFirst({
      where: {
        companyId,
        employeeId: pd.employee.id,
        deletedAt: null,
      },
    });
    if (!employeeRateRow) {
      console.warn(`? No employee per diem rate for ${pd.employee.id} - skipping`);
      continue;
    }

    const rate = resolveCategoryRate(employeeRateRow, pd.destinationCategory);
    if (!rate) {
      console.warn(`? No rate found for ${pd.destinationCategory} - skipping`);
      continue;
    }

    const start = new Date(pd.startDate);
    const end = new Date(pd.endDate);
    const days =
      Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1;
    const dailyRate = rate.dailyRate;
    const totalAmount = dailyRate * days;
    const exchangeRate =
      rate.currency === SupportedCurrency.USD
        ? usdRate
        : rate.currency === SupportedCurrency.CNY
          ? cnyRate
          : 1;
    const totalAmountEtb = totalAmount * exchangeRate;

    const approvalRequest = await createApprovalChain(ctx, {
      employeeId: pd.employee.id,
      categoryCode: 'PER_DIEM',
      title: `Per diem - ${pd.destination} (${pd.startDate} to ${pd.endDate})`,
      status: pd.status,
      companyId,
    });

    const seq = await prisma.$queryRaw<
      Array<{ nextval: bigint | number }>
    >`SELECT nextval('per_diem_request_number_seq') as nextval`;
    const requestNumber = `PD-${String(Number(seq[0]?.nextval ?? 1)).padStart(4, '0')}`;

    await prisma.perDiemRequest.create({
      data: {
        id: randomUUID(),
        companyId,
        requestNumber,
        employeeId: pd.employee.id,
        employeePerDiemRateId: employeeRateRow.id,
        destinationCategory: pd.destinationCategory,
        destination: pd.destination,
        startDate: start,
        endDate: end,
        days,
        dailyRate,
        currency: rate.currency,
        totalAmount,
        totalAmountEtb,
        exchangeRate,
        linkedFlightId: pd.linkedFlightId,
        linkedBusinessTripId: pd.linkedBusinessTripId,
        notes: pd.notes,
        status: pd.status as PerDiemStatus,
        approvalRequestId: approvalRequest.id,
        submittedAt: new Date(),
        completedAt: ['APPROVED', 'REJECTED'].includes(pd.status)
          ? new Date()
          : null,
        createdBy: pd.employee.id,
        updatedBy: pd.employee.id,
      },
    });

    console.log(
      `? Per diem ${requestNumber} - ${pd.destination} - ${days} days - ETB ${totalAmountEtb.toFixed(2)}`,
    );
  }

  console.log('? Per diem requests seeded');
}

// ©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤
// Runner
// ©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤©¤

async function main(): Promise<void> {
  console.log('Starting expense claim + per diem seed...');

  const weiChen = (await prisma.user.findFirst({
    where: { firstName: { contains: 'Wei' }, lastName: { contains: 'Chen' } },
    include: {
      engineeringDiscipline: { include: { leader: true } },
    },
  })) as UserWithDisciplineLeader | null;
  if (!weiChen) throw new Error('Wei Chen not found');

  const xiaomingLi = await prisma.user.findFirst({
    where: { firstName: { contains: 'Xiaoming' } },
  });
  if (!xiaomingLi) throw new Error('Xiaoming Li not found');

  const jinxia = await prisma.user.findFirst({
    where: { firstName: { contains: 'Jinxia' } },
  });
  if (!jinxia) throw new Error('Jinxia not found');

  const davidWu = await prisma.user.findFirst({
    where: { firstName: { contains: 'David' }, lastName: { contains: 'Wu' } },
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

  const approvedFlights = await prisma.flightApplication.findMany({
    where: { companyId, status: 'APPROVED' },
    take: 3,
  });

  const approvedTrips = await prisma.businessTrip.findMany({
    where: { companyId, status: 'APPROVED' },
    take: 3,
  });

  const allEmployees = [weiChen, xiaomingLi, ...otherEmployees];
  for (const employee of allEmployees) {
    await ensureEmployeePerDiemRate(companyId, employee.id, weiChen.id);
  }

  const usdRate = await getExchangeRate(SupportedCurrency.USD, companyId);
  const cnyRate = await getExchangeRate(SupportedCurrency.CNY, companyId);
  console.log(`Exchange rates - USD/ETB: ${usdRate}, CNY/ETB: ${cnyRate}`);

  const ctx: ChainContext = { xiaomingLi, jinxia, davidWu };

  await wipeExpenseAndPerDiem(companyId);
  await seedExpenseClaims(
    ctx,
    companyId,
    weiChen,
    xiaomingLi,
    otherEmployees,
    usdRate,
    cnyRate,
  );
  await seedPerDiemRequests(
    ctx,
    companyId,
    weiChen,
    xiaomingLi,
    otherEmployees,
    usdRate,
    cnyRate,
    approvedFlights,
    approvedTrips,
  );

  const claimCount = await prisma.expenseClaim.count({ where: { companyId } });
  const itemCount = await prisma.expenseClaimItem.count({
    where: { claim: { companyId } },
  });
  const perDiemCount = await prisma.perDiemRequest.count({
    where: { companyId },
  });
  const linkedCount = await prisma.perDiemRequest.count({
    where: {
      companyId,
      OR: [
        { linkedFlightId: { not: null } },
        { linkedBusinessTripId: { not: null } },
      ],
    },
  });

  console.log('\n? Expense claims + per diem seed complete');
  console.log(`  Expense claims: ${claimCount} (${itemCount} line items)`);
  console.log(`  Per diem:       ${perDiemCount} (${linkedCount} with flight/trip links)`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
