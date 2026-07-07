import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main(): Promise<void> {
  console.log('=== DOCUMENT TABLES (project-linked folders) ===');
  const docCounts = await prisma.$queryRawUnsafe<
    Array<{ label: string; cnt: number }>
  >(`
    SELECT 'document_folder (all)' AS label, COUNT(*)::int AS cnt FROM document_folder
    UNION ALL
    SELECT 'document_folder (PROJECT ctx)', COUNT(*)::int FROM document_folder WHERE context_type = 'PROJECT'
    UNION ALL
    SELECT 'document', COUNT(*)::int FROM document
    UNION ALL
    SELECT 'document_version', COUNT(*)::int FROM document_version
    UNION ALL
    SELECT 'design_package_attachments', COUNT(*)::int FROM design_package_attachments
  `);
  for (const row of docCounts) console.log(`${row.label}: ${row.cnt}`);

  console.log('\n=== USER BREAKDOWN ===');
  const userBreakdown = await prisma.$queryRawUnsafe<
    Array<{ category: string; cnt: number }>
  >(`
    SELECT
      CASE
        WHEN id::text LIKE '00000000-0000-4000-8000-%' THEN 'seed_uuid_pattern'
        WHEN email LIKE '%@company.local' THEN 'company_local_email'
        WHEN email IS NULL THEN 'no_email'
        ELSE 'real_email'
      END AS category,
      COUNT(*)::int AS cnt
    FROM "user"
    WHERE deleted_at IS NULL
    GROUP BY 1
    ORDER BY cnt DESC
  `);
  console.log(JSON.stringify(userBreakdown, null, 2));

  console.log('\n=== REAL-LOOKING USERS (non-seed, non-company.local) ===');
  const realUsers = await prisma.$queryRawUnsafe<
    Array<{ id: string; full_name: string; email: string | null; created_at: string }>
  >(`
    SELECT id, TRIM(CONCAT(first_name, ' ', last_name)) AS full_name, email, created_at
    FROM "user"
    WHERE deleted_at IS NULL
      AND id::text NOT LIKE '00000000-0000-4000-8000-%'
      AND (email IS NULL OR email NOT LIKE '%@company.local')
    ORDER BY created_at
    LIMIT 30
  `);
  console.log(JSON.stringify(realUsers, null, 2));

  console.log('\n=== FK CONSTRAINTS ON PROJECT-RELATED TABLES ===');
  const fks = await prisma.$queryRawUnsafe<
    Array<{
      child_table: string;
      child_column: string;
      parent_table: string;
      parent_column: string;
      constraint_name: string;
    }>
  >(`
    SELECT
      tc.table_name AS child_table,
      kcu.column_name AS child_column,
      ccu.table_name AS parent_table,
      ccu.column_name AS parent_column,
      tc.constraint_name
    FROM information_schema.table_constraints tc
    JOIN information_schema.key_column_usage kcu
      ON tc.constraint_name = kcu.constraint_name
     AND tc.table_schema = kcu.table_schema
    JOIN information_schema.constraint_column_usage ccu
      ON ccu.constraint_name = tc.constraint_name
     AND ccu.table_schema = tc.table_schema
    WHERE tc.constraint_type = 'FOREIGN KEY'
      AND tc.table_schema = 'public'
      AND (
        tc.table_name IN (
          'project','project_team','milestone','task','task_dependency','task_discipline',
          'engineering_document','engineering_document_version','design_package',
          'design_package_item','design_package_dependency','design_package_attachments',
          'review_session','review_context_snapshot','review_comment','workflow_event_log',
          'rfi','rfi_response','submittal','submittal_review','submittal_item',
          'external_review_trigger','deliverable','project_change_request',
          'task_discipline_review','drawing','drawing_version','drawing_link',
          'daily_log','daily_log_workforce','daily_log_equipment','daily_log_visitor',
          'daily_log_incident','meeting','meeting_agenda_item','meeting_attendee',
          'action_item','correspondence','risk','issue','punch_item','closeout',
          'closeout_checklist_item','warranty','document_folder','document','document_version'
        )
        OR ccu.table_name IN ('project','task','task_discipline','design_package','milestone')
      )
    ORDER BY child_table, parent_table
  `);
  console.log(JSON.stringify(fks, null, 2));

  console.log('\n=== NOTIFICATIONS REFERENCING PROJECTS (if any) ===');
  try {
    const notifs = await prisma.$queryRawUnsafe<Array<{ cnt: number }>>(
      `SELECT COUNT(*)::int AS cnt FROM notification WHERE entity_type ILIKE '%project%' OR entity_type ILIKE '%task%'`,
    );
    console.log(`project/task notifications: ${notifs[0]?.cnt ?? 0}`);
  } catch {
    console.log('notification table query skipped');
  }
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
