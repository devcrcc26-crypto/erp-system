import dayjs, { type Dayjs } from 'dayjs';
import type { TaskDiscipline } from '@/lib/api/project-management.types';
import type {
  CreateTaskDisciplineRequest,
  UpdateTaskDisciplineRequest,
} from '@/lib/api/project-management.types';

export interface DisciplineSimpleFormValues {
  disciplineId: string;
  disciplineLeadUserId: string;
}

export interface DisciplineRolesFormValues {
  designerUserId?: string;
  supportingDesignerUserId?: string;
  ownerUserId?: string;
  reviewerUserId?: string;
  chiefUserId?: string;
  instituteChiefUserId?: string;
}

export interface DisciplineFormValues
  extends DisciplineSimpleFormValues,
    DisciplineRolesFormValues {
  actualCompletionTime?: Dayjs;
}

export function formatDisciplineDateTime(value: string | null): string {
  if (!value) {
    return '-';
  }
  return dayjs(value).format('DD/MM/YYYY HH:mm');
}

export function formatDisciplineDate(value: string | null): string {
  if (!value) {
    return '-';
  }
  return dayjs(value).format('DD/MM/YYYY');
}

/** Payload for creating a discipline with name and leader only. */
export function toDisciplineSimplePayload(
  values: DisciplineSimpleFormValues,
): CreateTaskDisciplineRequest {
  return {
    disciplineId: values.disciplineId,
    disciplineLeadUserId: values.disciplineLeadUserId,
  };
}

/** Payload for updating discipline role assignments. */
export function toDisciplineRolesPayload(
  values: DisciplineRolesFormValues,
): UpdateTaskDisciplineRequest {
  return {
    designerUserId: values.designerUserId,
    supportingDesignerUserId: values.supportingDesignerUserId,
    ownerUserId: values.ownerUserId,
    reviewerUserId: values.reviewerUserId,
    chiefUserId: values.chiefUserId,
    instituteChiefUserId: values.instituteChiefUserId,
  };
}

export function toDisciplinePayload(
  values: DisciplineFormValues,
): CreateTaskDisciplineRequest {
  return {
    ...toDisciplineSimplePayload(values),
    ...toDisciplineRolesPayload(values),
    actualCompletionTime: values.actualCompletionTime?.toISOString(),
  };
}

export function toDisciplineFormValues(
  discipline: TaskDiscipline,
): DisciplineFormValues {
  return {
    disciplineId: discipline.disciplineId ?? '',
    disciplineLeadUserId: discipline.disciplineLeadUserId ?? '',
    ownerUserId: discipline.ownerUserId ?? undefined,
    designerUserId: discipline.designerUserId ?? undefined,
    reviewerUserId: discipline.reviewerUserId ?? undefined,
    chiefUserId: discipline.chiefUserId ?? undefined,
    instituteChiefUserId: discipline.instituteChiefUserId ?? undefined,
    supportingDesignerUserId: discipline.supportingDesignerUserId ?? undefined,
    actualCompletionTime: discipline.actualCompletionTime
      ? dayjs(discipline.actualCompletionTime)
      : undefined,
  };
}

export function toDisciplineRolesFormValues(
  discipline: TaskDiscipline,
): DisciplineRolesFormValues {
  return {
    ownerUserId: discipline.ownerUserId ?? undefined,
    designerUserId: discipline.designerUserId ?? undefined,
    reviewerUserId: discipline.reviewerUserId ?? undefined,
    chiefUserId: discipline.chiefUserId ?? undefined,
    instituteChiefUserId: discipline.instituteChiefUserId ?? undefined,
    supportingDesignerUserId: discipline.supportingDesignerUserId ?? undefined,
  };
}

export type DisciplineUpdatePayload = UpdateTaskDisciplineRequest;
