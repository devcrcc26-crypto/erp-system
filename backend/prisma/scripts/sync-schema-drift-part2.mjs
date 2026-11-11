/**
 * Part 2 - relations, timestamps, defaults. Run after sync-schema-drift.mjs
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const schemaPath = path.join(__dirname, '..', 'schema.prisma');
let schema = fs.readFileSync(schemaPath, 'utf8');

schema = schema.replace(
  /updatedAt(\s+)DateTime(\s+)@updatedAt/g,
  'updatedAt$1DateTime$2@default(now()) @updatedAt',
);

schema = schema.replace(
  'updatedAt        DateTime  @updatedAt @map("updated_at")',
  'updatedAt        DateTime  @default(now()) @updatedAt @map("updated_at")',
);

const patches = [
  [
    `  fetchedAt    DateTime          @map("fetched_at") @db.Date`,
    `  fetchedAt    DateTime          @default(dbgenerated("CURRENT_DATE")) @map("fetched_at") @db.Date`,
  ],
  [
    `  company Company @relation(fields: [companyId], references: [id])\n\n  @@unique([companyId, fromCurrency, toCurrency, fetchedAt])`,
    `  company Company @relation(fields: [companyId], references: [id], onDelete: NoAction, onUpdate: NoAction)\n\n  @@unique([companyId, fromCurrency, toCurrency, fetchedAt])`,
  ],
  [
    `  affectedEdvSnapshot     Json?                      @map("affected_edv_snapshot")`,
    `  affectedEdvSnapshot     Json?                      @default("[]") @map("affected_edv_snapshot")`,
  ],
  [
    `  totalHours      Decimal? @default(dbgenerated("(((regular_hours + night_hours) + weekend_hours) + holiday_hours)")) @map("total_hours") @db.Decimal(5, 2)`,
    `  totalHours      Decimal  @default(dbgenerated("(((regular_hours + night_hours) + weekend_hours) + holiday_hours)")) @map("total_hours") @db.Decimal(5, 2)`,
  ],
  [
    `  totalHours         Decimal?            @default(dbgenerated("(((total_regular_hours + total_night_hours) + total_weekend_hours) + total_holiday_hours)")) @map("total_hours") @db.Decimal(6, 2)`,
    `  totalHours         Decimal             @default(dbgenerated("(((total_regular_hours + total_night_hours) + total_weekend_hours) + total_holiday_hours)")) @map("total_hours") @db.Decimal(6, 2)`,
  ],
  [
    `  remaining  Decimal?  @default(dbgenerated("((entitled - used) - pending)")) @db.Decimal(4, 1)`,
    `  remaining  Decimal   @default(dbgenerated("((entitled - used) - pending)")) @db.Decimal(4, 1)`,
  ],
];

for (const [from, to] of patches) {
  if (schema.includes(from)) schema = schema.replace(from, to);
}

// Approval workflow timestamps (DB uses timestamp(6))
const approvalTimestampFields = [
  ['ApprovalCategory', ['createdAt', 'updatedAt', 'deletedAt']],
  ['ApprovalRequest', ['submittedAt', 'completedAt', 'createdAt', 'updatedAt', 'deletedAt']],
  ['ApprovalTier', ['decidedAt', 'createdAt']],
  ['ApprovalComment', ['createdAt']],
];

for (const [, fields] of approvalTimestampFields) {
  for (const field of fields) {
    schema = schema.replace(
      new RegExp(`(${field}\\s+DateTime\\??\\s+)(@default\\([^)]*\\)\\s+)?(@updatedAt\\s+)?(@map\\("[^"]+"\\))`, 'g'),
      (match, p1, p2, p3, p4) => {
        if (match.includes('@db.Timestamp')) return match;
        const mid = [p2, p3].filter(Boolean).join(' ');
        return `${p1}${mid ? `${mid} ` : ''}${p4} @db.Timestamp(6)`;
      },
    );
  }
}

// Submittal / risk timestamptz(6)
const tzFields = [
  'approvedAt       DateTime @map("approved_at")',
  'approvedAt       DateTime @map("approved_at") @db.Timestamptz(6)',
];
// handled below per model

schema = schema.replace(
  /approvedAt       DateTime @map\("approved_at"\)\n  notes/g,
  'approvedAt       DateTime @map("approved_at") @db.Timestamptz(6)\n  notes',
);
schema = schema.replace(
  /model SubmittalExternalApproval \{[\s\S]*?createdAt        DateTime @default\(now\(\)\) @map\("created_at"\)/,
  (block) => block.replace(
    'createdAt        DateTime @default(now()) @map("created_at")',
    'createdAt        DateTime @default(now()) @map("created_at") @db.Timestamptz(6)',
  ),
);
schema = schema.replace(
  /model SubmittalExternalFeedback \{[\s\S]*?createdAt        DateTime @default\(now\(\)\) @map\("created_at"\)/,
  (block) => block.replace(
    'createdAt        DateTime @default(now()) @map("created_at")',
    'createdAt        DateTime @default(now()) @map("created_at") @db.Timestamptz(6)',
  ),
);

schema = schema.replace(
  `  assessedAt         DateTime @default(now()) @map("assessed_at")
  createdAt          DateTime @default(now()) @map("created_at")

  risk     Risk @relation("RiskMitigations", fields: [riskId], references: [id], onDelete: Cascade)
  assessor User @relation("MitigationAssessor", fields: [assessedBy], references: [id])`,
  `  assessedAt         DateTime @default(now()) @map("assessed_at") @db.Timestamptz(6)
  createdAt          DateTime @default(now()) @map("created_at") @db.Timestamptz(6)

  risk     Risk @relation("RiskMitigations", fields: [riskId], references: [id], onDelete: Cascade)
  assessor User @relation("MitigationAssessor", fields: [assessedBy], references: [id], onDelete: NoAction, onUpdate: NoAction)`,
);

schema = schema.replace(
  `  risk     Risk @relation("RiskMitigations", fields: [riskId], references: [id], onDelete: Cascade)
  assessor User @relation("MitigationAssessor", fields: [assessedBy], references: [id], onDelete: NoAction, onUpdate: NoAction)`,
  `  risk     Risk @relation("RiskMitigations", fields: [riskId], references: [id], onDelete: Cascade, onUpdate: NoAction)
  assessor User @relation("MitigationAssessor", fields: [assessedBy], references: [id], onDelete: NoAction, onUpdate: NoAction)`,
);

// UUID text ids still on @default(uuid())
const uuidModels = [
  'ConsumablesRequisition',
  'ConsumablesRequisitionItem',
  'MaterialRequisition',
  'MaterialRequisitionItem',
  'PurchaseRequest',
  'PurchaseRequestItem',
  'VehicleApplication',
  'VehicleRefueling',
  'InspectionRepair',
];

for (const model of uuidModels) {
  schema = schema.replace(
    new RegExp(`(model ${model} \\{\\n  id\\s+\\S+\\s+)@id @default\\(uuid\\(\\)\\)`, 'm'),
    '$1@id @default(dbgenerated("(gen_random_uuid())::text"))',
  );
}

// Design package - keep DB FK / index names from legacy migrations
schema = schema.replace(
  `  deptDeputyChiefUser    User? @relation("SubtaskDeptDeputyChief", fields: [deptDeputyChiefUserId], references: [id])
  instituteChiefUser     User? @relation("SubtaskInstituteChief", fields: [instituteChiefUserId], references: [id])
  disciplineOwnerUser    User? @relation("SubtaskDisciplineOwner", fields: [disciplineOwnerUserId], references: [id])
  supportingDesignerUser User? @relation("SubtaskSupportingDesigner", fields: [supportingDesignerUserId], references: [id])
  siteRepresentative     User? @relation("PackageSiteRep", fields: [siteRepresentativeUserId], references: [id])`,
  `  deptDeputyChiefUser    User? @relation("SubtaskDeptDeputyChief", fields: [deptDeputyChiefUserId], references: [id], map: "design_package_package_chief_user_id_fkey")
  instituteChiefUser     User? @relation("SubtaskInstituteChief", fields: [instituteChiefUserId], references: [id], map: "design_package_package_institute_chief_user_id_fkey")
  disciplineOwnerUser    User? @relation("SubtaskDisciplineOwner", fields: [disciplineOwnerUserId], references: [id], map: "design_package_package_owner_user_id_fkey")
  supportingDesignerUser User? @relation("SubtaskSupportingDesigner", fields: [supportingDesignerUserId], references: [id])
  siteRepresentative     User? @relation("PackageSiteRep", fields: [siteRepresentativeUserId], references: [id], map: "design_package_site_representative_user_id_fkey")`,
);

schema = schema.replace(
  `  reviewerUser           User? @relation("SubtaskReviewer", fields: [reviewerUserId], references: [id])
  disciplinaryLeaderUser User? @relation("SubtaskDisciplinaryLeader", fields: [disciplinaryLeaderUserId], references: [id])`,
  `  reviewerUser           User? @relation("SubtaskReviewer", fields: [reviewerUserId], references: [id], map: "design_package_package_reviewer_user_id_fkey")
  disciplinaryLeaderUser User? @relation("SubtaskDisciplinaryLeader", fields: [disciplinaryLeaderUserId], references: [id], map: "design_package_package_discipline_lead_user_id_fkey")`,
);

fs.writeFileSync(schemaPath, schema);
console.log('Part 2 applied.');
