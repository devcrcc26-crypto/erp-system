import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main(): Promise<void> {
  const disciplines = await prisma.discipline.findMany({
    where: { deletedAt: null },
    select: { id: true, name: true, isActive: true },
    orderBy: { name: 'asc' },
  });

  const unmapped = await prisma.$queryRaw<
    Array<{ discipline_name: string; cnt: number }>
  >`
    SELECT discipline_name, COUNT(*)::int AS cnt
    FROM task_discipline
    WHERE deleted_at IS NULL AND discipline_id IS NULL
    GROUP BY discipline_name
  `;

  const mapped = await prisma.$queryRaw<Array<{ cnt: number }>>`
    SELECT COUNT(*)::int AS cnt FROM task_discipline
    WHERE deleted_at IS NULL AND discipline_id IS NOT NULL
  `;

  console.log(
    JSON.stringify(
      {
        disciplineCatalogCount: disciplines.length,
        disciplines,
        taskDisciplinesMapped: mapped[0]?.cnt ?? 0,
        unmappedTaskDisciplines: unmapped,
      },
      null,
      2,
    ),
  );
}

main()
  .finally(async () => {
    await prisma.$disconnect();
  });
