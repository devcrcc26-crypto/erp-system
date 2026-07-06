import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main(): Promise<void> {
  const companies = await prisma.company.findMany({
    where: { deletedAt: null },
    select: { id: true, legalName: true },
  });

  const divisions = await prisma.division.findMany({
    where: { deletedAt: null },
    select: { id: true, name: true, companyId: true },
  });

  const branches = await prisma.branch.findMany({
    where: { deletedAt: null },
    select: { id: true, name: true, companyId: true },
  });

  const departments = await prisma.department.findMany({
    where: { deletedAt: null },
    select: { id: true, name: true, code: true, companyId: true },
  });

  const projectsByDept = await prisma.$queryRaw<
    Array<{ responsible_department: string; cnt: number }>
  >`
    SELECT responsible_department, COUNT(*)::int AS cnt
    FROM project WHERE deleted_at IS NULL
    GROUP BY responsible_department
  `;

  const projectsByDepartmentId = await prisma.$queryRaw<
    Array<{ department_id: string | null; cnt: number }>
  >`
    SELECT department_id, COUNT(*)::int AS cnt
    FROM project WHERE deleted_at IS NULL
    GROUP BY department_id
  `;

  const taskDisciplineNames = await prisma.$queryRaw<
    Array<{ discipline_name: string; cnt: number }>
  >`
    SELECT discipline_name, COUNT(*)::int AS cnt
    FROM task_discipline WHERE deleted_at IS NULL
    GROUP BY discipline_name ORDER BY discipline_name
  `;

  const userDisciplines = await prisma.$queryRaw<
    Array<{ discipline: string | null; cnt: number }>
  >`
    SELECT discipline, COUNT(*)::int AS cnt
    FROM "user" WHERE deleted_at IS NULL
    GROUP BY discipline ORDER BY discipline
  `;

  const demoTasks = await prisma.task.findMany({
    where: {
      deletedAt: null,
      OR: [
        { name: { contains: 'Lorem', mode: 'insensitive' } },
        { description: { contains: 'Lorem', mode: 'insensitive' } },
        { name: { contains: 'DEMO', mode: 'insensitive' } },
        { taskIdCode: { startsWith: 'DEMO' } },
      ],
    },
    select: {
      id: true,
      taskIdCode: true,
      name: true,
      projectId: true,
    },
  });

  const childTasks = await prisma.$queryRaw<Array<{ cnt: number }>>`
    SELECT COUNT(*)::int AS cnt FROM task
    WHERE parent_task_id IS NOT NULL AND deleted_at IS NULL
  `;

  console.log(
    JSON.stringify(
      {
        companies,
        divisions,
        branches,
        departments,
        projectsByDept,
        projectsByDepartmentId,
        taskDisciplineNames,
        userDisciplines,
        demoTasks,
        childTasks: childTasks[0]?.cnt ?? 0,
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
