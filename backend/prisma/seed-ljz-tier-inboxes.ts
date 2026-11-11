import { PrismaClient } from '@prisma/client';
import { sid } from './seed-epc-demo';
import { seedLjzTierReviewInboxes } from './seed-demo-projects';
import { buildPmSeedContextFromDb } from './seed-project-full';

const LJZ_PROJECT_INDEX = 11;
const LJZ_PROJECT_CODE = 'LJZ-2024-001';

/**
 * Adds active review inbox sessions at every governance tier for LJZ-2024-001.
 * Safe to re-run - all writes are upserts.
 */
async function main(): Promise<void> {
  const prisma = new PrismaClient();

  try {
    const ctx = await buildPmSeedContextFromDb(prisma);
    const project = await prisma.project.findFirst({
      where: { companyId: ctx.companyId, projectCode: LJZ_PROJECT_CODE },
      select: { id: true, projectCode: true },
    });

    if (!project) {
      throw new Error(
        `Project ${LJZ_PROJECT_CODE} not found. Run the demo projects seed first.`,
      );
    }

    const task = await prisma.task.findFirst({
      where: { projectId: project.id, deletedAt: null },
      orderBy: { createdAt: 'asc' },
      select: { id: true },
    });

    if (!task) {
      throw new Error(`No schedule task found for ${LJZ_PROJECT_CODE}.`);
    }

    await seedLjzTierReviewInboxes(
      ctx,
      LJZ_PROJECT_INDEX,
      LJZ_PROJECT_CODE,
      task.id,
    );

    const activeSessions = await prisma.reviewSession.count({
      where: {
        companyId: ctx.companyId,
        status: 'ACTIVE',
        taskDiscipline: { task: { projectId: project.id } },
      },
    });

    console.log(
      `\nDone. ${LJZ_PROJECT_CODE} now has ${activeSessions} active review session(s).`,
    );
    console.log('Tier holders (log in to see their inbox):');
    console.log('  Discipline Owner  - demo owner user (U.owner / Hassan)');
    console.log('  Reviewer          - demo reviewer (U.reviewer / Nadia)');
    console.log('  Discipline Lead   - demo lead (U.lead / Khalid)');
    console.log('  Dept Chief        - demo dept chief (U.deptChief / Rania)');
    console.log('  Institute Chief   - demo institute chief (U.instituteChief / Li Zhang)');
  } finally {
    await prisma.$disconnect();
  }
}

if (require.main === module) {
  main().catch((error: unknown) => {
    console.error('LJZ tier inbox seed failed:', error);
    process.exit(1);
  });
}

export { main as seedLjzTierInboxesOnly };
