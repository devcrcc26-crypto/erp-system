import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main(): Promise<void> {
  const urgency = await prisma.$queryRaw<
    Array<{ urgency_level: string; cnt: number }>
  >`
    SELECT urgency_level, COUNT(*)::int AS cnt
    FROM task
    WHERE deleted_at IS NULL
    GROUP BY urgency_level
    ORDER BY urgency_level
  `;

  const approval = await prisma.$queryRaw<
    Array<{ approval_level: string | null; cnt: number }>
  >`
    SELECT approval_level, COUNT(*)::int AS cnt
    FROM task
    WHERE deleted_at IS NULL
    GROUP BY approval_level
    ORDER BY approval_level
  `;

  const responsibleDept = await prisma.$queryRaw<
    Array<{ responsible_department: string; cnt: number }>
  >`
    SELECT responsible_department, COUNT(*)::int AS cnt
    FROM project
    WHERE deleted_at IS NULL
    GROUP BY responsible_department
    ORDER BY responsible_department
  `;

  const designPackages = await prisma.$queryRaw<Array<{ cnt: number }>>`
    SELECT COUNT(*)::int AS cnt FROM design_package WHERE deleted_at IS NULL
  `;

  const childTasks = await prisma.$queryRaw<Array<{ cnt: number }>>`
    SELECT COUNT(*)::int AS cnt
    FROM task
    WHERE parent_task_id IS NOT NULL AND deleted_at IS NULL
  `;

  const disciplinesWithRoles = await prisma.$queryRaw<Array<{ cnt: number }>>`
    SELECT COUNT(*)::int AS cnt
    FROM task_discipline
    WHERE deleted_at IS NULL
      AND (
        designer_user_id IS NOT NULL
        OR supporting_designer_user_id IS NOT NULL
        OR owner_user_id IS NOT NULL
        OR reviewer_user_id IS NOT NULL
        OR discipline_lead_user_id IS NOT NULL
        OR chief_user_id IS NOT NULL
        OR institute_chief_user_id IS NOT NULL
      )
  `;

  const departments = await prisma.department.findMany({
    where: { deletedAt: null },
    select: { id: true, name: true, code: true, companyId: true },
  });

  console.log(
    JSON.stringify(
      {
        urgency,
        approval,
        responsibleDept,
        designPackages: designPackages[0]?.cnt ?? 0,
        childTasks: childTasks[0]?.cnt ?? 0,
        disciplinesWithRoles: disciplinesWithRoles[0]?.cnt ?? 0,
        departments,
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
