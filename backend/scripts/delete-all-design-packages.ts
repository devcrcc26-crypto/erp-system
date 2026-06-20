import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

/**
 * Hard-deletes every design package and dependent workflow rows.
 */
async function deleteAllDesignPackages(): Promise<void> {
  const packages = await prisma.designPackage.findMany({
    select: { id: true, companyId: true, name: true },
  });

  if (packages.length === 0) {
    console.log('No design packages found.');
    return;
  }

  const packageIds = packages.map((pkg) => pkg.id);
  const sessions = await prisma.reviewSession.findMany({
    where: { designPackageId: { in: packageIds } },
    select: { id: true },
  });
  const sessionIds = sessions.map((session) => session.id);

  await prisma.$transaction(async (tx) => {
    if (sessionIds.length > 0) {
      await tx.reviewComment.deleteMany({
        where: { reviewSessionId: { in: sessionIds } },
      });
      await tx.reviewContextSnapshot.deleteMany({
        where: { reviewSessionId: { in: sessionIds } },
      });
      await tx.reviewSession.deleteMany({ where: { id: { in: sessionIds } } });
    }

    await tx.deliverable.updateMany({
      where: { designPackageId: { in: packageIds } },
      data: { designPackageId: null },
    });

    await tx.submittalItem.deleteMany({
      where: { designPackageId: { in: packageIds } },
    });

    await tx.designPackageDependency.deleteMany({
      where: {
        OR: [
          { designPackageId: { in: packageIds } },
          { dependsOnPackageId: { in: packageIds } },
        ],
      },
    });

    await tx.designPackageItem.deleteMany({
      where: { designPackageId: { in: packageIds } },
    });

    const workflowEntityIds = [...packageIds, ...sessionIds];
    if (workflowEntityIds.length > 0) {
      await tx.workflowEventLog.deleteMany({
        where: { entityId: { in: workflowEntityIds } },
      });
    }

    const deleted = await tx.designPackage.deleteMany({
      where: { id: { in: packageIds } },
    });

    console.log(`Deleted ${deleted.count} design package(s):`);
    for (const pkg of packages) {
      console.log(`  - ${pkg.name} (${pkg.id})`);
    }
  });
}

deleteAllDesignPackages()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
