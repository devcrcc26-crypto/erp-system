export type EvaluationCycleStatus = 'DRAFT' | 'ACTIVE' | 'CLOSED';

export type EvaluationStatus =
  | 'PENDING'
  | 'SELF_ASSESSED'
  | 'TEAM_LEAD_ASSESSED'
  | 'DISCIPLINE_ASSESSED'
  | 'RESULT_SHARED'
  | 'ACCEPTED'
  | 'DISPUTED'
  | 'DL_UPHELD'
  | 'DL_ADJUSTED'
  | 'ESCALATED'
  | 'HR_DECIDED'
  | 'LOCKED';

export type EvaluationStage =
  | 'SELF'
  | 'TEAM_LEAD'
  | 'DISCIPLINE_LEAD'
  | 'HR';

export interface EvaluationCriteria {
  id: string;
  sectionId: string;
  name: string;
  nameZh: string | null;
  description: string | null;
  weight: number;
  isActive: boolean;
  sortOrder: number;
}

export interface EvaluationSection {
  id: string;
  templateId: string;
  name: string;
  nameZh: string | null;
  description: string | null;
  weight: number;
  sortOrder: number;
  criteria: EvaluationCriteria[];
}

export interface EvaluationTemplate {
  id: string;
  companyId: string;
  name: string;
  description: string | null;
  version: number;
  isActive: boolean;
  sections: EvaluationSection[];
  createdAt: string;
  updatedAt: string;
}

export interface EvaluationCycle {
  id: string;
  companyId: string;
  templateId: string;
  quarter: number;
  year: number;
  periodStart: string;
  periodEnd: string;
  evalStart: string | null;
  evalEnd: string | null;
  status: EvaluationCycleStatus;
  notes: string | null;
  template: { id: string; name: string };
  _count: { evaluations: number };
  createdAt: string;
  updatedAt: string;
}

export interface EvaluationScore {
  id: string;
  assessmentId: string;
  criteriaId: string;
  score: number | null;
  comment: string | null;
}

export interface EvaluationAssessment {
  id: string;
  evaluationId: string;
  stage: EvaluationStage;
  assessorId: string;
  overallAvg: number | null;
  comment: string | null;
  submittedAt: string | null;
  scores: EvaluationScore[];
}

export interface EvaluationDispute {
  id: string;
  evaluationId: string;
  initiatedBy: string;
  reason: string;
  stage: string;
  dlDecision: string | null;
  dlComment: string | null;
  dlAdjustedScore: number | null;
  employeeDecision: string | null;
  employeeEscalationReason: string | null;
  hrDecision: string | null;
  hrComment: string | null;
  hrFinalScore: number | null;
  createdAt: string;
}

export interface EmployeeEvaluation {
  id: string;
  companyId: string;
  cycleId: string;
  employeeId: string;
  contractId: string | null;
  teamLeadId: string | null;
  disciplineLeadId: string | null;
  status: EvaluationStatus;
  finalScore: number | null;
  adjustedScore: number | null;
  resultSharedAt: string | null;
  employeeRespondBy: string | null;
  lockedAt: string | null;
  cycle: {
    quarter: number;
    year: number;
    status: EvaluationCycleStatus;
    template?: {
      id: string;
      name: string;
      sections: EvaluationSection[];
    };
  };
  employee: {
    id: string;
    firstName: string;
    middleName?: string | null;
    lastName: string;
    chineseName?: string | null;
    employeeId: string | null;
  };
  teamLead: {
    id: string;
    firstName: string;
    middleName?: string | null;
    lastName: string;
    chineseName?: string | null;
  } | null;
  disciplineLead: {
    id: string;
    firstName: string;
    middleName?: string | null;
    lastName: string;
    chineseName?: string | null;
  } | null;
  assessments?: EvaluationAssessment[];
  disputes?: EvaluationDispute[];
  _count?: { assessments: number; disputes: number };
}

export interface CreateEvaluationCyclePayload {
  quarter: number;
  year: number;
  templateId?: string;
  evalStart?: string;
  evalEnd?: string;
  notes?: string;
}

export interface AssessmentScoreInput {
  criteriaId: string;
  score?: number | null;
  comment?: string;
}

export interface SubmitAssessmentPayload {
  scores: AssessmentScoreInput[];
  comment?: string;
}

export interface BulkCreateEvaluationsResult {
  created: number;
  skipped: number;
  total: number;
}
