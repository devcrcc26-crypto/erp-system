import type { OnBehalfPayload } from '@/lib/api/on-behalf.types';
export type ProjectSealStatus =
  | 'DRAFT'
  | 'SUBMITTED'
  | 'IN_REVIEW'
  | 'APPROVED'
  | 'REJECTED'
  | 'RETURNED'
  | 'CANCELLED'
  | 'SEAL_ISSUED';

export type ProjectSealUrgency =
  | 'MINOR'
  | 'MEDIUM'
  | 'URGENT'
  | 'CRITICAL'; 

export interface ProjectSealUserSummary {
  id: string;
  firstName: string;
  lastName: string;
  email?: string | null;
}

export interface ProjectSealSealedDocument{
    id: string;
    name: string;
    fileKey: string;
    fileType: string;
    fileSizeBytes: number;
}

export interface ProjectSealAttachmentDocument {
    id: string;
    name: string;
    fileType: string;
    fileSizeBytes: number;
}

export interface ProjectSealListItem {
    id: string;
    requestNumber: string;
    employeeId: string;
    fileName: string;
    description: string;
    sealCategory?: string | null;
    copyCount?: number | null;
    urgency: ProjectSealUrgency;
    dateNeeded: string;
    status: ProjectSealStatus;
    approvalRequestId?: string | null;
    sealedDocumentId?: string | null;
    issuedBy?: string | null;
    issuedAt?: string | null;
    currentTierLabel?: string | null;
    directApproved?: boolean;
    employee?: ProjectSealUserSummary;
    createdAt: string;
    submittedAt: string | null;
    completedAt: string | null;
}


export interface ProjectSealDetail extends ProjectSealListItem {
    documents?: ProjectSealAttachmentDocument[];
    sealedDocument?: ProjectSealSealedDocument | null;
    issuer?: ProjectSealUserSummary | null;
    approvalRequest?: {
        id: string;
        status: string;
        currentTier: number;
        tiers: Array<{
            id: string;
            tierOrder: number;
            label: string;
            decision: string;
            conditions?: string | null;
            approver?: ProjectSealUserSummary;
            comment?: string | null;
            decidedAt?: string | null;
        }>;
    } | null;
}


export interface SubmitProjectSealPayload extends OnBehalfPayload {
    fileName: string;
    description: string;
    sealCategory?: string;
    copyCount?: number;
    urgency: ProjectSealUrgency;
    dateNeeded: string;
    files?: File[];
}

export interface ListProjectSealsParams {
    page?: number;
    limit?: number;
    search?: string;
    status?: ProjectSealStatus | ProjectSealStatus[];
    employeeId?: string;
}