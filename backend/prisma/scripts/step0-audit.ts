import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const PROJECT_TABLES = [
  'review_session_attachment',
  'review_comment',
  'review_context_snapshot',
  'review_session',
  'workflow_event_log',
  'submittal_item',
  'submittal_review',
  'design_package_attachment',
  'design_package_dependency',
  'design_package_item',
  'design_package',
  'engineering_document_version',
  'engineering_document',
  'task_discipline_review',
  'deliverable',
  'task_discipline',
  'external_review_trigger',
  'project_change_request',
  'task_dependency',
  'rfi_response',
  'drawing_version',
  'drawing_link',
  'daily_log_workforce',
  'daily_log_equipment',
  'daily_log_visitor',
  'daily_log_incident',
  'meeting_agenda_item',
  'meeting_attendee',
  'action_item',
  'closeout_checklist_item',
  'warranty',
  'task',
  'milestone',
  'rfi',
  'submittal',
  'drawing',
  'daily_log',
  'meeting',
  'correspondence',
  'risk',
  'issue',
  'punch_item',
  'closeout',
  'project_team',
  'project',
];

const PROTECTED_TABLES = [
  'user',
  'department',
  'engineering_discipline',
  'user_role',
  'role',
  'permission',
  'role_permission',
  'user_session',
];

async function countTable(table: string): Promise<number> {
  const result = await prisma.$queryRawUnsafe<Array<{ cnt: number }>>(
    `SELECT COUNT(*)::int AS cnt FROM "${table}"`,
  );
  return result[0]?.cnt ?? 0;
}

async function main(): Promise<void> {
  const existingTables = await prisma.$queryRawUnsafe<Array<{ tablename: string }>>(
    `SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename`,
  );
  const tableSet = new Set(existingTables.map((row) => row.tablename));

  console.log('=== PROTECTED TABLE COUNTS (must not change) ===');
  for (const table of PROTECTED_TABLES) {
    if (!tableSet.has(table)) {
      console.log(`${table}: MISSING TABLE`);
      continue;
    }
    const count = await countTable(table);
    console.log(`${table}: ${count}`);
  }

  console.log('\n=== PROJECT-RELATED TABLE COUNTS ===');
  const counts: Array<{ table: string; count: number }> = [];
  for (const table of PROJECT_TABLES) {
    if (!tableSet.has(table)) {
      console.log(`${table}: MISSING TABLE`);
      continue;
    }
    const count = await countTable(table);
    counts.push({ table, count });
  }
  counts.sort((a, b) => b.count - a.count);
  for (const { table, count } of counts) {
    console.log(`${table}: ${count}`);
  }

  console.log('\n=== PROJECTS SUMMARY ===');
  const projects = await prisma.$queryRawUnsafe<
    Array<{
      id: string;
      project_code: string;
      name: string;
      status: string;
      created: string;
    }>
  >(`
    SELECT id, project_code, name, status, created_at::date AS created
    FROM project
    WHERE deleted_at IS NULL
    ORDER BY created_at
  `);
  console.log(JSON.stringify(projects, null, 2));

  console.log('\n=== LIVE USERS (first 20) ===');
  const users = await prisma.$queryRawUnsafe<
    Array<{
      id: string;
      full_name: string;
      discipline_id: string | null;
      email: string | null;
    }>
  >(`
    SELECT
      id,
      TRIM(CONCAT(first_name, ' ', last_name)) AS full_name,
      engineering_discipline_id AS discipline_id,
      email
    FROM "user"
    WHERE deleted_at IS NULL
    ORDER BY created_at
    LIMIT 20
  `);
  console.log(JSON.stringify(users, null, 2));

  console.log('\n=== DEPARTMENTS ===');
  const depts = await prisma.$queryRawUnsafe<
    Array<{ id: string; name: string; code: string | null }>
  >(`
    SELECT id, name, code FROM department WHERE deleted_at IS NULL ORDER BY name
  `);
  console.log(JSON.stringify(depts, null, 2));

  console.log('\n=== DISCIPLINES ===');
  const discs = await prisma.$queryRawUnsafe<
    Array<{ id: string; name: string; name_zh: string | null }>
  >(`
    SELECT id, name, name_zh FROM engineering_discipline WHERE deleted_at IS NULL ORDER BY name
  `);
  console.log(JSON.stringify(discs, null, 2));

  console.log('\n=== DOCUMENT FOLDERS BY CONTEXT ===');
  const folders = await prisma.$queryRawUnsafe<
    Array<{ context_type: string; cnt: number }>
  >(`
    SELECT context_type, COUNT(*)::int AS cnt
    FROM document_folder
    WHERE deleted_at IS NULL
    GROUP BY context_type
    ORDER BY cnt DESC
  `);
  console.log(JSON.stringify(folders, null, 2));

  console.log('\n=== ALL PUBLIC TABLES WITH project/task/design FK COLUMNS ===');
  const fkTables = await prisma.$queryRawUnsafe<
    Array<{ table_name: string; column_name: string }>
  >(`
    SELECT c.table_name, c.column_name
    FROM information_schema.columns c
    JOIN information_schema.tables t
      ON t.table_schema = c.table_schema
     AND t.table_name = c.table_name
    WHERE c.table_schema = 'public'
      AND t.table_type = 'BASE TABLE'
      AND c.column_name IN ('project_id', 'task_id', 'design_package_id', 'task_discipline_id')
    ORDER BY c.table_name, c.column_name
  `);
  const fkTableNames = [...new Set(fkTables.map((row) => row.table_name))];
  for (const table of fkTableNames) {
    const count = await countTable(table);
    console.log(`${table}: ${count}`);
  }
  const taskCodes = await prisma.$queryRawUnsafe<
    Array<{ task_id_code: string; project_code: string }>
  >(`
    SELECT t.task_id_code, p.project_code
    FROM task t
    JOIN project p ON p.id = t.project_id
    WHERE t.deleted_at IS NULL
    ORDER BY t.created_at
    LIMIT 10
  `);
  console.log(JSON.stringify(taskCodes, null, 2));
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
