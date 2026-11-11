model Company {
  officialSeals       OfficialSeal[]
  projectSeals        ProjectSeal[]
}




enum SealUrgency {
  CRITICAL
  URGENT
  MEDIUM
  MINOR
}

enum SealStatus {
  DRAFT
  SUBMITTED
  IN_REVIEW
  APPROVED
  REJECTED
  CANCELLED
  SEAL_ISSUED
  RETURNED
}

model OfficialSeal {
  id                    String                  @id @default(uuid())
  companyId             String                  @map("company_id")
  requestNumber         String                  @map("request_number")
  employeeId            String                  @map("employee_id")
  description           String
  urgency               SealUrgency             @default(MINOR)
  status                SealStatus              @default(DRAFT)
  approvalRequestId     String?                 @unique @map("approval_request_id")
  attachmentFolderId    String?                 @map("attachment_folder_id")
  dateNeeded            DateTime                @map("date_needed") @db.Date
  submittedAt           DateTime?               @map("submitted_at") 
  issuedBy              String?                 @map("issued_by")
  issuedAt              DateTime?               @map("issued_at")
  completedAt           DateTime?               @map("completed_at")
  createdAt             DateTime                @default(now()) @map("created_at")
  createdBy             String                  @map("created_by")
  updatedAt             DateTime                @updatedAt @map("updated_at")
  updatedBy             String                  @map("updated_by")
  deletedAt             DateTime?               @map("deleted_at")
  deletedBy             String?                 @map("deleted_by")
  sealedDocumentId      String?                 @map("sealed_document_id")


  company               Company                 @relation(fields: [companyId], references: [id])
  employee              User                    @relation("OfficialSealEmployee", fields: [employeeId], references: [id])
  issuer                User?                   @relation("OfficialSealIssuer", fields: [issuedBy], references: [id])
  creator               User                    @relation("OfficialSealCreator", fields:[createdBy], references: [id])
  approvalRequest       ApprovalRequest?        @relation(fields: [approvalRequestId], references: [id])
  attachmentFolder      DocumentFolder?         @relation(fields: [attachmentFolderId], references: [id])
  sealedDocument        Document?               @relation("OfficialSealSealedDocument", fields: [sealedDocumentId], references: [id])


  @@unique([companyId, requestNumber], map: "uq_official_seal_company_number")
  @@index([companyId], map:"idx_official_seal_company")
  @@index([employeeId], map: "idx_official_seal_employee")
  @@index([issuedBy], map: "idx_official_seal_issuer")
  @@index([status],map: "idx_official_seal_status")
  @@index([companyId, deletedAt], map: "idx_official_seal_company_deleted")
  @@index([attachmentFolderId], map: "idx_official_seal_attachment_folder")
  @@index([sealedDocumentId], map: "idx_official_seal_document")
  @@map("official_seal")
}


model ProjectSeal {
  id                    String                  @id @default(uuid())
  companyId             String                  @map("company_id")
  requestNumber         String                  @map("request_number")
  employeeId            String                  @map("employee_id")
  description           String
  urgency               SealUrgency             @default(MINOR)
  status                SealStatus              @default(DRAFT)
  approvalRequestId     String?                 @unique @map("approval_request_id")
  attachmentFolderId    String?                 @map("attachment_folder_id")
  submittedAt           DateTime?               @map("submitted_at")
  dateNeeded            DateTime                @map("date_needed") @db.Date
  issuedBy              String?                 @map("issued_by")
  issuedAt              DateTime?               @map("issued_at")
  completedAt           DateTime?               @map("completed_at")
  createdAt             DateTime                @default(now()) @map("created_at")
  createdBy             String                  @map("created_by")
  updatedAt             DateTime                @updatedAt @map("updated_at")
  updatedBy             String                  @map("updated_by")
  deletedAt             DateTime?               @map("deleted_at")
  deletedBy             String?                 @map("deleted_by")
  sealedDocumentId      String?                 @map("sealed_document_id")

  company               Company                 @relation(fields: [companyId], references: [id])
  employee              User                    @relation("ProjectSealEmployee", fields: [employeeId], references: [id])
  issuer                User?                   @relation("ProjectSealIssuer", fields: [issuedBy], references: [id]) 
  creator               User                    @relation("ProjectSealCreator", fields:[createdBy], references: [id])
  approvalRequest       ApprovalRequest?        @relation(fields: [approvalRequestId], references: [id])
  attachmentFolder      DocumentFolder?         @relation(fields: [attachmentFolderId], references: [id])
  sealedDocument        Document?               @relation("ProjectSealSealedDocument", fields: [sealedDocumentId], references: [id])

  @@unique([companyId, requestNumber], map: "uq_project_seal_company_number")
  @@index([companyId], map:"idx_project_seal_company")
  @@index([companyId, deletedAt], map: "idx_project_seal_company_deleted")
  @@index([employeeId], map: "idx_project_seal_employee")
  @@index([issuedBy], map: "idx_project_seal_issuer")
  @@index([status],map: "idx_project_seal_status")
  @@index([attachmentFolderId], map: "idx_project_seal_attachment_folder")
  @@index([sealedDocumentId], map: "idx_project_seal_document")
  
  @@map("project_seal")
}


