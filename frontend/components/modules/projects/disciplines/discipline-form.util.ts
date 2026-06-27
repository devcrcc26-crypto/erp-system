import dayjs, { type Dayjs } from 'dayjs';
import type { TaskDiscipline } from '@/lib/api/project-management.types';
import type {
  CreateTaskDisciplineRequest,
  UpdateTaskDisciplineRequest,
} from '@/lib/api/project-management.types';

export interface DisciplineFormValues {
  disciplineName: string;
  ownerUserId?: string;
  designerUserId?: string;
  reviewerUserId?: string;
  disciplineLeadUserId?: string;
  chiefUserId?: string;
  instituteChiefUserId?: string;
  supportingDesignerUserId?: string;
  actualCompletionTime?: Dayjs;
  deptReviewTime?: Dayjs;
}

export function formatDisciplineDateTime(value: string | null): string {
  if (!value) {
    return '-';
  }
  return dayjs(value).format('DD/MM/YYYY HH:mm');
}

export function toDisciplinePayload(
  values: DisciplineFormValues,
): CreateTaskDisciplineRequest {
  return {
    disciplineName: values.disciplineName.trim(),
    ownerUserId: values.ownerUserId,
    designerUserId: values.designerUserId,
    reviewerUserId: values.reviewerUserId,
    disciplineLeadUserId: values.disciplineLeadUserId,
    chiefUserId: values.chiefUserId,
    instituteChiefUserId: values.instituteChiefUserId,
    supportingDesignerUserId: values.supportingDesignerUserId,
    actualCompletionTime: values.actualCompletionTime?.toISOString(),
    deptReviewTime: values.deptReviewTime?.toISOString(),
  };
}

export function toDisciplineFormValues(
  discipline: TaskDiscipline,
): DisciplineFormValues {
  return {
    disciplineName: discipline.disciplineName,
    ownerUserId: discipline.ownerUserId ?? undefined,
    designerUserId: discipline.designerUserId ?? undefined,
    reviewerUserId: discipline.reviewerUserId ?? undefined,
    disciplineLeadUserId: discipline.disciplineLeadUserId ?? undefined,
    chiefUserId: discipline.chiefUserId ?? undefined,
    instituteChiefUserId: discipline.instituteChiefUserId ?? undefined,
    supportingDesignerUserId: discipline.supportingDesignerUserId ?? undefined,
    actualCompletionTime: discipline.actualCompletionTime
      ? dayjs(discipline.actualCompletionTime)
      : undefined,
    deptReviewTime: discipline.deptReviewTime
      ? dayjs(discipline.deptReviewTime)
      : undefined,
  };
}

export type DisciplineUpdatePayload = UpdateTaskDisciplineRequest;
