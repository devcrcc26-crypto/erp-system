import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const schemaPath = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'schema.prisma');
let s = fs.readFileSync(schemaPath, 'utf8');

// Vehicle registers in DB do not FK updated_by
for (const model of ['VehicleApplication', 'VehicleRefueling']) {
  s = s.replace(
    new RegExp(`(model ${model} \\{[\\s\\S]*?)\\n  updater\\s+User\\s+@relation\\("[^"]+", fields: \\[updatedBy\\], references: \\[id\\][^\\n]*\\n`, 'm'),
    '$1\n',
  );
}

s = s.replace(
  `  vehicleApplicationsUpdated       VehicleApplication[]     @relation("VehicleAppUpdater")`,
  '',
);
s = s.replace(
  `  vehicleRefuelingsUpdated         VehicleRefueling[]       @relation("RefuelingUpdater")`,
  '',
);

// Company vehicle uses NoAction in DB
s = s.replace(
  `  company              Company              @relation(fields: [companyId], references: [id])
  assignedDriver       User?                @relation("VehicleDriver", fields: [assignedDriverId], references: [id])
  creator              User                 @relation("VehicleCreator", fields: [createdBy], references: [id])`,
  `  company              Company              @relation(fields: [companyId], references: [id], onDelete: NoAction, onUpdate: NoAction)
  assignedDriver       User?                @relation("VehicleDriver", fields: [assignedDriverId], references: [id], onDelete: NoAction, onUpdate: NoAction)
  creator              User                 @relation("VehicleCreator", fields: [createdBy], references: [id], onDelete: NoAction, onUpdate: NoAction)`,
);

// Line-item relations
s = s.replace(
  `  claim   ExpenseClaim @relation(fields: [claimId], references: [id], onDelete: Cascade)
  receipt Document?    @relation("ExpenseItemReceipt", fields: [documentId], references: [id])`,
  `  claim   ExpenseClaim @relation(fields: [claimId], references: [id], onDelete: Cascade, onUpdate: NoAction)
  receipt Document?    @relation("ExpenseItemReceipt", fields: [documentId], references: [id], onDelete: NoAction, onUpdate: NoAction)`,
);

for (const [model, parent] of [
  ['PurchaseRequestItem', 'PurchaseRequest'],
  ['MaterialRequisitionItem', 'MaterialRequisition'],
  ['ConsumablesRequisitionItem', 'ConsumablesRequisition'],
]) {
  s = s.replace(
    new RegExp(`(@relation\\(fields: \\[\\w+Id\\], references: \\[id\\], onDelete: Cascade)(\\))`, 'm'),
    '$1, onUpdate: NoAction$2',
  );
}

s = s.replace(
  `  updatedAt       DateTime @updatedAt @map("updated_at")

  sheet     OvertimeSheet`,
  `  updatedAt       DateTime @default(now()) @updatedAt @map("updated_at")

  sheet     OvertimeSheet`,
);

s = s.replace(
  `  updatedAt    DateTime          @updatedAt @map("updated_at")

  claim   ExpenseClaim`,
  `  updatedAt    DateTime          @default(now()) @updatedAt @map("updated_at")

  claim   ExpenseClaim`,
);

s = s.replace(
  `  remaining  Decimal   @default(dbgenerated("((entitled - used) - pending)")) @db.Decimal(4, 1)`,
  `  remaining  Decimal?  @default(dbgenerated("((entitled - used) - pending)")) @db.Decimal(4, 1)`,
);

s = s.replace(
  `  totalHours         Decimal             @default(dbgenerated("(((total_regular_hours + total_night_hours) + total_weekend_hours) + total_holiday_hours)")) @map("total_hours") @db.Decimal(6, 2)`,
  `  totalHours         Decimal?            @default(dbgenerated("(((total_regular_hours + total_night_hours) + total_weekend_hours) + total_holiday_hours)")) @map("total_hours") @db.Decimal(6, 2)`,
);

s = s.replace(
  `  company        Company         @relation(fields: [companyId], references: [id])
  submittal      Submittal       @relation("SubmittalApprovals", fields: [submittalId], references: [id])
  creator        User            @relation("ApprovalCreator", fields: [createdBy], references: [id])
  evidenceFolder DocumentFolder? @relation(fields: [evidenceFolderId], references: [id])`,
  `  company        Company         @relation(fields: [companyId], references: [id], onDelete: NoAction, onUpdate: NoAction)
  submittal      Submittal       @relation("SubmittalApprovals", fields: [submittalId], references: [id], onDelete: NoAction, onUpdate: NoAction)
  creator        User            @relation("ApprovalCreator", fields: [createdBy], references: [id], onDelete: NoAction, onUpdate: NoAction)
  evidenceFolder DocumentFolder? @relation(fields: [evidenceFolderId], references: [id], onDelete: NoAction, onUpdate: NoAction)`,
);

s = s.replace(
  `  company        Company               @relation(fields: [companyId], references: [id])
  submittal      Submittal             @relation("SubmittalFeedback", fields: [submittalId], references: [id])
  creator        User                  @relation("FeedbackCreator", fields: [createdBy], references: [id])
  evidenceFolder DocumentFolder?       @relation(fields: [evidenceFolderId], references: [id])
  linkedCr       ProjectChangeRequest? @relation(fields: [linkedCrId], references: [id])`,
  `  company        Company               @relation(fields: [companyId], references: [id], onDelete: NoAction, onUpdate: NoAction)
  submittal      Submittal             @relation("SubmittalFeedback", fields: [submittalId], references: [id], onDelete: NoAction, onUpdate: NoAction)
  creator        User                  @relation("FeedbackCreator", fields: [createdBy], references: [id], onDelete: NoAction, onUpdate: NoAction)
  evidenceFolder DocumentFolder?       @relation(fields: [evidenceFolderId], references: [id], onDelete: NoAction, onUpdate: NoAction)
  linkedCr       ProjectChangeRequest? @relation(fields: [linkedCrId], references: [id], onDelete: NoAction, onUpdate: NoAction)`,
);

s = s.replace(
  `  reviewedAt    DateTime?                 @map("reviewed_at")
  reviewedBy    String?                   @map("reviewed_by")
  createdAt     DateTime                  @default(now()) @map("created_at")
  createdBy     String                    @map("created_by")
  updatedAt     DateTime                  @updatedAt @map("updated_at")
  updatedBy     String                    @map("updated_by")

  company   Company   @relation(fields: [companyId], references: [id])
  submittal Submittal @relation(fields: [submittalId], references: [id])
  siteRep   User      @relation("SubmittalSiteRep", fields: [siteRepUserId], references: [id])
  reviewer  User?     @relation("SubmittalSiteReviewReviewedBy", fields: [reviewedBy], references: [id])`,
  `  reviewedAt    DateTime?                 @map("reviewed_at") @db.Timestamptz(6)
  reviewedBy    String?                   @map("reviewed_by")
  createdAt     DateTime                  @default(now()) @map("created_at") @db.Timestamptz(6)
  createdBy     String                    @map("created_by")
  updatedAt     DateTime                  @default(now()) @updatedAt @map("updated_at") @db.Timestamptz(6)
  updatedBy     String                    @map("updated_by")

  company   Company   @relation(fields: [companyId], references: [id], onDelete: NoAction, onUpdate: NoAction)
  submittal Submittal @relation(fields: [submittalId], references: [id], onDelete: NoAction, onUpdate: NoAction)
  siteRep   User      @relation("SubmittalSiteRep", fields: [siteRepUserId], references: [id], onDelete: NoAction, onUpdate: NoAction)
  reviewer  User?     @relation("SubmittalSiteReviewReviewedBy", fields: [reviewedBy], references: [id], onDelete: NoAction, onUpdate: NoAction)`,
);

s = s.replace(
  `  taskDiscipline TaskDiscipline?     @relation(fields: [taskDisciplineId], references: [id])
  designPackage  DesignPackage?      @relation(fields: [designPackageId], references: [id])`,
  `  taskDiscipline TaskDiscipline?     @relation(fields: [taskDisciplineId], references: [id], onDelete: NoAction, onUpdate: NoAction)
  designPackage  DesignPackage?      @relation(fields: [designPackageId], references: [id], onDelete: NoAction, onUpdate: NoAction)`,
);

s = s.replace(
  `  risk     Risk @relation("RiskMitigations", fields: [riskId], references: [id], onDelete: Cascade, onUpdate: NoAction)`,
  `  risk     Risk @relation("RiskMitigations", fields: [riskId], references: [id], onDelete: Cascade, onUpdate: NoAction)`,
);

s = s.replace(
  `  risk     Risk @relation(fields: [riskId], references: [id])
  reviewer User @relation("RiskReviewReviewer", fields: [reviewedBy], references: [id])`,
  `  risk     Risk @relation(fields: [riskId], references: [id], onDelete: NoAction, onUpdate: NoAction)
  reviewer User @relation("RiskReviewReviewer", fields: [reviewedBy], references: [id], onDelete: NoAction, onUpdate: NoAction)`,
);

// Remove FK map that causes design_package site rep re-add churn (DB uses standard name)
s = s.replace(
  ', map: "design_package_site_representative_user_id_fkey"',
  '',
);

fs.writeFileSync(schemaPath, s);
console.log('Part 5 cleanup applied.');
