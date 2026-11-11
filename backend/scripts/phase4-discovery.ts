import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main(): Promise<void> {
  const packageCount = await prisma.designPackage.count({
    where: { deletedAt: null },
  });

  const roleFillCounts = await prisma.$queryRaw<
    Array<{
      has_owner: number;
      has_reviewer: number;
      has_lead: number;
      has_chief: number;
      has_institute: number;
    }>
  >`
    SELECT
      COUNT(*) FILTER (WHERE package_owner_user_id IS NOT NULL)::int AS has_owner,
      COUNT(*) FILTER (WHERE package_reviewer_user_id IS NOT NULL)::int AS has_reviewer,
      COUNT(*) FILTER (WHERE package_discipline_lead_user_id IS NOT NULL)::int AS has_lead,
      COUNT(*) FILTER (WHERE package_chief_user_id IS NOT NULL)::int AS has_chief,
      COUNT(*) FILTER (WHERE package_institute_chief_user_id IS NOT NULL)::int AS has_institute
    FROM design_package
    WHERE deleted_at IS NULL
  `;

  const copyDownPreview = await prisma.$queryRaw<
    Array<{
      package_id: string;
      package_name: string;
      would_fill_designer: boolean;
      would_fill_owner: boolean;
      would_fill_reviewer: boolean;
      would_fill_lead: boolean;
      would_fill_chief: boolean;
      would_fill_institute: boolean;
      would_fill_supporting: boolean;
    }>
  >`
    SELECT
      dp.id AS package_id,
      dp.name AS package_name,
      (dp.package_owner_user_id IS NULL AND td.designer_user_id IS NOT NULL) AS would_fill_designer,
      (dp.package_owner_user_id IS NULL AND td.owner_user_id IS NOT NULL) AS would_fill_owner,
      (dp.package_reviewer_user_id IS NULL AND td.reviewer_user_id IS NOT NULL) AS would_fill_reviewer,
      (dp.package_discipline_lead_user_id IS NULL AND td.discipline_lead_user_id IS NOT NULL) AS would_fill_lead,
      (dp.package_chief_user_id IS NULL AND td.chief_user_id IS NOT NULL) AS would_fill_chief,
      (dp.package_institute_chief_user_id IS NULL AND td.institute_chief_user_id IS NOT NULL) AS would_fill_institute,
      (td.supporting_designer_user_id IS NOT NULL) AS would_fill_supporting
    FROM design_package dp
    JOIN task_discipline td ON td.id = dp.task_discipline_id
    WHERE dp.deleted_at IS NULL AND td.deleted_at IS NULL
    ORDER BY dp.name
  `;

  const childTasks = await prisma.$queryRaw<Array<{ cnt: number }>>`
    SELECT COUNT(*)::int AS cnt FROM task
    WHERE parent_task_id IS NOT NULL AND deleted_at IS NULL
  `;

  console.log(
    JSON.stringify(
      {
        packageCount,
        roleFillCounts: roleFillCounts[0],
        copyDownPreview,
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
