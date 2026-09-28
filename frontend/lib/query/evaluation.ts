'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiGet, apiPatch, apiPost } from '@/lib/api/client';
import type {
  BulkCreateEvaluationsResult,
  CreateEvaluationCyclePayload,
  EmployeeEvaluation,
  EvaluationCycle,
  EvaluationTemplate,
  SubmitAssessmentPayload,
} from '@/lib/api/evaluation.types';
import { toQueryString, type QueryStringParams } from '@/lib/query/pm-query-utils';

const TEMPLATES_PATH = '/evaluation/templates';
const CYCLES_PATH = '/evaluation/cycles';
const EVALUATIONS_PATH = '/evaluation/evaluations';

export const evaluationKeys = {
  all: ['evaluations'] as const,
  templates: () => ['evaluation-templates'] as const,
  activeTemplate: () => [...evaluationKeys.templates(), 'active'] as const,
  cycles: () => ['evaluation-cycles'] as const,
  cycle: (id: string) => [...evaluationKeys.cycles(), id] as const,
  lists: () => [...evaluationKeys.all, 'list'] as const,
  list: (filters?: EvaluationListFilters) =>
    [...evaluationKeys.lists(), filters] as const,
  my: () => [...evaluationKeys.all, 'my'] as const,
  pendingMyAction: () => [...evaluationKeys.all, 'pending-my-action'] as const,
  detail: (id: string) => [...evaluationKeys.all, 'detail', id] as const,
  contract: (contractId: string) =>
    [...evaluationKeys.all, 'contract', contractId] as const,
};

export interface EvaluationListFilters {
  cycleId?: string;
  employeeId?: string;
  status?: string;
  disciplineLeadId?: string;
  teamLeadId?: string;
}

// ─── Template hooks ────────────────────────────────────────────────────────

export function useEvaluationTemplates() {
  return useQuery({
    queryKey: evaluationKeys.templates(),
    queryFn: () => apiGet<EvaluationTemplate[]>(TEMPLATES_PATH),
  });
}

export function useActiveEvaluationTemplate() {
  return useQuery({
    queryKey: evaluationKeys.activeTemplate(),
    queryFn: () => apiGet<EvaluationTemplate>(`${TEMPLATES_PATH}/active`),
  });
}

export function useCreateEvaluationTemplate() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (dto: Record<string, unknown>) =>
      apiPost<EvaluationTemplate>(TEMPLATES_PATH, dto),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: evaluationKeys.templates(),
      });
    },
  });
}

export function useUpdateEvaluationTemplate(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (dto: Record<string, unknown>) =>
      apiPatch<EvaluationTemplate>(`${TEMPLATES_PATH}/${id}`, dto),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: evaluationKeys.templates(),
      });
    },
  });
}

export function useEvaluationTemplate(id: string) {
  return useQuery({
    queryKey: [...evaluationKeys.templates(), id] as const,
    queryFn: () => apiGet<EvaluationTemplate>(`${TEMPLATES_PATH}/${id}`),
    enabled: Boolean(id),
  });
}

export interface AddEvaluationCriteriaPayload {
  sectionId: string;
  name: string;
  nameZh?: string;
  description?: string;
  weight: number;
  sortOrder: number;
}

export function useAddEvaluationCriteria() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ sectionId, ...dto }: AddEvaluationCriteriaPayload) =>
      apiPost(`${TEMPLATES_PATH}/sections/${sectionId}/criteria`, dto),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: evaluationKeys.templates(),
      });
    },
  });
}

export interface UpdateEvaluationCriteriaPayload {
  criteriaId: string;
  name?: string;
  nameZh?: string;
  description?: string;
  weight?: number;
  isActive?: boolean;
}

export function useUpdateEvaluationCriteria() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ criteriaId, ...dto }: UpdateEvaluationCriteriaPayload) =>
      apiPatch(`${TEMPLATES_PATH}/criteria/${criteriaId}`, dto),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: evaluationKeys.templates(),
      });
    },
  });
}

// ─── Cycle hooks ────────────────────────────────────────────────────────────

export function useEvaluationCycles() {
  return useQuery({
    queryKey: evaluationKeys.cycles(),
    queryFn: () => apiGet<EvaluationCycle[]>(CYCLES_PATH),
  });
}

export function useEvaluationCycle(id: string) {
  return useQuery({
    queryKey: evaluationKeys.cycle(id),
    queryFn: () => apiGet<EvaluationCycle>(`${CYCLES_PATH}/${id}`),
    enabled: Boolean(id),
  });
}

export function useCreateEvaluationCycle() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (dto: CreateEvaluationCyclePayload) =>
      apiPost<EvaluationCycle>(CYCLES_PATH, dto),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: evaluationKeys.cycles() });
    },
  });
}

export function useActivateCycle() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiPost<EvaluationCycle>(`${CYCLES_PATH}/${id}/activate`, {}),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: evaluationKeys.cycles() });
    },
  });
}

export function useCloseCycle() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiPost<EvaluationCycle>(`${CYCLES_PATH}/${id}/close`, {}),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: evaluationKeys.cycles() });
    },
  });
}

export function useBulkCreateEvaluations() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (cycleId: string) =>
      apiPost<BulkCreateEvaluationsResult>(
        `${EVALUATIONS_PATH}/cycle/${cycleId}/bulk-create`,
        {},
      ),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: evaluationKeys.all });
      void queryClient.invalidateQueries({ queryKey: evaluationKeys.cycles() });
    },
  });
}

export function useTriggerEvaluationAutoResolve() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () =>
      apiPost<{ resolved: number; details: string }>(
        `${EVALUATIONS_PATH}/admin/auto-resolve`,
        {},
      ),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: evaluationKeys.all });
    },
  });
}

// ─── Evaluation hooks ────────────────────────────────────────────────────────

export function useEvaluations(
  filters?: EvaluationListFilters,
  options?: { enabled?: boolean },
) {
  return useQuery({
    queryKey: evaluationKeys.list(filters),
    queryFn: () => {
      const params: QueryStringParams = {
        cycleId: filters?.cycleId,
        employeeId: filters?.employeeId,
        status: filters?.status,
        disciplineLeadId: filters?.disciplineLeadId,
        teamLeadId: filters?.teamLeadId,
      };
      return apiGet<EmployeeEvaluation[]>(
        `${EVALUATIONS_PATH}${toQueryString(params)}`,
      );
    },
    enabled: options?.enabled ?? true,
  });
}

export function useMyEvaluations() {
  return useQuery({
    queryKey: evaluationKeys.my(),
    queryFn: () => apiGet<EmployeeEvaluation[]>(`${EVALUATIONS_PATH}/my`),
  });
}

export function usePendingMyAction(options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: evaluationKeys.pendingMyAction(),
    queryFn: () =>
      apiGet<EmployeeEvaluation[]>(`${EVALUATIONS_PATH}/pending-my-action`),
    enabled: options?.enabled ?? true,
  });
}

export function useTeamLeadEvaluations() {
  return useEvaluations({ teamLeadId: 'me' });
}

export function useDisciplineLeadEvaluations() {
  return useEvaluations({ disciplineLeadId: 'me' });
}

export function useEvaluation(id: string) {
  return useQuery({
    queryKey: evaluationKeys.detail(id),
    queryFn: () =>
      apiGet<EmployeeEvaluation>(`${EVALUATIONS_PATH}/${id}`),
    enabled: Boolean(id),
  });
}

export function useSubmitSelfAssessment(evaluationId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (dto: SubmitAssessmentPayload) =>
      apiPost(`${EVALUATIONS_PATH}/${evaluationId}/self-assessment`, dto),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: evaluationKeys.all });
    },
  });
}

export function useSubmitTeamLeadAssessment(evaluationId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (dto: SubmitAssessmentPayload) =>
      apiPost(
        `${EVALUATIONS_PATH}/${evaluationId}/team-lead-assessment`,
        dto,
      ),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: evaluationKeys.all });
    },
  });
}

export function useSubmitDisciplineLeadAssessment(evaluationId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (dto: SubmitAssessmentPayload) =>
      apiPost(
        `${EVALUATIONS_PATH}/${evaluationId}/discipline-lead-assessment`,
        dto,
      ),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: evaluationKeys.all });
    },
  });
}

export function useShareResult(evaluationId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () =>
      apiPost(`${EVALUATIONS_PATH}/${evaluationId}/share-result`, {}),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: evaluationKeys.all });
    },
  });
}

export function useAcceptResult(evaluationId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () =>
      apiPost(`${EVALUATIONS_PATH}/${evaluationId}/accept`, {}),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: evaluationKeys.all });
    },
  });
}

export function useDisputeResult(evaluationId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (dto: { reason: string }) =>
      apiPost(`${EVALUATIONS_PATH}/${evaluationId}/dispute`, dto),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: evaluationKeys.all });
    },
  });
}

export function useDLRespondToDispute(evaluationId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (dto: {
      decision: 'UPHELD' | 'ADJUSTED';
      adjustedScore?: number;
      comment: string;
    }) => apiPost(`${EVALUATIONS_PATH}/${evaluationId}/dl-respond`, dto),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: evaluationKeys.all });
    },
  });
}

export function useEmployeeRespondToDL(evaluationId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (dto: {
      decision: 'ACCEPTED' | 'ESCALATED';
      escalationReason?: string;
    }) =>
      apiPost(`${EVALUATIONS_PATH}/${evaluationId}/employee-respond`, dto),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: evaluationKeys.all });
    },
  });
}

export function useHRDecideDispute(evaluationId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (dto: {
      decision: 'UPHELD' | 'ADJUSTED';
      adjustedScore?: number;
      comment: string;
    }) => apiPost(`${EVALUATIONS_PATH}/${evaluationId}/hr-decide`, dto),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: evaluationKeys.all });
    },
  });
}

export function useLockEvaluation(evaluationId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () =>
      apiPost(`${EVALUATIONS_PATH}/${evaluationId}/lock`, {}),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: evaluationKeys.all });
    },
  });
}

export function useContractEvaluationHistory(contractId: string) {
  return useQuery({
    queryKey: evaluationKeys.contract(contractId),
    queryFn: () =>
      apiGet<EmployeeEvaluation[]>(
        `${EVALUATIONS_PATH}/contract/${contractId}/history`,
      ),
    enabled: Boolean(contractId),
  });
}
