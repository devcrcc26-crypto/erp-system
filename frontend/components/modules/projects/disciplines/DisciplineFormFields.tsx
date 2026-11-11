'use client';

import { Form } from 'antd';
import type { TaskDiscipline } from '@/lib/api/project-management.types';
import DisciplineSimpleFormFields from '@/components/modules/projects/disciplines/DisciplineSimpleFormFields';
import {
  type DisciplineFormValues,
  toDisciplineFormValues,
} from '@/components/modules/projects/disciplines/discipline-form.util';

export default function DisciplineFormFields({
  projectId,
}: {
  projectId: string;
}): React.ReactNode {
  return <DisciplineSimpleFormFields projectId={projectId} />;
}

export function setDisciplineFormValues(
  form: ReturnType<typeof Form.useForm<DisciplineFormValues>>[0],
  discipline: TaskDiscipline | null,
): void {
  if (discipline) {
    form.setFieldsValue(toDisciplineFormValues(discipline));
    return;
  }
  form.resetFields();
}
