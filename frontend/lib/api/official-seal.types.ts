import type { OnBehalfPayload } from '@/lib/api/on-behalf.types';
export type OfficialSealStatus =
  | 'DRAFT'
  | 'SUBMITTED'
  | 'IN_REVIEW'
  | 'APPROVED'
  | 'REJECTED'
  | 'RETURNED'
  | 'CANCELLED'
  | 'SEAL_ISSUED';

export type OfficialSealUrgency =
  | 'MINOR'
  | 'MEDIUM'
  | 'URGENT'
  | 'CRITICAL';

export interface OfficialSealUserSummary {
  id: string;
  firstName: string;
  lastName: string;
  email?: string | null;
}

export interface OfficialSealSealedDocument{
    id: string;
    name: string;
    fileKey: string;
    fileType: string;
    fileSizeBytes: number;
}

export interface OfficialSealAttachmentDocument {
    id: string;
    name: string;
    fileType: string;
    fileSizeBytes: number;
}

export interface OfficialSealListItem {
    id: string;
    requestNumber: string;
    employeeId: string;
    fileName: string;
    description: string;
    sealCategory?: string | null;
    copyCount?: number | null;
    urgency: OfficialSealUrgency;
    dateNeeded: string;
    status: OfficialSealStatus;
    approvalRequestId?: string | null;
    sealedDocumentId?: string | null;
    issuedBy?: string | null;
    issuedAt?: string | null;
    currentTierLabel?: string | null;
    directApproved?: boolean;
    employee?: OfficialSealUserSummary;
    createdAt: string;
    submittedAt: string | null;
    completedAt: string | null;
}


export interface OfficialSealDetail extends OfficialSealListItem {
    documents?: OfficialSealAttachmentDocument[];
    sealedDocument?: OfficialSealSealedDocument | null;
    issuer?: OfficialSealUserSummary | null;
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
            approver?: OfficialSealUserSummary;
            comment?: string | null;
            decidedAt?: string | null;
        }>;
    } | null;
}

export interface SubmitOfficialSealPayload extends OnBehalfPayload {
    fileName: string;
    description: string;
    sealCategory?: string;
    copyCount?: number;
    urgency: OfficialSealUrgency;
    dateNeeded: string;
    files?: File[];
}

export interface ListOfficialSealsParams {
    page?: number;
    limit?: number;
    search?: string;
    status?: OfficialSealStatus | OfficialSealStatus[];
    employeeId?: string;
}
