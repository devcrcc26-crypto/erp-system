import dayjs, { type Dayjs } from 'dayjs';
import type { TaskDiscipline } from '@/lib/api/project-management.types';
import type {
  CreateTaskDisciplineRequest,
  UpdateTaskDisciplineRequest,
} from '@/lib/api/project-management.types';

export interface DisciplineFormValues {
  disciplineName: string;
  designerName?: string;
  reviewerName?: string;
  disciplinaryLeader?: string;
  deptChiefEngineer?: string;
  instituteChiefEngineer?: string;
  actualCompletionTime?: Dayjs;
  deptReviewTime?: Dayjs;
  instituteReviewTime?: Dayjs;
}

export function formatDisciplineDateTime(value: string | null): string {
  if (!value) {
    return '—';
  }
  return dayjs(value).format('DD/MM/YYYY HH:mm');
}

export function toDisciplinePayload(
  values: DisciplineFormValues,
): CreateTaskDisciplineRequest {
  return {
    disciplineName: values.disciplineName.trim(),
    designerName: values.designerName?.trim() || undefined,
    reviewerName: values.reviewerName?.trim() || undefined,
    disciplinaryLeader: values.disciplinaryLeader?.trim() || undefined,
    deptChiefEngineer: values.deptChiefEngineer?.trim() || undefined,
    instituteChiefEngineer: values.instituteChiefEngineer?.trim() || undefined,
    actualCompletionTime: values.actualCompletionTime?.toISOString(),
    deptReviewTime: values.deptReviewTime?.toISOString(),
    instituteReviewTime: values.instituteReviewTime?.toISOString(),
  };
}

export function toDisciplineFormValues(
  discipline: TaskDiscipline,
): DisciplineFormValues {
  return {
    disciplineName: discipline.disciplineName,
    designerName: discipline.designerName ?? undefined,
    reviewerName: discipline.reviewerName ?? undefined,
    disciplinaryLeader: discipline.disciplinaryLeader ?? undefined,
    deptChiefEngineer: discipline.deptChiefEngineer ?? undefined,
    instituteChiefEngineer: discipline.instituteChiefEngineer ?? undefined,
    actualCompletionTime: discipline.actualCompletionTime
      ? dayjs(discipline.actualCompletionTime)
      : undefined,
    deptReviewTime: discipline.deptReviewTime
      ? dayjs(discipline.deptReviewTime)
      : undefined,
    instituteReviewTime: discipline.instituteReviewTime
      ? dayjs(discipline.instituteReviewTime)
      : undefined,
  };
}

export type DisciplineUpdatePayload = UpdateTaskDisciplineRequest;
