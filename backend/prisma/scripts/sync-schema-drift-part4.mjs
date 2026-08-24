import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const schemaPath = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'schema.prisma');
let s = fs.readFileSync(schemaPath, 'utf8');

function stripNoActionFromModel(modelName) {
  s = s.replace(
    new RegExp(`(model ${modelName} \\{[\\s\\S]*?)(  @@)`, 'm'),
    (_, body, indexes) => {
      const patched = body.replace(/, onDelete: NoAction, onUpdate: NoAction/g, '');
      return patched + indexes;
    },
  );
}

for (const model of [
  'BusinessTrip',
  'FlightApplication',
  'LeaveRequest',
  'OvertimeSheet',
  'OfficialSeal',
  'ProjectSeal',
  'InspectionRepair',
  'CompanyVehicle',
]) {
  stripNoActionFromModel(model);
}

// Only approval_request uses timestamp(6) on submitted/completed in DB.
s = s.replace(
  /submittedAt(\s+)DateTime\?(\s+)@map\("submitted_at"\) @db\.Timestamp\(6\)/g,
  'submittedAt$1DateTime?$2@map("submitted_at")',
);
s = s.replace(
  /completedAt(\s+)DateTime\?(\s+)@map\("completed_at"\) @db\.Timestamp\(6\)/g,
  'completedAt$1DateTime?$2@map("completed_at")',
);

// Restore approval_request submitted/completed precision
s = s.replace(
  `  submittedAt        DateTime?             @map("submitted_at")
  completedAt        DateTime?             @map("completed_at")
  attachmentFolderId String?               @map("attachment_folder_id")
  notes              String?
  createdAt          DateTime              @default(now()) @map("created_at") @db.Timestamp(6)`,
  `  submittedAt        DateTime?             @map("submitted_at") @db.Timestamp(6)
  completedAt        DateTime?             @map("completed_at") @db.Timestamp(6)
  attachmentFolderId String?               @map("attachment_folder_id")
  notes              String?
  createdAt          DateTime              @default(now()) @map("created_at") @db.Timestamp(6)`,
);

// HR registers keep DB updated_at default in pulled schema
const hrUpdatedAtModels = [
  'ExpenseClaim',
  'PerDiemRequest',
  'EmployeePerDiemRate',
  'ConsumablesRequisition',
  'ConsumablesRequisitionItem',
  'MaterialRequisition',
  'MaterialRequisitionItem',
  'PurchaseRequest',
  'PurchaseRequestItem',
  'VehicleApplication',
  'VehicleRefueling',
  'CompanyVehicle',
  'ConsumablesRequisition',
  'LeaveRequest',
  'OvertimeSheet',
  'OvertimeEntry',
  'BusinessTrip',
  'FlightApplication',
  'InspectionRepair',
];

for (const model of hrUpdatedAtModels) {
  s = s.replace(
    new RegExp(`(model ${model} \\{[\\s\\S]*?updatedAt\\s+DateTime\\s+)@updatedAt`, 'm'),
    '$1@default(now()) @updatedAt',
  );
}

fs.writeFileSync(schemaPath, s);
console.log('Part 4 cleanup applied.');
