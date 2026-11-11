/**
 * Change 6 Phase 2 - backfill discipline_index, subtask_index, subtask_id.
 * Run: npx ts-node scripts/phase2-subtask-backfill.ts
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function count(label: string, sql: string): Promise<number> {
  const rows = await prisma.$queryRawUnsafe<Array<{ count: bigint }>>(sql);
  const value = Number(rows[0]?.count ?? 0);
  console.log(`${label}: ${value}`);
  return value;
}

async function main(): Promise<void> {
  console.log('=== Pre-backfill row counts ===');
  await count('task_discipline (all)', 'SELECT COUNT(*)::bigint AS count FROM task_discipline');
  await count(
    'task_discipline (active)',
    'SELECT COUNT(*)::bigint AS count FROM task_discipline WHERE deleted_at IS NULL',
  );
  await count('design_package (all)', 'SELECT COUNT(*)::bigint AS count FROM design_package');
  await count(
    'design_package (active)',
    'SELECT COUNT(*)::bigint AS count FROM design_package WHERE deleted_at IS NULL',
  );
  await count(
    'discipline_index already set',
    'SELECT COUNT(*)::bigint AS count FROM task_discipline WHERE discipline_index IS NOT NULL',
  );
  await count(
    'subtask_index already set',
    'SELECT COUNT(*)::bigint AS count FROM design_package WHERE subtask_index IS NOT NULL',
  );
  await count(
    'subtask_id already set',
    'SELECT COUNT(*)::bigint AS count FROM design_package WHERE subtask_id IS NOT NULL',
  );

  console.log('\n=== 2A: Backfill discipline_index ===');
  const r2a = await prisma.$executeRawUnsafe(`
    UPDATE task_discipline td
    SET discipline_index = sub.rn
    FROM (
      SELECT id,
        ROW_NUMBER() OVER (
          PARTITION BY task_id
          ORDER BY created_at ASC
        ) AS rn
      FROM task_discipline
      WHERE deleted_at IS NULL
    ) sub
    WHERE td.id = sub.id
  `);
  console.log(`Rows updated (2A): ${r2a}`);
  await count(
    'discipline_index set after 2A',
    'SELECT COUNT(*)::bigint AS count FROM task_discipline WHERE discipline_index IS NOT NULL AND deleted_at IS NULL',
  );

  console.log('\n=== 2B: Backfill subtask_index ===');
  const r2b = await prisma.$executeRawUnsafe(`
    UPDATE design_package dp
    SET subtask_index = sub.rn
    FROM (
      SELECT id,
        ROW_NUMBER() OVER (
          PARTITION BY task_discipline_id
          ORDER BY created_at ASC
        ) AS rn
      FROM design_package
      WHERE deleted_at IS NULL
    ) sub
    WHERE dp.id = sub.id
  `);
  console.log(`Rows updated (2B): ${r2b}`);
  await count(
    'subtask_index set after 2B',
    'SELECT COUNT(*)::bigint AS count FROM design_package WHERE subtask_index IS NOT NULL AND deleted_at IS NULL',
  );

  console.log('\n=== 2C: Backfill subtask_id (where overseas_task_number set) ===');
  const eligible2c = await count(
    'eligible for subtask_id',
    `SELECT COUNT(*)::bigint AS count
     FROM design_package dp
     JOIN task_discipline td ON dp.task_discipline_id = td.id
     JOIN task t ON t.id = td.task_id
     WHERE dp.deleted_at IS NULL
       AND t.overseas_task_number IS NOT NULL
       AND dp.subtask_index IS NOT NULL
       AND td.discipline_index IS NOT NULL`,
  );

  const r2c = await prisma.$executeRawUnsafe(`
    UPDATE design_package dp
    SET subtask_id = CONCAT(
      t.overseas_task_number,
      '-',
      LPAD(td.discipline_index::text, 2, '0'),
      '-',
      LPAD(dp.subtask_index::text, 2, '0')
    )
    FROM task_discipline td
    JOIN task t ON t.id = td.task_id
    WHERE dp.task_discipline_id = td.id
      AND t.overseas_task_number IS NOT NULL
      AND dp.subtask_index IS NOT NULL
      AND td.discipline_index IS NOT NULL
      AND dp.deleted_at IS NULL
  `);
  console.log(`Rows updated (2C): ${r2c} (eligible was ${eligible2c})`);
  await count(
    'subtask_id set after 2C',
    'SELECT COUNT(*)::bigint AS count FROM design_package WHERE subtask_id IS NOT NULL AND deleted_at IS NULL',
  );

  console.log('\n=== Sample subtask_id values ===');
  const samples = await prisma.$queryRawUnsafe<
    Array<{ subtask_id: string; package_code: string; name: string }>
  >(
    `SELECT subtask_id, package_code, name
     FROM design_package
     WHERE subtask_id IS NOT NULL AND deleted_at IS NULL
     ORDER BY created_at ASC
     LIMIT 10`,
  );
  for (const row of samples) {
    console.log(`  ${row.subtask_id}  (${row.package_code}: ${row.name})`);
  }
  if (samples.length === 0) {
    console.log('  (none - no packages with overseas task number on parent task)');
  }
}

main()
  .catch((err: unknown) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
