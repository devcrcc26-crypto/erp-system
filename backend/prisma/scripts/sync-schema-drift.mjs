/**
 * Aligns schema.prisma metadata with live DB introspection for known drift areas.
 * Run: node prisma/scripts/sync-schema-drift.mjs
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const schemaPath = path.join(__dirname, '..', 'schema.prisma');
const pulledPath = path.join(__dirname, '..', '_pulled.prisma');

let schema = fs.readFileSync(schemaPath, 'utf8');
const pulled = fs.readFileSync(pulledPath, 'utf8');

/** @param {string} text @param {string} name */
function extractModelBlock(text, name) {
  const re = new RegExp(`model ${name} \\{([\\s\\S]*?)^\\}`, 'm');
  const match = text.match(re);
  if (!match) throw new Error(`Model not found: ${name}`);
  return match[0];
}

/** @param {string} modelBlock */
function extractIndexLines(modelBlock) {
  return modelBlock
    .split('\n')
    .filter((line) => line.trim().startsWith('@@index') || line.trim().startsWith('@@unique'));
}

/** @param {string} text @param {string} modelName @param {string[]} indexLines */
function replaceModelIndexes(text, modelName, indexLines) {
  const re = new RegExp(
    `(model ${modelName} \\{[\\s\\S]*?)(  @@(?:index|unique)[\\s\\S]*?)(  @@map\\("[^"]+"\\)\\n\\})`,
    'm',
  );
  const indexes = indexLines.map((l) => `  ${l.trim()}`).join('\n');
  if (!re.test(text)) {
    throw new Error(`Could not replace indexes for ${modelName}`);
  }
  return text.replace(re, `$1${indexes}\n$3`);
}

const indexSyncModels = [
  'ApprovalRequest',
  'ApprovalTier',
  'CompanyVehicle',
  'ConsumablesRequisition',
  'ExpenseClaim',
  'ExpenseClaimItem',
  'MaterialRequisition',
  'PerDiemRequest',
  'PurchaseRequest',
  'VehicleApplication',
  'VehicleRefueling',
  'OvertimeSheet',
  'DesignPackage',
  'ExchangeRate',
  'EmployeePerDiemRate',
];

for (const model of indexSyncModels) {
  const pulledBlock = extractModelBlock(pulled, model);
  const indexLines = extractIndexLines(pulledBlock);
  if (indexLines.length > 0) {
    schema = replaceModelIndexes(schema, model, indexLines);
  }
}

const replacements = [
  // Generated / computed columns - match DB introspection exactly
  [
    'remaining  Decimal   @default(dbgenerated("(entitled - used - pending)")) @db.Decimal(4, 1)',
    'remaining  Decimal?  @default(dbgenerated("((entitled - used) - pending)")) @db.Decimal(4, 1)',
  ],
  [
    'entitled   Decimal   @db.Decimal(4, 1)\n  used       Decimal   @db.Decimal(4, 1)\n  pending    Decimal   @db.Decimal(4, 1)',
    'entitled   Decimal   @default(0) @db.Decimal(4, 1)\n  used       Decimal   @default(0) @db.Decimal(4, 1)\n  pending    Decimal   @default(0) @db.Decimal(4, 1)',
  ],
  [
    'totalHours         Decimal             @default(dbgenerated("(total_regular_hours + total_night_hours + total_weekend_hours + total_holiday_hours)")) @map("total_hours") @db.Decimal(6, 2)',
    'totalHours         Decimal?            @default(dbgenerated("(((total_regular_hours + total_night_hours) + total_weekend_hours) + total_holiday_hours)")) @map("total_hours") @db.Decimal(6, 2)',
  ],
  [
    'totalHours      Decimal  @default(dbgenerated("(regular_hours + night_hours + weekend_hours + holiday_hours)")) @map("total_hours") @db.Decimal(5, 2)',
    'totalHours      Decimal? @default(dbgenerated("(((regular_hours + night_hours) + weekend_hours) + holiday_hours)")) @map("total_hours") @db.Decimal(5, 2)',
  ],
  [
    'estimatedTotalCost         Decimal?           @map("estimated_total_cost") @db.Decimal(12, 2) @default(dbgenerated("((COALESCE(estimated_flight_cost, (0)::numeric) + COALESCE(estimated_accommodation_cost, (0)::numeric) + COALESCE(estimated_per_diem, (0)::numeric) + COALESCE(estimated_other_cost, (0)::numeric)))"))',
    'estimatedTotalCost         Decimal?           @default(dbgenerated("(((COALESCE(estimated_flight_cost, (0)::numeric) + COALESCE(estimated_accommodation_cost, (0)::numeric)) + COALESCE(estimated_per_diem, (0)::numeric)) + COALESCE(estimated_other_cost, (0)::numeric))")) @map("estimated_total_cost") @db.Decimal(12, 2)',
  ],
  // IDs created via gen_random_uuid() in SQL migrations
  [
    'model ExchangeRate {\n  id           String            @id @default(uuid())',
    'model ExchangeRate {\n  id           String            @id @default(dbgenerated("(gen_random_uuid())::text"))',
  ],
  [
    'model CompanyVehicle {\n  id              String        @id @default(uuid())',
    'model CompanyVehicle {\n  id              String        @id @default(dbgenerated("(gen_random_uuid())::text"))',
  ],
  [
    'model ConsumablesRequisition {\n  id                 String                         @id @default(uuid())',
    'model ConsumablesRequisition {\n  id                 String                         @id @default(dbgenerated("(gen_random_uuid())::text"))',
  ],
  [
    'model ConsumablesRequisitionItem {\n  id              String   @id @default(uuid())',
    'model ConsumablesRequisitionItem {\n  id              String   @id @default(dbgenerated("(gen_random_uuid())::text"))',
  ],
  [
    'model ExpenseClaim {\n  id                 String             @id @default(uuid())',
    'model ExpenseClaim {\n  id                 String             @id @default(dbgenerated("(gen_random_uuid())::text"))',
  ],
  [
    'model ExpenseClaimItem {\n  id           String            @id @default(uuid())',
    'model ExpenseClaimItem {\n  id           String            @id @default(dbgenerated("(gen_random_uuid())::text"))',
  ],
  [
    'model MaterialRequisition {\n  id                 String                      @id @default(uuid())',
    'model MaterialRequisition {\n  id                 String                      @id @default(dbgenerated("(gen_random_uuid())::text"))',
  ],
  [
    'model MaterialRequisitionItem {\n  id              String   @id @default(uuid())',
    'model MaterialRequisitionItem {\n  id              String   @id @default(dbgenerated("(gen_random_uuid())::text"))',
  ],
  [
    'model PerDiemRate {\n  id                  String            @id @default(uuid())',
    'model PerDiemRate {\n  id                  String            @id @default(dbgenerated("(gen_random_uuid())::text"))',
  ],
  [
    'model PerDiemRequest {\n  id                   String            @id @default(uuid())',
    'model PerDiemRequest {\n  id                   String            @id @default(dbgenerated("(gen_random_uuid())::text"))',
  ],
  [
    'model PurchaseRequest {\n  id                 String                  @id @default(uuid())',
    'model PurchaseRequest {\n  id                 String                  @id @default(dbgenerated("(gen_random_uuid())::text"))',
  ],
  [
    'model PurchaseRequestItem {\n  id              String   @id @default(uuid())',
    'model PurchaseRequestItem {\n  id              String   @id @default(dbgenerated("(gen_random_uuid())::text"))',
  ],
  [
    'model VehicleApplication {\n  id                 String                    @id @default(uuid())',
    'model VehicleApplication {\n  id                 String                    @id @default(dbgenerated("(gen_random_uuid())::text"))',
  ],
  [
    'model VehicleRefueling {\n  id                 String              @id @default(uuid())',
    'model VehicleRefueling {\n  id                 String              @id @default(dbgenerated("(gen_random_uuid())::text"))',
  ],
  [
    'model InspectionRepair {\n  id                 String                 @id @default(uuid())',
    'model InspectionRepair {\n  id                 String                 @id @default(dbgenerated("(gen_random_uuid())::text"))',
  ],
];

for (const [from, to] of replacements) {
  if (!schema.includes(from)) {
    console.warn('WARN: pattern not found:', from.slice(0, 60));
  } else {
    schema = schema.replace(from, to);
  }
}

fs.writeFileSync(schemaPath, schema);
console.log('Schema drift sync applied.');
