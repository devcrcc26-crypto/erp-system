export type ApprovalRequestStatus =
  | 'DRAFT'
  | 'PENDING'
  | 'SUBMITTED'
  | 'IN_REVIEW'
  | 'APPROVED'
  | 'REJECTED'
  | 'CANCELLED'
  | 'RETURNED';

export type ApprovalTierDecision =
  | 'PENDING'
  | 'APPROVED'
  | 'CONDITIONALLY_APPROVED'
  | 'REJECTED'
  | 'SKIPPED'
  | 'RETURNED';

export interface ApprovalUserSummary {
  id: string;
  firstName: string;
  lastName: string;
  email: string | null;
}

export interface ApprovalFormField {
  name: string;
  label: string;
  type: string;
  required?: boolean;
  options?: string[];
}

export interface ApprovalFormSchema {
  fields?: ApprovalFormField[];
}

export interface ApprovalCategorySummary {
  id: string;
  code: string;
  name: string;
  icon?: string | null;
  formSchema?: ApprovalFormSchema | ApprovalFormField[] | null;
  approvalRules?: unknown;
  numberPrefix?: string;
  module?: string;
  description?: string | null;
  isActive?: boolean;
  allowAttachments?: boolean;
  sortOrder?: number;
}

export interface ApprovalTierCondition {
  text: string;
  resolved: boolean;
  createdBy: string;
  createdAt: string;
  resolvedBy?: string;
  resolvedAt?: string;
}

export interface ApprovalTier {
  id: string;
  requestId?: string;
  tierOrder: number;
  label: string;
  approverId: string;
  resolver: string;
  decision: ApprovalTierDecision;
  comment?: string | null;
  conditions?: ApprovalTierCondition[] | unknown;
  decidedAt?: string | null;
  createdAt?: string;
  approver?: ApprovalUserSummary;
}

export interface ApprovalComment {
  id: string;
  requestId: string;
  commentBy: string;
  commentText: string;
  attachmentId?: string | null;
  createdAt: string;
  commenter?: ApprovalUserSummary;
}

export interface ApprovalRequestListItem {
  id: string;
  companyId: string;
  categoryId: string;
  requestNumber: string;
  title: string;
  status: ApprovalRequestStatus;
  currentTier: number;
  matchedRuleName?: string | null;
  submittedAt?: string | null;
  completedAt?: string | null;
  requestedBy: string;
  createdAt: string;
  updatedAt: string;
  category?: Pick<ApprovalCategorySummary, 'id' | 'code' | 'name' | 'icon'>;
  requester?: ApprovalUserSummary;
  tiers?: Array<
    Pick<
      ApprovalTier,
      'id' | 'tierOrder' | 'label' | 'decision' | 'approverId'
    >
  >;
}

export interface ApprovalRequestDetail extends ApprovalRequestListItem {
  formData: Record<string, unknown>;
  notes?: string | null;
  attachmentFolderId?: string | null;
  category?: ApprovalCategorySummary;
  /** Category code mirrored for typed detail routing. */
  categoryCode?: string | null;
  /** Linked leave/overtime request id when this approval owns an HR record. */
  sourceId?: string | null;
  tiers?: ApprovalTier[];
  comments?: ApprovalComment[];
  responses?: ApprovalResponse[];
  attachmentFolder?: { id: string; name: string; path: string } | null;
}

export type ApprovalResponseType = 'RESUBMIT' | 'CONDITION_RESPONSE';

export interface ApprovalResponseDocument {
  id: string;
  responseId: string;
  documentId: string;
  createdAt: string;
  document?: {
    id: string;
    name: string;
    fileType: string;
    fileSizeBytes: number;
  };
}

export interface ApprovalResponse {
  id: string;
  requestId: string;
  responseType: ApprovalResponseType | string;
  conditionIndex?: number | null;
  note?: string | null;
  respondedBy: string;
  createdAt: string;
  responder?: ApprovalUserSummary;
  documents?: ApprovalResponseDocument[];
}

export interface ListApprovalRequestsParams {
  page?: number;
  limit?: number;
  status?: ApprovalRequestStatus | ApprovalRequestStatus[];
  categoryId?: string;
  submittedById?: string;
  pendingApproverId?: string;
  /** Server-enforced inbox scope — JWT user id is applied on the backend. ALL is full-access only. */
  inbox?: 'MY_REQUESTS' | 'PENDING_MY_ACTION' | 'ALL';
  dateFrom?: string;
  dateTo?: string;
  search?: string;
}

export interface TierActionPayload {
  note?: string;
}

export interface AddConditionPayload {
  text: string;
}

export interface SubmitApprovalRequestPayload {
  categoryCode: string;
  title: string;
  formData: Record<string, unknown>;
  documentFolderId?: string;
  documentIds?: string[];
}
