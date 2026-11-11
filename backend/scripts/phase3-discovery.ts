import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main(): Promise<void> {
  const urgencyCounts = await prisma.$queryRaw<
    Array<{ urgency_level: string; cnt: number }>
  >`
    SELECT urgency_level, COUNT(*)::int AS cnt
    FROM task WHERE deleted_at IS NULL
    GROUP BY urgency_level ORDER BY urgency_level
  `;

  const approvalCounts = await prisma.$queryRaw<
    Array<{ approval_level: string | null; cnt: number }>
  >`
    SELECT approval_level, COUNT(*)::int AS cnt
    FROM task WHERE deleted_at IS NULL
    GROUP BY approval_level ORDER BY approval_level NULLS FIRST
  `;

  const commissioningCounts = await prisma.$queryRaw<
    Array<{ commissioning_method: string | null; cnt: number }>
  >`
    SELECT commissioning_method, COUNT(*)::int AS cnt
    FROM task WHERE deleted_at IS NULL
    GROUP BY commissioning_method ORDER BY commissioning_method NULLS FIRST
  `;

  const contractTypeCounts = await prisma.$queryRaw<
    Array<{ contract_type: string; cnt: number }>
  >`
    SELECT contract_type, COUNT(*)::int AS cnt
    FROM project WHERE deleted_at IS NULL
    GROUP BY contract_type ORDER BY contract_type
  `;

  const taskCount = await prisma.task.count({ where: { deletedAt: null } });

  const demoTasks = await prisma.task.findMany({
    where: {
      deletedAt: null,
      OR: [
        { taskIdCode: 'TAS-00002' },
        { name: { equals: 'A', mode: 'insensitive' } },
        { name: { contains: 'Lorem', mode: 'insensitive' } },
        { description: { contains: 'Lorem', mode: 'insensitive' } },
      ],
    },
    select: {
      id: true,
      taskIdCode: true,
      name: true,
      projectId: true,
      project: { select: { projectCode: true, name: true } },
    },
  });

  const notStartedWithActual = await prisma.$queryRaw<Array<{ cnt: number }>>`
    SELECT COUNT(*)::int AS cnt FROM task
    WHERE deleted_at IS NULL
      AND status = 'NOT_STARTED'
      AND actual_completion_time IS NOT NULL
  `;

  console.log(
    JSON.stringify(
      {
        taskCount,
        urgencyCounts,
        approvalCounts,
        commissioningCounts,
        contractTypeCounts,
        demoTasks,
        notStartedWithActual: notStartedWithActual[0]?.cnt ?? 0,
      },
      null,
      2,
    ),
  );
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
