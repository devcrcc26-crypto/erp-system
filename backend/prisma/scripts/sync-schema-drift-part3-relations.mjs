/**
 * Part 3 - HR/approval relations + submittedAt timestamp(6)
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const schemaPath = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'schema.prisma');
let s = fs.readFileSync(schemaPath, 'utf8');

const noAction = ', onDelete: NoAction, onUpdate: NoAction';

function addNoActionToModelRelations(modelName) {
  s = s.replace(
    new RegExp(`(model ${modelName} \\{[\\s\\S]*?)(  @@)`, 'm'),
    (_, body, indexes) => {
      const patched = body.replace(
        /@relation\(([^)]*)\)/g,
        (match, inner) => {
          if (inner.includes('onDelete:') || inner.includes('onDelete ')) return match;
          if (inner.includes('onUpdate:')) return match;
          return `@relation(${inner}${noAction})`;
        },
      );
      return patched + indexes;
    },
  );
}

const hrModels = [
  'ExpenseClaim',
  'PerDiemRequest',
  'EmployeePerDiemRate',
  'ConsumablesRequisition',
  'MaterialRequisition',
  'PurchaseRequest',
  'VehicleApplication',
  'VehicleRefueling',
  'InspectionRepair',
  'BusinessTrip',
  'FlightApplication',
  'OfficialSeal',
  'ProjectSeal',
  'OvertimeSheet',
  'LeaveRequest',
];

for (const model of hrModels) addNoActionToModelRelations(model);

// submittedAt / completedAt precision on approval-linked HR records
s = s.replace(
  /submittedAt(\s+)DateTime\?(\s+)@map\("submitted_at"\)(?! @db)/g,
  'submittedAt$1DateTime?$2@map("submitted_at") @db.Timestamp(6)',
);
s = s.replace(
  /completedAt(\s+)DateTime\?(\s+)@map\("completed_at"\)(?! @db)/g,
  'completedAt$1DateTime?$2@map("completed_at") @db.Timestamp(6)',
);

// Approval audit relations missing from schema
s = s.replace(
  `  company  Company           @relation(fields: [companyId], references: [id])
  creator  User              @relation("CategoryCreator", fields: [createdBy], references: [id])
  requests ApprovalRequest[]`,
  `  company  Company           @relation(fields: [companyId], references: [id], onDelete: NoAction, onUpdate: NoAction)
  creator  User              @relation("CategoryCreator", fields: [createdBy], references: [id], onDelete: NoAction, onUpdate: NoAction)
  updater  User              @relation("CategoryUpdater", fields: [updatedBy], references: [id], onDelete: NoAction, onUpdate: NoAction)
  requests ApprovalRequest[]`,
);

s = s.replace(
  `  company          Company           @relation(fields: [companyId], references: [id])
  category         ApprovalCategory  @relation(fields: [categoryId], references: [id])
  requester        User              @relation("RequestRequester", fields: [requestedBy], references: [id])`,
  `  company          Company           @relation(fields: [companyId], references: [id], onDelete: NoAction, onUpdate: NoAction)
  category         ApprovalCategory  @relation(fields: [categoryId], references: [id], onDelete: NoAction, onUpdate: NoAction)
  requester        User              @relation("RequestRequester", fields: [requestedBy], references: [id], onDelete: NoAction, onUpdate: NoAction)
  creator          User              @relation("ApprovalRequestCreator", fields: [createdBy], references: [id], onDelete: NoAction, onUpdate: NoAction)
  updater          User              @relation("ApprovalRequestUpdater", fields: [updatedBy], references: [id], onDelete: NoAction, onUpdate: NoAction)`,
);

s = s.replace(
  `  attachmentFolder DocumentFolder?   @relation(fields: [attachmentFolderId], references: [id])
  leaveRequest       LeaveRequest?`,
  `  attachmentFolder DocumentFolder?   @relation(fields: [attachmentFolderId], references: [id], onDelete: NoAction, onUpdate: NoAction)
  leaveRequest       LeaveRequest?`,
);

// Updater relations on HR registers
const updaterPatches = [
  ['ExpenseClaim', 'ExpenseClaimUpdater', 'expenseClaimsUpdated'],
  ['PerDiemRequest', 'PerDiemUpdater', 'perDiemRequestsUpdated'],
  ['PerDiemRate', 'PerDiemRateUpdater', 'perDiemRatesUpdated'],
  ['ConsumablesRequisition', 'ConsumablesRequisitionUpdater', 'consumablesRequisitionsUpdated'],
  ['MaterialRequisition', 'MaterialRequisitionUpdater', 'materialRequisitionsUpdated'],
  ['PurchaseRequest', 'PurchaseRequestUpdater', 'purchaseRequestsUpdated'],
  ['VehicleApplication', 'VehicleAppUpdater', 'vehicleApplicationsUpdated'],
  ['VehicleRefueling', 'RefuelingUpdater', 'vehicleRefuelingsUpdated'],
];

for (const [model, rel, userField] of updaterPatches) {
  const re = new RegExp(
    `(model ${model} \\{[\\s\\S]*?  creator\\s+User\\s+@relation\\("[^"]+", fields: \\[createdBy\\], references: \\[id\\][^\\n]*\\n)`,
    'm',
  );
  s = s.replace(
    re,
    `$1  updater          User               @relation("${rel}", fields: [updatedBy], references: [id], onDelete: NoAction, onUpdate: NoAction)\n`,
  );

  s = s.replace(
    `  ${userField.replace(/Updated$/, 'Created')}        `,
    `  ${userField}         `,
  );
}

// User back-relations
s = s.replace(
  `  createdCategories        ApprovalCategory[]     @relation("CategoryCreator")
  approvalRequests         ApprovalRequest[]      @relation("RequestRequester")`,
  `  createdCategories        ApprovalCategory[]     @relation("CategoryCreator")
  updatedCategories        ApprovalCategory[]     @relation("CategoryUpdater")
  approvalRequests         ApprovalRequest[]      @relation("RequestRequester")
  approvalRequestsCreated  ApprovalRequest[]      @relation("ApprovalRequestCreator")
  approvalRequestsUpdated  ApprovalRequest[]      @relation("ApprovalRequestUpdater")`,
);

s = s.replace(
  `  expenseClaimsCreated        ExpenseClaim[]      @relation("ExpenseClaimCreator")`,
  `  expenseClaimsCreated        ExpenseClaim[]      @relation("ExpenseClaimCreator")
  expenseClaimsUpdated          ExpenseClaim[]      @relation("ExpenseClaimUpdater")`,
);

s = s.replace(
  `  perDiemRequestsCreated      PerDiemRequest[]    @relation("PerDiemCreator")
  perDiemRatesCreated         PerDiemRate[]       @relation("PerDiemRateCreator")`,
  `  perDiemRequestsCreated      PerDiemRequest[]    @relation("PerDiemCreator")
  perDiemRequestsUpdated      PerDiemRequest[]    @relation("PerDiemUpdater")
  perDiemRatesCreated         PerDiemRate[]       @relation("PerDiemRateCreator")
  perDiemRatesUpdated           PerDiemRate[]       @relation("PerDiemRateUpdater")`,
);

s = s.replace(
  `  consumablesRequisitionsCreated    ConsumablesRequisition[] @relation("ConsumablesRequisitionCreator")`,
  `  consumablesRequisitionsCreated    ConsumablesRequisition[] @relation("ConsumablesRequisitionCreator")
  consumablesRequisitionsUpdated    ConsumablesRequisition[] @relation("ConsumablesRequisitionUpdater")`,
);

s = s.replace(
  `  materialRequisitionsCreated    MaterialRequisition[] @relation("MaterialRequisitionCreator")`,
  `  materialRequisitionsCreated    MaterialRequisition[] @relation("MaterialRequisitionCreator")
  materialRequisitionsUpdated    MaterialRequisition[] @relation("MaterialRequisitionUpdater")`,
);

s = s.replace(
  `  purchaseRequestsCreated     PurchaseRequest[]   @relation("PurchaseRequestCreator")`,
  `  purchaseRequestsCreated     PurchaseRequest[]   @relation("PurchaseRequestCreator")
  purchaseRequestsUpdated       PurchaseRequest[]   @relation("PurchaseRequestUpdater")`,
);

s = s.replace(
  `  vehicleApplicationsCreated       VehicleApplication[]     @relation("VehicleAppCreator")`,
  `  vehicleApplicationsCreated       VehicleApplication[]     @relation("VehicleAppCreator")
  vehicleApplicationsUpdated       VehicleApplication[]     @relation("VehicleAppUpdater")`,
);

s = s.replace(
  `  vehicleRefuelingsCreated         VehicleRefueling[]       @relation("RefuelingCreator")`,
  `  vehicleRefuelingsCreated         VehicleRefueling[]       @relation("RefuelingCreator")
  vehicleRefuelingsUpdated           VehicleRefueling[]       @relation("RefuelingUpdater")`,
);

// Action item completedBy
s = s.replace(
  `  meeting       Meeting        @relation(fields: [meetingId], references: [id], onDelete: Cascade)
  owner         User?          @relation(fields: [ownerId], references: [id])
  linkedIssue   Issue?         @relation(fields: [linkedIssueId], references: [id])
  designPackage DesignPackage? @relation(fields: [designPackageId], references: [id])`,
  `  meeting       Meeting        @relation(fields: [meetingId], references: [id], onDelete: Cascade)
  owner         User?          @relation(fields: [ownerId], references: [id], onDelete: Restrict)
  linkedIssue   Issue?         @relation(fields: [linkedIssueId], references: [id], onDelete: NoAction, onUpdate: NoAction)
  designPackage DesignPackage? @relation(fields: [designPackageId], references: [id], onDelete: NoAction, onUpdate: NoAction)
  completedByUser User?          @relation("ActionItemCompleter", fields: [completedBy], references: [id], onDelete: NoAction, onUpdate: NoAction)`,
);

s = s.replace(
  `  meetingActionItems     ActionItem[]`,
  `  meetingActionItems     ActionItem[]
  completedActionItems   ActionItem[]           @relation("ActionItemCompleter")`,
);

// Approval workflow tiers/comments
s = s.replace(
  `  request  ApprovalRequest @relation(fields: [requestId], references: [id])
  approver User            @relation("TierApprover", fields: [approverId], references: [id])`,
  `  request  ApprovalRequest @relation(fields: [requestId], references: [id], onDelete: NoAction, onUpdate: NoAction)
  approver User            @relation("TierApprover", fields: [approverId], references: [id], onDelete: NoAction, onUpdate: NoAction)`,
);

s = s.replace(
  `  request    ApprovalRequest @relation(fields: [requestId], references: [id])
  commenter  User            @relation("ApprovalCommenter", fields: [commentBy], references: [id])
  attachment Document?       @relation(fields: [attachmentId], references: [id])`,
  `  request    ApprovalRequest @relation(fields: [requestId], references: [id], onDelete: NoAction, onUpdate: NoAction)
  commenter  User            @relation("ApprovalCommenter", fields: [commentBy], references: [id], onDelete: NoAction, onUpdate: NoAction)
  attachment Document?       @relation(fields: [attachmentId], references: [id], onDelete: NoAction, onUpdate: NoAction)`,
);

// Restore approval updatedAt DB default
s = s.replace(
  `  updatedAt        DateTime  @updatedAt @map("updated_at") @db.Timestamp(6)
  updatedBy        String    @map("updated_by")
  deletedAt         DateTime? @map("deleted_at") @db.Timestamp(6)
  deletedBy        String?   @map("deleted_by")

  company  Company           @relation(fields: [companyId], references: [id], onDelete: NoAction, onUpdate: NoAction)`,
  `  updatedAt        DateTime  @default(now()) @updatedAt @map("updated_at") @db.Timestamp(6)
  updatedBy        String    @map("updated_by")
  deletedAt         DateTime? @map("deleted_at") @db.Timestamp(6)
  deletedBy        String?   @map("deleted_by")

  company  Company           @relation(fields: [companyId], references: [id], onDelete: NoAction, onUpdate: NoAction)`,
);

s = s.replace(
  `  updatedAt          DateTime              @updatedAt @map("updated_at") @db.Timestamp(6)
  updatedBy          String                @map("updated_by")
  deletedAt         DateTime? @map("deleted_at") @db.Timestamp(6)
  deletedBy          String?               @map("deleted_by")

  company          Company           @relation(fields: [companyId], references: [id], onDelete: NoAction, onUpdate: NoAction)`,
  `  updatedAt          DateTime              @default(now()) @updatedAt @map("updated_at") @db.Timestamp(6)
  updatedBy          String                @map("updated_by")
  deletedAt         DateTime? @map("deleted_at") @db.Timestamp(6)
  deletedBy          String?               @map("deleted_by")

  company          Company           @relation(fields: [companyId], references: [id], onDelete: NoAction, onUpdate: NoAction)`,
);

fs.writeFileSync(schemaPath, s);
console.log('Part 3 relations applied.');
