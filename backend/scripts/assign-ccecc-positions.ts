/**
 * Assign positions to CC-0001…CC-0095 from the employment roster spreadsheet
 * (name / position / date of employment). The roster date is only logged:
 * years of experience are entered by HR, never seeded.
 *
 * Usage:
 *   $env:SEED_MODE='true'
 *   npx ts-node --transpile-only scripts/assign-ccecc-positions.ts
 */
import { PrismaClient } from '@prisma/client';
import { assertLocalhostSeedGuards } from './lib/localhost-seed-guard';

const SAMUEL_ID = '16040ab7-b923-4fe4-87cf-cc3a916c7325';

interface RosterRow {
  employeeId: string;
  positionLabel: string;
  /** ISO date YYYY-MM-DD (parsed from DD/MM/YYYY roster dates); logged only. */
  rosterDate: string;
}

/** Map spreadsheet labels → exact `position.title` in DB. */
const POSITION_ALIASES: Record<string, string> = {
  'admin assistant (directorate)': 'Admin Assistant',
  'admin assistant (directore)': 'Admin Assistant',
  'admin assistant': 'Admin Assistant',
  'mechanical eng.': 'Mechanical Engineer',
  'mechanical eng': 'Mechanical Engineer',
  'pavement eng.': 'Pavement Engineer',
  'pavement eng': 'Pavement Engineer',
  'chief surveyor': 'Surveyor',
  driller: 'Driller',
  'structure eng.': 'Structural Engineer',
  'structure eng': 'Structural Engineer',
  'structural eng.': 'Structural Engineer',
  'structural eng': 'Structural Engineer',
  surveyor: 'Surveyor',
  'junior surveyor': 'Surveyor',
  architect: 'Architect',
  'bid & tender officer': 'Bid & Tender Officer',
  'highway eng.': 'Highway Engineer',
  'highway eng': 'Highway Engineer',
  'highway office eng.': 'Highway Engineer',
  'highway office eng': 'Highway Engineer',
  'highway/road eng.': 'Highway Engineer',
  'highway/road eng': 'Highway Engineer',
  'highway/rural eng.': 'Highway Engineer',
  'highway/rural eng': 'Highway Engineer',
  'geological eng.': 'Geological Engineer',
  'geological eng': 'Geological Engineer',
  'stru. eng./office eng.': 'Structural Engineer',
  'stru. des./office eng.': 'Structural Engineer',
  'stru. eng./office eng': 'Structural Engineer',
  'sanitary eng.': 'Sanitary Engineer',
  'sanitary eng': 'Sanitary Engineer',
  'junior electrical eng': 'Electrical Engineer',
  'junior electrical eng.': 'Electrical Engineer',
  'hydraulic eng.': 'Hydraulic Engineer',
  'hydraulic eng': 'Hydraulic Engineer',
  driver: 'Driver',
  'drafts person': 'Drafts Person',
  'leader architect': 'Architect',
  'hr manager': 'Human Resource Manager',
  'human resource manager': 'Human Resource Manager',
  'senior communication & publicity officer':
    'Communication & Publicity Officer',
  'senior communication and publicity officer':
    'Communication & Publicity Officer',
  'geotechnical/material eng': 'Geotechnical Engineer',
  'geotechnical/material eng.': 'Geotechnical Engineer',
  'geotechnical engineer': 'Geotechnical Engineer',
  'document controller': 'Document Controller',
  'purchase officer': 'Purchase Officer',
  'purchaser officer': 'Purchase Officer',
  'highway structural': 'Structural Engineer',
  'software eng/erp developer': 'Software Engineer (ERP Developer)',
  'software eng-erp (developer)': 'Software Engineer (ERP Developer)',
  'software eng/erp (developer)': 'Software Engineer (ERP Developer)',
  'senior electrical eng.': 'Electrical Engineer',
  'senior electrical eng': 'Electrical Engineer',
  'senior electrical engineer': 'Electrical Engineer',
  'electrical eng.': 'Electrical Engineer',
  'electrical eng': 'Electrical Engineer',
  'material eng.': 'Material Engineer',
  'material eng': 'Material Engineer',
  'contract eng.': 'Contract Engineer',
  'contract eng': 'Contract Engineer',
  'architectural eng.': 'Architect',
  'architectural eng': 'Architect',
  cleaner: 'Cleaner',
  'deputy general manager': 'Deputy General',
  'deputy general': 'Deputy General',
  'highway/structural eng': 'Structural Engineer',
  'highway/structural eng.': 'Structural Engineer',
  'senior hydrologist (freelancer)': 'Hydraulic Engineer',
  'senior hydrologist': 'Hydraulic Engineer',
  'hr assistant': 'Human Resource Assistant',
  'human resource assistant': 'Human Resource Assistant',
  secretary: 'Secretary',
};

/**
 * Roster in CC-0001…CC-0095 order (positions + employment dates from spreadsheet).
 * Dates are DD/MM/YYYY as written on the sheet.
 */
const ROSTER_RAW: ReadonlyArray<{ position: string; date: string }> = [
  { position: 'Admin Assistant (Directorate)', date: '12/8/2026' },
  { position: 'Mechanical Eng.', date: '10/8/2024' },
  { position: 'Pavement Eng.', date: '24/08/2021' },
  { position: 'Chief Surveyor', date: '24/06/2026' },
  { position: 'Driller', date: '9/1/2023' },
  { position: 'Structure Eng.', date: '22/12/2022' },
  { position: 'Driller', date: '15/05/2025' },
  { position: 'Surveyor', date: '20/07/2025' },
  { position: 'Architect', date: '20/10/2025' },
  { position: 'Bid & Tender Officer', date: '1/9/2025' },
  { position: 'Surveyor', date: '9/1/2023' },
  { position: 'Highway Eng.', date: '21/12/2025' },
  { position: 'Geological Eng.', date: '1/7/2022' },
  { position: 'Highway Office Eng.', date: '26/01/2024' },
  { position: 'Architect', date: '15/04/2024' },
  { position: 'Stru. Eng./Office Eng.', date: '12/12/2022' },
  { position: 'Surveyor', date: '15/05/2025' },
  { position: 'Mechanical Eng.', date: '28/8/2026' },
  { position: 'Surveyor', date: '26/11/2021' },
  { position: 'Sanitary Eng.', date: '22/01/2023' },
  { position: 'Junior Electrical Eng', date: '19/05/2026' },
  { position: 'Hydraulic Eng.', date: '1/9/2025' },
  { position: 'Structure Eng.', date: '27/10/2025' },
  { position: 'Driller', date: '4/8/2025' },
  { position: 'Architect', date: '13/10/2025' },
  { position: 'Driver', date: '12/10/2024' },
  { position: 'Structure Eng.', date: '26/04/2022' },
  { position: 'Driller', date: '23/03/2025' },
  { position: 'Drafts Person', date: '20/01/2023' },
  { position: 'Sanitary Eng.', date: '22/01/2023' },
  { position: 'Structural Eng.', date: '6/6/2025' },
  { position: 'Highway Eng.', date: '23/10/2024' },
  { position: 'Structure Eng.', date: '8/1/2024' },
  { position: 'Mechanical Eng.', date: '21/12/2024' },
  { position: 'Architect', date: '1/9/2025' },
  { position: 'Secretary', date: '31/10/2022' },
  { position: 'Architect', date: '29/1/2024' },
  { position: 'Architect', date: '21/8/2023' },
  { position: 'Leader Architect', date: '19/4/2023' },
  { position: 'HR Manager', date: '12/2/2016' },
  { position: 'Driller', date: '20/07/2025' },
  { position: 'Architect', date: '18/12/2023' },
  {
    position: 'Senior communication & Publicity Officer',
    date: '21/01/2025',
  },
  { position: 'Structure Eng.', date: '10/10/2024' },
  { position: 'Highway/Rural Eng.', date: '12/11/2022' },
  { position: 'Geotechnical/Material Eng', date: '4/10/2025' },
  { position: 'Driver', date: '1/7/2023' },
  { position: 'Document Controller', date: '12/12/2025' },
  { position: 'Structure Eng.', date: '6/2/2024' },
  { position: 'Purchase Officer', date: '01/06/2026' },
  { position: 'Architect', date: '1/9/2025' },
  { position: 'Highway Eng.', date: '27/1/2026' },
  { position: 'Highway Eng.', date: '18/9/2023' },
  { position: 'Structure Eng.', date: '12/12/2022' },
  { position: 'Architect', date: '6/1/2026' },
  { position: 'Highway Structural', date: '09/01/2025' },
  { position: 'Drafts Person', date: '15/05/2026' },
  { position: 'Highway Eng.', date: '1/9/2022' },
  { position: 'Software Eng/ERP Developer', date: '8/6/2025' },
  { position: 'Junior Surveyor', date: '2/5/2025' },
  { position: 'Structure Eng.', date: '22/01/2024' },
  { position: 'Senior Electrical Eng.', date: '15/8/2023' },
  { position: 'Surveyor', date: '13/10/2021' },
  { position: 'Geological Eng.', date: '29/3/2024' },
  { position: 'Hydraulic Eng.', date: '4/10/2025' },
  { position: 'Sanitary Eng.', date: '13/03/2021' },
  { position: 'Electrical Eng.', date: '9/12/2025' },
  { position: 'Architect', date: '2/1/2023' },
  { position: 'Drafts Person', date: '1/12/2023' },
  { position: 'Material Eng.', date: '11/5/2026' },
  { position: 'Geotechnical Engineer', date: '21/05/2026' },
  { position: 'Structure Eng.', date: '16/04/2023' },
  { position: 'Hydraulic Eng.', date: '1/11/2024' },
  { position: 'Deputy General Manager', date: '1/11/2025' },
  { position: 'Highway/Structural Eng', date: '26/10/2025' },
  { position: 'Surveyor', date: '9/1/2023' },
  { position: 'Contract Eng.', date: '22/10/2024' },
  { position: 'Architectural Eng.', date: '9/1/2023' },
  { position: 'Cleaner', date: '1/2/2026' },
  { position: 'Drafts Person', date: '19/12/2022' },
  { position: 'Architect', date: '1/9/2024' },
  { position: 'Electrical Eng.', date: '25/7/2024' },
  { position: 'Driller', date: '01/06/2026' },
  { position: 'Surveyor', date: '9/1/2023' },
  { position: 'Geotechnical/Material Eng', date: '19/05/2025' },
  { position: 'Driller', date: '22/04/2024' },
  { position: 'Senior Electrical Engineer', date: '6/7/2026' },
  { position: 'Material Eng.', date: '6/7/2026' },
  { position: 'Driver', date: '1/7/2026' },
  { position: 'Senior Hydrologist (Freelancer)', date: '1/9/2026' },
  { position: 'Material Eng.', date: '10/8/2026' },
  { position: 'HR Assistant', date: '17/08/2026' },
  { position: 'Material Eng.', date: '18/08/2026' },
  { position: 'Surveyor', date: '12/08/2026' },
  { position: 'Highway Eng.', date: '24/08/2026' },
];

function parseRosterDate(raw: string): string {
  const parts = raw.trim().split(/[/.]/);
  if (parts.length !== 3) {
    throw new Error(`Bad date: ${raw}`);
  }
  const day = Number(parts[0]);
  const month = Number(parts[1]);
  const year = Number(parts[2]);
  if (!day || !month || !year) {
    throw new Error(`Bad date parts: ${raw}`);
  }
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function normalizeLabel(label: string): string {
  return label.trim().toLowerCase().replace(/\s+/g, ' ');
}

function buildRoster(): RosterRow[] {
  if (ROSTER_RAW.length !== 95) {
    throw new Error(`Expected 95 roster rows, got ${ROSTER_RAW.length}`);
  }
  return ROSTER_RAW.map((row, index) => ({
    employeeId: `CC-${String(index + 1).padStart(4, '0')}`,
    positionLabel: row.position,
    rosterDate: parseRosterDate(row.date),
  }));
}

async function main(): Promise<void> {
  assertLocalhostSeedGuards({ requireDatabase: 'pwf_fresh' });

  const prisma = new PrismaClient();
  const roster = buildRoster();

  try {
    const positions = await prisma.position.findMany({
      where: { deletedAt: null },
      select: { id: true, title: true },
    });
    const byTitle = new Map(
      positions.map((p) => [normalizeLabel(p.title), p]),
    );

    // Purchase Officer appears on the sheet but is not in the catalog yet.
    if (!byTitle.has('purchase officer')) {
      const created = await prisma.position.create({
        data: {
          title: 'Purchase Officer',
          isActive: true,
          companyId: '00000000-0000-4000-8000-000000000001',
          createdBy: SAMUEL_ID,
          updatedBy: SAMUEL_ID,
        },
        select: { id: true, title: true },
      });
      byTitle.set(normalizeLabel(created.title), created);
      console.log(`Created missing position: ${created.title}`);
    }

    const unresolved = new Set<string>();
    const aliasHits = new Map<string, string>();
    let updated = 0;
    let missingUsers = 0;

    console.log('Assigning positions + employment dates…\n');

    for (const row of roster) {
      const aliasKey = normalizeLabel(row.positionLabel);
      const mappedTitle = POSITION_ALIASES[aliasKey] ?? row.positionLabel;
      const position = byTitle.get(normalizeLabel(mappedTitle));

      if (!position) {
        unresolved.add(row.positionLabel);
        console.log(
          `${row.employeeId}  NO MATCH for "${row.positionLabel}" → skipped position`,
        );
        continue;
      }

      aliasHits.set(row.positionLabel, position.title);

      const result = await prisma.user.updateMany({
        where: { employeeId: row.employeeId, deletedAt: null },
        data: {
          positionId: position.id,
          updatedBy: SAMUEL_ID,
        },
      });

      if (result.count === 0) {
        missingUsers += 1;
        console.log(`${row.employeeId}  USER NOT FOUND`);
        continue;
      }

      console.log(
        `${row.employeeId}  ${position.title}  @ ${row.rosterDate}  (from "${row.positionLabel}")`,
      );
      updated += 1;
    }

    console.log('\n=== Assignment complete ===');
    console.log(`Updated: ${updated}`);
    console.log(`Missing users: ${missingUsers}`);
    console.log(`Unresolved position labels: ${unresolved.size}`);
    if (unresolved.size > 0) {
      for (const label of unresolved) {
        console.log(`  - ${label}`);
      }
    }

    console.log('\n=== Label → DB position map used ===');
    for (const [from, to] of [...aliasHits.entries()].sort((a, b) =>
      a[0].localeCompare(b[0]),
    )) {
      if (normalizeLabel(from) !== normalizeLabel(to)) {
        console.log(`  "${from}" → ${to}`);
      }
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error('assign-ccecc-positions failed:', error);
  process.exit(1);
});
